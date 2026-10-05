import { Card, isHonour, isTarokk } from './cards.js';
import { GameState } from './game.js';
import { determineWinner, TrickCard } from './play.js';
import { pairOf } from './partnership.js';

export interface TrickEconomyAdvice {
  score: number;
  currentSidePoints: number;
  opponentSidePoints: number;
  trickPoints: number;
  projectedSidePoints: number;
  urgency: 'low' | 'medium' | 'high';
  reasons: string[];
}

/**
 * Information-safe trick economy evaluator.
 *
 * It only uses public completed tricks, the current visible trick and the
 * observer's own candidate card. It deliberately does not inspect any
 * opponent's hidden hand or skart.
 */
export function evaluateTrickEconomy(
  state: GameState,
  playerId: string,
  card: Card,
  candidateWinner: string,
): TrickEconomyAdvice {
  const side = pairOf(playerId, state.takerId ?? '', state.partnerId);
  if (side !== 'taker' && side !== 'defence') {
    return neutral('Nem azonosítható a játékos oldala.');
  }

  const currentSidePoints = publicTrickPointsForSide(state, side);
  const opponentSide = side === 'taker' ? 'defence' : 'taker';
  const opponentSidePoints = publicTrickPointsForSide(state, opponentSide);
  const trickPoints = (state.trick?.cards ?? []).reduce((sum, entry) => sum + entry.card.points, 0) + card.points;
  const candidateOwnsTrick = pairOf(candidateWinner, state.takerId ?? '', state.partnerId) === side;
  const projectedSidePoints = currentSidePoints + (candidateOwnsTrick ? trickPoints : 0);
  const trickNumber = state.completedTricks.length + 1;
  const remainingAfter = Math.max(0, 9 - trickNumber);

  let score = 0;
  const reasons: string[] = [];

  // The public trick-point balance is exact for already collected tricks. Use
  // the legal thresholds as urgency landmarks, not as an absolute hidden-score
  // claim because skarts may still hide points.
  const winTarget = side === 'taker' ? 48 : 47;
  const beforeDistance = winTarget - currentSidePoints;
  const afterDistance = winTarget - projectedSidePoints;

  if (candidateOwnsTrick && trickPoints >= 7) {
    score += 5.5;
    reasons.push(`Nagy értékű (${trickPoints} pontos) ütés megszerzése javítja a páros ponthelyzetét.`);
  } else if (candidateOwnsTrick && trickPoints >= 5) {
    score += 3.2;
    reasons.push(`Értékes (${trickPoints} pontos) ütést szerez a saját pár.`);
  }

  if (!candidateOwnsTrick && side === 'taker' && currentSidePoints >= 46 && trickPoints >= 3) {
    score -= 3.5;
    reasons.push('A felvevő pár még nincs biztosan a 48-as pontküszöb fölött; értékes ellenoldali ütést nem célszerű átengedni.');
  }
  if (!candidateOwnsTrick && side === 'defence' && currentSidePoints >= 45 && trickPoints >= 3) {
    score -= 2.8;
    reasons.push('Az ellenpár a nyerési küszöbhöz közel van; értékes ütés átengedése különösen veszélyes.');
  }

  if (afterDistance <= 0 && candidateOwnsTrick) {
    score += remainingAfter === 0 ? 7 : 4;
    reasons.push(`A páros a nyerési küszöböt ezzel az ütéssel eléri vagy átlépi (${winTarget} pont körüli közvetlen kontroll).`);
  }

  if (beforeDistance > 0 && afterDistance > 0 && remainingAfter <= 2 && candidateOwnsTrick && trickPoints > 0) {
    const progress = Math.min(4, (trickPoints / Math.max(1, beforeDistance)) * 3.5);
    score += progress;
    reasons.push('A leosztás vége közeleg; a még hiányzó pontok megszerzése felértékelődik.');
  }

  // When the partner currently controls a low-value trick, overtaking with a
  // costly trump or honour is usually bad economy unless the trick itself is
  // important for the point race.
  const trick = state.trick;
  if (trick?.cards.length) {
    const currentWinner = determineWinner(trick.cards.map(toTrickCard), trick.cards[0]!.card);
    const winnerSide = pairOf(currentWinner, state.takerId ?? '', state.partnerId);
    if (winnerSide === side && currentWinner !== playerId && candidateOwnsTrick) {
      if (trickPoints <= 4 && (isHonour(card) || (isTarokk(card) && card.rank >= 18))) {
        score -= trickPoints <= 2 ? 4.5 : 3.0;
        reasons.push('A partner által kontrollált, nem túl értékes ütést magas tarokkal vagy honőrrel nem érdemes átvenni.');
      } else if (trickPoints >= 6) {
        score += 1.5;
        reasons.push('A partner fölé ütés csak értékes pontütésnél indokolható, itt az ütés értéke ezt támogatja.');
      }
    }
  }

  // In the final trick(s), spending the absolute control card is justified when
  // it secures the point race; earlier in the deal its opportunity cost is higher.
  if (candidateOwnsTrick && isTarokk(card) && card.rank >= 19) {
    const opportunityCost = remainingAfter >= 4 ? 3.0 : remainingAfter >= 2 ? 1.3 : 0;
    if (trickPoints <= 2) {
      score -= opportunityCost;
      if (opportunityCost > 0) reasons.push('Magas tarokk korai, olcsó ütésre való elhasználása későbbi kontrollt veszít.');
    } else if (beforeDistance > 0 && afterDistance <= 0) {
      score += 2.5;
      reasons.push('A magas tarokk felhasználása most közvetlenül biztosítja a pontküszöb elérését.');
    }
  }

  const urgency = remainingAfter <= 1 || Math.abs(beforeDistance) <= 3 ? 'high'
    : remainingAfter <= 3 || Math.abs(beforeDistance) <= 8 ? 'medium'
    : 'low';

  return {
    score: Math.max(-12, Math.min(12, score)),
    currentSidePoints,
    opponentSidePoints,
    trickPoints,
    projectedSidePoints,
    urgency,
    reasons,
  };
}

function publicTrickPointsForSide(state: GameState, side: 'taker' | 'defence'): number {
  return state.completedTricks.reduce((sum, trick) => {
    if (!trick.winner) return sum;
    const winnerSide = pairOf(trick.winner, state.takerId ?? '', state.partnerId);
    if (winnerSide !== side) return sum;
    return sum + trick.cards.reduce((s, entry) => s + entry.card.points, 0);
  }, 0);
}

function toTrickCard(x: { player: string; card: Card }): TrickCard {
  return { playerId: x.player, card: x.card };
}

function neutral(reason: string): TrickEconomyAdvice {
  return {
    score: 0,
    currentSidePoints: 0,
    opponentSidePoints: 0,
    trickPoints: 0,
    projectedSidePoints: 0,
    urgency: 'low',
    reasons: [reason],
  };
}
