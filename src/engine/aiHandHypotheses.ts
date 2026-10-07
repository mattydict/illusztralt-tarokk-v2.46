import { GameState, PlayerId } from './game.js';
import { AIBeliefSnapshot } from './aiBeliefEngine.js';

export type HiddenOwner = PlayerId | 'unknown';

export interface HandHypothesis {
  weight: number;
  ownership: Partial<Record<number, HiddenOwner>>;
}

export interface HandHypothesisSummary {
  hypotheses: HandHypothesis[];
  partnerId?: PlayerId;
  partnerTarokkProfile: Array<{ rank: number; probability: number }>;
  targetProfiles: {
    centrumCore: number;
    kismadarCore: number;
    nagymadarCore: number;
    xxiThreat: number;
    pagatThreat: number;
    sasThreat: number;
  };
}

/**
 * Builds a small beam of plausible hidden-hand worlds from public ownership
 * priors. It is deliberately limited to strategically important tarokks;
 * it is not a full card-dealing simulator and never reads hidden hands.
 */
export function buildHandHypotheses(
  state: GameState,
  observerId: PlayerId,
  beliefs: AIBeliefSnapshot,
  beamWidth = 64,
): HandHypothesisSummary {
  const hidden = state.players.filter(p => p.id !== observerId && p.active).map(p => p.id);
  const ranks = importantRanks(state, beliefs);
  const enforceCapacity = state.phase === 'play' || hidden.some(id => (state.players.find(p => p.id === id)?.hand.length ?? 0) > 0);
  let beam: InternalHypothesis[] = [{ weight: 1, ownership: {}, assignedCounts: {} }];

  for (const rank of ranks) {
    if (beliefs.visibleTarokks.includes(rank)) continue;
    const candidates = hidden
      .map(playerId => ({
        owner: playerId as HiddenOwner,
        weight: Math.max(0.001, beliefs.ownership[playerId]?.[rank]?.probability ?? 0.001),
      }))
      .filter(candidate => {
        if (!enforceCapacity) return true;
        const capacity = hiddenHandCapacity(state, candidate.owner as PlayerId);
        const assigned = beam[0]?.assignedCounts[candidate.owner] ?? 0;
        return capacity === undefined || assigned < capacity;
      });

    if (!enforceCapacity) {
      // During declaration tests/partially constructed states the hidden hand
      // sizes may intentionally be omitted. Keep the old unknown pool in that
      // case rather than pretending a partial fixture is a complete deal.
      candidates.push({ owner: 'unknown', weight: 0.12 });
    }
    if (!candidates.length) continue;

    const expanded: InternalHypothesis[] = [];
    for (const h of beam) {
      for (const c of candidates) {
        const capacity = enforceCapacity ? hiddenHandCapacity(state, c.owner as PlayerId) : undefined;
        const assigned = h.assignedCounts[c.owner] ?? 0;
        if (capacity !== undefined && assigned >= capacity) continue;
        const nextCounts = { ...h.assignedCounts };
        if (c.owner !== 'unknown') nextCounts[c.owner] = assigned + 1;
        expanded.push({
          weight: h.weight * c.weight,
          ownership: { ...h.ownership, [rank]: c.owner },
          assignedCounts: nextCounts,
        });
      }
    }
    expanded.sort((a, b) => b.weight - a.weight);
    beam = expanded.slice(0, beamWidth);
  }

  const weightSum = beam.reduce((s, h) => s + h.weight, 0) || 1;
  const publicBeam: HandHypothesis[] = beam.map(({ assignedCounts: _assignedCounts, ...world }) => ({
    ...world,
    weight: world.weight / weightSum,
  }));
  const partnerId = beliefs.partnerId ?? undefined;
  const partnerTarokkProfile = partnerId
    ? ranks.map(rank => ({ rank, probability: probabilityOwner(publicBeam, rank, partnerId) })).sort((a,b)=>b.probability-a.probability)
    : [];

  const targetProfiles = {
    centrumCore: jointOwner(publicBeam, [20, 21], partnerId),
    kismadarCore: jointOwner(publicBeam, [21], partnerId),
    nagymadarCore: jointOwner(publicBeam, [22], partnerId),
    xxiThreat: maxOwnerProbability(publicBeam, 21, hidden.filter(id => id !== partnerId)),
    pagatThreat: maxOwnerProbability(publicBeam, 1, hidden.filter(id => id !== partnerId)),
    sasThreat: maxOwnerProbability(publicBeam, 2, hidden.filter(id => id !== partnerId)),
  };

  return { hypotheses: publicBeam, ...(partnerId !== undefined ? { partnerId } : {}), partnerTarokkProfile, targetProfiles };
}

type InternalHypothesis = HandHypothesis & { assignedCounts: Partial<Record<PlayerId, number>> };

function hiddenHandCapacity(state: GameState, playerId: PlayerId): number | undefined {
  const player = state.players.find(p => p.id === playerId);
  return player ? player.hand.length : undefined;
}

function importantRanks(state: GameState, beliefs: AIBeliefSnapshot): number[] {
  const ranks = new Set<number>([22, 21, 20, 19, 18, 1, 2]);
  if (state.calledTarokk !== undefined) ranks.add(state.calledTarokk);
  for (const rank of beliefs.visibleTarokks) ranks.delete(rank);
  return [...ranks].sort((a,b)=>b-a);
}

function probabilityOwner(beam: HandHypothesis[], rank: number, owner: PlayerId): number {
  return beam.reduce((s,h)=>s + (h.ownership[rank] === owner ? h.weight : 0), 0);
}

function jointOwner(beam: HandHypothesis[], ranks: number[], owner?: PlayerId): number {
  if (!owner) return 0;
  return beam.reduce((s,h)=>s + (ranks.every(r => h.ownership[r] === owner) ? h.weight : 0), 0);
}

function maxOwnerProbability(beam: HandHypothesis[], rank: number, owners: PlayerId[]): number {
  return Math.max(0, ...owners.map(o => probabilityOwner(beam, rank, o)));
}
