import { ContraLevel, contraMultiplier, nextContraLevel } from './contra.js';
import { DeclarationType, tarokkCount } from './declarations.js';
import { Contract, contractValue, declaredFigureValue } from './settlement.js';
import { GameState } from './game.js';
import { dealPlanSuccessProbability } from './aiDealPlan.js';

export type StakeTarget = 'game' | DeclarationType;

export interface StakeEscalationEvaluation {
  nominalValue: number;
  currentMultiplier: number;
  nextMultiplier: number;
  marginalStake: number;
  successProbability: number;
  expectedMarginalValue: number;
  attractive: boolean;
}

/**
 * Returns the nominal stake represented by a game or declaration target.
 * Settlement/legality remain authoritative elsewhere; this module only prices
 * the marginal economic exposure created by the next kontra step.
 */
export function stakeNominalValue(target: StakeTarget, contract?: Contract): number {
  if (target === 'game') return contract ? contractValue(contract) : 1;
  return declaredFigureValue(target) ?? 0;
}

export function evaluateStakeEscalation(input: {
  target: StakeTarget;
  contract?: Contract;
  currentLevel: ContraLevel;
  successProbability: number;
}): StakeEscalationEvaluation | undefined {
  const next = nextContraLevel(input.currentLevel);
  if (!next) return undefined;
  const nominalValue = stakeNominalValue(input.target, input.contract);
  if (nominalValue <= 0) return undefined;
  const currentMultiplier = contraMultiplier(input.currentLevel);
  const nextMultiplier = contraMultiplier(next);
  const marginalStake = nominalValue * (nextMultiplier - currentMultiplier);
  const successProbability = clamp(input.successProbability);
  const expectedMarginalValue = marginalStake * (2 * successProbability - 1);
  return {
    nominalValue,
    currentMultiplier,
    nextMultiplier,
    marginalStake,
    successProbability,
    expectedMarginalValue,
    attractive: expectedMarginalValue > 0,
  };
}

/**
 * Conservative estimate for the game-level outcome when no complete rollout
 * exists. It is intentionally weak and is only a pricing input for the
 * contra layer, never a legality decision.
 */
export function estimateGameSuccessProbability(state: GameState, hand: GameState['players'][number]['hand']): number {
  const contract = state.contract ?? 'three';
  return dealPlanSuccessProbability(hand, contract, 0.5);
}

function clamp(value: number): number {
  return Math.max(0, Math.min(1, value));
}
