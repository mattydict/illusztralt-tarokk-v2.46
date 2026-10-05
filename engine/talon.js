import { isTarokk } from './cards.js';
import { isForbiddenSkart, validateSkart } from './skart.js';
/** The six talon cards are distributed starting with the taker, counter-clockwise.
 *  3: 3/1/1/1, 2: 2/2/1/1, 1: 1/2/2/1, solo: 0/2/2/2.
 *  The fifth player (dealer in a five-player game) is not part of the four-player
 *  distribution and receives no talon cards. */
export function distributeTalon(talon, playerIds, takerIndex, contract) {
    if (talon.length !== 6)
        throw new Error('A talonnak pontosan 6 lapból kell állnia.');
    if (playerIds.length !== 4)
        throw new Error('A talonelosztás jelenleg 4 aktív játékosra vonatkozik.');
    const counts = {
        three: [3, 1, 1, 1], two: [2, 2, 1, 1], one: [1, 2, 2, 1], solo: [0, 2, 2, 2]
    };
    const result = Object.fromEntries(playerIds.map(id => [id, []]));
    const order = Array.from({ length: 4 }, (_, n) => playerIds[(takerIndex + n) % 4]);
    counts[contract].forEach((count, seat) => { result[order[seat]] = talon.slice(counts[contract].slice(0, seat).reduce((a, b) => a + b, 0), counts[contract].slice(0, seat + 1).reduce((a, b) => a + b, 0)); });
    return { byPlayer: result, undealt: [] };
}
export function legalFektetes(hand, count, invitedTarokk) {
    return hand.filter(c => !isForbiddenSkart(c, invitedTarokk));
}
export function applyFektetes(hand, cards, count, isTaker, invitedTarokk) {
    validateSkart(cards, count, invitedTarokk);
    const handIds = new Set(hand.map(c => c.id));
    if (cards.some(c => !handIds.has(c.id)))
        throw new Error('Csak a saját kézben lévő lap fektethető.');
    const ids = new Set(cards.map(c => c.id));
    return { remainingHand: hand.filter(c => !ids.has(c.id)), skart: cards, tarokkCount: cards.filter(isTarokk).length, revealSkart: isTaker };
}
