export function trickPointValue(trick) {
    return trick.cards.reduce((sum, entry) => sum + entry.card.points, 0);
}
export function pointsByPlayer(tricks) {
    const result = {};
    for (const trick of tricks) {
        result[trick.winner] = (result[trick.winner] ?? 0) + trickPointValue(trick);
    }
    return result;
}
export function totalTrickPoints(tricks) {
    return tricks.reduce((sum, trick) => sum + trickPointValue(trick), 0);
}
export function winnerByPair(points) {
    if (points.takerPair >= 48)
        return 'taker';
    if (points.defencePair >= 47)
        return 'defence';
    return 'invalid';
}
