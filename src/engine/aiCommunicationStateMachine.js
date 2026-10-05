import { isTarokk } from './cards.js';
import { pairOf } from './partnership.js';
import { scorePartnerSignalAcknowledgement, scoreResponseToPartnerOpeningLead, inferPartnerLeadSignalHistory } from './leadConventions.js';
/**
 * v2.27: reconstruct a two-way partner communication cycle from public play.
 * No persistent hidden state is required: the stage is derived from completed
 * tricks plus the current public trick. This models: partner signal -> reply
 * -> partner-side reinforcement/ambiguity -> next response.
 */
export function assessCommunicationStateMachine(state, observerId, candidate, partnerBeliefs) {
    const partner = partnerFor(state, observerId);
    if (!partner)
        return empty();
    const history = partnerSignalEvents(state, observerId, partner);
    const current = state.trick;
    const currentPartnerLead = current?.leader === partner && current.cards.length === 1 && isTarokk(current.cards[0].card);
    let acknowledgement = 0;
    let reinforcement = 0;
    let ambiguity = 0;
    const reasons = [];
    if (currentPartnerLead) {
        const direct = scorePartnerSignalAcknowledgement(state, observerId, candidate).score;
        const response = scoreResponseToPartnerOpeningLead(state, observerId, candidate).score;
        acknowledgement = clamp((direct * 0.65 + response * 0.35) / 5, -1, 1);
        if (acknowledgement >= 0.55)
            reasons.push('A partner jelzésére egyértelmű, de természetes visszajelzés érkezik.');
        if (acknowledgement <= -0.45)
            reasons.push('A válasz eltér a partner aktuális jelzésétől; ez csak indokolt taktikai eltérésként értékelhető.');
    }
    const recent = history.slice(-3);
    if (recent.length) {
        const compatible = recent.filter(e => e.replyScore >= 2).length;
        const contradictory = recent.filter(e => e.replyScore <= -2).length;
        reinforcement = clamp((compatible - contradictory * 0.9) / 2.5, -1, 1);
        if (compatible >= 2)
            reasons.push('A korábbi válaszok ugyanazt a partneri értelmezést erősítették meg.');
        if (contradictory >= 2)
            reasons.push('A korábbi válaszok vegyes képet adnak; az új jelzés ereje ezért csökken.');
    }
    // Ambiguity is useful only when there is already a coherent partner message.
    // It is never rewarded merely for being hard to interpret.
    const historySignal = inferPartnerLeadSignalHistory(state, observerId);
    if (historySignal) {
        const natural = isTarokk(candidate) && candidate.rank >= 11 && candidate.rank <= 19;
        if (natural && acknowledgement >= 0)
            ambiguity = 0.35 * historySignal.confidence;
        if (isTarokk(candidate) && candidate.rank >= 21)
            ambiguity -= 0.2;
    }
    const age = historySignal?.age ?? 0;
    const decay = historySignal ? Math.max(0, age - 1) * 0.12 : 0;
    const stage = currentPartnerLead
        ? (acknowledgement >= 0.55 ? 'acknowledged' : acknowledgement <= -0.45 ? 'ambiguous' : 'awaiting-response')
        : recent.length >= 2 && reinforcement >= 0.55
            ? 'reinforced'
            : historySignal && age >= 2
                ? 'decaying'
                : recent.length ? 'acknowledged' : 'idle';
    let score = acknowledgement * 2.6 + reinforcement * 1.7 + ambiguity * 1.15 - decay;
    // Beliefs moderate, but never create, a communication cycle.
    const beliefSignal = partnerBeliefs.likelyTarokks.filter(x => x.score >= 3).length;
    score *= 0.9 + Math.min(0.15, beliefSignal * 0.03);
    score = clamp(score, -4, 4);
    if (stage === 'reinforced')
        reasons.push('A kommunikációs ciklus már nem egyszeri jelzésként, hanem több publikus lépésben megerősített vonalként kezelhető.');
    if (stage === 'decaying')
        reasons.push('A régi jelzés már halványul; újabb megerősítés nélkül nem kezelhető kemény információként.');
    if (!reasons.length)
        reasons.push('Nincs elegendő publikus adat egy erős kétirányú kommunikációs ciklushoz.');
    return {
        score,
        stage,
        confidence: historySignal?.confidence ?? 0,
        acknowledgement,
        reinforcement,
        ambiguity,
        reasons: [...new Set(reasons)].slice(0, 3),
    };
}
function partnerSignalEvents(state, observerId, partnerId) {
    const events = [];
    for (let i = 0; i < state.completedTricks.length; i += 1) {
        const trick = state.completedTricks[i];
        if (trick.leader !== partnerId || !trick.cards.length)
            continue;
        const lead = trick.cards[0].card;
        if (!isTarokk(lead))
            continue;
        const reply = trick.cards.find(x => x.player === observerId)?.card;
        const replyScore = reply ? scoreHistoricalReply(state, observerId, lead, reply) : 0;
        events.push({ trickNumber: i + 1, lead, reply, replyScore });
    }
    return events;
}
function scoreHistoricalReply(state, observerId, lead, reply) {
    if (!isTarokk(reply))
        return -0.5;
    const history = inferPartnerLeadSignalHistory(state, observerId);
    if (!history)
        return 0;
    if (history.kind === 'skiz-drive')
        return reply.rank >= 19 && reply.rank < 22 ? 3 : reply.rank === 22 ? -3 : 0;
    if (history.kind === 'xxi-small')
        return reply.rank === 21 ? 3 : reply.rank <= 10 ? 1 : -1;
    if (history.kind === 'xxi-medium')
        return reply.rank === 21 ? 2.5 : reply.rank >= 19 ? -1 : 0;
    return 0;
}
function partnerFor(state, observerId) {
    const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
    if (side === 'unknown')
        return undefined;
    if (side === 'taker')
        return observerId === state.takerId ? state.partnerId : state.takerId;
    return state.players.find(p => p.active && p.id !== observerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
}
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function empty() {
    return { score: 0, stage: 'idle', confidence: 0, acknowledgement: 0, reinforcement: 0, ambiguity: 0, reasons: [] };
}
