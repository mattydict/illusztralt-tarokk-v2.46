import { contraMultiplier, nextContraLevel } from './contra.js';
import { contractValue, declaredFigureValue } from './settlement.js';
import { dealPlanSuccessProbability } from './aiDealPlan.js';
/**
 * Returns the nominal stake represented by a game or declaration target.
 * Settlement/legality remain authoritative elsewhere; this module only prices
 * the marginal economic exposure created by the next kontra step.
 */
export function stakeNominalValue(target, contract) {
    if (target === 'game')
        return contract ? contractValue(contract) : 1;
    return declaredFigureValue(target) ?? 0;
}
export function evaluateStakeEscalation(input) {
    const next = nextContraLevel(input.currentLevel);
    if (!next)
        return undefined;
    const nominalValue = stakeNominalValue(input.target, input.contract);
    if (nominalValue <= 0)
        return undefined;
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
export function estimateGameSuccessProbability(state, hand) {
    const contract = state.contract ?? 'three';
    return dealPlanSuccessProbability(hand, contract, 0.5);
}
function clamp(value) {
    return Math.max(0, Math.min(1, value));
}
