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
        players: playerIds.map(playerId => ({ playerId, hand: [], dealtHand: [], receivedTalon: [], skart: [], skartRevealed: false, skartAnnounced: false })),
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
        score: p.score ?? 0,
        receivedTalon: [],
        skart: [],
        skartRevealed: false,
        skartAnnounced: false,
        dealtHand: [],
    }));
    const talon = deck.slice(0, 6);
    let cursor = 6;
    // A 4 aktív játékos egyenként 9 lapot kap; a hatlapos talon külön marad.
    for (let pass = 0; pass < 9; pass++) {
        for (let seat = 0; seat < players.length; seat++) {
            players[seat].hand.push(deck[cursor++]);
        }
    }
    for (const player of players) player.dealtHand = [...player.hand];
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
export function preSkartRedealReason(state) {
    if (!state?.takerId || !Array.isArray(state.players)) return undefined;
    const kings = new Set(['hearts-K', 'diamonds-K', 'spades-K', 'clubs-K']);
    for (const player of state.players) {
        const tarokks = player.hand.filter(c => c?.kind === 'tarokk');
        const tarokkIds = new Set(tarokks.map(c => c.id));
        if ([...kings].every(id => player.hand.some(c => c?.id === id))) return `${player.playerId}: mind a négy király.`;
        if (tarokks.length === 0) return `${player.playerId}: nincs tarokk a kezében.`;
        if (tarokks.length === 1 && tarokks[0]?.id === 'T1') return `${player.playerId}: szóló Pagát.`;
        if (tarokks.length === 1 && tarokks[0]?.id === 'T21') return `${player.playerId}: szóló XXI.`;
        if (tarokks.length === 2 && tarokkIds.has('T1') && tarokkIds.has('T21')) return `${player.playerId}: csak Pagát és XXI.`;
    }
    return undefined;
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
    const firstSkarter = nextSkarter(players, state.takerId);
    return {
        ...state,
        players,
        phase: 'skart',
        currentPlayerId: state.parallelSkart ? undefined : firstSkarter,
        eventLog: [...state.eventLog, state.parallelSkart ? 'A talon kiosztva. A négy játékos párhuzamosan fektethet.' : 'A talon kiosztva; következik a fektetés.']
    };
}
export function skartRoundPlayer(state, playerId, cards) {
    if (state.phase !== 'skart')
        throw new Error('A parti nincs fektetési fázisban.');
    const player = state.players.find(x => x.playerId === playerId);
    if (!player)
        throw new Error('Ismeretlen játékos.');
    if (!state.parallelSkart && state.currentPlayerId !== playerId)
        throw new Error('Most nem ennek a játékosnak kell fektetnie.');
    if (player.skart.length === player.receivedTalon.length)
        throw new Error('Ez a játékos már befejezte a fektetést.');
    const count = player.receivedTalon.length;
    if (cards.length !== count)
        throw new Error(`Pontosan ${count} lapot kell fektetni.`);
    const result = applyFektetes(player.hand, cards, count, playerId === state.takerId, state.invitedTarokk);
    let players = state.players.map(p => p.playerId === playerId
        ? { ...p, hand: result.remainingHand, skart: result.skart, skartTarokkCount: result.tarokkCount, skartRevealed: state.parallelSkart ? false : result.revealSkart, skartAnnounced: false }
        : p);
    const allDone = players.every(p => p.skart.length === p.receivedTalon.length);
    if (!allDone) {
        const next = state.parallelSkart ? undefined : nextSkarter(players, playerId);
        return { ...state, players, currentPlayerId: next, eventLog: [...state.eventLog, `${playerId} fektetett ${result.tarokkCount} tarokkot.`] };
    }
    if (!state.takerId)
        throw new Error('Nincs felvevő a fektetés lezárásához.');
    // A single-player/AI engine keeps its established serial fektetés-közlés flow.
    // The authoritative multiplayer room uses the dedicated parallel subphase below.
    if (!state.parallelSkart) {
        const nextAnnouncer = nextSkartAnnouncer(players, state.takerId);
        if (nextAnnouncer) {
            return {
                ...state,
                players,
                phase: 'skart',
                currentPlayerId: nextAnnouncer,
                eventLog: [...state.eventLog, `${playerId} fektetett ${result.tarokkCount} tarokkot.`, 'A fektetés lezárult; következik a fektetett tarokkok számának közlése.']
            };
        }
        return {
            ...state,
            players,
            phase: 'partner-call',
            currentPlayerId: state.takerId,
            skartAnnouncementResolved: true,
            eventLog: [...state.eventLog, `${playerId} fektetett ${result.tarokkCount} tarokkot.`, 'Minden szükséges fektetésközlés lezárult; következik a kötelező partnerhívás.']
        };
    }
    // Multiplayer: a fektetés lezárult. A felvevő tarokkos fektetése automatikusan
    // nyilvánossá válik az első ütés végéig; a nem felvevő tarokkos fektetését az
    // érintett játékos közli. Minden érintett védő egyszerre közölhet.
    const preparedPlayers = players.map(p => {
        if (p.playerId === state.takerId) {
            const hasTakerTarokk = (p.skartTarokkCount ?? 0) > 0;
            return { ...p, skartRevealed: hasTakerTarokk, skartAnnounced: true };
        }
        return {
            ...p,
            skartAnnounced: (p.skartTarokkCount ?? 0) === 0,
        };
    });
    const pendingAnnouncements = preparedPlayers.filter(p => p.playerId !== state.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced).length;
    const takerHasTarokk = (preparedPlayers.find(p => p.playerId === state.takerId)?.skartTarokkCount ?? 0) > 0;
    const baseLog = [
        `${playerId} fektetett ${result.tarokkCount} tarokkot.`,
        ...(takerHasTarokk ? ['A felvevő fektetett tarokkjai nyilvánosak az első ütés végéig.'] : []),
    ];
    if (pendingAnnouncements > 0) {
        return {
            ...state,
            players: preparedPlayers,
            phase: 'skart-announcement',
            currentPlayerId: undefined,
            skartAnnouncementResolved: false,
            eventLog: [...state.eventLog, ...baseLog, 'A tarokkot fektetett nem felvevő játékosoknak közölniük kell a fektetést; ez megelőzi a partnerhívást.']
        };
    }
    return {
        ...state,
        players: preparedPlayers,
        phase: 'partner-call',
        currentPlayerId: state.takerId,
        skartAnnouncementResolved: true,
        eventLog: [...state.eventLog, ...baseLog, 'Minden szükséges fektetésközlés lezárult; következik a kötelező partnerhívás.']
    };
}
export function announceSkartCount(state, playerId) {
    if (!state.parallelSkart) {
        if (state.phase !== 'skart')
            throw new Error('Most nincs fektetésközlési fázis.');
        if (state.currentPlayerId !== playerId)
            throw new Error('Most nem ennek a játékosnak kell bemondania a fektetést.');
        const player = state.players.find(p => p.playerId === playerId);
        if (!player)
            throw new Error('Ismeretlen játékos.');
        if (player.skart.length !== player.receivedTalon.length)
            throw new Error('A játékos még nem fejezte be a fektetést.');
        if (player.skartAnnounced)
            throw new Error('A fektetés már közölve lett.');
        const players = state.players.map(p => p.playerId === playerId ? { ...p, skartAnnounced: true } : p);
        const allAnnounced = players.every(p => p.skartAnnounced);
        if (!allAnnounced) {
            const next = nextSkartAnnouncer(players, state.takerId);
            return { ...state, players, currentPlayerId: next, eventLog: [...state.eventLog, `${playerId} közölte a fektetett tarokkok számát.`] };
        }
        if (!state.takerId)
            throw new Error('Nincs felvevő a partnerhíváshoz.');
        return {
            ...state,
            players,
            phase: 'partner-call',
            currentPlayerId: state.takerId,
            skartAnnouncementResolved: true,
            eventLog: [...state.eventLog, `${playerId} közölte a fektetett tarokkok számát.`, 'Minden szükséges fektetésközlés lezárult; következik a kötelező partnerhívás.']
        };
    }
    if (state.phase !== 'skart-announcement')
        throw new Error('Most nincs fektetésközlési fázis.');
    const player = state.players.find(p => p.playerId === playerId);
    if (!player)
        throw new Error('Ismeretlen játékos.');
    if (playerId === state.takerId)
        throw new Error('A felvevő fektetett tarokkjait a rendszer automatikusan felfedi.');
    if ((player.skartTarokkCount ?? 0) <= 0)
        throw new Error('Nincs mit közölni: nem fektettél tarokkot.');
    if (player.skartAnnounced)
        throw new Error('A fektetés már közölve lett.');
    const players = state.players.map(p => p.playerId === playerId ? { ...p, skartAnnounced: true } : p);
    const pending = players.some(p => p.playerId !== state.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced);
    if (pending) {
        return { ...state, players, currentPlayerId: undefined, eventLog: [...state.eventLog, `${playerId} közölte: tarokkot fektetett.`] };
    }
    return {
        ...state,
        players,
        phase: 'partner-call',
        currentPlayerId: state.takerId,
        skartAnnouncementResolved: true,
        eventLog: [...state.eventLog, `${playerId} közölte: tarokkot fektetett.`, 'Minden szükséges fektetésközlés lezárult; következik a kötelező partnerhívás.']
    };
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
