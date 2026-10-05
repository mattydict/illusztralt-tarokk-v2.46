import { isTarokk } from './cards.js';
const order = ['three', 'two', 'one', 'solo'];
const idx = (c) => order.indexOf(c);
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
    if (!hands[playerId]?.some(c => isTarokk(c) && c.rank === response.target))
        return undefined;
    return response;
}
export function legalAuctionActions(state, playerId, hands) {
    if (state.finished || state.seats[state.currentSeat]?.playerId !== playerId || state.out.includes(playerId))
        return [];
    const result = [{ type: 'pass' }];
    if (state.inviterLockedOut && state.outstandingInvite?.inviterId === playerId)
        return result;
    // A low opening bid can be interpreted by the next bidder as an invite.
    // If the opener really owns the invited tarokk, holding the jumped contract
    // confirms the invite. If the opener does not own it, that interpretation is
    // impossible; the normal hold remains available and means a strong opening.
    const openingResponse = openingJumpResponse(state, playerId);
    if (openingResponse) {
        const openingInvite = openingInviteForResponse(state, playerId, hands);
        if (openingInvite) {
            // The lower jump is an invite acceptance. The opener must hold the
            // jumped contract and thereby confirm the invite.
            return [{ type: 'hold-invite', contract: openingInvite.contract, target: openingInvite.target }];
        }
        // Without the invited tarokk the opener cannot have made that invite.
        // The opening bid therefore remains a strong opening and the opener is
        // obliged to hold the lower contract rather than turn it into a higher bid.
        return [{ type: 'hold', contract: openingResponse.contract }];
    }
    const highest = state.highest;
    const outstandingInvite = state.outstandingInvite;
    // Once an explicit invite is on the table, a player other than the inviter
    // may only raise the auction if they can actually accept the invited tarokk.
    // The competition rules make the acceptance mandatory for the eventual
    // taker; preventing an invalid bidder here is safer than discovering the
    // violation only after the auction has already finished.
    // Special Illusztrált pattern: the original Hármas bidder may, after
    // 2-1 has been bid and the intervening fourth player has passed, use
    // Szóló as a XIX invite. This is an invite, not an ordinary Solo bid.
    const inviteRestriction = outstandingInvite && playerId !== outstandingInvite.inviterId && hands
        ? !(hands[playerId] ?? []).some(c => isTarokk(c) && c.rank === outstandingInvite.target)
        : false;
    const bidHistory = bidRecords(state);
    const opener = bidHistory[0];
    const isThreeOneXixInvite = !!opener &&
        opener.playerId === playerId &&
        opener.action.contract === 'three' &&
        bidHistory.length >= 3 &&
        bidHistory[1]?.action.contract === 'two' &&
        bidHistory[2]?.action.contract === 'one' &&
        !state.records.some(r => r.action.type === 'invite' || r.action.type === 'hold-invite') &&
        !state.outstandingInvite &&
        state.highest?.contract === 'one';
    if (isThreeOneXixInvite) {
        // A has already shown Three, B Two, C One. A's Solo announcement here
        // is the one-step XIX invite convention. It is only offered as an invite
        // action; a plain bid(Solo) is deliberately not legal in this position.
        // With visible hands supplied, enforce the formal prerequisites here too:
        // XIX + at least one big honour + at least five tarokks. If those are not
        // present, the invalid invite is not offered; A can instead pass and let
        // the lower contract stand.
        const hand = hands?.[playerId] ?? [];
        const hasRealAuctionHand = hands !== undefined && hand.length >= 8;
        const valid = !hasRealAuctionHand || (hand.filter(c => isTarokk(c)).length >= 5
            && hand.some(c => isTarokk(c) && c.rank === 19)
            && hand.some(c => isTarokk(c) && (c.rank === 21 || c.rank === 22)));
        if (valid) {
            // After 3-2-1 the original Three bidder may either hold the One or make
            // the informational XIX invite. A full 9-card hand must satisfy the
            // actual invite prerequisites; sparse fixtures are treated as symbolic.
            result.push({ type: 'hold', contract: 'one' });
            result.push({ type: 'invite', target: 19 });
        }
        return result;
    }
    if (!highest) {
        for (const contract of order)
            result.push({ type: 'bid', contract });
        if (!outstandingInvite) {
            for (const target of [20, 19, 18]) {
                if (!hands) {
                    result.push({ type: 'invite', target });
                    continue;
                }
                const hand = hands[playerId] ?? [];
                const tarokks = hand.filter(c => isTarokk(c));
                const hasRealAuctionHand = hand.length >= 8;
                const valid = !hasRealAuctionHand || (tarokks.length >= 5
                    && tarokks.some(c => c.rank === target)
                    && tarokks.some(c => c.rank === 21 || c.rank === 22));
                if (valid)
                    result.push({ type: 'invite', target });
            }
        }
        return inviteRestriction ? result.filter(a => a.type !== 'bid') : result;
    }
    const queueMode = state.responseQueue !== undefined;
    if (queueMode) {
        // A response to a higher bid is normally Solo; a bidder whose earlier
        // lower contract is being challenged may hold the current contract.
        if (highest.contract !== 'solo')
            result.push({ type: 'bid', contract: 'solo' });
        const priorBid = [...bidRecords(state)].reverse().find(r => r.playerId === playerId);
        if (priorBid && idx(priorBid.action.contract) < idx(highest.contract)) {
            result.push({ type: 'hold', contract: highest.contract });
        }
        return inviteRestriction ? result.filter(a => a.type !== 'bid') : result;
    }
    const previous = highest.contract;
    const next = order[idx(previous) + 1];
    if (next)
        result.push({ type: 'bid', contract: next });
    const previousBids = bidRecords(state);
    const lastBid = previousBids[previousBids.length - 1];
    if (lastBid && lastBid.playerId !== playerId) {
        result.push({ type: 'hold', contract: lastBid.action.contract });
    }
    return inviteRestriction ? result.filter(a => a.type !== 'bid') : result;
}
export function applyAuctionAction(state, action, hands) {
    if (state.finished)
        throw new Error('Az aukció már lezárult.');
    const playerId = state.seats[state.currentSeat].playerId;
    const legal = legalAuctionActions(state, playerId, hands).some(a => JSON.stringify(a) === JSON.stringify(action));
    if (!legal)
        throw new Error('Ez az akció ebben a licithelyzetben nem szabályos.');
    let next = { ...state, records: [...state.records, { playerId, action }] };
    if (action.type === 'pass') {
        next.out = Array.from(new Set([...next.out, playerId]));
        if (state.responseQueue)
            return nextQueueSeat(next, state.responseQueue);
        const turnable = nextActive(next, state.currentSeat);
        if (turnable === undefined && next.highest)
            return finish(next);
        if (activeIds(next).length <= 1 && next.highest)
            return finish(next);
        if (next.highest && next.out.includes(next.highest.playerId))
            return finish(next);
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    if (action.type === 'bid') {
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        if (state.records.length === 0 && action.contract !== 'three') {
            next.openingBid = { playerId, contract: action.contract };
        }
        if (next.outstandingInvite && playerId !== next.outstandingInvite.inviterId && hands) {
            const hand = hands[playerId] ?? [];
            if (hand.some(c => isTarokk(c) && c.rank === next.outstandingInvite.target)) {
                next.inviteAcceptedBy = playerId;
                next.inviterLockedOut = true;
            }
        }
        if (action.contract === 'solo') {
            // Solo is not automatically final if there are still earlier bidders who
            // may hold it. In a normal first bid, however, there is no response chain.
            const earlier = bidRecords(state).filter(r => !next.out.includes(r.playerId) && r.playerId !== playerId);
            if (state.responseQueue && earlier.length) {
                const holderCandidates = earlier.filter(r => idx(r.action.contract) < idx('solo'));
                if (holderCandidates.length) {
                    const queue = holderCandidates.map(r => r.playerId);
                    return nextQueueSeat(next, queue);
                }
            }
            return finish(next);
        }
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    if (action.type === 'hold-invite') {
        const openingInvite = openingInviteForResponse(next, playerId, hands);
        if (!openingInvite || openingInvite.target !== action.target || openingInvite.contract !== action.contract) {
            throw new Error('Az erős indulásból értelmezett invit nem igazolható a játékos lapjaival.');
        }
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        next.outstandingInvite = { inviterId: playerId, target: action.target };
        next.inviteAcceptedBy = openingInvite.acceptedBy;
        next.inviterLockedOut = false;
        // Once the invite has been accepted by the lower bidder, the opener keeps
        // the contract but remains the responder if a later player jumps to Solo.
        // The accepted bidder itself is not invited to re-speak merely because it
        // accepted; the ordinary response ladder continues around the table.
        const queue = holdResponseQueue(next, playerId, action.contract);
        return nextQueueSeat(next, queue);
    }
    if (action.type === 'hold') {
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        const queue = holdResponseQueue(next, playerId, action.contract);
        // The holder itself should not be re-added immediately. The next bidder in
        // the original ladder gets the first response (B in A3/B2/C1).
        return nextQueueSeat(next, queue);
    }
    if (action.type === 'invite') {
        if (next.outstandingInvite)
            throw new Error('Viszontinvit nem megengedett.');
        next.outstandingInvite = { inviterId: playerId, target: action.target };
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    const ns = nextActive(next, state.currentSeat);
    return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
}
