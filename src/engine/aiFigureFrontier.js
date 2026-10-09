import { pairOf } from './partnership.js';
import { determineWinner } from './play.js';
/**
 * v2.10: explicit figure-frontier coordination.
 *
 * The existing portfolio layers estimate many figures independently. This
 * layer looks at the *remaining distance* to each live objective and rewards a
 * card that moves several objectives at once. It never inspects hidden hands;
 * only completed/open tricks, active declarations and observer-relative
 * silent-figure hypotheses are used.
 */
export function assessFigureFrontierPlay(state, observerId, candidate, landscape) {
    const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
    const opponentSide = side === 'taker' ? 'defence' : side === 'defence' ? 'taker' : 'unknown';
    const partnerId = partnerFor(state, observerId);
    const trickNo = state.completedTricks.length + 1;
    const winners = projectedWinner(state, observerId, candidate);
    const closes = state.trick ? state.trick.cards.length + 1 >= activePlayers(state) : false;
    const reasons = [];
    let own = 0;
    let partner = 0;
    let opponent = 0;
    let urgency = 0;
    for (const threat of landscape.threats) {
        const relevance = 0.35 + 0.65 * Math.min(1, threat.probability) * (0.45 + 0.55 * threat.urgency);
        const frontier = frontierDelta(state, observerId, candidate, threat, winners, closes, trickNo);
        if (frontier === 0)
            continue;
        const weighted = Math.max(-14, Math.min(14, frontier * relevance));
        if (threat.relation === 'self')
            own += weighted;
        else if (threat.relation === 'partner')
            partner += weighted;
        else
            opponent += -weighted;
        urgency = Math.max(urgency, threat.urgency * Math.min(1, Math.abs(weighted) / 8));
        if (Math.abs(weighted) >= 4) {
            const verb = weighted > 0 ? 'közelíti' : 'távolítja';
            reasons.push(`${threat.label}: a kijátszás ${verb} a cél teljesítésének határát.`);
        }
    }
    // Explicit declarations are checked against their current remaining target
    // frontier too. This is intentionally narrow: it complements, rather than
    // replaces, declaration-specific planners.
    for (const d of state.declarations.declarations.filter(isActiveDeclaration)) {
        const relation = relationOf(d.ownerId, observerId, partnerId, side, opponentSide, state);
        if (!relation)
            continue;
        const delta = declaredFrontierDelta(state, observerId, candidate, d, winners, closes, trickNo);
        if (!delta)
            continue;
        const confidence = declarationPriority(d);
        const weighted = delta * confidence;
        if (relation === 'self')
            own += weighted;
        else if (relation === 'partner')
            partner += weighted;
        else
            opponent += -weighted;
        if (Math.abs(weighted) >= 4) {
            reasons.push(`${declarationLabel(d)}: a kijátszás ${weighted > 0 ? 'javítja' : 'rontja'} a még nyitott célablakot.`);
        }
    }
    // Portfolio synergy: a single trick can close more than one objective. A
    // positive own+partner frontier is deliberately preferred over two isolated
    // small gains, while simultaneous destruction of an opponent target is an
    // additional bonus rather than a replacement for the own side.
    const positiveBands = [own, partner, opponent].filter(v => v > 3).length;
    const synergy = Math.min(7, Math.max(0, positiveBands - 1) * 1.75 + (own > 5 && partner > 4 ? 1.25 : 0));
    let score = own * 0.86 + partner * 0.72 + opponent * 0.64 + synergy;
    // Hard-deadline conservation. Near an Ultimo/Uhu/bird deadline, a move that
    // demonstrably preserves the target winner gets more weight than a broad,
    // speculative silent-figure gain.
    const nearestDeadline = nearestDeadlineFor(state, observerId);
    if (nearestDeadline !== undefined) {
        const d = nearestDeadline - trickNo;
        if (d <= 1) {
            const pressure = Math.min(1.5, 1.15 + Math.max(0, urgency));
            score += Math.max(0, own + partner) * 0.11 * pressure;
            score -= Math.max(0, -own) * 0.08 * pressure;
        }
    }
    if (synergy >= 3)
        reasons.push('Egyetlen kijátszás több élő figura-határvonalon egyszerre javít.');
    if (own > 5 && opponent > 5)
        reasons.push('A lépés egyszerre védi a saját célokat és fojt meg egy ellenoldali lehetőséget.');
    if (partner > 5 && own > 5)
        reasons.push('A saját és partneri figurák azonos kijátszási irányt támogatnak.');
    return {
        score: clamp(score, -24, 24),
        own: clamp(own, -22, 22),
        partner: clamp(partner, -22, 22),
        opponent: clamp(opponent, -22, 22),
        urgency: clamp(urgency, 0, 1),
        synergy,
        reasons: [...new Set(reasons)].slice(0, 5),
    };
}
function frontierDelta(state, observerId, candidate, threat, winners, closes, trickNo) {
    const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
    const targetSide = relationSide(threat.relation, side);
    if (targetSide === 'unknown')
        return 0;
    if (threat.type === 'tuletroa' || threat.type === 'fourKings') {
        const targetIds = threat.type === 'tuletroa'
            ? ['T20', 'T21', 'T22']
            : ['hearts-K', 'diamonds-K', 'spades-K', 'clubs-K'];
        const remainingBefore = targetIds.filter(id => !hasCardWonBySide(state, id, targetSide)).length;
        if (remainingBefore <= 0)
            return 0;
        const winsTarget = closes && winners !== undefined && targetCardInCurrentTrick(state, winners, targetIds);
        if (!winsTarget)
            return 0;
        return targetSide === side ? 8 - remainingBefore : -7 + remainingBefore * 0.3;
    }
    if (threat.type === 'pagatUltimo' || threat.type === 'sasUltimo') {
        if (trickNo !== 9 || !closes)
            return preserveUltimoValue(state, candidate, threat, targetSide === side);
        const targetId = threat.type === 'pagatUltimo' ? 'T1' : 'T2';
        const winsTarget = winnerTakesCard(state, winners, targetId);
        if (winsTarget)
            return targetSide === side ? 12 : -12;
        if (cardInCurrentTrick(state, targetId) && !winsTarget)
            return targetSide === side ? -10 : 10;
        return 0;
    }
    if (threat.type === 'xxiFogas') {
        const targetIds = ['T21', 'T22'];
        if (state.trick?.cards.some(x => targetIds.includes(x.card.id)) && closes) {
            const winsPair = targetIds.every(id => cardInCurrentTrick(state, id) || (winners ? cardWonInCompleted(state, id, winners) : false));
            if (winsPair)
                return targetSide === side ? 10 : -10;
        }
        return 0;
    }
    if (threat.type === 'doubleGame') {
        return doubleGameFrontierDelta(state, targetSide, observerId, candidate, closes, winners);
    }
    if (threat.type === 'volat') {
        if (!closes)
            return 0;
        return winners && pairOf(winners, state.takerId ?? '', state.partnerId) === targetSide ? 3.2 : -9;
    }
    return 0;
}
function sidePoints(state, side, observerId) {
    let points = state.completedTricks.reduce((sum, trick) => {
        if (pairOf(trick.winner ?? '', state.takerId ?? '', state.partnerId) !== side)
            return sum;
        return sum + trick.cards.reduce((s, play) => s + play.card.points, 0);
    }, 0);
    if (pairOf(observerId, state.takerId ?? '', state.partnerId) === side) {
        points += (state.skartsByPlayer?.[observerId] ?? []).reduce((s, card) => s + card.points, 0);
    }
    return points;
}
function doubleGameFrontierDelta(state, targetSide, observerId, candidate, closes, winners) {
    const before = sidePoints(state, targetSide, observerId);
    if (before >= 71)
        return 0;
    const gained = state.trick && closes && winners && pairOf(winners, state.takerId ?? '', state.partnerId) === targetSide
        ? state.trick.cards.reduce((sum, x) => sum + x.card.points, 0) + candidate.points
        : 0;
    const after = before + gained;
    if (after >= 71)
        return targetSide === pairOf(observerId, state.takerId ?? '', state.partnerId) ? 10 : 9;
    const beforeGap = Math.max(0, 71 - before);
    const afterGap = Math.max(0, 71 - after);
    return Math.max(-3, beforeGap - afterGap);
}
function preserveUltimoValue(state, candidate, threat, ownSide) {
    const targetId = threat.type === 'pagatUltimo' ? 'T1' : 'T2';
    if (candidate.id === targetId && state.completedTricks.length + 1 < 9)
        return ownSide ? -5.5 : 6.0;
    return 0;
}
function declaredFrontierDelta(state, observerId, candidate, declaration, winners, closes, trickNo) {
    const side = pairOf(declaration.ownerId, state.takerId ?? '', state.partnerId);
    if (side === 'unknown')
        return 0;
    const deadline = deadlineFor(declaration);
    if (deadline === undefined)
        return 0;
    const target = targetFor(declaration);
    if (target && candidate.id === target && trickNo < deadline)
        return -8;
    if (!closes || !winners)
        return 0;
    if (trickNo !== deadline || !target)
        return 0;
    if (!winnerTakesCard(state, winners, target))
        return -8;
    return pairOf(winners, state.takerId ?? '', state.partnerId) === side ? 11 : -10;
}
function nearestDeadlineFor(state, observerId) {
    const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
    return state.declarations.declarations
        .filter(isActiveDeclaration)
        .filter(d => pairOf(d.ownerId, state.takerId ?? '', state.partnerId) === side)
        .map(deadlineFor)
        .filter((x) => x !== undefined)
        .sort((a, b) => a - b)[0];
}
function declarationPriority(d) {
    if (d.type === 'volat')
        return 1.4;
    if (d.type === 'pagatUhu' || d.type === 'sasUhu' || d.type === 'kingUhu')
        return 1.25;
    if (d.type === 'pagatUltimo' || d.type === 'sasUltimo' || d.type === 'kingUltimo')
        return 1.2;
    if (d.type === 'centrum' || d.type === 'kismadar' || d.type === 'nagymadar')
        return 1.1;
    return 0.9;
}
function declarationLabel(d) {
    const labels = {
        tuletroa: 'Trull', fourKings: 'Négykirály', doubleGame: 'Duplajáték', volat: 'Volát',
        pagatUltimo: 'Pagátultimó', sasUltimo: 'Sasultimó', kingUltimo: 'Királyultimó',
        pagatUhu: 'Pagát Uhu', sasUhu: 'Sas Uhu', kingUhu: 'Király Uhu', xxiFogas: 'XXI-fogás',
        centrum: 'Centrum', kismadar: 'Kismadár', nagymadar: 'Nagymadár',
    };
    return labels[d.type] ?? d.type;
}
function deadlineFor(d) {
    if (d.type === 'centrum')
        return 5;
    if (d.type === 'kismadar')
        return 6;
    if (d.type === 'nagymadar')
        return 7;
    if (d.type.endsWith('Uhu'))
        return 8;
    if (d.type.endsWith('Ultimo') || d.type === 'xxiFogas')
        return 9;
    return undefined;
}
function targetFor(d) {
    if (d.targetCardId)
        return d.targetCardId;
    if (d.type === 'pagatUhu' || d.type === 'pagatUltimo')
        return 'T1';
    if (d.type === 'sasUhu' || d.type === 'sasUltimo')
        return 'T2';
    return undefined;
}
function targetCardInCurrentTrick(state, winner, targets) {
    return !!state.trick?.cards.some(x => targets.includes(x.card.id) && x.player === winner);
}
function winnerTakesCard(state, winner, targetId) {
    return !!winner && !!state.trick?.cards.some(x => x.card.id === targetId && x.player === winner);
}
function cardInCurrentTrick(state, targetId) {
    return !!state.trick?.cards.some(x => x.card.id === targetId);
}
function cardWonInCompleted(state, targetId, winner) {
    return state.completedTricks.some(t => t.winner === winner && t.cards.some(x => x.card.id === targetId));
}
function hasCardWonBySide(state, cardId, side) {
    return state.completedTricks.some(t => {
        const owner = t.cards.find(x => x.card.id === cardId)?.player;
        return owner !== undefined && t.winner === owner && pairOf(t.winner, state.takerId ?? '', state.partnerId) === side;
    });
}
function relationOf(ownerId, observerId, partnerId, side, opponentSide, state) {
    const ownerSide = pairOf(ownerId, state.takerId ?? '', state.partnerId);
    if (ownerId === observerId)
        return 'self';
    if (partnerId && ownerId === partnerId)
        return 'partner';
    if (ownerSide === side)
        return 'partner';
    if (ownerSide === opponentSide)
        return 'opponent';
    return undefined;
}
function relationSide(relation, side) {
    if (side === 'unknown')
        return 'unknown';
    return relation === 'opponent' ? (side === 'taker' ? 'defence' : 'taker') : side;
}
function projectedWinner(state, observerId, candidate) {
    if (!state.trick?.cards.length)
        return observerId;
    return determineWinner([...state.trick.cards.map(x => ({ playerId: x.player, card: x.card })), { playerId: observerId, card: candidate }], state.trick.cards[0].card);
}
function partnerFor(state, observerId) {
    const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
    if (side === 'taker')
        return observerId === state.takerId ? state.partnerId : state.takerId;
    if (side === 'defence')
        return state.players.find(p => p.active && p.id !== observerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
    return undefined;
}
function activePlayers(state) { return state.players.filter(p => p.active).length; }
function isActiveDeclaration(d) { return d.status !== 'failed' && d.status !== 'fulfilled'; }
function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
