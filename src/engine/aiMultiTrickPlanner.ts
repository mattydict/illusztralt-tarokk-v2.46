import { Card } from './cards.js';
import { GameState, PlayerId } from './game.js';
import { HandHypothesisSummary } from './aiHandHypotheses.js';
import { evaluateCardContinuation, PlayContinuationResult } from './aiRollout.js';
import { assessMiniLine, assessCounterfactualStress, CounterfactualStressAssessment, MiniLineAssessment } from './aiLinePlanner.js';

export interface MultiTrickPlanResult {
  cardId: string;
  shortHorizon: PlayContinuationResult;
  extendedHorizon: PlayContinuationResult;
  score: number;
  horizon: number;
  reasons: string[];
  miniLine: MiniLineAssessment;
  counterfactual: CounterfactualStressAssessment;
}

/**
 * Compare the candidate's existing two-trick outlook with a three-trick
 * continuation. The purpose is not to replace the rollout engine, but to
 * detect lines whose value only appears after the immediate trick.
 *
 * The planner remains information-safe: evaluateCardContinuation samples only
 * the observer's public-information belief worlds.
 */
export function evaluateMultiTrickPlan(
  state: GameState,
  observerId: PlayerId,
  hypotheses: HandHypothesisSummary,
  candidate: Card,
  shortSamples = 32,
  extendedSamples = 24,
): MultiTrickPlanResult | undefined {
  const remaining = Math.max(1, 9 - state.completedTricks.length);
  const shortHorizon = Math.min(2, remaining);
  const extendedHorizon = Math.min(3, remaining);
  if (!hypotheses.hypotheses.length || extendedHorizon <= 1) return undefined;

  const shortHorizonResult = evaluateCardContinuation(
    state,
    observerId,
    hypotheses,
    candidate,
    shortHorizon,
    shortSamples,
  );
  const extendedHorizonResult = evaluateCardContinuation(
    state,
    observerId,
    hypotheses,
    candidate,
    extendedHorizon,
    extendedSamples,
  );

  const delta = extendedHorizonResult.expectedValue - shortHorizonResult.expectedValue;
  const partnerDelta = extendedHorizonResult.partnerWinRate - shortHorizonResult.partnerWinRate;
  const settlementDelta = extendedHorizonResult.expectedSettlementForObserverSide - shortHorizonResult.expectedSettlementForObserverSide;
  const confidence = Math.max(0, Math.min(1, extendedHorizonResult.confidence));

  // A line that remains good after the third trick is more valuable than one
  // whose advantage exists only in the immediate two-trick window. The delta
  // is deliberately bounded so the multi-trick planner cannot overwhelm hard
  // figure locks, legality, or urgent settlement considerations.
  let score = extendedHorizonResult.expectedValue * 0.72 + delta * 1.05;
  score += Math.max(-1.5, Math.min(1.5, partnerDelta * 7));
  score += Math.max(-1.5, Math.min(1.5, settlementDelta * 0.08));
  score *= 0.65 + confidence * 0.35;
  score = Math.max(-8, Math.min(8, score));

  const miniLine = assessMiniLine(state, observerId, candidate, shortHorizonResult, extendedHorizonResult);
  score += miniLine.score * 0.8;

  const counterfactual = assessCounterfactualStress(shortHorizonResult, extendedHorizonResult);
  score += counterfactual.score * 0.55;

  const reasons: string[] = [...miniLine.reasons, ...counterfactual.reasons.slice(0, 1).map(r => `Ellenjáték-stressz: ${r}`)];
  if (delta >= 0.8) reasons.push('A harmadik ütésig előrenézve a mostani kijátszásból erősebb folytatási vonal nyílik.');
  if (delta <= -0.8) reasons.push('A rövid távú előny a harmadik ütésre részben vagy teljesen elolvad.');
  if (partnerDelta >= 0.08) reasons.push('A hosszabb vonal gyakrabban ad kontrollt a partnernek a következő ütésekben.');
  if (partnerDelta <= -0.08) reasons.push('A hosszabb vonal a partner kontrollját is veszélyezteti.');
  if (settlementDelta >= 3) reasons.push('A háromütéses folytatás partiértéke kedvezőbbnek látszik.');
  if (settlementDelta <= -3) reasons.push('A háromütéses folytatás partiértéke romlik a rövid vonalhoz képest.');
  if (!reasons.length) reasons.push('A két- és háromütéses vonal között nincs jelentős stratégiai eltérés.');
  score = Math.max(-8, Math.min(8, score));

  return {
    cardId: candidate.id,
    shortHorizon: shortHorizonResult,
    extendedHorizon: extendedHorizonResult,
    score,
    horizon: extendedHorizon,
    reasons: [...new Set(reasons)].slice(0, 3),
    miniLine,
    counterfactual,
  };
}
