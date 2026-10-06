import { isTarokk } from './cards.js';
import { pairOf } from './partnership.js';
import { scorePartnerSignalAcknowledgement, scoreResponseToPartnerOpeningLead } from './leadConventions.js';
/**
 * Second-order communication layer: evaluates a play partly by what the
 * partner can reasonably infer from it. This never creates hidden information.
 * It only rewards public actions that are consistent with an already observed
 * partner signal and penalises contradictory/ambiguous replies.
 */
export function assessPartnerMetaCommunication(state, observerId, candidate, beliefs) {
    const partnerId = partnerFor(state, observerId);
    if (!partnerId)
        return emptyAssessment();
    const signalReply = scorePartnerSignalAcknowledgement(state, observerId, candidate);
    const response = scoreResponseToPartnerOpeningLead(state, observerId, candidate);
    let clarity = 0;
    let consistency = 0;
    let ambiguityPenalty = 0;
    const reasons = [];
    const partnerTarokkSignals = [19, 20, 21, 22].filter(rank => (beliefs.likelyTarokks.find(x => x.rank === rank)?.score ?? 0) >= 3);
    const figureSignals = Object.entries(beliefs.targetFigureInvitations)
        .filter(([, score]) => score >= 3)
        .map(([figure]) => figure);
    // A direct acknowledgement is clearer when the candidate is itself a
    // tarokk response to a live partner tarokk lead.
    if (signalReply.score > 0) {
        clarity += Math.min(5, signalReply.score);
        reasons.push(...signalReply.reasons.slice(0, 1));
    }
    if (response.score > 0) {
        consistency += Math.min(4, response.score * 0.7);
        reasons.push(...response.reasons.slice(0, 1));
    }
    // When several high-tarokk hypotheses are active, a deliberately extreme
    // response can become ambiguous: it may be read as a new control claim
    // rather than acknowledgement. Prefer a controlled tarokk response unless
    // the current signal specifically calls for the extreme card.
    if (candidate.kind === 'tarokk' && partnerTarokkSignals.length >= 2) {
        if (candidate.rank >= 22 && partnerTarokkSignals.includes(19) && !partnerTarokkSignals.includes(22)) {
            ambiguityPenalty += 1.8;
            reasons.push('A Skíz nélküli magas-tarokk hipotézis mellett a Skíz kijátszása félreérthető visszajelzés lenne.');
        }
        if (candidate.rank >= 20 && figureSignals.includes('centrum') && state.completedTricks.length + 1 < 5) {
            ambiguityPenalty += 0.7;
        }
    }
    // On an empty trick there is no immediate reply signal. A conventionally
    // coherent lead can still be informative, but only softly.
    if (!state.trick?.cards.length && isTarokk(candidate)) {
        const likelyHigh = Math.max(...partnerTarokkSignals, 0);
        if (likelyHigh >= 19 && candidate.rank <= 17) {
            consistency += 0.8;
            reasons.push('A partner feltételezett magas-tarokk struktúrájához illeszkedő kontrollvezetés.');
        }
    }
    // Do not reward signalling when the same play is likely to destroy an
    // urgent partner figure. Meta-communication is subordinate to the figure
    // portfolio; this layer only shapes close tactical choices.
    const urgencyPenalty = urgentPartnerFigurePenalty(state, observerId, candidate);
    ambiguityPenalty += urgencyPenalty;
    if (urgencyPenalty > 0)
        reasons.push('A jelzés tisztasága ellenére a partner sürgős figuracélja elsőbbséget élvez.');
    const score = Math.max(-5, Math.min(7, clarity * 0.65 + consistency * 0.85 - ambiguityPenalty));
    return { score, clarity, consistency, ambiguityPenalty, reasons: [...new Set(reasons)].slice(0, 3) };
}
function partnerFor(state, observerId) {
    const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
    if (side === 'unknown')
        return undefined;
    if (side === 'taker')
        return observerId === state.takerId ? state.partnerId : state.takerId;
    return state.players.find(p => p.active && p.id !== observerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
}
function urgentPartnerFigurePenalty(state, observerId, candidate) {
    const partnerId = partnerFor(state, observerId);
    if (!partnerId)
        return 0;
    const trickNo = state.completedTricks.length + 1;
    let penalty = 0;
    for (const declaration of state.declarations.declarations) {
        if (declaration.ownerId !== partnerId || declaration.status === 'failed' || declaration.status === 'fulfilled')
            continue;
        const deadline = declaration.type === 'centrum' ? 5
            : declaration.type === 'kismadar' ? 6
                : declaration.type === 'nagymadar' ? 7
                    : declaration.type === 'pagatUhu' || declaration.type === 'sasUhu' || declaration.type === 'kingUhu' ? 8
                        : declaration.type === 'pagatUltimo' || declaration.type === 'sasUltimo' || declaration.type === 'kingUltimo' || declaration.type === 'xxiFogas' ? 9
                            : undefined;
        if (deadline === undefined)
            continue;
        const urgency = Math.max(0, Math.min(1, 1 - (deadline - trickNo) / 3));
        if (urgency < 0.55)
            continue;
        if (isTarokk(candidate) && candidate.rank >= 19)
            penalty += urgency * 0.5;
    }
    return Math.min(2.5, penalty);
}
function emptyAssessment() {
    return { score: 0, clarity: 0, consistency: 0, ambiguityPenalty: 0, reasons: [] };
}
