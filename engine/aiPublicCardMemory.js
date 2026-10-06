import { createDeck, isTarokk } from './cards.js';
export function buildPublicCardMemory(state, observerId) {
    const own = state.players.find(player => player.id === observerId)?.hand ?? [];
    const ownCardIds = new Set(own.map(card => card.id));
    const publicCards = collectPublicCards(state);
    const publicCardIds = new Set(publicCards.map(card => card.id));
    const known = new Set([...ownCardIds, ...publicCardIds]);
    const unseenCards = createDeck().filter(card => !known.has(card.id));
    const unseenTarokkCards = unseenCards.filter(isTarokk);
    const unseenTarokkAbove = (rank) => unseenTarokkCards.filter(card => card.rank > rank);
    const unseenSuitAbove = (suit, rank) => unseenCards.filter(card => card.kind === 'suit' && card.suit === suit && compareSuitRank(card.rank, rank) > 0);
    const allHigherTarokksAccounted = (rank) => unseenTarokkAbove(rank).length === 0;
    const allHigherSuitCardsAccounted = (suit, rank) => unseenSuitAbove(suit, rank).length === 0;
    return { observerId, publicCardIds, publicCards, ownCardIds, unseenCards, unseenTarokkCards, unseenTarokkAbove, unseenSuitAbove, allHigherTarokksAccounted, allHigherSuitCardsAccounted };
}
export function assessPublicCardControl(state, playerId, card, candidateWins = false) {
    const memory = buildPublicCardMemory(state, playerId);
    const reasons = [];
    let score = 0;
    const unseenHigherTarokks = isTarokk(card) ? memory.unseenTarokkAbove(card.rank).length : 0;
    let unseenHigherSuitCards = 0;
    const trick = state.trick;
    const lateGame = state.completedTricks.length >= 6;
    if (isTarokk(card)) {
        if (trick?.cards.length && isTarokk(trick.cards[0].card) && candidateWins) {
            if (memory.allHigherTarokksAccounted(card.rank)) {
                score += 6.5;
                reasons.push(`Nyilvános kártyaszámolás: ${card.id} most már biztos tarokk-kontroll, minden magasabb tarokk ismert.`);
            }
            else if (unseenHigherTarokks === 1 && card.rank >= 18) {
                score += 1.5;
                reasons.push(`Nyilvános kártyaszámolás: csak egy magasabb ismeretlen tarokk maradt ${card.id} fölött.`);
            }
            else if (card.rank >= 19 && unseenHigherTarokks >= 2) {
                score -= 2.5;
                reasons.push(`Nyilvános kártyaszámolás: ${unseenHigherTarokks} magasabb ismeretlen tarokk még felülüthet.`);
            }
        }
        if (!trick?.cards.length && memory.allHigherTarokksAccounted(card.rank) && card.rank >= 17) {
            score += 3.5;
            reasons.push(`Nyilvános kártyaszámolás: ${card.id} vezetése mellett nincs ismeretlen magasabb tarokk.`);
        }
        if (lateGame && candidateWins && memory.unseenTarokkCards.length <= 3) {
            score += 1.5;
            reasons.push('Végjáték: kevés ismeretlen tarokk maradt, ezért a biztos kontroll többet ér.');
        }
    }
    else if (card.kind === 'suit') {
        unseenHigherSuitCards = memory.unseenSuitAbove(card.suit, card.rank).length;
        if (trick?.cards.length && trick.cards[0].card.kind === 'suit' && state.leadSuit === card.suit && candidateWins) {
            if (memory.allHigherSuitCardsAccounted(card.suit, card.rank)) {
                score += 2.5;
                reasons.push(`Nyilvános kártyaszámolás: ${card.id} a színben ismert módon kontrollálja a magasabb lapokat.`);
            }
        }
    }
    return { score, reasons, unseenHigherTarokks, unseenHigherSuitCards };
}
function collectPublicCards(state) {
    const result = [];
    for (const trick of state.completedTricks)
        for (const item of trick.cards) result.push(item.card);
    if (state.trick)
        for (const item of state.trick.cards) result.push(item.card);
    for (const cards of Object.values(state.skartsByPlayer ?? {})) result.push(...cards);
    return result;
}
const SUIT_RANK_VALUE = { '10': 1, 'J': 2, 'C': 3, 'Q': 4, 'K': 5 };
function compareSuitRank(a, b) { return (SUIT_RANK_VALUE[a] ?? 0) - (SUIT_RANK_VALUE[b] ?? 0); }
