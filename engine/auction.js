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
    // XX-invit / engedés is not available with Pagát: it is the XX + big honour
    // + 5 tarokk structural invite used to release the game to a partner.
    if (target === 20 && tarokks.some(c => c.rank === 1))
        return false;
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
    const opening = state.openingBid ?? (bids[0]?.action.contract === 'three'
        ? { playerId: bids[0].playerId, contract: 'three' }
        : undefined);
    if (!opening || opening.playerId !== playerId)
        return undefined;
    // Opening-invite logic is tied to the FIRST opposing bid after the opening.
    // A:2 B:1 C:Szóló must still be the XIX invite to B, not a new invite to C;
    // A:3 B:2 C:1 is ordinary 3-2-1, not an opening invite.
    const firstResponse = bids.find(r => r.playerId !== opening.playerId);
    if (!firstResponse)
        return undefined;
    const c = firstResponse.action.contract;
    let candidate;
    if (opening.contract === 'three') {
        if (c === 'one')
            candidate = { target: 19, contract: 'one', acceptedBy: firstResponse.playerId };
        else if (c === 'solo')
            candidate = { target: 18, contract: 'solo', acceptedBy: firstResponse.playerId };
    }
    else if (opening.contract === 'two') {
        if (c === 'one' || c === 'solo')
            candidate = { target: 19, contract: c, acceptedBy: firstResponse.playerId };
    }
    else if (opening.contract === 'one' && c === 'solo') {
        candidate = { target: 18, contract: 'solo', acceptedBy: firstResponse.playerId };
    }
    // The response is only actionable while that bid remains the live highest.
    // If somebody subsequently raises, the original opener simply passes and the
    // original invite is resolved against the eventual winner.
    return candidate && state.highest?.contract === candidate.contract ? candidate : undefined;
}
function latePassInviteTarget(state, playerId, hands) {
    const bids = bidRecords(state);
    if (bids.length < 2 || !hands)
        return undefined;
    const passEligible = (target) => canInviteWithHand(hands[playerId], target);
    // Classic opening-invite families, including the cases where intervening
    // players have already passed or a later player has raised again.
    const opening = state.openingBid;
    if (opening?.playerId === playerId) {
        const candidate = openingJumpResponse(state, playerId);
        if (candidate && passEligible(candidate.target))
            return candidate.target;
    }
    // Tarokk-őr's later XIX-invite: A:3 B:2 A:1 B:Tartom A:Passz.
    // The Tartom is not a bid record, therefore the pattern is detected from the
    // first three bids plus the actual subsequent hold action.
    const hasThreeTwoOnePrefix = bids.length >= 3
        && bids[0]?.playerId === playerId && bids[0]?.action.contract === 'three'
        && bids[1]?.playerId !== playerId && bids[1]?.action.contract === 'two'
        && bids[2]?.playerId === playerId && bids[2]?.action.contract === 'one';
    const firstAfterOne = hasThreeTwoOnePrefix
        ? state.records.slice(Math.max(0, state.records.findIndex(r => r.playerId === playerId && r.action.type === 'bid' && r.action.contract === 'one')) + 1)
            .find(r => r.playerId !== playerId)
        : undefined;
    const firstAfterOneIsHold = !!firstAfterOne
        && firstAfterOne.action.type === 'hold'
        && firstAfterOne.action.contract === 'one';
    if (hasThreeTwoOnePrefix && firstAfterOneIsHold && passEligible(19))
        return 19;
    // Tarokk-őr's parallel later XVIII-invite: A:3 B:2 A:1 B:Szóló A:Passz.
    const hasThreeTwoOneSolo = bids.length >= 4
        && bids[0]?.playerId === playerId && bids[0]?.action.contract === 'three'
        && bids[1]?.action.contract === 'two' && bids[1]?.playerId !== playerId
        && bids[2]?.playerId === playerId && bids[2]?.action.contract === 'one'
        && bids[3]?.playerId !== playerId && bids[3]?.action.contract === 'solo';
    if (hasThreeTwoOneSolo && passEligible(18))
        return 18;
    // A:2 B:1 C:Szóló D:Passz A:Passz (the original A's XIX invite is still
    // addressed to B, even though C subsequently raised to Szóló).
    const hasTwoOneLate = opening?.playerId === playerId
        && opening.contract === 'two'
        && bids.some((r, i) => i > 0 && r.playerId !== playerId && r.action.contract === 'one')
        && passEligible(19);
    if (hasTwoOneLate)
        return 19;
    // Keep the helper conservative if the player has only made an unrelated
    // rebid; an invite must be supported by a documented sequence.
    return undefined;
}
function holdCreatesInviteTarget(state, holderId, heldContract, hands) {
    if (!hands || heldContract !== 'solo')
        return undefined;
    const bids = bidRecords(state);
    if (bids.length < 3)
        return undefined;
    const solo = bids[bids.length - 1];
    const previous = bids[bids.length - 2];
    const opening = bids[0];
    if (solo.action.contract !== 'solo' || previous.action.contract !== 'two')
        return undefined;
    // Canonical special case: A:3 B:2 C:Szóló D:Pass A:Tartom ... -> C's
    // Szóló is the XVIII invite. This is the convention explicitly discussed in
    // the literature; we prefer XVIII here over the mechanical one-jump reading.
    if (opening.playerId !== holderId || opening.action.contract !== 'three')
        return undefined;
    if (solo.playerId === holderId || previous.playerId === holderId)
        return undefined;
    return canInviteWithHand(hands[solo.playerId], 18)
        ? { inviterId: solo.playerId, target: 18 }
        : undefined;
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
/**
 * After a new Szóló bid by somebody other than the current hold-owner, the
 * players sitting between the solo bidder and the hold-owner must still get
 * their one response (normally Passz) before the hold-owner can accept, hold
 * or establish an invite. This is what produces, for example,
 * A:2 B:1 C:Szóló D:Pász A:Pász and A:3 B:2 A:1 B:Szóló C/D:Pász A:Pász.
 */
function responseQueueUntilHolder(state, speaker, holder) {
    const result = [];
    const soloSeat = seatOf(state, speaker);
    const holderSeat = seatOf(state, holder);
    for (let step = 1; step <= state.seats.length; step++) {
        const s = (soloSeat + step) % state.seats.length;
        if (s === holderSeat)
            break;
        const id = state.seats[s].playerId;
        if (!state.out.includes(id) && !result.includes(id))
            result.push(id);
    }
    if (!state.out.includes(holder) && !result.includes(holder))
        result.push(holder);
    return result;
}
function honourlessResponseQueueUntilHolder(state, speaker, holder, hands) {
    if (!hands)
        return [];
    const result = [];
    const speakerSeat = seatOf(state, speaker);
    const holderSeat = seatOf(state, holder);
    for (let step = 1; step <= state.seats.length; step++) {
        const s = (speakerSeat + step) % state.seats.length;
        if (s === holderSeat)
            break;
        const id = state.seats[s].playerId;
        if (state.out.includes(id) || result.includes(id))
            continue;
        if (!canBidWithHand(hands[id]))
            result.push(id);
    }
    return result;
}
function allActiveExcept(state, except) {
    const result = [];
    const exceptSeat = seatOf(state, except);
    for (let step = 1; step <= state.seats.length; step++) {
        const s = (exceptSeat + step) % state.seats.length;
        const id = state.seats[s].playerId;
        if (id !== except && activeIds(state).includes(id) && !result.includes(id))
            result.push(id);
    }
    return result;
}
export function legalAuctionActions(state, playerId, hands) {
    if (state.finished || state.seats[state.currentSeat]?.playerId !== playerId || state.out.includes(playerId))
        return [];
    const result = [{ type: 'pass' }];
    const hand = hands?.[playerId];
    const hasBidAuthority = canBidWithHand(hand);
    const currentHolder = holdOwner(state);
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
            return [{ type: 'pass', inviteTarget: openingInvite.target }, { type: 'hold', contract: openingResponse.contract }];
        return [{ type: 'pass' }, { type: 'hold', contract: openingResponse.contract }];
    }
    const lateInvite = latePassInviteTarget(state, playerId, hands);
    if (lateInvite !== undefined) {
        const unique = [...result.filter(a => a.type !== 'pass'), { type: 'pass', inviteTarget: lateInvite }];
        return unique.length ? unique : result;
    }
    const highest = state.highest;
    const outstandingInvite = state.outstandingInvite;
    const history = bidRecords(state);
    const alreadyBid = hasBidOfPlayer(state, playerId);
    // Later invite response case: A:3 B:2 A:1. The Kettő bidder B may either
    // Tartom the One (XIX invite path) or continue to Szóló (XVIII invite path).
    // These are documented signalling moves, not ordinary lower-bids by B.
    const lateInviteResponder = history.length === 3
        && history[0]?.action.contract === 'three'
        && history[1]?.action.contract === 'two'
        && history[2]?.action.contract === 'one'
        && history[0]?.playerId === history[2]?.playerId
        && history[1]?.playerId === playerId
        && highest.contract === 'one'
        && highest.playerId === history[2]?.playerId;
    if (lateInviteResponder) {
        result.push({ type: 'hold', contract: 'one' });
        result.push({ type: 'bid', contract: 'solo' });
        return result;
    }
    // The only player entitled to Tartom is the current hold-owner. It does not
    // suppress legal invite signals that the same player can make after having
    // already entered the auction: XX/XIX/XVIII invits are information actions,
    // not higher ordinary bids.
    if (currentHolder === playerId && highest && highest.playerId !== playerId) {
        const firstBid = history[0];
        const engedesEligible = !!firstBid
            && firstBid.playerId === playerId
            && firstBid.action.type === 'bid'
            && firstBid.action.contract === 'three'
            && history.length === 2
            && history[1]?.action.type === 'bid'
            && history[1]?.action.contract === 'two'
            && highest.contract === 'two';
        // Only the immediate 3-2 position has the mandatory-Tartom rule. Once the
        // auction has continued to One/Solo, the holder may of course pass normally.
        if (!engedesEligible) {
            return [...result, { type: 'hold', contract: highest.contract }];
        }
        // After 3-2 the first speaker must hold the Kettő by default. The one
        // documented exception is a later XIX/XVIII invite sequence: A:3 B:2
        // A:1 ... . The lower One is a signalling move, not an ordinary raise,
        // and is only legal when A has the strong XIX/XVIII invite structure.
        const resultWithHold = [
            { type: 'hold', contract: highest.contract },
        ];
        if (canInviteWithHand(hand, 19) || canInviteWithHand(hand, 18)) {
            resultWithHold.push({ type: 'bid', contract: 'one' });
        }
        if (!outstandingInvite && canInviteWithHand(hand, 20)) {
            resultWithHold.push({ type: 'invite', target: 20, contract: highest.contract });
        }
        return resultWithHold;
    }
    if (!highest) {
        if (outstandingInvite && hands && !hasInviteCard(hand, outstandingInvite.target))
            return result;
        for (const contract of order)
            result.push({ type: 'bid', contract });
        // A first-spoken Solo is never itself an invite: it cannot yet be accepted.
        // Opening 2/1 invitations are recognized later when the opener steps aside.
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
        const isCanonicalThreeTwo = bidRecords(state).length >= 2
            && bidRecords(state)[0]?.action.contract === 'three'
            && bidRecords(state)[1]?.action.contract === 'two'
            && bidRecords(state)[0]?.playerId !== playerId
            && bidRecords(state)[1]?.playerId !== playerId
            && highest.contract === 'two';
        // Jump over exactly one/two contracts = XIX/XVIII invite respectively.
        for (const announced of order.slice(idx(highest.contract) + 2)) {
            const target = inviteTargetForJump(highest.contract, announced);
            if (target !== undefined && !(isCanonicalThreeTwo && announced === 'solo') && canInviteWithHand(hand, target)) {
                result.push({ type: 'invite', target, contract: announced });
            }
        }
        // Canonical special case from the specialist literature: after 3-2, a
        // third player's Szóló can be offered explicitly as an XVIII-invit. Some
        // tables mechanically call it a XIX-invit because it skips only One; the
        // Tarokk-őr convention treats this accepted Szóló as an XVIII-invit, which
        // we use for this exact 3-2 context.
        const canonicalThreeTwo = isCanonicalThreeTwo && canInviteWithHand(hand, 18);
        if (canonicalThreeTwo && !result.some(a => a.type === 'invite' && a.target === 18 && a.contract === 'solo')) {
            result.push({ type: 'invite', target: 18, contract: 'solo' });
        }
        // XX-invit / Engedés is handled only in the dedicated first-speaker
        // Három -> Kettő branch above. Do not offer it here: doing so would make
        // later speakers eligible after Tartom.
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
        const openingInvite = action.inviteTarget !== undefined ? openingInviteForResponse(state, playerId, hands) : undefined;
        const lateInvite = action.inviteTarget !== undefined && !openingInvite ? latePassInviteTarget(state, playerId, hands) : undefined;
        const resolvedTarget = openingInvite?.target ?? lateInvite;
        if (action.inviteTarget !== undefined) {
            if (resolvedTarget !== action.inviteTarget)
                throw new Error('Ez a Passz nem hozhat létre szabályos invitet.');
            const inviteAcceptor = openingInvite?.acceptedBy ?? (() => {
                const bids = bidRecords(state);
                // Later 3-2-1 invitation families: the Kettő bidder is the responder.
                if (bids.length >= 3 && bids[0]?.playerId === playerId && bids[0]?.action.contract === 'three'
                    && bids[1]?.action.contract === 'two' && bids[1]?.playerId !== playerId
                    && bids[2]?.playerId === playerId && bids[2]?.action.contract === 'one')
                    return bids[1]?.playerId;
                if (state.openingBid?.playerId === playerId) {
                    return bids.find(r => r.playerId !== playerId)?.playerId;
                }
                return undefined;
            })();
            next.outstandingInvite = { inviterId: playerId, target: action.inviteTarget };
            if (inviteAcceptor)
                next.inviteAcceptedBy = inviteAcceptor;
            next.inviterLockedOut = false;
            // If the invited player has not yet become the winning holder, give them
            // the auction now; otherwise the pass completes the invitation.
            if (inviteAcceptor && !next.out.includes(inviteAcceptor)) {
                const acceptorIsHighest = next.highest?.playerId === inviteAcceptor;
                if (acceptorIsHighest)
                    return finish(next);
                delete next.responseQueue;
                return { ...next, currentSeat: seatOf(next, inviteAcceptor) };
            }
        }
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
        // A simple Hármas ends after the fourth player's pass. There is no
        // second-round return to the opening bidder.
        if (activeIds(next).length <= 1 && next.highest)
            return finish(next);
        // When the holder passes, the Tartom right moves directly to the next
        // bidder; that player must be given the next speaking turn. Do not skip
        // the new holder by applying nextActive() from their seat.
        if (successor)
            return { ...next, currentSeat: seatOf(next, successor) };
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    if (action.type === 'bid') {
        const bidsBefore = bidRecords(state);
        const isLateInviteOne = action.contract === 'one'
            && bidsBefore.length === 2
            && bidsBefore[0]?.playerId === playerId
            && bidsBefore[0]?.action.contract === 'three'
            && bidsBefore[1]?.playerId !== playerId
            && bidsBefore[1]?.action.contract === 'two'
            && state.highest?.playerId === bidsBefore[1]?.playerId
            && state.highest.contract === 'two';
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
                const queue = responseQueueUntilHolder(next, playerId, owner);
                if (queue.length)
                    return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
                return { ...next, currentSeat: seatOf(next, owner) };
            }
            return finish(next);
        }
        if (owner && owner !== playerId && !next.out.includes(owner)
            && !(next.inviterLockedOut && next.outstandingInvite?.inviterId === owner)) {
            // Normally the current holder responds directly after the new bid.
            // Exception: if a player who is sitting between the holder and the
            // new bidder has already passed, the still-unspoken seats between
            // the new bidder and the holder must get their own explicit turn.
            // Example: A:3, B:Pass, C:2 => D must press Passz before A can
            // respond. We never skip D merely because D has no honour.
            const openingInvite = openingInviteForResponse(next, owner, hands);
            if (openingInvite && openingInvite.acceptedBy === playerId) {
                const queue = responseQueueUntilHolder(next, playerId, owner);
                if (queue.length)
                    return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
            }
            const ownerSeat = seatOf(next, owner);
            const bidderSeat = seatOf(next, playerId);
            // If anyone between the new bidder and the hold-owner has already
            // passed earlier in this auction, we are completing a speaking
            // cycle after a gap. The seats after the new bid and before the
            // holder must receive their own explicit turns; never infer a
            // pass from the contents of their hand.
            const hasPassedGap = (() => {
                // In a 4-player auction, a previously passed opener changes the
                // return path. Example: A:Pass, B:3, C:2. D has not spoken yet
                // and must press Passz before B can receive the holding right.
                // Never infer D's pass from the hand.
                const openerPassed = next.seats.length === 4 && state.records[0]?.action?.type === 'pass';
                if (openerPassed) return true;
                for (let step = 1; step < next.seats.length; step++) {
                    const s = (bidderSeat + step) % next.seats.length;
                    if (s === ownerSeat) break;
                    const id = next.seats[s].playerId;
                    if (next.out.includes(id)) return true;
                }
                for (let step = 1; step < next.seats.length; step++) {
                    const s = (ownerSeat + step) % next.seats.length;
                    if (s === bidderSeat) break;
                    const id = next.seats[s].playerId;
                    if (next.out.includes(id)) return true;
                }
                return false;
            })();
            if (hasPassedGap) {
                const queue = responseQueueUntilHolder(next, playerId, owner);
                if (queue.length && queue[0] !== owner)
                    return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
            }
            // A player without a honőr cannot raise, but that does NOT mean
            // the engine may silently skip that player. Surface an explicit
            // Passz turn before the current holder responds.
            const honourlessQueue = honourlessResponseQueueUntilHolder(next, playerId, owner, hands);
            if (honourlessQueue.length) {
                return { ...next, currentSeat: seatOf(next, honourlessQueue[0]), responseQueue: [...honourlessQueue.slice(1), owner] };
            }
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
        if (action.contract === 'solo') {
            const queue = allActiveExcept(next, playerId);
            if (queue.length)
                return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
            return finish(next);
        }
        const continuation = continuationAfterHold(next, playerId);
        return continuation === undefined ? finish(next) : { ...next, currentSeat: continuation };
    }
    if (action.type === 'hold') {
        const owner = holdOwner(state);
        const bidsNow = bidRecords(state);
        const lateInviteResponder = action.contract === 'one'
            && bidsNow.length === 3
            && bidsNow[0]?.action.contract === 'three'
            && bidsNow[1]?.action.contract === 'two'
            && bidsNow[2]?.action.contract === 'one'
            && bidsNow[0]?.playerId === bidsNow[2]?.playerId
            && bidsNow[1]?.playerId === playerId
            && state.highest?.contract === 'one'
            && state.highest.playerId === bidsNow[2]?.playerId;
        if ((!lateInviteResponder && owner !== playerId) || !state.highest || state.highest.playerId === playerId)
            throw new Error('Tartani csak a tartási jogosult teheti, másik játékos magasabb licitje után.');
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        delete next.responseQueue;
        const holdInvite = holdCreatesInviteTarget(state, playerId, action.contract, hands);
        if (holdInvite) {
            next.outstandingInvite = holdInvite;
            next.inviteAcceptedBy = playerId;
        }
        // In the later A:3 B:2 A:1 B:Tartom line, C/D may still be unspoken.
        // They get their response before the original inviter A can close the
        // sequence with Passz (which establishes the XIX invite).
        if (lateInviteResponder && action.contract === 'one') {
            const inviter = bidsNow[2]?.playerId;
            if (inviter && inviter !== playerId && !next.out.includes(inviter)) {
                const queue = responseQueueUntilHolder(next, playerId, inviter);
                if (queue.length)
                    return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
                return { ...next, currentSeat: seatOf(next, inviter) };
            }
        }
        if (action.contract === 'solo') {
            const queue = allActiveExcept(next, playerId);
            if (queue.length)
                return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
            return finish(next);
        }
        // In the later A:3 B:2 A:1 B:Tartom line, C/D may still be unspoken.
        // They get their response before the original inviter A can close the
        // sequence with Passz (which establishes the XIX invite).
        if (lateInviteResponder && action.contract === 'one') {
            const inviter = bidsNow[2]?.playerId;
            if (inviter && inviter !== playerId && !next.out.includes(inviter)) {
                const queue = responseQueueUntilHolder(next, playerId, inviter);
                if (queue.length)
                    return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
                return { ...next, currentSeat: seatOf(next, inviter) };
            }
        }
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
