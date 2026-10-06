import { GameState } from './game.js';
import { pairOf } from './partnership.js';

export type BirdFigure = 'centrum' | 'kismadar' | 'nagymadar';

export interface FigureGeometryAssessment {
  figure: BirdFigure;
  deadline: 5 | 6 | 7;
  targetCardId: 'T20' | 'T21' | 'T22';
  side: 'taker' | 'defence' | 'unknown';
  /** All already completed prerequisite tricks were won by the declaring side. */
  prefixIntact: boolean;
  /** The target card has not been played before its designated trick. */
  targetPreserved: boolean;
  /** The target card is still in the observing player's hand, if known. */
  targetInOwnHand: boolean;
  /** The target card has appeared in an earlier completed trick. */
  targetPlayedEarly: boolean;
  /** A completed prerequisite trick was already lost. */
  prerequisiteTrickLost: number | undefined;
  /** Current progress as a compact, AI-friendly status. */
  status: 'live' | 'failed-prefix' | 'failed-target';
  /** Human-readable explanation for AI/debugging. */
  reason: string;
}

const BIRD: Record<BirdFigure, { deadline: 5 | 6 | 7; target: 'T20' | 'T21' | 'T22' }> = {
  centrum: { deadline: 5, target: 'T20' },
  kismadar: { deadline: 6, target: 'T21' },
  nagymadar: { deadline: 7, target: 'T22' },
};

/**
 * Observable play-geometry for the bird figures.
 *
 * This is deliberately NOT a declaration legality check. It answers only:
 * "given the public tricks and this player's own hand, is the figure still
 * alive, and what is currently threatening it?"
 *
 * In particular, it never assumes the partner owns a hidden card.
 */
export function assessFigureGeometry(
  state: GameState,
  ownerId: string,
  figure: BirdFigure,
): FigureGeometryAssessment {
  const spec = BIRD[figure];
  const takerId = state.takerId;
  const side = takerId ? pairOf(ownerId, takerId, state.partnerId) : 'unknown';
  const ownHand = state.players.find(p => p.id === ownerId)?.hand ?? [];
  const targetInOwnHand = ownHand.some(c => c.id === spec.target);

  let prefixIntact = true;
  let prerequisiteTrickLost: number | undefined;
  let targetPlayedEarly = false;
  let targetPreserved = true;

  for (let i = 0; i < state.completedTricks.length; i += 1) {
    const trickNumber = i + 1;
    const trick = state.completedTricks[i]!;
    const wonBySide = side !== 'unknown' && takerId !== undefined && trick.winner !== undefined && pairOf(trick.winner, takerId!, state.partnerId) === side;
    if (trickNumber < spec.deadline && !wonBySide && prerequisiteTrickLost === undefined) {
      prerequisiteTrickLost = trickNumber;
      prefixIntact = false;
    }
    if (trickNumber < spec.deadline && trick.cards.some(x => x.card.id === spec.target)) {
      targetPlayedEarly = true;
      targetPreserved = false;
    }
  }

  // A target already played in the currently open trick is also an early use.
  const currentTrickNumber = state.completedTricks.length + 1;
  if (state.trick && currentTrickNumber < spec.deadline && state.trick.cards.some(x => x.card.id === spec.target)) {
    targetPlayedEarly = true;
    targetPreserved = false;
  }

  if (targetPlayedEarly) {
    return {
      figure, deadline: spec.deadline, targetCardId: spec.target, side,
      prefixIntact, targetPreserved, targetInOwnHand,
      targetPlayedEarly, prerequisiteTrickLost,
      status: 'failed-target',
      reason: `${figure} bukott: a ${spec.target} a ${spec.deadline}. ütés előtt kijátszásra került.`,
    };
  }

  if (!prefixIntact) {
    return {
      figure, deadline: spec.deadline, targetCardId: spec.target, side,
      prefixIntact, targetPreserved, targetInOwnHand,
      targetPlayedEarly, prerequisiteTrickLost,
      status: 'failed-prefix',
      reason: `${figure} bukott: a ${prerequisiteTrickLost}. előkészítő ütést nem a bemondó oldal vitte.`,
    };
  }

  return {
    figure, deadline: spec.deadline, targetCardId: spec.target, side,
    prefixIntact, targetPreserved, targetInOwnHand,
    targetPlayedEarly, prerequisiteTrickLost,
    status: 'live',
    reason: targetInOwnHand
      ? `${figure} él; a célkártya a saját kézben van, és az előkészítő ütéseket még nem vesztették el.`
      : `${figure} él, de a célkártya nem ismert a saját kézben; a partner célkártyája továbbra is csak valószínűség.`,
  };
}


export interface FigureCandidateAssessment {
  figure: BirdFigure;
  candidateCardId: string;
  trickNumber: number;
  closesTrick: boolean;
  candidateWins: boolean;
  candidateSideWins: boolean;
  partnerCanWin: boolean;
  preservesPrefix: boolean;
  protectsTarget: boolean;
  value: number;
  reason: string;
}

/**
 * Public-information-only strategic value of a candidate card while a bird
 * figure is active. This is intentionally narrower than a full rollout: it
 * evaluates only the currently visible trick and the declaring side. Hidden
 * hands are never consulted. Positive value means the candidate helps keep
 * the required prefix alive or improves the chance of handing control to the
 * declaring side; negative value means it would visibly throw away that
 * opportunity.
 */
export function assessFigureCandidateValue(
  state: GameState,
  ownerId: string,
  figure: BirdFigure,
  candidateCardId: string,
): FigureCandidateAssessment {
  const spec = BIRD[figure];
  const trick = state.trick;
  const trickNumber = state.completedTricks.length + 1;
  const side = state.takerId ? pairOf(ownerId, state.takerId, state.partnerId) : 'unknown';
  const ownHand = state.players.find(p => p.id === ownerId)?.hand ?? [];
  const targetInOwnHand = ownHand.some(c => c.id === spec.target);

  if (!trick) {
    const protectsTarget = candidateCardId !== spec.target || trickNumber >= spec.deadline;
    return {
      figure, candidateCardId, trickNumber, closesTrick: false,
      candidateWins: false, candidateSideWins: false, partnerCanWin: false,
      preservesPrefix: true, protectsTarget,
      value: protectsTarget ? 1 : -3,
      reason: protectsTarget
        ? `${figure}: vezetésnél a célkártya megőrzése támogatja a figura későbbi teljesítését.`
        : `${figure}: a célkártya túl korai vezetése láthatóan veszélyezteti a figurát.`,
    };
  }

  const candidate = ownHand.find(c => c.id === candidateCardId);
  const lead = trick.cards[0]?.card;
  if (!candidate || !lead) {
    return {
      figure, candidateCardId, trickNumber, closesTrick: false,
      candidateWins: false, candidateSideWins: false, partnerCanWin: false,
      preservesPrefix: true, protectsTarget: candidateCardId !== spec.target,
      value: 0, reason: 'A jelölt laphoz nincs elegendő nyilvános állapotinformáció.',
    };
  }

  const activeCount = state.players.filter(p => p.active).length;
  const closesTrick = trick.cards.length + 1 >= activeCount;
  const candidateWinner = localWinner([...trick.cards, { player: ownerId, card: candidate }], lead);
  const candidateWins = candidateWinner === ownerId;
  const candidateSide = state.takerId ? pairOf(candidateWinner, state.takerId, state.partnerId) : 'unknown';
  const candidateSideWins = side !== 'unknown' && candidateSide === side;
  const partnerId = state.partnerId === ownerId ? state.takerId : state.partnerId;
  const partnerCanWin = partnerId !== undefined && candidateWinner === partnerId;
  const preservesPrefix = !closesTrick || trickNumber >= spec.deadline || candidateSideWins;
  const protectsTarget = candidateCardId !== spec.target || trickNumber >= spec.deadline;

  let value = 0;
  if (trickNumber < spec.deadline && closesTrick) {
    if (candidateSideWins) value += 4.5;
    else value -= 6;
  } else if (trickNumber < spec.deadline && partnerCanWin) {
    value += 1.5;
  }

  if (candidateCardId === spec.target && trickNumber < spec.deadline) value -= 8;
  if (candidateCardId === spec.target && trickNumber === spec.deadline && candidateSideWins) value += 7;
  if (trickNumber === spec.deadline && candidateSideWins && candidateCardId === spec.target) value += 5;

  return {
    figure, candidateCardId, trickNumber, closesTrick, candidateWins,
    candidateSideWins, partnerCanWin, preservesPrefix, protectsTarget, value,
    reason: value > 0
      ? `${figure}: a látható ütésállapot alapján ez a kijátszás támogatja a bemondó oldal célütését.`
      : value < 0
        ? `${figure}: a látható ütésállapot alapján ez a kijátszás veszélyezteti a figura előkészítő láncát vagy célkártyáját.`
        : `${figure}: a látható ütésállapot alapján nincs egyértelmű figuraelőny.`,
  };
}

export function assessActiveBirdGeometry(state: GameState, ownerId: string): FigureGeometryAssessment | undefined {
  const active = state.declarations.declarations.find(d =>
    d.ownerId === ownerId &&
    d.status !== 'failed' && d.status !== 'fulfilled' &&
    (d.type === 'centrum' || d.type === 'kismadar' || d.type === 'nagymadar')
  );
  if (!active) return undefined;
  const figure = active.type as BirdFigure;
  return assessFigureGeometry(state, ownerId, figure);
}

/**
 * Candidate-play risk for a bird figure. If the candidate closes the current
 * trick before the target trick, we can determine whether that trick would
 * leave the declaring side. Otherwise we deliberately return no hard risk.
 */
export interface FigurePlayRisk {
  figure: BirdFigure;
  trickNumber: number;
  closesTrick: boolean;
  wouldLosePrefix: boolean;
  wouldPlayTargetTooEarly: boolean;
  risk: 'none' | 'prefix' | 'target';
  reason: string;
}

export function assessFigurePlayRisk(
  state: GameState,
  ownerId: string,
  figure: BirdFigure,
  candidateCardId: string,
): FigurePlayRisk {
  const spec = BIRD[figure];
  const trick = state.trick;
  const trickNumber = state.completedTricks.length + 1;
  if (!trick) {
    return { figure, trickNumber, closesTrick: false, wouldLosePrefix: false, wouldPlayTargetTooEarly: false, risk: 'none', reason: 'Nincs aktív ütés.' };
  }

  const activeCount = state.players.filter(p => p.active).length;
  const closesTrick = trick.cards.length + 1 >= activeCount;
  const wouldPlayTargetTooEarly = candidateCardId === spec.target && trickNumber < spec.deadline;
  if (wouldPlayTargetTooEarly) {
    return {
      figure, trickNumber, closesTrick,
      wouldLosePrefix: false,
      wouldPlayTargetTooEarly: true,
      risk: 'target',
      reason: `${figure}: a ${spec.target} a ${spec.deadline}. ütés előtt kerülne kijátszásra.`,
    };
  }

  if (!closesTrick || trickNumber >= spec.deadline) {
    return {
      figure, trickNumber, closesTrick,
      wouldLosePrefix: false,
      wouldPlayTargetTooEarly: false,
      risk: 'none',
      reason: `${figure}: ez a kijátszás még nem zárja le az előkészítő ütést, vagy már a célütésben vagyunk.`,
    };
  }

  const candidate = state.players.find(p => p.id === ownerId)?.hand.find(c => c.id === candidateCardId);
  const lead = trick.cards[0]?.card;
  if (!candidate || !lead) {
    return { figure, trickNumber, closesTrick, wouldLosePrefix: false, wouldPlayTargetTooEarly: false, risk: 'none', reason: 'A jelölt lap nem található a saját kézben.' };
  }
  const cards = [...trick.cards, { player: ownerId, card: candidate }];
  const winner = localWinner(cards, lead);
  const takerId = state.takerId;
  const side = takerId ? pairOf(ownerId, takerId, state.partnerId) : 'unknown';
  const winnerSide = takerId ? pairOf(winner, takerId, state.partnerId) : 'unknown';
  const wouldLosePrefix = side !== 'unknown' && winnerSide !== side;

  return {
    figure, trickNumber, closesTrick,
    wouldLosePrefix,
    wouldPlayTargetTooEarly: false,
    risk: wouldLosePrefix ? 'prefix' : 'none',
    reason: wouldLosePrefix
      ? `${figure}: a ${trickNumber}. előkészítő ütést az ellenoldal vinné el ezzel a kijátszással.`
      : `${figure}: a ${trickNumber}. előkészítő ütés a bemondó oldalon maradna.`,
  };
}

function localWinner(cards: Array<{ player: string; card: import('./cards.js').Card }>, lead: import('./cards.js').Card): string {
  let winner = cards[0]!;
  for (const current of cards.slice(1)) {
    if (localBeats(current.card, winner.card, lead)) winner = current;
  }
  return winner.player;
}

function localBeats(candidate: import('./cards.js').Card, current: import('./cards.js').Card, lead: import('./cards.js').Card): boolean {
  const tarokk = (c: import('./cards.js').Card) => c.kind === 'tarokk';
  if (tarokk(candidate) && !tarokk(current)) return true;
  if (!tarokk(candidate) && tarokk(current)) return false;
  if (tarokk(candidate) && tarokk(current)) return candidate.rank > current.rank;
  if (candidate.kind !== 'suit' || current.kind !== 'suit' || lead.kind !== 'suit') return false;
  const candidateLed = candidate.suit === lead.suit;
  const currentLed = current.suit === lead.suit;
  if (candidateLed && !currentLed) return true;
  if (!candidateLed) return false;
  if (!currentLed) return true;
  const value = (r: import('./cards.js').SuitRank) => ({ K: 5, Q: 4, C: 3, J: 2, '10': 1, A: 1 }[r]);
  return value(candidate.rank) > value(current.rank);
}
