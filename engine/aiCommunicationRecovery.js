import { isTarokk } from './cards.js';
import { pairOf } from './partnership.js';
import { inferPartnerLeadSignalHistory } from './leadConventions.js';
import { assessCommunicationErrorCorrection } from './aiCommunicationErrorCorrection.js';
/** v2.30: actively chooses a natural reply that can repair a weakened partner signal. */
export function assessCommunicationRecovery(state, observerId, candidate) {
    const partner = partnerFor(state, observerId);
    if (!partner || !state.trick?.cards.length)
        return empty();
    const signal = inferPartnerLeadSignalHistory(state, observerId);
    if (!signal)
        return empty();
    const correction = assessCommunicationErrorCorrection(state, observerId, candidate);
    if (correction.correction === 'none' || correction.correction === 'decaying')
        return empty();
    const lead = state.trick.cards[0]?.card;
    if (!lead || !isTarokk(lead) || !isTarokk(candidate))
        return empty();
    const target = targetRank(signal.kind);
    if (target === undefined)
        return empty();
    let score = 0;
    let recovery = 'stay-neutral';
    const reasons = [];
    if (correction.correction === 'tactical-exception') {
        // The previous deviation has a plausible tactical explanation. Reconfirm
        // softly rather than forcing the original signal with an extreme card.
        if (candidate.rank <= 10 || candidate.rank === target) {
            score += 1.2;
            recovery = 'reconfirm';
            reasons.push('A korábbi eltérés taktikai kényszernek tűnik; természetes tarokk-válasszal érdemes finoman visszaigazolni a korábbi jelzést.');
        }
        else {
            score -= 0.4;
            recovery = 'stay-neutral';
        }
    }
    else if (correction.correction === 'contradicted') {
        // One contradiction is not enough to invent a new message. Prefer a
        // medium/low acknowledgement that keeps both interpretations alive.
        if (candidate.rank <= 10) {
            score += 1.4;
            recovery = 'clarify';
            reasons.push('Egyetlen ellentmondás után az AI kis tarokkal tisztázó, de nem túlzó választ preferál.');
        }
        else if (candidate.rank === target) {
            score += 0.5;
            recovery = 'reconfirm';
            reasons.push('A korábbi jelzés közvetlen visszaigazolása még lehetséges, de az AI nem kezeli már biztos információként.');
        }
    }
    else if (correction.correction === 'reinterpreted') {
        // Repeated contradiction: do not stubbornly repeat the old signal.
        if (candidate.rank === target || candidate.rank > target) {
            score -= 1.6;
            recovery = 'avoid-overcorrection';
            reasons.push('A partneri játék több alkalommal eltért; a régi jelzés erőltetett megismétlése már kommunikációs túlkorrekció lenne.');
        }
        else if (candidate.rank <= 10) {
            score += 0.7;
            recovery = 'stay-neutral';
            reasons.push('Az AI semleges, természetes tarokk-válasszal tartja nyitva az újraértelmezést.');
        }
    }
    // Never let recovery override a hard tactical decision: bounded influence only.
    return { score: Math.max(-2, Math.min(2, score)), recovery, reasons: [...new Set(reasons)].slice(0, 2) };
}
function targetRank(kind) {
    if (kind === 'skiz-drive')
        return 22;
    if (kind === 'xxi-small' || kind === 'xxi-medium')
        return 21;
    return undefined;
}
function partnerFor(state, observerId) {
    const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
    if (side === 'unknown')
        return undefined;
    if (side === 'taker')
        return observerId === state.takerId ? state.partnerId : state.takerId;
    return state.players.find(p => p.active && p.id !== observerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
}
function empty() {
    return { score: 0, recovery: 'none', reasons: [] };
}
