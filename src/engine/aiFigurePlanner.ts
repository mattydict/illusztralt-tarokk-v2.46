import { Card } from './cards.js';
import { GameState } from './game.js';
import { HandHypothesisSummary } from './aiHandHypotheses.js';
import { evaluateCardContinuation } from './aiRollout.js';
import { pairOf } from './partnership.js';
import { BirdFigure } from './figureGeometry.js';

export interface FigurePlanSpec {
  figure: BirdFigure;
  deadline: 5 | 6 | 7;
  targetCardId: 'T20' | 'T21' | 'T22';
}

export interface FigurePlanEvidence {
  figure: BirdFigure;
  deadline: number;
  targetCardId: string;
  remainingTricks: number;
  targetSuccessRate: number;
  sideWinRate: number;
  partnerWinRate: number;
  expectedValue: number;
  score: number;
  confidence: number;
  reasons: string[];
}

const SPECS: Record<BirdFigure, FigurePlanSpec> = {
  centrum: { figure: 'centrum', deadline: 5, targetCardId: 'T20' },
  kismadar: { figure: 'kismadar', deadline: 6, targetCardId: 'T21' },
  nagymadar: { figure: 'nagymadar', deadline: 7, targetCardId: 'T22' },
};

/**
 * Build a goal-directed card value for a currently active bird figure.
 *
 * The planner is deliberately pair-aware: the designated trick is successful
 * only if a member of the declaring side wins it with the target card. Before
 * the deadline, retaining or transferring control to the partner can therefore
 * be better than taking the current trick with the candidate player.
 *
 * It uses the same information-safe hidden-world beam as the ordinary rollout;
 * no opponent hand is inspected outside a sampled world created by the rollout.
 */
export function evaluateBirdFigureCandidate(
  state: GameState,
  observerId: string,
  hypotheses: HandHypothesisSummary,
  candidate: Card,
  sampleLimit = 32,
): FigurePlanEvidence | undefined {
  const declaration = activeOwnBirdDeclaration(state, observerId);
  if (!declaration) return undefined;

  const currentTrick = state.completedTricks.length + 1;
  if (currentTrick > declaration.deadline) return undefined;

  const remainingTricks = Math.max(1, declaration.deadline - state.completedTricks.length);
  // A bird has one hard target trick. Do not simulate the whole remaining
  // deal: the useful decision boundary is the target deadline itself.
  const horizon = Math.min(remainingTricks, 7);
  const rollout = evaluateCardContinuation(
    state,
    observerId,
    hypotheses,
    candidate,
    horizon,
    sampleLimit,
    { name: declaration.figure, cardId: declaration.targetCardId, deadline: declaration.deadline },
  );

  const targetSuccessRate = clamp01(rollout.targetSuccessRate);
  const sideWinRate = clamp01(rollout.sideWinRate);
  const partnerWinRate = clamp01(rollout.partnerWinRate);
  const partnerId = hypotheses.partnerId;
  const targetInOwnHand = state.players.find(p => p.id === observerId)?.hand.some(c => c.id === declaration.targetCardId) ?? false;

  let score = 0;
  const reasons: string[] = [];

  // The target-trick outcome is the dominant criterion. The baseline is the
  // neutral 50% target-success line; deviations are translated into a bounded
  // play preference so tactical rules still retain control.
  score += (targetSuccessRate - 0.5) * 70;

  // A bird is a pair achievement. Before the deadline, a partner win is often
  // strategically preferable when the target is likely with the partner.
  if (currentTrick < declaration.deadline && partnerId && !targetInOwnHand) {
    score += (partnerWinRate - 0.5) * 20;
    if (partnerWinRate >= 0.60) reasons.push(`A szimulációban a partner gyakran megtartja az irányítást a ${declaration.figure} ${declaration.deadline}. ütése előtt.`);
  }

  // Conversely, if the target is in our hand, our own controlled line matters
  // slightly more than a generic partner hand-off.
  if (currentTrick < declaration.deadline && targetInOwnHand) {
    score += (sideWinRate - 0.5) * 10;
  }

  // Expected trick value is useful only as a secondary criterion. A bird line
  // should not cash a point-rich trick by destroying its designated target.
  score += Math.max(-2, Math.min(2, rollout.expectedValue)) * 2.2;

  if (targetSuccessRate >= 0.70) {
    reasons.push(`A ${declaration.figure} célütésének becsült esélye magas (${Math.round(targetSuccessRate * 100)}%).`);
  } else if (targetSuccessRate <= 0.35) {
    reasons.push(`A ${declaration.figure} célütésének becsült esélye alacsony (${Math.round(targetSuccessRate * 100)}%).`);
  }

  if (currentTrick < declaration.deadline && candidate.id === declaration.targetCardId) {
    score -= 60;
    reasons.push(`A ${declaration.targetCardId} idő előtti elhasználása veszélyezteti a ${declaration.figure} célütését.`);
  }

  if (currentTrick === declaration.deadline && candidate.id === declaration.targetCardId) {
    score += 80;
    reasons.push(`Most van a ${declaration.figure} célütése: a ${declaration.targetCardId} kijátszása elsődleges.`);
  }

  if (!reasons.length) reasons.push(`${declaration.figure}: a célütésig tartó előreszámolás nem mutat erős eltérést.`);

  return {
    figure: declaration.figure,
    deadline: declaration.deadline,
    targetCardId: declaration.targetCardId,
    remainingTricks,
    targetSuccessRate,
    sideWinRate,
    partnerWinRate,
    expectedValue: rollout.expectedValue,
    score: Math.max(-90, Math.min(90, score)),
    confidence: rollout.confidence,
    reasons,
  };
}

export function activeOwnBirdDeclaration(state: GameState, playerId: string): FigurePlanSpec | undefined {
  if (!state.takerId) return undefined;
  const observerSide = pairOf(playerId, state.takerId, state.partnerId);
  if (observerSide === 'unknown') return undefined;
  const active = state.declarations.declarations.find(d =>
    d.status !== 'failed' &&
    d.status !== 'fulfilled' &&
    (d.type === 'centrum' || d.type === 'kismadar' || d.type === 'nagymadar') &&
    pairOf(d.ownerId, state.takerId ?? '', state.partnerId) === observerSide
  );
  if (!active) return undefined;
  return SPECS[active.type as BirdFigure];
}

export function declaredBirdSide(state: GameState, declaration: FigurePlanSpec, ownerId: string): 'taker' | 'defence' | 'unknown' {
  if (!state.takerId) return 'unknown';
  const ownerSide = pairOf(ownerId, state.takerId, state.partnerId);
  return ownerSide;
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
