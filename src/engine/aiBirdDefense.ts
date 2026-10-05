import { Card, isHonour, isTarokk } from './cards.js';
import { GameState, PlayerId } from './game.js';
import { beats, TrickCard } from './play.js';
import { pairOf } from './partnership.js';
import { chooseDefensiveBirdLeadCard } from './leadConventions.js';
import { HandHypothesisSummary } from './aiHandHypotheses.js';

export type DefensiveBirdFigure = 'centrum' | 'kismadar' | 'nagymadar';

export interface DefensiveBirdSpec {
  figure: DefensiveBirdFigure;
  deadline: 5 | 6 | 7;
  targetCardId: 'T20' | 'T21' | 'T22';
}

export interface BirdDefenseEvidence {
  figure: DefensiveBirdFigure;
  deadline: number;
  targetCardId: string;
  score: number;
  confidence: number;
  threatProbability: number;
  breakProbability: number;
  reasons: string[];
}

const SPECS: Record<DefensiveBirdFigure, DefensiveBirdSpec> = {
  centrum: { figure: 'centrum', deadline: 5, targetCardId: 'T20' },
  kismadar: { figure: 'kismadar', deadline: 6, targetCardId: 'T21' },
  nagymadar: { figure: 'nagymadar', deadline: 7, targetCardId: 'T22' },
};

/**
 * Information-safe defence planner for an opponent's active
 * Centrum/Kismadár/Nagymadár.
 *
 * The planner never reads an opponent's actual hidden hand. It uses the public
 * declaration chain, the current trick and the observer's hypothesis beam to
 * estimate how dangerous the opponent's target is and whether this card can
 * improve the chance of breaking the figure.
 */
export function evaluateBirdDefenseCandidate(
  state: GameState,
  playerId: PlayerId,
  candidate: Card,
  hypotheses?: HandHypothesisSummary,
): BirdDefenseEvidence | undefined {
  const spec = activeOppositionBird(state, playerId);
  if (!spec) return undefined;

  const nextTrick = state.completedTricks.length + 1;
  if (nextTrick > spec.deadline) return undefined;

  const observerSide = pairOf(playerId, state.takerId ?? '', state.partnerId);
  const opponentIds = state.players
    .filter(p => p.active && pairOf(p.id, state.takerId ?? '', state.partnerId) !== observerSide)
    .map(p => p.id);
  const threatProbability = estimateTargetThreat(state, spec, playerId, opponentIds, hypotheses);

  const trick = state.trick;
  const normalizedTrick = trick?.cards.map(x => ({ playerId: x.player, card: x.card }));
  const currentWinner = normalizedTrick && normalizedTrick.length
    ? determineCurrentWinner(normalizedTrick, normalizedTrick[0]!.card)
    : undefined;
  const candidateWinner = normalizedTrick && normalizedTrick.length
    ? determineCurrentWinner([...normalizedTrick, { playerId: '__candidate__', card: candidate }], normalizedTrick[0]!.card)
    : undefined;
  const winsNow = candidateWinner === '__candidate__';
  const currentWinnerIsOpponent = currentWinner !== undefined && opponentIds.includes(currentWinner);
  const partnerIds = state.players
    .filter(p => p.active && p.id !== playerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === observerSide)
    .map(p => p.id);
  const partnerCurrentlyWinning = currentWinner !== undefined && partnerIds.includes(currentWinner);

  let score = 0;
  const reasons: string[] = [];

  // Opening defence: preserve the established headless-suit convention, but
  // let the dedicated break-the-bird objective reinforce that lead rather than
  // replace the convention entirely.
  if (!trick?.cards.length) {
    const preferred = chooseDefensiveBirdLeadCard(state, playerId);
    if (preferred?.id === candidate.id) {
      score += 20;
      reasons.push('Madárbemondás ellen a fejetlen színű indulás erős védekező konvenció.');
    }
    if (threatProbability >= 0.65 && candidate.kind === 'suit' && !isHonour(candidate)) {
      score += 3;
      reasons.push('Magas madárfenyegetés mellett a kis értékű színindítás kevés saját kontrollt éget el.');
    }
    if (isTarokk(candidate) && candidate.rank >= 20) {
      score -= 8;
      reasons.push('Korai magas tarokkvezetés feleslegesen átadhatja a védelmi kontrollt.');
    }
  }

  // If the opponent side is currently winning an early trick, taking it away
  // directly breaks the required prefix of a bird figure.
  if (trick?.cards.length && currentWinnerIsOpponent && winsNow && nextTrick < spec.deadline) {
    const cost = isTarokk(candidate) ? candidate.rank >= 21 ? 8 : candidate.rank >= 17 ? 4.5 : 2 : 0.5;
    score += 24 + (threatProbability * 22) - cost;
    reasons.push(`Ezzel az ütéssel megtörhető az ellenfél ${spec.figure} előkészítő sorozata.`);
    if (isTarokk(candidate) && candidate.rank >= 21) {
      reasons.push('A megtörés ugyanakkor magas fogó tarokkot használ el; ezt csak erős madárfenyegetés indokolja.');
    }
  }

  // Do not steal a cheap prefix trick from our own partner merely to generate
  // activity. The partner's winning trick is already a successful defence of
  // the opponent's figure.
  if (partnerCurrentlyWinning && winsNow) {
    score -= 18;
    reasons.push('A saját partner már viszi az ütést; nem célszerű fölé ütni.');
  }

  // The designated target trick is the critical defensive window. If the
  // target has appeared, winning with a non-target card is the cleanest break.
  if (nextTrick === spec.deadline && trick?.cards.length) {
    const targetPresent = trick.cards.some(x => x.card.id === spec.targetCardId);
    if (targetPresent && winsNow) {
      const targetCardPlayed = trick.cards.find(x => x.card.id === spec.targetCardId)!;
      const targetOpponent = opponentIds.includes(targetCardPlayed.player);
      score += targetOpponent ? 42 + threatProbability * 35 : 10;
      reasons.push(`A ${spec.figure} célütésében az ellenfél ${spec.targetCardId} lapjának felülütése közvetlenül megbontja a bemondást.`);
    }
    if (!targetPresent && winsNow && currentWinnerIsOpponent) {
      score += 16 + threatProbability * 16;
      reasons.push(`A határütést az ellenféltől elvenni már önmagában veszélyezteti a ${spec.figure} teljesítését.`);
    }
    if (targetPresent && !winsNow && currentWinnerIsOpponent) {
      score -= 8;
      reasons.push('A célkártya ellenőrzött felülütése nem érhető el ezzel a lappal; célszerű olcsón eldobni.');
    }
  }

  // When the figure is still several tricks away, preserve the cards that can
  // later serve as target-stoppers: Skíz/XXI/XX are particularly valuable on a
  // target trick, while small tarokks are expendable pressure tools.
  if (nextTrick < spec.deadline && !winsNow) {
    if (isTarokk(candidate) && candidate.rank >= 20) {
      score -= 5;
      reasons.push('A nagy tarokk jobb későbbi célütés-ellenes stopperként, mint egy semleges korai eldobás.');
    } else if (isTarokk(candidate) && candidate.rank <= 16) {
      score += 2;
      reasons.push('Kis tarokk viszonylag olcsó védekező eszköz a későbbi magas stopper megőrzése mellett.');
    }
  }

  // The current threat estimate scales the whole defence policy. This keeps a
  // formally active bird from hijacking every trick when its target is already
  // public or the declaration is likely structurally dead.
  score *= 0.65 + threatProbability * 0.7;

  const breakProbability = estimateImmediateBreakProbability(state, spec, playerId, candidate, winsNow, currentWinnerIsOpponent, threatProbability);
  if (breakProbability >= 0.65) {
    score += 10;
    reasons.push(`A jelenlegi lapválasztás becsült megtörési esélye ${Math.round(breakProbability * 100)}%.`);
  }

  const confidence = clamp01(0.42 + (hypotheses?.hypotheses.length ?? 0) / 180);
  if (!reasons.length) reasons.push(`Az ellenfél ${spec.figure} bemondása aktív; semleges védekezési vonal.`);

  return {
    figure: spec.figure,
    deadline: spec.deadline,
    targetCardId: spec.targetCardId,
    score: Math.max(-90, Math.min(90, score)),
    confidence,
    threatProbability,
    breakProbability,
    reasons,
  };
}

export function activeOppositionBird(state: GameState, playerId: PlayerId): DefensiveBirdSpec | undefined {
  if (!state.takerId || !state.declarations?.declarations?.length) return undefined;
  if (state.players[state.nextPlayerIndex]?.id !== playerId) return undefined;
  const observerSide = pairOf(playerId, state.takerId, state.partnerId);
  if (observerSide === 'unknown') return undefined;
  const active = state.declarations.declarations.find(d => {
    if (d.status === 'failed' || d.status === 'fulfilled') return false;
    if (!(d.type === 'centrum' || d.type === 'kismadar' || d.type === 'nagymadar')) return false;
    return pairOf(d.ownerId, state.takerId ?? '', state.partnerId) !== observerSide;
  });
  return active ? SPECS[active.type as DefensiveBirdFigure] : undefined;
}

function estimateTargetThreat(
  state: GameState,
  spec: DefensiveBirdSpec,
  observerId: PlayerId,
  opponentIds: PlayerId[],
  hypotheses?: HandHypothesisSummary,
): number {
  if (state.completedTricks.some(t => t.cards.some(c => c.card.id === spec.targetCardId))) return 0.15;

  const visibleInOwnHand = state.players.find(p => p.id === observerId)?.hand.some(c => c.id === spec.targetCardId) ?? false;
  const visibleInPublicTrick = state.completedTricks.some(t => t.cards.some(c => c.card.id === spec.targetCardId))
    || !!state.trick?.cards.some(c => c.card.id === spec.targetCardId);
  if (visibleInOwnHand) return 0.1;
  if (visibleInPublicTrick) return 0.15;

  if (hypotheses?.hypotheses.length) {
    return clamp01(hypotheses.hypotheses.reduce((sum, h) => {
      const owner = h.ownership[Number(spec.targetCardId.slice(1))];
      return sum + h.weight * (owner !== 'unknown' && opponentIds.includes(owner as PlayerId) ? 1 : 0);
    }, 0));
  }

  return opponentIds.length ? 0.55 : 0;
}

function estimateImmediateBreakProbability(
  state: GameState,
  spec: DefensiveBirdSpec,
  playerId: PlayerId,
  candidate: Card,
  winsNow: boolean,
  currentWinnerIsOpponent: boolean,
  threatProbability: number,
): number {
  const trick = state.trick;
  if (!trick?.cards.length) return 0.25 * threatProbability;
  if (!winsNow || !currentWinnerIsOpponent) return 0.05 * threatProbability;
  const trickNumber = state.completedTricks.length + 1;
  const targetPresent = trick.cards.some(c => c.card.id === spec.targetCardId);
  if (trickNumber === spec.deadline && targetPresent) return 0.9;
  if (trickNumber < spec.deadline) return 0.74;
  return candidate.id === spec.targetCardId ? 0.02 : 0.5;
}

function determineCurrentWinner(cards: TrickCard[], lead: Card): PlayerId {
  let winner = cards[0]!;
  for (const c of cards.slice(1)) if (beats(c.card, winner.card, lead)) winner = c;
  return winner.playerId;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
