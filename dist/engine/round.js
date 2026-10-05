import { createDeck } from './cards.js';
import { shuffle } from './game.js';
import { distributeTalon, applyFektetes } from './talon.js';
import { resolveAuctionOutcome } from './auctionOutcome.js';
import { createInitialState, setPartnership } from './game.js';
export function createRound(playerIds, firstBidder = 0) {
    if (playerIds.length !== 4)
        throw new Error('Egy partihoz 4 aktív játékos szükséges.');
    return {
        phase: 'auction',
        startingPlayerId: playerIds[firstBidder],
        players: playerIds.map(playerId => ({ playerId, hand: [], receivedTalon: [], skart: [], skartRevealed: false, skartAnnounced: false })),
        auction: {
            seats: playerIds.map((playerId, seat) => ({ playerId, seat })),
            currentSeat: firstBidder,
            records: [], finished: false, out: []
        },
        eventLog: [],
        talon: []
    };
}
export function dealRound(state, random = Math.random) {
    if (state.phase !== 'auction')
        throw new Error('A leosztás már elkezdődött.');
    const deck = shuffle(createDeck(), random);
    const players = state.players.map(p => ({
        playerId: p.playerId,
        hand: [],
        receivedTalon: [],
        skart: [],
        skartRevealed: false,
        skartAnnounced: false,
    }));
    const talon = deck.slice(0, 6);
    let cursor = 6;
    // A 4 aktív játékos egyenként 9 lapot kap; a hatlapos talon külön marad.
    for (let pass = 0; pass < 9; pass++) {
        for (let seat = 0; seat < players.length; seat++) {
            players[seat].hand.push(deck[cursor++]);
        }
    }
    return {
        ...state,
        players,
        auction: { ...state.auction },
        eventLog: [...state.eventLog, `Leosztva: 9 lap/játékos, 6 lapos talon.`],
        talon,
    };
}
export function finishAuction(state, talon = []) {
    if (!state.auction.finished || !state.auction.highest)
        throw new Error('Az aukció még nem ért véget.');
    const hands = Object.fromEntries(state.players.map(p => [p.playerId, p.hand]));
    const outcome = resolveAuctionOutcome(state.auction, hands, talon);
    const taker = state.players.find(p => p.playerId === outcome.takerId);
    if (!taker)
        throw new Error('A felvevő nem található.');
    return {
        ...state,
        phase: 'talon-distribution',
        contract: outcome.contract,
        takerId: outcome.takerId,
        ...(outcome.calledTarokk !== undefined ? { invitedTarokk: outcome.calledTarokk } : {}),
        auctionOutcome: outcome,
        currentPlayerId: outcome.takerId,
        eventLog: [...state.eventLog, `${outcome.takerId} felvevő: ${outcome.contract}`]
            .concat(outcome.requiredPartnerCallId ? [`Kötelező meghívni: ${outcome.requiredPartnerCallId}`] : []),
    };
}
function suitCounts(hand) {
    const counts = { hearts: 0, diamonds: 0, spades: 0, clubs: 0 };
    for (const card of hand) {
        if (card.kind === 'suit')
            counts[card.suit] += 1;
    }
    return counts;
}
export function distributeRoundTalon(state, talon) {
    if (state.phase !== 'talon-distribution' || !state.takerId || !state.contract)
        throw new Error('A parti nincs talonelosztási állapotban.');
    const takerIndex = state.players.findIndex(p => p.playerId === state.takerId);
    const d = distributeTalon(talon, state.players.map(p => p.playerId), takerIndex, state.contract);
    const players = state.players.map(p => {
        const hand = [...p.hand, ...(d.byPlayer[p.playerId] ?? [])];
        return {
            ...p,
            receivedTalon: d.byPlayer[p.playerId] ?? [],
            hand,
            preSkartSuitCounts: suitCounts(hand),
        };
    });
    const firstSkarter = state.players[(takerIndex + 1) % state.players.length]?.playerId;
    return firstSkarter ? { ...state, players, phase: 'skart', currentPlayerId: firstSkarter, eventLog: [...state.eventLog, 'A talon kiosztva.'] } : { ...state, players, phase: 'skart', eventLog: [...state.eventLog, 'A talon kiosztva.'] };
}
export function skartRoundPlayer(state, playerId, cards) {
    if (state.phase !== 'skart')
        throw new Error('A parti nincs skartolási állapotban.');
    if (state.currentPlayerId !== playerId)
        throw new Error('Most nem ennek a játékosnak kell fektetnie.');
    const player = state.players.find(p => p.playerId === playerId);
    if (!player)
        throw new Error('Ismeretlen játékos.');
    const count = player.receivedTalon.length;
    if (cards.length !== count)
        throw new Error(`Pontosan ${count} lapot kell fektetni.`);
    const result = applyFektetes(player.hand, cards, count, playerId === state.takerId, state.invitedTarokk);
    const players = state.players.map(p => p.playerId === playerId ? { ...p, hand: result.remainingHand, skart: result.skart, skartTarokkCount: result.tarokkCount, skartRevealed: result.revealSkart, skartAnnounced: false } : p);
    const allDone = players.every(p => p.skart.length === p.receivedTalon.length);
    const nextPlayer = allDone ? nextSkartAnnouncer(players, state.takerId) : nextSkarter(players, playerId);
    return nextPlayer ? { ...state, players, phase: 'skart', currentPlayerId: nextPlayer, eventLog: [...state.eventLog, `${playerId} fektetett ${result.tarokkCount} tarokkot.`] } : { ...state, players, phase: 'skart', eventLog: [...state.eventLog, `${playerId} fektetett ${result.tarokkCount} tarokkot.`] };
}
export function announceSkartCount(state, playerId) {
    if (state.phase !== 'skart')
        throw new Error('Ebben a fázisban nincs fektetési bemondás.');
    if (state.currentPlayerId !== playerId)
        throw new Error('Most nem ennek a játékosnak kell bemondania.');
    const player = state.players.find(p => p.playerId === playerId);
    if (!player || player.skart.length !== player.receivedTalon.length)
        throw new Error('A játékos még nem fejezte be a fektetést.');
    if (player.skartAnnounced)
        throw new Error('A fektetés már be lett mondva.');
    const players = state.players.map(p => p.playerId === playerId ? { ...p, skartAnnounced: true } : p);
    const allAnnounced = players.every(p => p.skartAnnounced);
    if (!allAnnounced) {
        const next = nextSkartAnnouncer(players, state.takerId);
        return next ? { ...state, players, currentPlayerId: next, eventLog: [...state.eventLog, `${playerId} bemondta: ${player.skartTarokkCount ?? 0} tarokk.`] } : { ...state, players };
    }
    const reveal = players.find(p => p.playerId === state.takerId)?.skart ?? [];
    if (!state.takerId)
        throw new Error('Nincs felvevő a fektetési bemondás lezárásához.');
    // The partner call is always the first declaration-stage action.
    // Even when the auction fixed an invite, the taker must explicitly call
    // that tarokk before making any other declaration.
    return { ...state, players, phase: 'partner-call', currentPlayerId: state.takerId, eventLog: [...state.eventLog, `${playerId} bemondta: ${player.skartTarokkCount ?? 0} tarokk.`, `A felvevő fektetett lapjai felfedve: ${reveal.map(c => c.id).join(', ')}`] };
}
function nextSkartAnnouncer(players, takerId) {
    const takerIndex = takerId ? players.findIndex(p => p.playerId === takerId) : -1;
    const order = takerIndex >= 0
        ? players.map((_, i) => players[(takerIndex + 1 + i) % players.length].playerId)
        : players.map(p => p.playerId);
    return order.find(id => !players.find(p => p.playerId === id)?.skartAnnounced);
}
function nextSkarter(players, current) {
    const idx = players.findIndex(p => p.playerId === current);
    for (let i = 1; i <= players.length; i++) {
        const p = players[(idx + i) % players.length];
        if (p.skart.length < p.receivedTalon.length)
            return p.playerId;
    }
    return undefined;
}
/**
 * Converts the completed auction/skart state into the common game-state model.
 * The partner must already be known; partner discovery itself belongs to the
 * auction/call layer because ordinary games may call a tarokk during play.
 */
export function roundToGameState(state, partnerId, dealerIndex = 0) {
    if (state.phase !== 'declarations' && state.phase !== 'play' && state.phase !== 'scoring' && state.phase !== 'complete') {
        throw new Error('A parti még nem jutott el a lejátszásig.');
    }
    if (!state.takerId)
        throw new Error('Nincs felvevő.');
    if (!state.players.every(p => p.skart.length === p.receivedTalon.length)) {
        throw new Error('Még nincs minden fektetés lezárva.');
    }
    const game = createInitialState(state.players.map(p => p.playerId), dealerIndex);
    const players = game.players.map(p => {
        const source = state.players.find(x => x.playerId === p.id);
        return { ...p, hand: [...source.hand], active: true };
    });
    return setPartnership({
        ...game,
        phase: state.phase === 'scoring' ? 'scoring' : 'declarations',
        players,
        talon: [],
        skartsByPlayer: Object.fromEntries(state.players.map(p => [p.playerId, [...p.skart]])),
        preSkartSuitCountsByPlayer: Object.fromEntries(state.players.map(p => [p.playerId, p.preSkartSuitCounts ?? suitCounts(p.hand)])),
        startingPlayerId: state.startingPlayerId,
        ...(state.contract ? { contract: state.contract } : {}),
        nextPlayerIndex: Math.max(0, players.findIndex(p => p.id === state.currentPlayerId)),
    }, state.takerId, partnerId);
}
