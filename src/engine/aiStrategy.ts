import { Card, isTarokk } from './cards.js';
import { DeclarationType, DeclarationContext, tarokkCount, hasTarokk, kingCount } from './declarations.js';
import { PartnerBeliefState } from './partnerBeliefs.js';
import { AIBeliefSnapshot } from './aiBeliefEngine.js';
import { HandHypothesisSummary } from './aiHandHypotheses.js';
import { simulateDeclarationWorlds } from './aiWorldSimulation.js';
import { GameState } from './game.js';
import { evaluateDeclarationDecision } from './aiDecisionEvaluator.js';
import { communicationSignalFor, inferPartnerInformation } from './signals.js';

export interface AIStrategyContext extends DeclarationContext {
  /** Seat of the speaker in table order (0..3), if known. */
  speakerSeat?: number;
  /** Seat of the partner, if known. */
  partnerSeat?: number;
  /** Seat of the player who starts the first trick. */
  starterSeat?: number;
  /** Soft estimate that the partner is able to support the intended figure. */
  partnerSupport?: number;
  worldBeliefs?: AIBeliefSnapshot;
  handHypotheses?: HandHypothesisSummary;
  worldSimulation?: { declaration: DeclarationType; successProbability: number; confidence: number };
  gameState?: GameState;
}

export interface FigureEstimate {
  success: number;
  communication: number;
  risk: number;
}

const VALUE: Record<DeclarationType, number> = {
  tarokk8: 1, tarokk9: 2, tuletroa: 2, fourKings: 2, doubleGame: 4, volat: 6,
  pagatUltimo: 10, sasUltimo: 10, kingUltimo: 15,
  pagatUhu: 20, sasUhu: 20, kingUhu: 25,
  centrum: 10, kismadar: 10, nagymadar: 10, xxiFogas: 60,
};

/**
 * Strategic estimate, deliberately probabilistic rather than a legality test.
 * A low estimate never removes a declaration from the UI; it only makes the AI
 * less likely to choose it. The AI may still make a bad declaration.
 */
export function estimateDeclaration(option: DeclarationType, hand: Card[], context: AIStrategyContext, beliefs: PartnerBeliefState): FigureEstimate {
  const t = tarokkCount(hand);
  const big = Number(hasTarokk(hand, 21)) + Number(hasTarokk(hand, 22));
  const kings = kingCount(hand);
  let success = 0.25;
  let communication = 0;

  switch (option) {
    case 'tuletroa': success = 0.35 + big * 0.2 + (context.partnerSupport ?? 0) * 0.03; communication = context.isPartner ? 0.8 : 0.5; break;
    case 'fourKings': success = Math.min(0.9, 0.2 + kings * 0.12 + (context.trullDeclared ? 0.18 : 0)); communication = context.trullDeclared ? 1.0 : 0.55; break;
    case 'doubleGame': {
      // A rough card-value proxy: honours/tarokks increase control, but the AI
      // should not equate length alone with 71 points.
      const control = Math.min(1, (t * 0.07) + big * 0.08 + kings * 0.02);
      success = 0.25 + control;
      if (beliefs.encouragements.doubleGame) communication += Math.min(1.5, beliefs.encouragements.doubleGame.score * 0.25);
      break;
    }
    case 'volat': success = Math.min(0.82, 0.02 + t * 0.045 + big * 0.06 + (context.partnerSupport ?? 0) * 0.03); success = blendBelief(success, context.worldBeliefs?.figurePressure.volat); break;
    case 'centrum': success = Math.min(0.9, 0.15 + Number(hasTarokk(hand, 20)) * 0.3 + big * 0.1 + Math.max(0, t - 4) * 0.04 + (context.partnerSupport ?? 0) * 0.08 + (context.handHypotheses?.targetProfiles.centrumCore ?? 0) * 0.22); success = blendBelief(success, context.worldBeliefs?.figurePressure.centrum); communication = context.trullDeclared ? 1.0 : 0.65; break;
    case 'kismadar': success = Math.min(0.9, 0.12 + Number(hasTarokk(hand, 21)) * 0.28 + big * 0.08 + Math.max(0, t - 5) * 0.04 + (context.partnerSupport ?? 0) * 0.1 + (context.handHypotheses?.targetProfiles.kismadarCore ?? 0) * 0.20); success = blendBelief(success, context.worldBeliefs?.figurePressure.kismadar); communication = 0.8; break;
    case 'nagymadar': success = Math.min(0.9, 0.1 + Number(hasTarokk(hand, 22)) * 0.3 + big * 0.08 + Math.max(0, t - 5) * 0.04 + (context.partnerSupport ?? 0) * 0.1 + (context.handHypotheses?.targetProfiles.nagymadarCore ?? 0) * 0.20); success = blendBelief(success, context.worldBeliefs?.figurePressure.nagymadar); communication = 0.8; break;
    case 'pagatUltimo': success = targetFigureChance(1, hand, t, false, context); communication = context.isPartner ? 0.7 : 0.25; break;
    case 'sasUltimo': success = targetFigureChance(2, hand, t, false, context); communication = context.isPartner ? 0.5 : 0.2; break;
    case 'kingUltimo': success = kingFigureChance(hand, kings, t, false, context); break;
    case 'pagatUhu': success = targetFigureChance(1, hand, t, true, context); break;
    case 'sasUhu': success = targetFigureChance(2, hand, t, true, context); break;
    case 'kingUhu': success = kingFigureChance(hand, kings, t, true, context); break;
    case 'xxiFogas': {
      success = 0.02 + (hasTarokk(hand, 22) ? 0.18 : 0) + (context.xxiThreatScore ?? 0) * 0.045 + (context.skizCapturePressure ?? 0) * 0.04;
      if (context.xxiThreatScore && context.xxiThreatScore >= 8) communication += 0.5;
      success = blendBelief(success, context.worldBeliefs?.figurePressure.xxiFogas);
      break;
    }
    case 'tarokk8': success = t >= 8 ? 1 : 0; break;
    case 'tarokk9': success = t >= 9 ? 1 : 0; break;
  }

  // Communication is intentionally separate from fulfilment. This lets the AI
  // make a risky but meaningful signal when it improves partner coordination.
  const risk = 1 - success;
  return { success: clamp(success), communication, risk };
}

function blendBelief(local: number, belief?: number): number {
  return belief === undefined ? local : clamp(local * 0.62 + belief * 0.38);
}

function targetFigureChance(target: number, hand: Card[], t: number, uhu: boolean, context: AIStrategyContext): number {
  const has = hasTarokk(hand, target);
  const higher = hand.filter(c => c.kind === 'tarokk' && c.rank > target).length;
  const control = hand.filter(c => c.kind === 'tarokk' && c.rank >= Math.max(17, target - 2)).length;
  const latePenalty = (context.gameState?.completedTricks.length ?? 0) > (uhu ? 6 : 7) ? 0.12 : 0;
  let score = has ? 0.34 : 0.08;
  score += Math.min(0.18, Math.max(0, t - 4) * 0.028);
  score += Math.min(0.14, control * 0.022);
  score += Math.min(0.10, higher * 0.025);
  if (uhu) score -= 0.08;
  score -= latePenalty;
  return Math.min(0.9, Math.max(0.02, score));
}

function kingFigureChance(hand: Card[], kings: number, t: number, uhu: boolean, context: AIStrategyContext): number {
  const target = context.gameState?.declarations.declarations.find(d =>
    (d.type === (uhu ? 'kingUhu' : 'kingUltimo')) && d.status !== 'failed' && d.status !== 'fulfilled'
  )?.targetCardId;
  const hasTarget = target ? hand.some(c => c.id === target) : kings > 0;
  const control = hand.filter(c => c.kind === 'tarokk' && c.rank >= 17).length;
  let score = hasTarget ? 0.34 : 0.10;
  score += Math.min(0.20, Math.max(0, t - 4) * 0.03);
  score += Math.min(0.14, control * 0.024);
  if (uhu) score -= 0.08;
  if (context.gameState && context.gameState.completedTricks.length >= (uhu ? 7 : 8)) score -= 0.08;
  return Math.min(0.88, Math.max(0.02, score));
}
function clamp(x: number): number { return Math.max(0, Math.min(1, x)); }

export function declarationStrategicScore(option: DeclarationType, hand: Card[], context: AIStrategyContext, beliefs: PartnerBeliefState): { score: number; estimate: FigureEstimate } {
  const e = estimateDeclaration(option, hand, context, beliefs);
  const value = VALUE[option];
  // Expected value dominates, while communication can justify a moderate risk.
  // A figure worth 60 is not automatically good: the success probability matters.
  const simulation = context.gameState && context.worldBeliefs?.observerId && context.handHypotheses
    ? simulateDeclarationWorlds(context.gameState, context.worldBeliefs.observerId, hand, context.handHypotheses, option)
    : undefined;
  if (simulation) {
    context.worldSimulation = { declaration: option, successProbability: simulation.successProbability, confidence: simulation.confidence };
    e.success = clamp(e.success * 0.45 + simulation.successProbability * 0.55);
    e.risk = 1 - e.success;
  }
  const positionBonus = positionalBonus(context);
  const communication = communicationDecisionValue(option, context, beliefs);
  const evaluation = evaluateDeclarationDecision(option, {
    successProbability: e.success,
    communicationValue: Math.max(e.communication, communication.value),
    ...(simulation ? { modelConfidence: simulation.confidence } : {}),
    nominalValue: value,
    positionValue: positionBonus + communication.positionValue,
    riskPenalty: communication.riskPenalty,
  });
  return { score: evaluation.score, estimate: e };
}

function positionalBonus(context: AIStrategyContext): number {
  if (context.speakerSeat === undefined || context.partnerSeat === undefined) return 0;
  const distance = (context.partnerSeat - context.speakerSeat + 4) % 4;
  // Sitting opposite is less direct for some communication chains; adjacent
  // partner signalling is slightly easier to coordinate. This is deliberately soft.
  return distance === 1 || distance === 3 ? 0.35 : 0;
}


interface CommunicationDecisionValue {
  value: number;
  positionValue: number;
  riskPenalty: number;
}

/**
 * Scores the information content of a declaration separately from its
 * fulfilment probability.  The signal layer is intentionally soft: a
 * convention can make a declaration more attractive, but never turns a
 * hidden card into known information.
 */
function communicationDecisionValue(
  option: DeclarationType,
  context: AIStrategyContext,
  beliefs: PartnerBeliefState,
): CommunicationDecisionValue {
  const previous = context.previousDeclarations;
  const baseContext = {
    previous,
    ...(context.invitedTarokk !== undefined ? { invitedTarokk: context.invitedTarokk } : {}),
    ...(context.calledTarokk !== undefined ? { calledTarokk: context.calledTarokk } : {}),
    ...(context.contract !== undefined ? { contract: context.contract } : {}),
    isTaker: context.isTaker,
    ...(context.speakerSeat !== undefined ? { speakerSeat: context.speakerSeat } : {}),
    ...(context.partnerSeat !== undefined ? { partnerSeat: context.partnerSeat } : {}),
    speakerDeclarations: previous,
    ...(context.speakerSeat !== undefined && context.starterSeat !== undefined
      ? { speakerIsStarter: context.speakerSeat === context.starterSeat }
      : {}),
    ...(context.seatContext !== undefined ? { seatContext: context.seatContext } : {}),
    ...(context.lastSeatHasXVIIAndUnboundHigherTarokk !== undefined
      ? { lastSeatHasXVIIAndUnboundHigherTarokk: context.lastSeatHasXVIIAndUnboundHigherTarokk }
      : {}),
    ...(context.ollosPosition !== undefined ? { ollosPosition: context.ollosPosition } : {}),
    ...(context.speakerIsLastSeat !== undefined ? { speakerIsLastSeat: context.speakerIsLastSeat } : {}),
    ...(context.passedAfterChain !== undefined ? { passedAfterChain: context.passedAfterChain } : {}),
  };

  const signal = communicationSignalFor(baseContext, option);
  const inferred = inferPartnerInformation(baseContext);

  let value = 0;
  let positionValue = 0;
  let riskPenalty = 0.12;

  if (signal) {
    if (signal.meaning === 'cardSignal') value += signal.confidence === 'rule' ? 1.4 : 1.1;
    if (signal.meaning === 'encouragement') value += 0.65;
    if (signal.meaning === 'targetFigureInvitation') value += 0.9;
  }

  // The most useful signal is one that answers a live question in the
  // partnership. Reward only modestly: the AI should not sacrifice a
  // highly probable figure merely to send a message.
  const relevant = inferred.filter(item => {
    if (option === 'fourKings') return item.kind === 'knownTarokkSet' || item.kind === 'tarokkCountAtLeast';
    if (option === 'doubleGame') return item.kind === 'speakerOwnTarokkSet' || item.kind === 'encouragement';
    if (option === 'centrum' || option === 'kismadar' || option === 'nagymadar') return item.kind === 'targetFigureInvitation' || item.kind === 'encouragement';
    if (option === 'tarokk8' || option === 'tarokk9') return item.kind === 'tarokkCountAtLeast' || item.kind === 'knownTarokkSet';
    return item.kind === 'encouragement' || item.kind === 'targetFigureInvitation';
  });
  value += Math.min(0.9, relevant.length * 0.3);

  if (context.partnerSupport !== undefined) {
    const support = Math.max(0, Math.min(1, context.partnerSupport));
    positionValue += support * value * 0.45;
  }

  if (value >= 1.2 && context.partnersKnown) riskPenalty = 0.10;

  // Existing encouragements are evidence, never facts.
  if (beliefs.encouragements.doubleGame && option === 'doubleGame') {
    value += Math.min(0.6, beliefs.encouragements.doubleGame.score * 0.1);
  }

  return { value: Math.min(2, value), positionValue: Math.min(0.8, positionValue), riskPenalty };
}
