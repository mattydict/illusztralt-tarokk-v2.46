import { Card, isTarokk } from './cards.js';
import { GameState } from './game.js';
import { pairOf } from './partnership.js';
import { PartnerBeliefState } from './beliefs.js';
import { assessPartnerMetaCommunication } from './aiPartnerMetaCommunication.js';

export interface DualCommunicationAssessment {
  score: number;
  partnerClarity: number;
  opponentReadRisk: number;
  deceptionValue: number;
  reasons: string[];
}

/**
 * v2.25: evaluates a public play from both sides of the communication table.
 * The play may be a clear acknowledgement to the partner while remaining
 * relatively uninformative to the opponents. This is not hidden-information
 * play: opponent risk is estimated only from public declarations, public
 * tricks and the existing soft partner-belief state.
 */
export function assessDualCommunication(
  state: GameState,
  observerId: string,
  candidate: Card,
  partnerBeliefs: PartnerBeliefState,
): DualCommunicationAssessment {
  const partner = partnerFor(state, observerId);
  if (!partner) return empty();

  const meta = assessPartnerMetaCommunication(state, observerId, candidate, partnerBeliefs);
  let opponentReadRisk = 0;
  let deceptionValue = 0;
  const reasons: string[] = [];

  const opponentFigures = state.declarations.declarations
    .filter(d => d.ownerId !== observerId && d.ownerId !== partner && d.status !== 'failed' && d.status !== 'fulfilled')
    .map(d => d.type);

  // An ordinary tarokk reply is often both useful to the partner and difficult
  // for the opponents to distinguish from a natural control play.
  if (isTarokk(candidate)) {
    const highSignal = partnerBeliefs.likelyTarokks.filter(x => x.score >= 3).length;
    const figurePressure = opponentFigures.length;
    if (highSignal > 0 && candidate.rank <= 18) {
      deceptionValue += 0.8;
      reasons.push('A partneri jelzés visszaigazolható úgy, hogy a vezetés természetes kontrollját az ellenfél is láthatja.');
    }
    if (candidate.rank >= 21 && highSignal >= 2) {
      opponentReadRisk += 1.1;
      reasons.push('A nagyon magas tarokk túl sok információt árulhat el a saját erősségről.');
    }
    if (figurePressure > 0 && candidate.rank >= 19) {
      opponentReadRisk += Math.min(1.4, figurePressure * 0.35);
    }
  }

  // Avoid rewarding a fake signal merely because it is hard to read. The
  // partner acknowledgement must remain meaningful first.
  if (meta.score < 0) deceptionValue *= 0.25;

  // If the opponent has already declared a figure, a deliberately ambiguous
  // control card can be more valuable than an obvious figure-breaking card.
  if (opponentFigures.length > 0 && isTarokk(candidate) && candidate.rank >= 17 && candidate.rank <= 19) {
    deceptionValue += 0.45;
  }

  const score = clamp(meta.score * 0.55 + deceptionValue * 1.15 - opponentReadRisk * 0.85, -4, 5);
  return {
    score,
    partnerClarity: meta.clarity,
    opponentReadRisk,
    deceptionValue,
    reasons: [...new Set([...meta.reasons.slice(0, 1), ...reasons])].slice(0, 3),
  };
}

function partnerFor(state: GameState, observerId: string): string | undefined {
  const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
  if (side === 'unknown') return undefined;
  if (side === 'taker') return observerId === state.takerId ? state.partnerId : state.takerId;
  return state.players.find(p => p.active && p.id !== observerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function empty(): DualCommunicationAssessment {
  return { score: 0, partnerClarity: 0, opponentReadRisk: 0, deceptionValue: 0, reasons: [] };
}
