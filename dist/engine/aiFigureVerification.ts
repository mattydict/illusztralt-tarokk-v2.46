import { Card } from './cards.js';
import { GameState, PlayerId } from './game.js';
import { determineWinner } from './play.js';
import { pairOf } from './partnership.js';
import { ActiveDeclaration } from './declarationLifecycle.js';

export interface FigureVerificationAssessment {
  score: number;
  hardConflict: boolean;
  opponentBreak: number;
  ownProtection: number;
  independentUltimo: number;
  reasons: string[];
}

/**
 * Final interaction guard for figure objectives.
 * This is deliberately narrow: it does not replace the specialist figure
 * planners; it verifies cross-figure interactions so one figure cannot
 * accidentally suppress another independent objective.
 */
export function assessFigureInteractions(
  state: GameState,
  observerId: PlayerId,
  candidate: Card,
): FigureVerificationAssessment {
  const active = state.declarations.declarations.filter(d => d.status !== 'failed' && d.status !== 'fulfilled');
  const observerSide = pairOf(observerId, state.takerId ?? '', state.partnerId);
  const trickNo = state.completedTricks.length + 1;
  const trick = state.trick;
  const closes = !!trick && trick.cards.length + 1 >= state.players.filter(p => p.active).length;
  const cards = trick?.cards.map(x => ({ playerId: x.player, card: x.card })) ?? [];
  if (candidate) cards.push({ playerId: observerId, card: candidate });
  const winner = trick?.cards.length ? determineWinner(cards, trick.cards[0]!.card) : undefined;
  const winnerSide = winner ? pairOf(winner, state.takerId ?? '', state.partnerId) : observerSide;

  let score = 0;
  let hardConflict = false;
  let opponentBreak = 0;
  let ownProtection = 0;
  let independentUltimo = 0;
  const reasons: string[] = [];

  const own = active.filter(d => pairOf(d.ownerId, state.takerId ?? '', state.partnerId) === observerSide);
  const opponents = active.filter(d => pairOf(d.ownerId, state.takerId ?? '', state.partnerId) !== observerSide);

  // Uhu and Ultimo for Pagát/Sas are independent objectives. Never penalize
  // preserving the target merely because the other objective is active.
  for (const target of ['T1', 'T2'] as const) {
    const ultimo = own.some(d => (target === 'T1' ? d.type === 'pagatUltimo' : d.type === 'sasUltimo'));
    const uhu = own.some(d => (target === 'T1' ? d.type === 'pagatUhu' : d.type === 'sasUhu'));
    if (ultimo && uhu) {
      independentUltimo += 1;
      if (candidate.id === target && trickNo < 9) {
        score -= 2.5;
        reasons.push(`${target === 'T1' ? 'Pagát' : 'Sas'} Uhu és Ultimó egyszerre aktív: a céllapot meg kell őrizni a 9. ütésig.`);
      }
    }
  }

  // Explicit hard deadlines: when the candidate actually closes the trick,
  // an opponent's locked figure must be treated as a direct counter-objective.
  for (const declaration of opponents) {
    const target = targetFor(declaration);
    const deadline = deadlineFor(declaration);
    if (!target || deadline === undefined || !closes || trickNo !== deadline) continue;
    const targetPlayed = cards.some(x => x.card.id === target);
    if (!targetPlayed) continue;
    const targetOwner = cards.find(x => x.card.id === target)?.playerId;
    const targetWon = winner === targetOwner;
    if (!targetWon && targetOwner) {
      opponentBreak += 1;
      score += 8;
      reasons.push(`ellenfél ${labelFor(declaration)} célütésének blokkolása`);
    }
  }

  // Protect our own hard deadline. This is bounded because the authoritative
  // figure planner remains responsible for exact success conditions.
  for (const declaration of own) {
    const target = targetFor(declaration);
    const deadline = deadlineFor(declaration);
    if (!target || deadline === undefined || !closes || trickNo !== deadline) continue;
    if (!cards.some(x => x.card.id === target)) continue;
    const targetOwner = cards.find(x => x.card.id === target)?.playerId;
    if (winner === targetOwner && winnerSide === observerSide) {
      ownProtection += 1;
      score += 7;
      reasons.push(`saját ${labelFor(declaration)} céljának biztosítása`);
    } else if (winnerSide !== observerSide) {
      hardConflict = true;
      score -= 10;
      reasons.push(`saját ${labelFor(declaration)} célja veszélybe kerül`);
    }
  }

  // Volát is a global all-tricks objective, while Double Game is a 71-point
  // objective. They must not be treated as interchangeable bird targets.
  for (const declaration of active) {
    if (declaration.type === 'volat' && closes && winnerSide !== pairOf(declaration.ownerId, state.takerId ?? '', state.partnerId)) {
      const side = pairOf(declaration.ownerId, state.takerId ?? '', state.partnerId);
      if (side === observerSide) {
        hardConflict = true;
        score -= 9;
        reasons.push('a Volát saját oldali ütésvesztést szenvedne');
      } else {
        opponentBreak += 1;
        score += 6;
        reasons.push('az ellenfél Volát-vonalának megtörése');
      }
    }
  }

  return {
    score: Math.max(-18, Math.min(18, score)),
    hardConflict,
    opponentBreak,
    ownProtection,
    independentUltimo,
    reasons: [...new Set(reasons)].slice(0, 4),
  };
}

function targetFor(d: ActiveDeclaration): string | undefined {
  if (d.targetCardId) return d.targetCardId;
  if (d.type === 'pagatUltimo' || d.type === 'pagatUhu') return 'T1';
  if (d.type === 'sasUltimo' || d.type === 'sasUhu') return 'T2';
  if (d.type === 'centrum') return 'T20';
  if (d.type === 'kismadar') return 'T21';
  if (d.type === 'nagymadar') return 'T22';
  return undefined;
}

function deadlineFor(d: ActiveDeclaration): number | undefined {
  if (d.type === 'centrum') return 5;
  if (d.type === 'kismadar') return 6;
  if (d.type === 'nagymadar') return 7;
  if (d.type === 'pagatUhu' || d.type === 'sasUhu' || d.type === 'kingUhu') return 8;
  if (d.type === 'pagatUltimo' || d.type === 'sasUltimo' || d.type === 'kingUltimo' || d.type === 'xxiFogas') return 9;
  return undefined;
}

function labelFor(d: ActiveDeclaration): string {
  const labels: Record<string, string> = {
    centrum: 'Centrum', kismadar: 'Kismadár', nagymadar: 'Nagymadár',
    pagatUhu: 'Pagát Uhu', sasUhu: 'Sas Uhu', kingUhu: 'Király Uhu',
    pagatUltimo: 'Pagát Ultimó', sasUltimo: 'Sas Ultimó', kingUltimo: 'Király Ultimó',
    xxiFogas: 'XXI-fogás', volat: 'Volát',
  };
  return labels[d.type] ?? d.type;
}
