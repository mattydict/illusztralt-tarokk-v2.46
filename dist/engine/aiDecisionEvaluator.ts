import { DeclarationType } from './declarations.js';

export interface DecisionEvidence {
  successProbability: number;
  communicationValue?: number;
  modelConfidence?: number;
  nominalValue?: number;
  positionValue?: number;
  riskPenalty?: number;
}

export interface DecisionEvaluation {
  expectedValue: number;
  successProbability: number;
  communicationValue: number;
  risk: number;
  confidence: number;
  score: number;
}

const DECLARATION_VALUE: Record<DeclarationType, number> = {
  tarokk8: 1,
  tarokk9: 2,
  tuletroa: 2,
  fourKings: 2,
  doubleGame: 4,
  volat: 6,
  pagatUltimo: 10,
  sasUltimo: 10,
  kingUltimo: 15,
  pagatUhu: 20,
  sasUhu: 20,
  kingUhu: 25,
  centrum: 10,
  kismadar: 10,
  nagymadar: 10,
  xxiFogas: 60,
};

/**
 * One common scoring layer for AI choices. Legality is deliberately absent:
 * legality belongs to the rule engine. This function only ranks an action.
 */
export function evaluateDeclarationDecision(
  type: DeclarationType,
  evidence: DecisionEvidence,
): DecisionEvaluation {
  const success = clamp(evidence.successProbability);
  const risk = 1 - success;
  const communication = clamp(evidence.communicationValue ?? 0, 0, 2);
  const confidence = clamp(evidence.modelConfidence ?? 1);
  const nominalValue = evidence.nominalValue ?? DECLARATION_VALUE[type];
  const position = evidence.positionValue ?? 0;
  const riskPenalty = evidence.riskPenalty ?? 0.12;

  // Expected figure value remains the main driver. Communication can justify
  // a risky declaration, but cannot turn a hopeless declaration into a good
  // one by itself. Confidence only affects how much we trust the estimate.
  const expectedValue = nominalValue * (success - risk * riskPenalty);
  const confidenceAdjustment = 0.65 + confidence * 0.35;
  const score = expectedValue * confidenceAdjustment + communication * 3.5 + position;

  return { expectedValue, successProbability: success, communicationValue: communication, risk, confidence, score };
}

export function evaluateCounterDecision(
  nominalValue: number,
  breakProbability: number,
  modelConfidence = 1,
  communicationValue = 0,
  positionValue = 0,
): DecisionEvaluation {
  const success = clamp(breakProbability);
  const risk = 1 - success;
  const confidence = clamp(modelConfidence);
  // A counter has asymmetric downside: the figure is worth more if broken,
  // but a weak counter exposes the defender to the figure's multiplier.
  const expectedValue = nominalValue * (success - risk * 0.18);
  const score = expectedValue * (0.65 + confidence * 0.35) + clamp(communicationValue, 0, 2) * 2 + positionValue;
  return { expectedValue, successProbability: success, communicationValue, risk, confidence, score };
}


export interface PlayDecisionEvidence {
  immediateTrickValue?: number;
  figurePreservation?: number;
  partnerSupport?: number;
  opponentPressure?: number;
  futureControl?: number;
  communicationValue?: number;
  riskPenalty?: number;
}

export interface PlayDecisionEvaluation {
  score: number;
  immediateTrickValue: number;
  figurePreservation: number;
  partnerSupport: number;
  opponentPressure: number;
  futureControl: number;
  risk: number;
}

/**
 * Common ranking layer for card play. It intentionally does not check legality;
 * legalCardsForPlay() remains the sole authority for legality.
 */
export function evaluatePlayDecision(evidence: PlayDecisionEvidence): PlayDecisionEvaluation {
  const immediate = evidence.immediateTrickValue ?? 0;
  const figure = evidence.figurePreservation ?? 0;
  const partner = evidence.partnerSupport ?? 0;
  const pressure = evidence.opponentPressure ?? 0;
  const control = evidence.futureControl ?? 0;
  const communication = evidence.communicationValue ?? 0;
  const riskPenalty = evidence.riskPenalty ?? 0;
  const risk = clamp(riskPenalty, 0, 2);
  const score = immediate + figure * 1.8 + partner * 1.15 + pressure * 1.2 + control * 1.35 + communication * 0.5 - risk * 1.4;
  return { score, immediateTrickValue: immediate, figurePreservation: figure, partnerSupport: partner, opponentPressure: pressure, futureControl: control, risk };
}

export function declarationNominalValue(type: DeclarationType): number {
  return DECLARATION_VALUE[type];
}

function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}
