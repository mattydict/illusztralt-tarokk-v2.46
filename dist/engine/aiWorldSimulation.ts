import { Card, isTarokk } from './cards.js';
import { DeclarationType, hasTarokk } from './declarations.js';
import { GameState, PlayerId } from './game.js';
import { HandHypothesisSummary, HandHypothesis } from './aiHandHypotheses.js';
import { rolloutDeclaration, fullRolloutDeclaration } from './aiRollout.js';

export interface WorldSimulationResult {
  declaration: DeclarationType;
  worlds: number;
  successProbability: number;
  failureProbability: number;
  confidence: number;
  reasons: string[];
}

/**
 * Evaluates declaration success over the currently plausible hidden worlds.
 * This is intentionally a world-model evaluator, not a hidden-hand oracle:
 * it only uses the observer's cards and the public-information hypothesis beam.
 * The play-out model is conservative and figure-specific; it does not claim
 * that every sampled world has been fully played.
 */
export function simulateDeclarationWorlds(
  state: GameState,
  observerId: PlayerId,
  hand: Card[],
  hypotheses: HandHypothesisSummary | undefined,
  declaration: DeclarationType,
): WorldSimulationResult | undefined {
  if (!hypotheses?.hypotheses?.length) return undefined;
  const partnerId = hypotheses.partnerId;
  const worlds = hypotheses.hypotheses;
  let weightedSuccess = 0;
  let total = 0;

  for (const world of worlds) {
    const probability = world.weight;
    const score = worldFigureScore(state, observerId, hand, partnerId, world, declaration);
    weightedSuccess += probability * score;
    total += probability;
  }

  const baseSuccessProbability = total ? clamp(weightedSuccess / total) : 0;
  const rollout = rolloutDeclaration(state, observerId, hypotheses, declaration, Math.min(512, Math.max(128, worlds.length * 8)));
  const fullTypes = new Set<DeclarationType>(['centrum','kismadar','nagymadar','pagatUltimo','pagatUhu','sasUltimo','sasUhu','volat']);
  const full = fullTypes.has(declaration) ? fullRolloutDeclaration(state, observerId, hypotheses, declaration, Math.min(256, Math.max(64, worlds.length * 3))) : undefined;
  const successProbability = full ? clamp(baseSuccessProbability * 0.35 + rollout.successProbability * 0.25 + full.successProbability * 0.40) : clamp(baseSuccessProbability * 0.55 + rollout.successProbability * 0.45);
  const confidence = full ? clamp(Math.min(1, worlds.length / 32) * 0.55 + full.confidence * 0.45) : clamp(Math.min(1, worlds.length / 32) * (0.65 + 0.35 * worldDiversity(worlds)));
  return {
    declaration,
    worlds: worlds.length,
    successProbability,
    failureProbability: 1 - successProbability,
    confidence,
    reasons: [...explain(declaration, successProbability, confidence, partnerId), ...rollout.failureReasons, ...(full?.failureModes ?? [])],
  };
}

function worldFigureScore(
  state: GameState,
  observerId: PlayerId,
  hand: Card[],
  partnerId: PlayerId | undefined,
  world: HandHypothesis,
  declaration: DeclarationType,
): number {
  const side: PlayerId[] = [observerId, ...(partnerId ? [partnerId] : [])];
  const hasOwn = (rank: number) => hasTarokk(hand, rank);
  const owner = (rank: number) => world.ownership[rank];
  const sideOwns = (rank: number) => hasOwn(rank) || side.includes(owner(rank) as PlayerId);
  const opponentsOwn = (rank: number) => owner(rank) !== undefined && owner(rank) !== 'unknown' && !side.includes(owner(rank) as PlayerId);
  const tarokkLength = hand.filter(isTarokk).length + side.reduce((n, id) => n + (countHypothesisTarokk(world, id) * 0.55), 0);

  switch (declaration) {
    case 'centrum':
      return pairFigureScore(sideOwns(20), sideOwns(21), sideOwns(22), tarokkLength, owner(20) === partnerId);
    case 'kismadar':
      return pairFigureScore(sideOwns(21), sideOwns(22), false, tarokkLength, owner(21) === partnerId);
    case 'nagymadar':
      return pairFigureScore(sideOwns(22), sideOwns(21), false, tarokkLength, owner(22) === partnerId);
    case 'pagatUltimo': case 'pagatUhu':
      return targetFigureScore(sideOwns(1), tarokkLength, declaration.endsWith('Uhu'));
    case 'sasUltimo': case 'sasUhu':
      return targetFigureScore(sideOwns(2), tarokkLength, declaration.endsWith('Uhu'));
    case 'kingUltimo': case 'kingUhu':
      return targetFigureScore(countHypothesisKings(world, side) >= 1, tarokkLength, declaration.endsWith('Uhu'));
    case 'xxiFogas':
      return catchScore(hasOwn(22), opponentsOwn(21), tarokkLength, state);
    case 'volat':
      return volatScore(tarokkLength, sideOwns(22), sideOwns(21), sideOwns(20));
    case 'doubleGame':
      return doubleScore(state, observerId, partnerId, tarokkLength);
    case 'tuletroa':
      return clamp(0.45 + Number(sideOwns(22)) * 0.18 + Number(sideOwns(21)) * 0.15 + Math.min(0.2, tarokkLength * 0.015));
    case 'fourKings':
      return clamp(0.35 + Math.min(0.35, countHypothesisKings(world, side) * 0.08) + Math.min(0.25, tarokkLength * 0.015));
    case 'tarokk8': return hand.filter(isTarokk).length >= 8 ? 1 : 0;
    case 'tarokk9': return hand.filter(isTarokk).length >= 9 ? 1 : 0;
    default: return 0.35;
  }
}

function pairFigureScore(primary: boolean, secondary: boolean, tertiary: boolean, tarokkLength: number, partnerHasPrimary: boolean): number {
  let score = 0.15;
  if (primary) score += 0.36;
  if (secondary) score += 0.15;
  if (tertiary) score += 0.08;
  if (partnerHasPrimary) score += 0.12;
  score += Math.min(0.16, Math.max(0, tarokkLength - 4) * 0.035);
  return clamp(score);
}

function targetFigureScore(hasTarget: boolean, tarokkLength: number, uhu: boolean): number {
  let score = hasTarget ? 0.56 : 0.08;
  score += Math.min(0.22, Math.max(0, tarokkLength - 4) * 0.035);
  if (uhu) score += 0.08;
  return clamp(score);
}

function catchScore(hasSkiz: boolean, opponentHasXXI: boolean, tarokkLength: number, state: GameState): number {
  if (!hasSkiz || !opponentHasXXI) return hasSkiz ? 0.08 : 0.01;
  const seatPressure = state.startingPlayerId ? 0.08 : 0.03;
  return clamp(0.45 + Math.min(0.25, Math.max(0, tarokkLength - 4) * 0.04) + seatPressure);
}

function volatScore(tarokkLength: number, skiz: boolean, xxi: boolean, xx: boolean): number {
  let score = 0.01 + Math.min(0.42, Math.max(0, tarokkLength - 5) * 0.055);
  score += Number(skiz) * 0.12 + Number(xxi) * 0.08 + Number(xx) * 0.05;
  return clamp(score);
}

function doubleScore(state: GameState, observerId: PlayerId, partnerId: PlayerId | undefined, tarokkLength: number): number {
  // Only the observer's own cards are hard information. Partner strength is
  // represented by the tarokk-length hypothesis, never by reading the hidden
  // partner hand. This keeps the AI from becoming an information oracle.
  const p = state.players.find(x => x.id === observerId);
  const ownPoints = p?.hand.reduce((s, c) => s + c.points, 0) ?? 0;
  const partnerEvidence = partnerId ? Math.min(0.22, Math.max(0, tarokkLength - 4) * 0.025) : 0;
  return clamp(0.15 + Math.min(0.48, ownPoints / 120) + partnerEvidence + Math.min(0.18, tarokkLength * 0.02));
}

function countHypothesisTarokk(world: HandHypothesis, playerId: PlayerId): number {
  return Object.values(world.ownership).filter(owner => owner === playerId).length;
}

function countHypothesisKings(world: HandHypothesis, side: PlayerId[]): number {
  // Kings are not part of the compact tarokk-only hypothesis beam. Keep this
  // hook explicit so a future full-card world sampler can replace it.
  void world; void side;
  return 0;
}

function worldDiversity(worlds: HandHypothesis[]): number {
  const distinct = new Set(worlds.map(w => JSON.stringify(w.ownership))).size;
  return Math.min(1, distinct / Math.max(1, worlds.length));
}

function explain(type: DeclarationType, success: number, confidence: number, partnerId?: PlayerId): string[] {
  const reasons = [`${Math.round(success * 100)}% becsült teljesítési esély ${Math.round(confidence * 100)}%-os modellbiztonság mellett.`];
  if (partnerId && ['centrum','kismadar','nagymadar','tuletroa'].includes(type)) reasons.push('A partner feltételezett tarokkstruktúrája is bekerült az értékelésbe.');
  if (type === 'xxiFogas') reasons.push('A fogásnál külön vizsgáltuk, hogy a XXI az ellenfél lehetséges világai szerint mennyire fenyegetően helyezkedik el.');
  return reasons;
}

function clamp(x: number): number { return Math.max(0, Math.min(1, x)); }
