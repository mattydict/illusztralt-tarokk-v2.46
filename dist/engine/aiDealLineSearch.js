import { createDeck } from './cards.js';
import { contractTalonCount } from './auctionOutcome.js';
import { declarationPortfolioValue, evaluateDealPlan } from './aiDealPlan.js';
import { chooseAISkart } from './aiSkart.js';
const DOWNSTREAM_FIGURES = [
    'tarokk8', 'tarokk9', 'fourKings', 'centrum', 'kismadar', 'nagymadar',
    'pagatUltimo', 'sasUltimo', 'kingUltimo', 'doubleGame', 'volat',
];
/**
 * Bounded auction look-ahead.
 *
 * At auction time the real talon is hidden. Instead of pretending the future
 * is known, this samples deterministic talon worlds from the cards outside
 * the AI's hand, applies the actual skart selector, and prices the resulting
 * post-skart hand with the same deal-plan model used later in the game.
 *
 * This is an evaluation layer only: it never decides legality and never reads
 * opponents' hidden hands.
 */
export function evaluateAuctionDealLine(input) {
    const count = contractTalonCount(input.contract);
    const requestedSamples = Math.max(1, Math.min(input.samples ?? (count === 0 ? 1 : 8), 12));
    if (count === 0) {
        const plan = evaluateDealPlan({
            hand: input.hand,
            contract: input.contract,
            isTaker: true,
            partnerSupport: input.partnerSupport ?? 0.5,
        });
        const figures = estimateDownstreamFigureOptionality(input.hand, plan.successProbability);
        const world = {
            talon: [],
            skart: [],
            remainingHand: [...input.hand],
            successProbability: plan.successProbability,
            dealPlanValue: plan.totalExpectedValue,
            figureOptionality: figures,
            downstreamValue: plan.totalExpectedValue + figures,
            reasons: ['Szóló: nincs talon, ezért egyetlen determinisztikus világ értékelhető.'],
        };
        return summarizeLine(input.contract, [world]);
    }
    const deck = createDeck();
    const ownIds = new Set(input.hand.map(card => card.id));
    const unseen = deck.filter(card => !ownIds.has(card.id));
    const worlds = sampleTalonWorlds(unseen, count, requestedSamples, seedFor(input.hand, input.contract));
    const evaluations = [];
    for (const talon of worlds) {
        const postTalonHand = [...input.hand, ...talon];
        const skart = chooseAISkart(postTalonHand, count, {
            isTaker: true,
            contract: input.contract,
        }).cards;
        const remainingHand = postTalonHand.filter(card => !skart.some(chosen => chosen.id === card.id));
        const plan = evaluateDealPlan({
            hand: remainingHand,
            contract: input.contract,
            isTaker: true,
            partnerSupport: input.partnerSupport ?? 0.5,
        });
        const figures = estimateDownstreamFigureOptionality(remainingHand, plan.successProbability);
        evaluations.push({
            talon: [...talon],
            skart: [...skart],
            remainingHand,
            successProbability: plan.successProbability,
            dealPlanValue: plan.totalExpectedValue,
            figureOptionality: figures,
            downstreamValue: plan.totalExpectedValue + figures,
            reasons: plan.reasons.slice(0, 2),
        });
    }
    return summarizeLine(input.contract, evaluations);
}
function summarizeLine(contract, worlds) {
    const values = worlds.map(world => world.downstreamValue);
    const expectedValue = mean(values);
    const valueStdDev = standardDeviation(values, expectedValue);
    const confidence = Math.max(0.35, Math.min(0.98, 1 - valueStdDev / Math.max(4, Math.abs(expectedValue) + 8)));
    const riskAdjustedValue = expectedValue - valueStdDev * 0.22;
    const successProbability = mean(worlds.map(world => world.successProbability));
    const figureOptionality = mean(worlds.map(world => world.figureOptionality));
    const reasons = [
        `${worlds.length} determinisztikus talonvilágon lefuttatott downstream keresés.`,
        `Átlagos játéksiker ${Math.round(successProbability * 100)}%, szórás ${valueStdDev.toFixed(2)}.`,
    ];
    if (riskAdjustedValue < expectedValue - 0.5) {
        reasons.push('A nagyobb szórás miatt óvatosabb lett a vonalérték.');
    }
    if (figureOptionality >= 2)
        reasons.push('A downstream fázisokban érdemi figura-opcionalitás marad.');
    if (contract === 'solo')
        reasons.push('Szólónál nincs talon- vagy fektetési bizonytalanság.');
    return {
        contract,
        sampleCount: worlds.length,
        expectedValue,
        riskAdjustedValue,
        valueStdDev,
        successProbability,
        figureOptionality,
        confidence,
        worlds,
        reasons,
    };
}
function estimateDownstreamFigureOptionality(hand, gameSuccess) {
    const candidates = DOWNSTREAM_FIGURES
        .map(type => declarationPortfolioValue(hand, type, gameSuccess))
        .filter(value => value > 0)
        .sort((a, b) => b - a);
    if (!candidates.length)
        return 0;
    return Math.min(9, candidates[0] + (candidates[1] ?? 0) * 0.30);
}
function sampleTalonWorlds(unseen, count, sampleCount, seed) {
    const result = [];
    const seen = new Set();
    let state = seed >>> 0;
    let attempts = 0;
    while (result.length < sampleCount && attempts < sampleCount * 20) {
        attempts += 1;
        const deck = [...unseen];
        for (let i = deck.length - 1; i > 0; i -= 1) {
            state = lcg(state);
            const j = state % (i + 1);
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        const talon = deck.slice(0, count).sort((a, b) => a.id.localeCompare(b.id));
        const key = talon.map(card => card.id).join('|');
        if (seen.has(key))
            continue;
        seen.add(key);
        result.push(talon);
    }
    return result.length ? result : [unseen.slice(0, count)];
}
function seedFor(hand, contract) {
    let hash = 2166136261 >>> 0;
    for (const id of [...hand.map(card => card.id).sort(), contract]) {
        for (let i = 0; i < id.length; i += 1) {
            hash ^= id.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
    }
    return hash >>> 0;
}
function lcg(state) {
    return (Math.imul(1664525, state) + 1013904223) >>> 0;
}
function mean(values) {
    if (!values.length)
        return 0;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}
function standardDeviation(values, average) {
    if (values.length <= 1)
        return 0;
    const variance = mean(values.map(value => (value - average) ** 2));
    return Math.sqrt(Math.max(0, variance));
}
