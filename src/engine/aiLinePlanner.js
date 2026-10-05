import { isTarokk } from './cards.js';
import { pairOf } from './partnership.js';
/**
 * Identify a concrete 2–3 trick mini-line from public state and rollout deltas.
 * This is intentionally a light plan classifier, not a hidden-hand solver.
 */
export function assessMiniLine(state, observerId, candidate, short, extended) {
    const partnerId = state.partnerId && state.takerId ?
        (pairOf(observerId, state.takerId, state.partnerId) === 'taker' ?
            (observerId === state.takerId ? state.partnerId : state.takerId) : undefined) : undefined;
    const nextId = state.trick?.cards.length === 0 ? nextPlayer(state, observerId) : undefined;
    const partnerNext = !!partnerId && nextId === partnerId;
    const partnerDelta = extended.partnerWinRate - short.partnerWinRate;
    const valueDelta = extended.expectedValue - short.expectedValue;
    const settlementDelta = extended.expectedSettlementForObserverSide - short.expectedSettlementForObserverSide;
    const confidence = Math.max(0, Math.min(1, extended.confidence));
    let kind = 'neutral';
    let score = 0;
    const reasons = [];
    if (partnerNext && isTarokk(candidate) && candidate.rank <= 18 && partnerDelta >= 0.05) {
        kind = 'partner-pass-return';
        score += 2.6 + Math.min(2.4, partnerDelta * 16);
        reasons.push('Átadás → partneri folytatás: a mostani tarokkos lap nagyobb eséllyel adja a kontrollt a partnernek, mint az alternatív rövid vonal.');
    }
    if (!partnerNext && partnerId && isTarokk(candidate) && short.partnerWinRate < 0.48 && extended.partnerWinRate >= short.partnerWinRate + 0.07) {
        kind = 'hold-return-partner';
        score += 1.8 + Math.min(2.2, partnerDelta * 14);
        reasons.push('Megtartás → visszahívás → partneri fogás: a hosszabb vonal később javítja a partner kontrollját.');
    }
    if (kind === 'neutral' && valueDelta >= 0.8 && settlementDelta >= 2 && partnerDelta >= 0.04) {
        kind = 'control-cycle';
        score += 2.2 + Math.min(2.5, valueDelta * 0.8);
        reasons.push('Kontrollciklus: a rövid előny nem önmagában, hanem a következő vezetés és visszavétel miatt válik értékessé.');
    }
    if (valueDelta <= -0.7 && partnerDelta <= -0.04) {
        score -= 2.2;
        reasons.push('A látszólagos megtartás után a partner kontrollja és a folytatás is romlik.');
    }
    score += Math.max(-1.2, Math.min(1.2, settlementDelta * 0.12));
    score *= 0.65 + confidence * 0.35;
    score = Math.max(-5, Math.min(5, score));
    if (!reasons.length)
        reasons.push('Nincs azonosítható stabil két-háromütéses mini-játékvonal.');
    return { kind, score, confidence, reasons: [...new Set(reasons)].slice(0, 3) };
}
function nextPlayer(state, playerId) {
    const ids = state.players.filter(p => p.active).map(p => p.id);
    const i = ids.indexOf(playerId);
    if (i < 0 || !ids.length)
        return undefined;
    return ids[(i + 1) % ids.length];
}
/**
 * Shallow counterfactual stress test for a mini-line. It does not invent
 * hidden cards: it stresses the already sampled public-information rollout
 * along the most damaging plausible response dimensions (partner control,
 * side control and settlement). This keeps the planner information-safe while
 * making it prefer lines that still work when the opponent reacts well.
 */
export function assessCounterfactualStress(short, extended) {
    const base = extended.expectedValue;
    const partnerFragility = Math.max(0, extended.partnerWinRate - short.partnerWinRate);
    const controlFragility = Math.max(0, extended.sideWinRate - short.sideWinRate);
    const settlementFragility = Math.max(0, extended.expectedSettlementForObserverSide - short.expectedSettlementForObserverSide);
    // These are deliberately bounded shocks, not a second independent rollout.
    // A line that depends heavily on one optimistic continuation is discounted.
    const partnerShock = Math.min(3.5, partnerFragility * 12);
    const controlShock = Math.min(3.5, controlFragility * 10);
    const settlementShock = Math.min(3.0, settlementFragility * 0.10);
    const worstCaseValue = base - Math.max(partnerShock, controlShock, settlementShock);
    const fragility = Math.max(0, Math.min(1, (partnerShock / 3.5) * 0.42 +
        (controlShock / 3.5) * 0.38 +
        (settlementShock / 3.0) * 0.20));
    let score = worstCaseValue * 0.55 - fragility * 2.4;
    score = Math.max(-5, Math.min(5, score));
    const reasons = [];
    if (partnerShock >= 1.2)
        reasons.push('A vonal érzékeny a partneri folytatás sikerére; jó ellenjáték esetén a partner kontrollja könnyen elolvadhat.');
    if (controlShock >= 1.2)
        reasons.push('A vonal az ütés feletti kontroll megtartására támaszkodik, ezért az ellenfél erős válasza érdemben ronthatja.');
    if (settlementShock >= 1.0)
        reasons.push('A kedvező partiérték egy része csak optimista folytatás mellett marad meg.');
    if (!reasons.length)
        reasons.push('A mini-vonal viszonylag robusztus: a fő előnye nem egyetlen optimista válaszra épül.');
    return { score, fragility, worstCaseValue, reasons: [...new Set(reasons)].slice(0, 3) };
}
