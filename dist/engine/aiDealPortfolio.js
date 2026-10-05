import { contractValue } from './settlement.js';
import { contraMultiplier } from './contra.js';
import { declaredFigureValue as declarationValue } from './settlement.js';
/**
 * One bounded economic layer for all AI phases.
 *
 * This does not decide legality and deliberately does not replace specialist
 * convention engines. It only normalises the way the different phases price
 * success, failure risk, optionality, communication and tactical value.
 */
export function evaluateDealPortfolio(input) {
    const success = clamp(input.successProbability);
    const confidence = clamp(input.confidence ?? 1);
    const communication = clamp(input.communicationValue ?? 0, 0, 2);
    const position = clampSigned(input.positionValue ?? 0, 12);
    const optionality = clampSigned(input.optionalityValue ?? 0, 12);
    const tactical = clampSigned(input.tacticalValue ?? 0, 20);
    const upside = Math.max(0, input.upside);
    const downside = Math.max(0, input.downside);
    const exposure = Math.max(0, input.targetValue ?? downside);
    const grossExpectedValue = upside * success;
    const downsideRisk = downside * (1 - success);
    const confidenceWeight = 0.65 + confidence * 0.35;
    const base = (grossExpectedValue - downsideRisk) * confidenceWeight;
    // Keep the common layer bounded so a specialist rule can still dominate it.
    const phaseWeight = {
        auction: 0.85,
        skart: 0.70,
        declaration: 0.90,
        contra: 0.95,
        play: 0.55,
    };
    const soft = optionality * 0.42
        + communication * 2.2
        + position * 0.65
        + tactical * phaseWeight[input.phase];
    const score = clampSigned(base + soft, 25);
    const netExpectedValue = base + optionality * 0.35 + communication * 1.4 + position * 0.45 + tactical * 0.65;
    return {
        phase: input.phase,
        successProbability: success,
        confidence,
        grossExpectedValue,
        downsideRisk,
        optionalityValue: optionality,
        tacticalValue: tactical,
        communicationValue: communication,
        positionValue: position,
        netExpectedValue,
        score,
        exposure,
    };
}
/**
 * Price an auction contract through the same portfolio lens used later.
 * Pass has an explicit outside-option price instead of pretending it is a
 * contract with zero value.
 */
export function evaluateAuctionPath(input) {
    if (input.action === 'pass') {
        return evaluateDealPortfolio({
            phase: 'auction',
            successProbability: 1,
            upside: 0,
            downside: 0,
            confidence: input.confidence ?? 1,
            optionalityValue: Math.max(0, input.figureOptionality ?? 0),
            positionValue: input.positionValue ?? 0,
            tacticalValue: input.tacticalValue ?? 0,
        });
    }
    const contract = input.contract ?? 'three';
    const nominal = contractValue(contract);
    const success = input.successProbability ?? 0.5;
    return evaluateDealPortfolio({
        phase: 'auction',
        contract,
        successProbability: success,
        upside: nominal * 1.45,
        downside: nominal,
        confidence: input.confidence ?? 1,
        optionalityValue: input.figureOptionality ?? 0,
        positionValue: input.positionValue ?? 0,
        tacticalValue: input.tacticalValue ?? 0,
        targetValue: nominal,
    });
}
export function evaluateDeclarationPath(input) {
    const nominal = declarationValue(input.type) ?? 0;
    const multiplier = contraMultiplier(input.contraLevel ?? 'none');
    const exposure = nominal * multiplier;
    return evaluateDealPortfolio({
        phase: 'declaration',
        successProbability: input.successProbability,
        upside: exposure,
        downside: exposure,
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.communicationValue !== undefined ? { communicationValue: input.communicationValue } : {}),
        ...(input.positionValue !== undefined ? { positionValue: input.positionValue } : {}),
        ...(input.tacticalValue !== undefined ? { tacticalValue: input.tacticalValue } : {}),
        targetValue: exposure,
    });
}
export function evaluateContraPath(input) {
    const currentMultiplier = contraMultiplier(input.currentLevel);
    const nextMultiplier = nextMultiplierFor(input.currentLevel);
    const marginal = input.targetValue * Math.max(0, nextMultiplier - currentMultiplier);
    return evaluateDealPortfolio({
        phase: 'contra',
        successProbability: input.breakProbability,
        upside: marginal,
        downside: marginal,
        ...(input.confidence !== undefined ? { confidence: input.confidence } : {}),
        ...(input.communicationValue !== undefined ? { communicationValue: input.communicationValue } : {}),
        ...(input.positionValue !== undefined ? { positionValue: input.positionValue } : {}),
        ...(input.tacticalValue !== undefined ? { tacticalValue: input.tacticalValue } : {}),
        targetValue: marginal,
    });
}
function nextMultiplierFor(level) {
    const order = ['none', 'kontra', 'rekontra', 'szubkontra', 'mordkontra'];
    const index = order.indexOf(level);
    return contraMultiplier(order[Math.min(index + 1, order.length - 1)]);
}
function clamp(value, min = 0, max = 1) {
    return Math.max(min, Math.min(max, value));
}
function clampSigned(value, limit) {
    return Math.max(-limit, Math.min(limit, value));
}
