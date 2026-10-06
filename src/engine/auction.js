import { isHonour, isTarokk } from './cards.js';
const order = ['three', 'two', 'one', 'solo'];
const idx = (c) => order.indexOf(c);
export function inviteTargetForJump(previous, announced) {
    if (!previous)
        return undefined;
    const from = idx(previous);
    const to = idx(announced);
    const jumps = to - from - 1;
    if (jumps === 1)
        return 19;
    if (jumps === 2)
        return 18;
    return undefined;
}
function inviteContractForTarget(state, target) {
    const highest = state.highest?.contract;
    if (!highest)
        return target === 18 || target === 19 || target === 20 ? 'solo' : undefined;
    if (target === 20)
        return highest;
    if (target === 19 && highest === 'three')
        return 'one';
    if (target === 18 && highest === 'three')
        return 'solo';
    if (target === 19 && highest === 'two')
        return 'solo';
    return undefined;
}
function sameAuctionAction(state, expected, actual) {
    if (expected.type !== 'invite' || actual.type !== 'invite')
        return JSON.stringify(expected) === JSON.stringify(actual);
    if (expected.target !== actual.target)
        return false;
    const expectedContract = expected.contract ?? inviteContractForTarget(state, expected.target);
    const actualContract = actual.contract ?? inviteContractForTarget(state, actual.target);
    return expectedContract === actualContract;
}
function canInviteWithHand(hand, target) {
    // Unit-level callers sometimes provide no/full-hand information. The live
    // multiplayer authority always supplies the complete hand, where the strict
    // prerequisites below are enforced. With partial hands we can safely require
    // only presence of the invited tarokk because the remaining prerequisites are
    // genuinely unknown.
    if (!Array.isArray(hand))
        return true;
    const tarokks = hand.filter(isTarokk);
    const hasTarget = tarokks.some(c => c.rank === target);
    if (hand.length < 8)
        return hasTarget;
    const hasBigHonour = tarokks.some(c => c.rank === 21 || c.rank === 22);
    if (tarokks.length < 5 || !hasBigHonour || !hasTarget)
        return false;
    // XX-invit / Engedés requires XX, at least five tarokks and at least one
    // big honour. Pagát is not an additional exclusion criterion here.
    return true;
}
function hasBidOfPlayer(state, playerId) {
    return bidRecords(state).some(r => r.playerId === playerId);
}
function hasInviteCard(hand, target) {
    return Array.isArray(hand) && hand.some(c => isTarokk(c) && c.rank === target);
}
export function createAuction(playerIds, firstSeat = 0) {
    return { seats: playerIds.map((playerId, seat) => ({ playerId, seat })), currentSeat: firstSeat, records: [], finished: false, out: [] };
}
function activeIds(state) {
    return state.seats
        .filter(s => !state.out.includes(s.playerId))
        .filter(s => !(state.inviterLockedOut && state.outstandingInvite?.inviterId === s.playerId))
        .map(s => s.playerId);
}
function seatOf(state, playerId) {
    return state.seats.findIndex(s => s.playerId === playerId);
}
function nextActive(state, from) {
    for (let step = 1; step <= state.seats.length; step++) {
        const s = (from + step) % state.seats.length;
        const id = state.seats[s].playerId;
        if (!state.out.includes(id) && !(state.inviterLockedOut && state.outstandingInvite?.inviterId === id))
            return s;
    }
    return undefined;
}
function bidRecords(state) {
    return state.records.filter(r => r.action.type === 'bid');
}
/**
 * In the canonical 3-2-1 sequence, after A holds C's 1, B gets the first
 * response. If B passes, C may still say Solo. If C says Solo, A may hold or
 * pass. A pass in the auction is permanent; a hold is not a pass.
 */
function holdResponseQueue(state, holder, heldContract) {
    const bids = bidRecords(state);
    const heldBidIndex = [...bids].reverse().findIndex(r => r.action.contract === heldContract);
    if (heldBidIndex < 0)
        return [];
    const originalIndex = bids.length - 1 - heldBidIndex;
    const originalSeat = seatOf(state, bids[originalIndex].playerId);
    const result = [];
    for (let step = 1; step <= state.seats.length; step++) {
        const s = (originalSeat + step) % state.seats.length;
        const id = state.seats[s].playerId;
        if (id !== holder && !state.out.includes(id) && !result.includes(id))
            result.push(id);
    }
    // The holder is offered the response only after another player has raised
    // the held contract to a higher level (e.g. C -> Solo, then A may hold/pass).
    return result;
}
function finish(state) {
    const { responseQueue: _responseQueue, ...rest } = state;
    return { ...rest, finished: true };
}
function nextQueueSeat(state, queue) {
    const next = queue.find(id => !state.out.includes(id) && !(state.inviterLockedOut && state.outstandingInvite?.inviterId === id));
    if (next)
        return { ...state, currentSeat: seatOf(state, next), responseQueue: queue.filter(id => id !== next) };
    return finish(state);
}
function openingJumpResponse(state, playerId) {
    const bids = bidRecords(state);
    const opening = state.openingBid ?? (bids[0]?.action.contract === 'three' ? { playerId: bids[0].playerId, contract: 'three' } : undefined);
    if (!opening || opening.playerId !== playerId)
        return undefined;
    const later = [...bids].reverse().find(r => r.playerId !== playerId && idx(r.action.contract) > idx(opening.contract));
    if (!later)
        return undefined;
    const target = opening.contract === 'two' && later.action.contract === 'one' ? 19
        : opening.contract === 'one' && later.action.contract === 'solo' ? 18
            : undefined;
    if (target === undefined)
        return undefined;
    return { target, contract: later.action.contract, acceptedBy: later.playerId };
}
function openingInviteForResponse(state, playerId, hands) {
    const response = openingJumpResponse(state, playerId);
    if (!response || response.target === undefined || !hands)
        return undefined;
    if (!canInviteWithHand(hands[playerId], response.target))
        return undefined;
    return response;
}
function fullHand(hand) {
    return Array.isArray(hand) && hand.length >= 8;
}
function canBidWithHand(hand) {
    if (!fullHand(hand))
        return true;
    return hand.some(isHonour);
}
function allOtherPlayersPassed(state, playerId) {
    return state.seats.filter(s => s.playerId !== playerId)
        .every(s => state.records.some(r => r.playerId === s.playerId && r.action.type === 'pass'));
}
function holdOwner(state) {
    if (state.holdOwnerId && !state.out.includes(state.holdOwnerId)
        && !(state.inviterLockedOut && state.outstandingInvite?.inviterId === state.holdOwnerId))
        return state.holdOwnerId;
    const bids = bidRecords(state);
    const distinct = [];
    for (const r of bids)
        if (!distinct.includes(r.playerId))
            distinct.push(r.playerId);
    return distinct.find(id => !state.out.includes(id));
}
function nextHoldOwner(state, currentHolder) {
    const bids = bidRecords(state);
    const distinct = [];
    for (const r of bids)
        if (!distinct.includes(r.playerId))
            distinct.push(r.playerId);
    const index = distinct.indexOf(currentHolder);
    for (let i = index + 1; i < distinct.length; i++) {
        const id = distinct[i];
        if (!state.out.includes(id))
            return id;
    }
    return undefined;
}
function continuationAfterHold(state, holder) {
    const bids = bidRecords(state);
    const first = bids[0]?.playerId;
    const second = bids.find(r => r.playerId !== first)?.playerId;
    if (second && second !== holder && !state.out.includes(second))
        return seatOf(state, second);
    const fallback = bids.find(r => r.playerId !== holder && !state.out.includes(r.playerId))?.playerId;
    if (fallback)
        return seatOf(state, fallback);
    return nextActive(state, seatOf(state, holder));
}
export function legalAuctionActions(state, playerId, hands) {
    if (state.finished || state.seats[state.currentSeat]?.playerId !== playerId || state.out.includes(playerId))
        return [];
    const hand = hands?.[playerId];
    const hasBidAuthority = canBidWithHand(hand);
    const currentHolder = holdOwner(state);
    const history = bidRecords(state);
    const firstBid = history[0];
    const isThreeTwoFirstSpeaker = !!firstBid
        && firstBid.playerId === playerId
        && firstBid.action.type === 'bid'
        && firstBid.action.contract === 'three'
        && history.length === 2
        && history[1]?.action.type === 'bid'
        && history[1]?.action.contract === 'two'
        && state.highest?.contract === 'two';
    // Pass is public in every normal auction position, including for an
    // honourless hand. After the specific 3->2 response of the first speaker,
    // however, an ordinary Pass is not a legal action: yielding is the XX-invite
    // (Engedés), subject to its exact card prerequisites.
    const result = isThreeTwoFirstSpeaker ? [] : [{ type: 'pass' }];
    if (state.inviterLockedOut && state.outstandingInvite?.inviterId === playerId)
        return result;
    if (!hasBidAuthority) {
        if (!state.highest && allOtherPlayersPassed(state, playerId))
            result.push({ type: 'bid', contract: 'three', honourless: true });
        return result;
    }
    const openingResponse = openingJumpResponse(state, playerId);
    if (openingResponse) {
        const openingInvite = openingInviteForResponse(state, playerId, hands);
        if (openingInvite)
            return [{ type: 'hold-invite', contract: openingInvite.contract, target: openingInvite.target }];
        return [{ type: 'hold', contract: openingResponse.contract }];
    }
    const highest = state.highest;
    const outstandingInvite = state.outstandingInvite;
    const alreadyBid = hasBidOfPlayer(state, playerId);
    // The only player entitled to Tartom is the current hold-owner. It does not
    // suppress legal invite signals that the same player can make after having
    // already entered the auction: XX/XIX/XVIII invits are information actions,
    // not higher ordinary bids.
    if (currentHolder === playerId && highest && highest.playerId !== playerId) {
        const resultWithHold = [...result, { type: 'hold', contract: highest.contract }];
        const isThreeOneXixInvite = !!history[0]
            && history[0].playerId === playerId
            && history[0].action.contract === 'three'
            && history.length >= 3
            && history[1]?.action.contract === 'two'
            && history[2]?.action.contract === 'one'
            && !state.records.some(r => r.action.type === 'invite' || r.action.type === 'hold-invite')
            && !state.outstandingInvite
            && highest.contract === 'one';
        if (isThreeOneXixInvite && canInviteWithHand(hand, 19))
            resultWithHold.push({ type: 'invite', target: 19, contract: 'one' });
        // XX-invit / engedés is available after the player has already entered
        // the auction, regardless of whether the player currently owns Tartom.
        // Engedés / XX-invit is reserved for the first speaker, and only in
        // the canonical Három -> Kettő situation, before that first speaker
        // makes Tartom. It must never be offered to the second speaker after
        // Három -> Kettő -> Tartom.
        const firstBid = history[0];
        const engedesEligible = !!firstBid
            && firstBid.playerId === playerId
            && firstBid.action.type === 'bid'
            && firstBid.action.contract === 'three'
            && history.length === 2
            && history[1]?.action.type === 'bid'
            && history[1]?.action.contract === 'two'
            && highest.contract === 'two';
        if (!outstandingInvite && engedesEligible && canInviteWithHand(hand, 20)) {
            resultWithHold.push({ type: 'invite', target: 20, contract: highest.contract });
        }
        return resultWithHold;
    }
    if (!highest) {
        if (outstandingInvite && hands && !hasInviteCard(hand, outstandingInvite.target))
            return result;
        for (const contract of order)
            result.push({ type: 'bid', contract });
        if (!outstandingInvite) {
            for (const target of [20, 19, 18]) {
                if (canInviteWithHand(hand, target))
                    result.push({ type: 'invite', target, contract: 'solo' });
            }
        }
        return result;
    }
    // An outstanding invite can only be accepted by the player who actually owns
    // the invited tarokk. Acceptance itself does NOT require that player to have
    // the inviter's full 5-tarokk + big-honour structure.
    const inviteRestriction = outstandingInvite && playerId !== outstandingInvite.inviterId && hands
        ? !hasInviteCard(hands[playerId], outstandingInvite.target) : false;
    const next = order[idx(highest.contract) + 1];
    if (next)
        result.push({ type: 'bid', contract: next });
    if (!outstandingInvite) {
        // Jump over exactly one/two contracts = XIX/XVIII invite respectively.
        for (const announced of order.slice(idx(highest.contract) + 2)) {
            const target = inviteTargetForJump(highest.contract, announced);
            if (target !== undefined && canInviteWithHand(hand, target)) {
                result.push({ type: 'invite', target, contract: announced });
            }
        }
        // XX-invit / Engedés is handled only in the dedicated first-speaker
        // Három -> Kettő branch above. Do not offer it here: doing so would make
        // the second speaker (or later bidders) eligible after Tartom.
    }
    return inviteRestriction ? result.filter(a => a.type !== 'bid') : result;
}
export function applyAuctionAction(state, action, hands) {
    if (state.finished)
        throw new Error('Az aukció már lezárult.');
    const playerId = state.seats[state.currentSeat].playerId;
    const legal = legalAuctionActions(state, playerId, hands).some(a => sameAuctionAction(state, a, action));
    if (!legal)
        throw new Error('Ez az akció ebben a licithelyzetben nem szabályos.');
    let next = { ...state, records: [...state.records, { playerId, action }] };
    if (action.type === 'pass') {
        next.out = Array.from(new Set([...next.out, playerId]));
        const owner = state.holdOwnerId ?? holdOwner(state);
        let successor;
        if (owner === playerId) {
            successor = nextHoldOwner(next, playerId);
            if (successor)
                next.holdOwnerId = successor;
            else
                delete next.holdOwnerId;
        }
        if (state.responseQueue) {
            const q = state.responseQueue.filter(id => id !== playerId);
            return q.length ? nextQueueSeat(next, q) : finish(next);
        }
        if (next.highest && next.out.includes(next.highest.playerId))
            return finish(next);
        // In a simple Hármas all three other players have passed. The fourth
        // pass is the end of the auction; there is no second-round return to
        // the opening bidder. The game remains Hármas and proceeds to the talon.
        if (activeIds(next).length <= 1 && next.highest) return finish(next);
        // When the holder passes, the Tartom right moves directly to the next
        // bidder; do not skip that player with nextActive().
        if (successor)
            return { ...next, currentSeat: seatOf(next, successor) };
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    if (action.type === 'bid') {
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        if (state.records.length === 0) {
            next.holdOwnerId = playerId;
            if (action.contract !== 'three')
                next.openingBid = { playerId, contract: action.contract };
        }
        if (next.outstandingInvite && playerId !== next.outstandingInvite.inviterId && hands) {
            if (hasInviteCard(hands[playerId], next.outstandingInvite.target)) {
                next.inviteAcceptedBy = playerId;
                next.inviterLockedOut = true;
            }
        }
        const owner = holdOwner(next);
        if (action.contract === 'solo') {
            if (owner && owner !== playerId && !next.out.includes(owner)
                && !(next.inviterLockedOut && next.outstandingInvite?.inviterId === owner)) {
                delete next.responseQueue;
                return { ...next, currentSeat: seatOf(next, owner) };
            }
            return finish(next);
        }
        if (owner && owner !== playerId && !next.out.includes(owner)
            && !(next.inviterLockedOut && next.outstandingInvite?.inviterId === owner)) {
            delete next.responseQueue;
            return { ...next, currentSeat: seatOf(next, owner) };
        }
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    if (action.type === 'hold-invite') {
        const openingInvite = openingInviteForResponse(next, playerId, hands);
        if (!openingInvite || openingInvite.target !== action.target || openingInvite.contract !== action.contract)
            throw new Error('Az erős indulásból értelmezett invit nem igazolható a játékos lapjaival.');
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        next.outstandingInvite = { inviterId: playerId, target: action.target };
        next.inviteAcceptedBy = openingInvite.acceptedBy;
        next.inviterLockedOut = false;
        delete next.responseQueue;
        if (action.contract === 'solo')
            return finish(next);
        const continuation = continuationAfterHold(next, playerId);
        return continuation === undefined ? finish(next) : { ...next, currentSeat: continuation };
    }
    if (action.type === 'hold') {
        const owner = holdOwner(state);
        if (owner !== playerId || !state.highest || state.highest.playerId === playerId)
            throw new Error('Tartani csak a tartási jogosult teheti, másik játékos magasabb licitje után.');
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        delete next.responseQueue;
        if (action.contract === 'solo')
            return finish(next);
        const continuation = continuationAfterHold(next, playerId);
        return continuation === undefined ? finish(next) : { ...next, currentSeat: continuation };
    }
    if (action.type === 'invite') {
        if (next.outstandingInvite)
            throw new Error('Viszontinvit nem megengedett.');
        if (!canInviteWithHand(hands?.[playerId], action.target))
            throw new Error('Az invithez nem állnak fenn a szükséges lapfeltételek.');
        const contract = action.contract ?? inviteContractForTarget(state, action.target);
        if (state.highest && action.target !== 20 && !contract)
            throw new Error('Ehhez a licithelyzethez nem tartozik szabályos ugró-invit.');
        if (state.highest && action.target !== 20 && contract !== inviteContractForTarget(state, action.target))
            throw new Error('Az ugró-invit szerződésértéke nem egyezik a licitlépcsővel.');
        next.outstandingInvite = { inviterId: playerId, target: action.target };
        // A XIX/XVIII jump invite is the announced higher contract itself.
        // XX-invit is Engedés: the existing highest (the Kettő) remains the
        // contract, the first speaker becomes the mandatory XX partner, and
        // the auction ends immediately. There is no acceptance turn.
        if (state.highest && action.target !== 20 && contract) {
            next.highest = { playerId, contract, seat: state.currentSeat };
        }
        const recordedAction = contract ? { ...action, contract } : action;
        next.records[next.records.length - 1] = { playerId, action: recordedAction };
        if (action.target === 20 && state.highest?.contract === 'two' && state.highest.playerId !== playerId) {
            next.inviteAcceptedBy = state.highest.playerId;
            next.engedes = true;
            return finish(next);
        }
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    const ns = nextActive(next, state.currentSeat);
    return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
}
