function sideWon(trick, side, ctx) {
    return side !== 'unknown' && ctx.sideOf(trick.winner) === side;
}
function cardWonBySide(trick, cardId, side, ctx) {
    return sideWon(trick, side, ctx) && trick.winner === trick.cards.find(x => x.card.id === cardId)?.player;
}
function hasCardWonBySide(tricks, cardId, side, ctx) {
    return tricks.some(t => cardWonBySide(t, cardId, side, ctx));
}
/**
 * Evaluates only objectively observable figure conditions. It does not invent
 * hidden-card information and is therefore safe for both human and AI play.
 */
export function evaluateDeclaration(d, ctx) {
    const side = ctx.sideOf(d.ownerId);
    if (side === 'unknown')
        return undefined;
    const tricks = ctx.tricks;
    const t = (n) => tricks[n - 1];
    switch (d.type) {
        case 'tuletroa': {
            const targets = ['T20', 'T21', 'T22'];
            const captured = targets.every(id => hasCardWonBySide(tricks, id, side, ctx));
            return captured ? 'fulfilled' : (tricks.length >= 9 ? 'failed' : undefined);
        }
        case 'fourKings': {
            const targets = ['hearts-K', 'diamonds-K', 'spades-K', 'clubs-K'];
            const captured = targets.every(id => hasCardWonBySide(tricks, id, side, ctx));
            return captured ? 'fulfilled' : (tricks.length >= 9 ? 'failed' : undefined);
        }
        case 'doubleGame': {
            const trickPoints = tricks.filter(x => sideWon(x, side, ctx)).reduce((s, x) => s + x.cards.reduce((n, e) => n + e.card.points, 0), 0);
            const points = trickPoints + (ctx.skartPointsBySide?.[side] ?? 0);
            return points >= 71 ? 'fulfilled' : (tricks.length >= 9 ? 'failed' : undefined);
        }
        case 'volat': {
            return tricks.some(x => ctx.sideOf(x.winner) !== side) ? 'failed' : (tricks.length >= 9 ? 'fulfilled' : undefined);
        }
        case 'xxiFogas': {
            const success = tricks.some(x => x.cards.some(e => e.card.id === 'T21') && x.cards.some(e => e.card.id === 'T22') && x.winner === x.cards.find(e => e.card.id === 'T22')?.player && sideWon(x, side, ctx));
            return success ? 'fulfilled' : (tricks.length >= 9 ? 'failed' : undefined);
        }
        case 'centrum': return birdLock(tricks, 5, 'T20', side, ctx);
        case 'kismadar': return birdLock(tricks, 6, 'T21', side, ctx);
        case 'nagymadar': return birdLock(tricks, 7, 'T22', side, ctx);
        case 'pagatUltimo': return deadlineLock(t(9), 'T1', side, ctx);
        case 'pagatUhu': return deadlineLock(t(8), 'T1', side, ctx);
        case 'sasUltimo': return deadlineLock(t(9), 'T2', side, ctx);
        case 'sasUhu': return deadlineLock(t(8), 'T2', side, ctx);
        case 'kingUltimo':
        case 'kingUhu':
            // The explicit king target must be attached by the UI/declaration call.
            if (!d.targetCardId)
                return undefined;
            return deadlineLock(t(d.type === 'kingUltimo' ? 9 : 8), d.targetCardId, side, ctx);
        default:
            return undefined;
    }
}
function birdLock(tricks, deadline, cardId, declaringSide, ctx) {
    if (tricks.length < deadline)
        return undefined;
    // The target honour's holder is deliberately irrelevant. Centrum/Kismadár/
    // Nagymadár are obligations of the DECLARING SIDE: one of that side's two
    // players must win every preceding trick, and one of them must win the
    // deadline trick with XX/XXI/Skíz. This also permits the rare case where
    // the defence declares the figure and the target honour sits with its partner.
    const side = declaringSide;
    const prefix = tricks.slice(0, deadline - 1);
    if (prefix.some(trick => !sideWon(trick, side, ctx)))
        return 'failed';
    return cardWonBySide(tricks[deadline - 1], cardId, side, ctx) ? 'fulfilled' : 'failed';
}
function deadlineLock(trick, cardId, side, ctx) {
    if (!trick)
        return undefined;
    return cardWonBySide(trick, cardId, side, ctx) ? 'fulfilled' : 'failed';
}
