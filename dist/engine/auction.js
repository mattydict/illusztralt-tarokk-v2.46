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
    if (target === 18 && (highest === 'three' || highest === 'two'))
        return 'solo';
    if (target === 19 && (highest === 'two' || highest === 'one'))
        return 'solo';
    return undefined;
}
function sameAuctionAction(state, expected, actual) {
    if (!expected || !actual || expected.type !== actual.type) return false;
    // These extra fields explain the rules to the UI; they are issued by the
    // server and must not be required from (or trusted in) a client request.
    if (expected.type === 'pass') return (expected.inviteTarget ?? undefined) === (actual.inviteTarget ?? undefined);
    if (expected.type === 'bid') return expected.contract === actual.contract && Boolean(expected.honourless) === Boolean(actual.honourless);
    if (expected.type === 'hold') return expected.contract === actual.contract;
    if (expected.type === 'hold-invite') return expected.target === actual.target && expected.contract === actual.contract;
    if (expected.type === 'invite') {
      if (expected.target !== actual.target) return false;
      const expectedContract = expected.contract ?? inviteContractForTarget(state, expected.target);
      const actualContract = actual.contract ?? inviteContractForTarget(state, actual.target);
      return expectedContract === actualContract;
    }
    return JSON.stringify(expected) === JSON.stringify(actual);
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
    if (bids.length < 2 || !hands) return undefined;
    const passEligible = (target) => canInviteWithHand(hands[playerId], target);
    const opening = state.openingBid;

    // Opening XX/XIX/XVIII invitation patterns.
    if (opening?.playerId === playerId) {
        const candidate = openingJumpResponse(state, playerId);
        if (candidate && passEligible(candidate.target)) return candidate.target;
    }

    const records = state.records ?? [];
    const firstIndex = (id, contract) => records.findIndex(r => r.playerId === id && r.action?.type === 'bid' && r.action.contract === contract);
    const hasAction = (id, type, contract, after = -1) => records.some((r, i) => i > after && r.playerId === id && r.action?.type === type && (contract === undefined || r.action.contract === contract));

    // A:3 B:2 A:1 is an XIX-invit. B can accept with Tartom or Szóló;
    // Szóló here does NOT turn it into an XVIII-invit.
    const threeTwoOne = bids.length >= 3
        && bids[0]?.playerId === playerId && bids[0]?.action.contract === 'three'
        && bids[1]?.playerId !== playerId && bids[1]?.action.contract === 'two'
        && bids[2]?.playerId === playerId && bids[2]?.action.contract === 'one';
    if (threeTwoOne) {
        const oneIndex = firstIndex(playerId, 'one');
        const subsequent = records.slice(oneIndex + 1).find(r => r.playerId !== playerId);
        if (subsequent && ((subsequent.action?.type === 'hold' && subsequent.action.contract === 'one')
            || (subsequent.action?.type === 'bid' && subsequent.action.contract === 'solo')) && passEligible(19)) return 19;
    }

    // A:3 B:2 A:Hold, B:Szóló*, A:Hold, B:Pass -> B's XIX-invit.
    if (bids[0]?.action.contract === 'three' && bids[1]?.action.contract === 'two'
        && bids[0]?.playerId !== playerId && bids[1]?.playerId === playerId
        && bids.at(-1)?.playerId === playerId && bids.at(-1)?.action.contract === 'solo'
        && hasAction(bids[0].playerId, 'hold', 'two') && passEligible(19)) return 19;

    // A:3 B:2 A:Hold, B:1, A:Szóló*, B:Hold, A:Pass -> A's XIX-invit.
    if (bids.length >= 4 && bids[0]?.action.contract === 'three' && bids[1]?.action.contract === 'two'
        && bids[0]?.playerId === playerId && bids[1]?.playerId !== playerId
        && bids[2]?.action.contract === 'one' && bids[2]?.playerId !== playerId
        && bids[3]?.playerId === playerId && bids[3]?.action.contract === 'solo'
        && hasAction(playerId, 'hold', 'two') && passEligible(19)) {
        const oneIndex = firstIndex(bids[2].playerId, 'one');
        if (hasAction(bids[1].playerId, 'hold', 'solo', oneIndex)) return 19;
    }

    // XVIII-specific patterns from the user's table. These are distinct from
    // the 3-2-1 family above, whose Solo response is still an XIX acceptance.
    // A:3 B:Szóló*, A:Tartom, B:Passz.
    if (bids.length >= 2 && bids[0]?.playerId !== playerId && bids[0]?.action.contract === 'three'
        && bids[1]?.playerId === playerId && bids[1]?.action.contract === 'solo'
        && hasAction(bids[0].playerId, 'hold', 'solo') && passEligible(18)) return 18;
    // A:3 B:2 A:Szóló*, B:Tartom, A:Passz.
    if (bids.length >= 3 && bids[0]?.playerId === playerId && bids[0]?.action.contract === 'three'
        && bids[1]?.playerId !== playerId && bids[1]?.action.contract === 'two'
        && bids[2]?.playerId === playerId && bids[2]?.action.contract === 'solo'
        && hasAction(bids[1].playerId, 'hold', 'solo') && passEligible(18)) return 18;

    // Three-bidder variants where the original two-bidder invitation survives
    // a later raise to Solo (A:2, B:1, C:Solo, A:Pass, B:Hold).
    const hasTwoOneLate = opening?.playerId === playerId && opening.contract === 'two'
        && bids.length === 2
        && bids[1]?.playerId !== playerId && bids[1]?.action.contract === 'one'
        && passEligible(19);
    if (hasTwoOneLate) return 19;

    // A:3 B:1* C:Solo A:Hold B:Pass — the One bidder B owns XIX.
    if (bids.length >= 3 && bids[0]?.action.contract === 'three'
        && bids[1]?.playerId === playerId && bids[1]?.action.contract === 'one'
        && bids[2]?.playerId !== playerId && bids[2]?.action.contract === 'solo'
        && hasAction(bids[0].playerId, 'hold', 'solo') && passEligible(19)) return 19;

    return undefined;
}
function holdCreatesInviteTarget(state, holderId, heldContract, hands) {
    if (!hands || heldContract !== 'solo') return undefined;
    const bids = bidRecords(state);
    if (bids.length < 3 || bids.at(-1)?.action.contract !== 'solo') return undefined;
    const opening = bids[0];
    const second = bids[1];
    const solo = bids.at(-1);
    const owns = (id, target) => canInviteWithHand(hands[id], target);

    // A:3 B:2 C:Szóló*, A:Tartom. The marked bidder's card decides whether
    // this is an XIX or XVIII invite; do not infer it from the contract jump.
    if (opening.action.contract === 'three' && second.action.contract === 'two'
        && opening.playerId === holderId && solo.playerId !== holderId && second.playerId !== holderId) {
        if (owns(solo.playerId, 19)) return { inviterId: solo.playerId, target: 19 };
        if (owns(solo.playerId, 18)) return { inviterId: solo.playerId, target: 18 };
    }

    // A:3 B:2 A:Szóló*, B:Tartom, A:Pass — explicit XVIII family.
    if (bids.length === 3 && opening.action.contract === 'three' && second.action.contract === 'two'
        && solo.playerId === opening.playerId && holderId !== opening.playerId && owns(solo.playerId, 18)) {
        return { inviterId: solo.playerId, target: 18 };
    }

    // A:3 B:2 A:Tartom B:Szóló*, A:Tartom — B's marked Solo invites XIX.
    if (bids.length === 3 && opening.action.contract === 'three' && second.action.contract === 'two'
        && solo.playerId === second.playerId && holderId === opening.playerId && owns(solo.playerId, 19)) {
        return { inviterId: solo.playerId, target: 19 };
    }

    // A:3 B:2 C:1 A:Szóló*, B:Tartom — A's marked Solo invites XIX.
    if (bids.length >= 4 && opening.action.contract === 'three' && second.action.contract === 'two'
        && bids[2]?.action.contract === 'one' && bids[3]?.action.contract === 'solo'
        && bids[3]?.playerId === opening.playerId && holderId !== opening.playerId
        && owns(opening.playerId, 19)) return { inviterId: opening.playerId, target: 19 };

    // A:2 B:1 C:Szóló*, A:Pass, B:Tartom — the later Solo bidder invites XIX.
    if (bids.length === 3 && opening.action.contract === 'two' && second.action.contract === 'one'
        && solo.playerId !== opening.playerId && solo.playerId !== second.playerId
        && holderId === second.playerId && owns(solo.playerId, 19)) {
        return { inviterId: solo.playerId, target: 19 };
    }
    return undefined;
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
    // Explicit invites are a two-step public signal: the inviter names the
    // invited tarokk, the current/highest bidder accepts with Tartom, and the
    // inviter closes with Passz. Never turn a lower signal bid (e.g. One-invit
    // against Three) into the actual winning contract.
    if (state.outstandingInvite && !state.inviteAcceptedBy && state.inviteResponderId === playerId) {
        return [{ type: 'hold-invite', target: state.outstandingInvite.target, contract: state.highest?.contract ?? 'solo' }];
    }
    if (state.outstandingInvite && state.inviteAcceptedBy && state.outstandingInvite.inviterId === playerId) {
        return [{ type: 'pass' }];
    }
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
        const unique = [...result.filter(a => a.type !== 'pass')];
        unique.push({ type: 'pass', inviteTarget: lateInvite });
        return unique;
    }
    const highest = state.highest;
    const outstandingInvite = state.outstandingInvite;
    const history = bidRecords(state);
    const alreadyBid = hasBidOfPlayer(state, playerId);
    // A:3 B:2 A:1 is an XIX-invit. The Kettő bidder may accept with Tartom-One
    // or by continuing to Szóló; the acceptance does not turn it into XVIII.
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
        result.push({ type: 'hold', contract: 'one', acceptsInviteTarget: 19 });
        result.push({ type: 'bid', contract: 'solo', acceptsInviteTarget: 19 });
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
            // A:Három, B:Kettő, A:Tartom, B:Egy, A:Szóló* is a special
            // adjacent-step XIX-invit. It must be exposed as an invitation,
            // not as an unlabelled ordinary Solo bid.
            const openerInvitesXixAfterSecondBidsOne = history.length === 3
                && history[0]?.action.contract === 'three'
                && history[1]?.action.contract === 'two'
                && history[2]?.action.contract === 'one'
                && history[0]?.playerId === playerId
                && history[1]?.playerId !== playerId
                && history[2]?.playerId === history[1]?.playerId
                && state.records.some(r => r.playerId === playerId && r.action?.type === 'hold' && r.action.contract === 'two')
                && highest.contract === 'one'
                && highest.playerId === history[1]?.playerId
                && !outstandingInvite
                && canInviteWithHand(hand, 19);
            if (openerInvitesXixAfterSecondBidsOne) {
                return [...result, { type: 'hold', contract: 'one' }, { type: 'invite', target: 19, contract: 'solo' }];
            }
            // Three-bidder XIX-invit from the first bidder's Solo:
            // A:Három, B:Kettő, C:Egy, A:Szóló*, B:Tartom, A:Passz.
            // This Solo is an invitation to XIX, not an ordinary XVIII jump.
            const threeTwoOneThirdBidder = history.length >= 3
                && history[0]?.action.contract === 'three'
                && history[1]?.action.contract === 'two'
                && history[2]?.action.contract === 'one'
                && history[0]?.playerId === playerId
                && history[1]?.playerId !== playerId
                && history[2]?.playerId !== playerId
                && history[2]?.playerId !== history[1]?.playerId
                && highest.contract === 'one'
                && !outstandingInvite
                && canInviteWithHand(hand, 19);
            if (threeTwoOneThirdBidder) {
                return [...result, { type: 'hold', contract: 'one' }, { type: 'invite', target: 19, contract: 'solo' }];
            }
            const heldThreeTwoThenOne = history.length >= 3
                && history[0]?.action.contract === 'three'
                && history[1]?.action.contract === 'two'
                && history[0]?.playerId === playerId
                && history[1]?.playerId !== playerId
                && history[2]?.action.contract === 'one'
                && history[2]?.playerId === history[1]?.playerId
                && highest.contract === 'one'
                && canInviteWithHand(hand, 19)
                && !outstandingInvite;
            if (heldThreeTwoThenOne) {
                return [...result, { type: 'hold', contract: 'one' }, { type: 'invite', target: 19, contract: 'solo' }];
            }
            const inferredInvite = holdCreatesInviteTarget(state, playerId, highest.contract, hands);
            return [...result, { type: 'hold', contract: highest.contract, ...(inferredInvite ? { acceptsInviteTarget: inferredInvite.target } : {}) }];
        }
        // After 3-2 the first speaker must hold the Kettő by default. The one
        // documented exception is a later XIX/XVIII invite sequence: A:3 B:2
        // A:1 ... . The lower One is a signalling move, not an ordinary raise,
        // and is only legal when A has the strong XIX/XVIII invite structure.
        const resultWithHold = [
            { type: 'hold', contract: highest.contract },
        ];
        if (canInviteWithHand(hand, 19)) {
            resultWithHold.push({ type: 'bid', contract: 'one', invitationSignalTarget: 19 });
        }
        // In the exact 3-2 position the opener can choose Solo as an XVIII-invit.
        if (!outstandingInvite && canInviteWithHand(hand, 18)) {
            resultWithHold.push({ type: 'invite', target: 18, contract: 'solo' });
        }
        // In the exact 3-2 position, XX is an Engedés/pass signal, not a
        // separate higher bid. It is available only to the original Three
        // bidder who actually holds XX and satisfies the strong-hand rules.
        if (canInviteWithHand(hand, 20)) {
            resultWithHold.push({ type: 'pass', inviteTarget: 20 });
        }
        return resultWithHold;
    }
    if (!highest) {
        for (const contract of order) {
            const openingInviteTarget = contract === 'two' && canInviteWithHand(hand, 19)
                ? 19
                : contract === 'one' && canInviteWithHand(hand, 18) ? 18 : undefined;
            result.push({ type: 'bid', contract, ...(openingInviteTarget !== undefined ? { invitationSignalTarget: openingInviteTarget } : {}) });
        }
        // A first-spoken Solo is never itself an invite: it cannot yet be accepted.
        // Opening 2/1 invitations are recognized later when the opener steps aside.
        return result;
    }
    // In the A:3, B:1*-invit, C:Solo line, an unspoken player between the
    // explicit XIX signal and its responder may still raise to Solo. This is a
    // normal auction bid in the pending invite context, not an XVIII signal.
    const pendingThreeOneXix = outstandingInvite?.target === 19
        && !state.inviteAcceptedBy
        && state.inviteResponderId !== playerId
        && outstandingInvite.inviterId !== playerId
        && highest.contract === 'three'
        && state.records.some(r => r.action?.type === 'invite'
            && r.action.target === 19 && r.action.contract === 'one');
    if (pendingThreeOneXix && !result.some(a => a.type === 'bid' && a.contract === 'solo')) {
        result.push({ type: 'bid', contract: 'solo' });
    }
    // The invited tarokk belongs to the inviter. The accepting/winning player
    // therefore must NOT be required to hold the same (unique) card.
    const next = order[idx(highest.contract) + 1];
    if (next)
        result.push({ type: 'bid', contract: next });
    if (!outstandingInvite) {
        const bidsSoFar = bidRecords(state);
        const threeTwoThirdSpeakerXix = highest.contract === 'two'
            && bidsSoFar.length === 2
            && bidsSoFar[0]?.action.contract === 'three'
            && bidsSoFar[1]?.action.contract === 'two'
            && bidsSoFar[0]?.playerId !== playerId
            && bidsSoFar[1]?.playerId !== playerId
            && currentHolder === bidsSoFar[0]?.playerId
            && canInviteWithHand(hand, 19);
        if (threeTwoThirdSpeakerXix) {
            const soloBidIndex = result.findIndex(a => a.type === 'bid' && a.contract === 'solo');
            if (soloBidIndex >= 0) result[soloBidIndex] = { ...result[soloBidIndex], invitationSignalTarget: 19 };
            else result.push({ type: 'bid', contract: 'solo', invitationSignalTarget: 19 });
        }
        const twoOneThirdSpeaker = highest.contract === 'one'
            && bidsSoFar.length === 2
            && bidsSoFar[0]?.action.contract === 'two'
            && bidsSoFar[1]?.action.contract === 'one'
            && bidsSoFar[0]?.playerId !== playerId
            && bidsSoFar[1]?.playerId !== playerId
            && canInviteWithHand(hand, 19);
        if (twoOneThirdSpeaker) {
            // A:Kettő, B:Egy, C:Szóló* is an XIX signal to the holder who
            // accepts it with Tartom. Record it as a marked bid so the final
            // Pass/Tartom sequence is resolved by that table pattern.
            const soloBidIndex = result.findIndex(a => a.type === 'bid' && a.contract === 'solo');
            if (soloBidIndex >= 0) result[soloBidIndex] = { ...result[soloBidIndex], invitationSignalTarget: 19 };
            else result.push({ type: 'bid', contract: 'solo', invitationSignalTarget: 19 });
        }
        // Jump over exactly one/two contracts = XIX/XVIII invite respectively.
        for (const announced of order.slice(idx(highest.contract) + 2)) {
            const target = inviteTargetForJump(highest.contract, announced);
            if (target !== undefined && canInviteWithHand(hand, target)) {
                if (threeTwoThirdSpeakerXix && announced === 'solo' && target === 19) continue;
                result.push({ type: 'invite', target, contract: announced });
            }
        }
        // The documented three-bidder 3-2-Solo pattern is XIX-invit. XVIII-invit
        // belongs to the original 3-2 bidder's own Solo signal, exposed below.
        // XX-invit / Engedés is handled only in the dedicated first-speaker
        // Három -> Kettő branch above. Do not offer it here: doing so would make
        // later speakers eligible after Tartom.
    }
    return result;
}
export function applyAuctionAction(state, action, hands) {
    if (state.finished)
        throw new Error('Az aukció már lezárult.');
    const playerId = state.seats[state.currentSeat].playerId;
    const legalAction = legalAuctionActions(state, playerId, hands).find(a => sameAuctionAction(state, a, action));
    if (!legalAction)
        throw new Error('Ez az akció ebben a licithelyzetben nem szabályos.');
    action = legalAction;
    let next = { ...state, records: [...state.records, { playerId, action }] };
    if (action.type === 'pass') {
        // The inviter's closing Pass completes an explicit invitation accepted
        // by the nominated responder. The responder remains the auction winner.
        if (state.outstandingInvite && state.inviteAcceptedBy && state.outstandingInvite.inviterId === playerId) {
            return finish({ ...next, inviterPassConfirmed: true });
        }
        // For A:3, B:2, C:1, A:Solo*, B:Tartom, the invit is already complete
        // when all non-inviter seats between the acceptor and inviter have passed.
        // The inviter does not have to take an extra turn after the marked Solo.
        if (state.inviterPassConfirmed && state.outstandingInvite && state.inviteAcceptedBy
            && state.outstandingInvite.inviterId !== playerId
            && state.inviteAcceptedBy !== playerId
            && state.responseQueue?.length === 0) {
            return finish(next);
        }
        // Table-form invitations signalled by a marked ordinary bid (e.g.
        // A:3, B:2, C:Solo*, A:Tartom, B:Pass) close on the final other
        // player's Pass; the marked bidder is not asked for a second Pass.
        const markedBidInviteAccepted = state.outstandingInvite && state.inviteAcceptedBy
            && state.inviteAcceptedBy !== playerId
            && state.outstandingInvite.inviterId !== playerId
            && state.responseQueue?.length === 0
            && state.records.some(r => r.playerId === state.outstandingInvite.inviterId
                && r.action?.type === 'bid' && r.action?.invitationSignalTarget === state.outstandingInvite.target);
        if (markedBidInviteAccepted) return finish({ ...next, inviterPassConfirmed: true });
        // XX-invit / Engedés: in the documented A:3, B:2, A:Pass line,
        // the opening Three bidder yields the contract to the Kettő bidder.
        // The pass itself is the public invitation marker and closes the auction.
        if (action.inviteTarget === 20) {
            const bids = bidRecords(state);
            const validEngedes = bids.length === 2
                && bids[0]?.playerId === playerId && bids[0]?.action.contract === 'three'
                && bids[1]?.playerId !== playerId && bids[1]?.action.contract === 'two'
                && state.highest?.playerId === bids[1]?.playerId && state.highest?.contract === 'two'
                && canInviteWithHand(hands?.[playerId], 20);
            if (!validEngedes) throw new Error('XX-invit csak a szabályos Három–Kettő–Engedés helyzetben mondható.');
            next.outstandingInvite = { inviterId: playerId, target: 20 };
            next.inviteResponderId = state.highest.playerId;
            next.inviteAcceptedBy = state.highest.playerId;
            next.inviterPassConfirmed = true;
            next.engedes = true;
            return finish(next);
        }
        const openingInvite = action.inviteTarget !== undefined ? openingInviteForResponse(state, playerId, hands) : undefined;
        const lateInvite = action.inviteTarget !== undefined && !openingInvite ? latePassInviteTarget(state, playerId, hands) : undefined;
        const resolvedTarget = openingInvite?.target ?? lateInvite;
        if (action.inviteTarget !== undefined) {
            if (resolvedTarget !== action.inviteTarget)
                throw new Error('Ez a Passz nem hozhat létre szabályos invitet.');
            const inviteAcceptor = openingInvite?.acceptedBy
                ?? (state.highest?.playerId && state.highest.playerId !== playerId ? state.highest.playerId : undefined)
                ?? (() => {
                    const bids = bidRecords(state);
                    if (bids.length >= 3 && bids[0]?.playerId === playerId && bids[0]?.action.contract === 'three'
                        && bids[1]?.action.contract === 'two' && bids[1]?.playerId !== playerId
                        && bids[2]?.playerId === playerId && bids[2]?.action.contract === 'one') return bids[1]?.playerId;
                    if (state.openingBid?.playerId === playerId) return bids.find(r => r.playerId !== playerId)?.playerId;
                    return undefined;
                })();
            next.outstandingInvite = { inviterId: playerId, target: action.inviteTarget };
            if (inviteAcceptor) next.inviteAcceptedBy = inviteAcceptor;
            next.inviterLockedOut = false;
            if (action.inviteTarget === 20 && state.highest?.contract === 'two' && inviteAcceptor === state.highest.playerId) next.engedes = true;
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
        if (Array.isArray(state.responseQueue) && state.responseQueue.length) {
            const q = state.responseQueue.filter(id => id !== playerId);
            if (q.length) return nextQueueSeat(next, q);
            // If the queued holder passes, their Tartom right has already moved
            // to the next bidder. Do not let the response queue terminate the
            // auction before that new holder receives the explicit Tartom turn.
            if (successor) return { ...next, currentSeat: seatOf(next, successor) };
            return finish(next);
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
        // An outstanding invit is accepted only by its designated responder.
        // Other players who speak before that responder are merely exercising
        // their normal response turn and must not replace the invite's identity.
        if (next.outstandingInvite && state.inviteResponderId === playerId && !state.inviteAcceptedBy) {
            next.inviteAcceptedBy = playerId;
        }
        // Late XIX-invite acceptance: A:3, C:2, A:1. The Kettő bidder C is the
        // intended responder; do not send the auction onward to D as a fresh bid.
        if (isLateInviteOne) {
            const responder = bidsBefore[1]?.playerId;
            if (responder && !next.out.includes(responder)) {
                delete next.responseQueue;
                return { ...next, currentSeat: seatOf(next, responder) };
            }
        }
        const owner = holdOwner(next);
        if (action.contract === 'solo') {
            if (owner && owner !== playerId && !next.out.includes(owner)
                && !(next.inviterLockedOut && next.outstandingInvite?.inviterId === owner)) {
                const queue = responseQueueUntilHolder(next, playerId, owner);
                if (queue.length > 1 && queue[0] !== owner) {
                    return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
                }
                return { ...next, currentSeat: seatOf(next, owner) };
            }
            return finish(next);
        }
        if (owner && owner !== playerId && !next.out.includes(owner)
            && !(next.inviterLockedOut && next.outstandingInvite?.inviterId === owner)) {
            // A new bid gets a full clockwise response before the current hold-owner:
            // players who have not spoken must explicitly bid/pass; those already
            // out after Passz are skipped. This supports the documented 3-2-C:Solo
            // and 3-2-C:1-A:Solo invitation sequences without silently skipping C/D.
            const queue = responseQueueUntilHolder(next, playerId, owner);
            if (queue.length > 1 && queue[0] !== owner) {
                return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
            }
            return { ...next, currentSeat: seatOf(next, owner) };
        }
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    if (action.type === 'hold-invite') {
        const invite = state.outstandingInvite;
        if (!invite || state.inviteResponderId !== playerId || state.inviteAcceptedBy
            || invite.target !== action.target || action.contract !== state.highest?.contract) {
            throw new Error('Ez az invit ebben a licithelyzetben nem fogadható el.');
        }
        const inviter = invite.inviterId;
        next.highest = { playerId, contract: action.contract, seat: state.currentSeat };
        next.inviteAcceptedBy = playerId;
        next.inviterLockedOut = false;
        delete next.responseQueue;
        // In the listed 3-2-1- Solo* invitation, the inviter's action is the
        // closing signal already. Give all other seats between the acceptor and
        // inviter their response, but do not ask the inviter for another pass.
        const bidsAtAccept = bidRecords(state);
        const openerThreeTwoOneXix = invite.target === 19
            && bidsAtAccept.length >= 3
            && bidsAtAccept[0]?.action.contract === 'three'
            && bidsAtAccept[1]?.action.contract === 'two'
            && bidsAtAccept[2]?.action.contract === 'one'
            && bidsAtAccept[0]?.playerId === inviter
            && bidsAtAccept[2]?.playerId !== inviter
            && bidsAtAccept[2]?.playerId !== bidsAtAccept[1]?.playerId
            && state.records.some(r => r.playerId === inviter && r.action?.type === 'invite'
                && r.action.target === 19 && r.action.contract === 'solo');
        const rawQueue = responseQueueUntilHolder(next, playerId, inviter);
        const queue = openerThreeTwoOneXix ? rawQueue.filter(id => id !== inviter) : rawQueue;
        if (openerThreeTwoOneXix) next.inviterPassConfirmed = true;
        if (queue.length) {
            return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
        }
        return finish(next);
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
            next.inviteResponderId = playerId;
            // The table pattern tells us which earlier Solo/bid was the actual
            // invitation signal. Annotate that original record so outcome
            // resolution and the public event history agree about who invited.
            const originIndex = next.records.findLastIndex(r => r.playerId === holdInvite.inviterId
              && (r.action?.type === 'bid' || r.action?.type === 'invite'));
            if (originIndex >= 0) {
              const origin = next.records[originIndex];
              next.records[originIndex] = { ...origin, action: { ...origin.action, inviteTarget: holdInvite.target, invitationSignalTarget: holdInvite.target } };
            }
        } else if (next.outstandingInvite && state.inviteResponderId === playerId && !state.inviteAcceptedBy) {
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
            const markedBidInvite = holdInvite && next.records.some(r => r.playerId === holdInvite.inviterId
                && r.action?.type === 'bid' && r.action?.invitationSignalTarget === holdInvite.target);
            const queue = allActiveExcept(next, playerId).filter(id => !(markedBidInvite && id === holdInvite.inviterId));
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
        // XX-invit / Engedés is immediate and preserves the Kettes winner.
        if (action.target === 20 && state.highest?.contract === 'two' && state.highest.playerId !== playerId) {
            next.inviteResponderId = state.highest.playerId;
            next.inviteAcceptedBy = state.highest.playerId;
            next.engedes = true;
            return finish(next);
        }
        // In the Three -> One XIX pattern, One is a lower invitation signal;
        // the original Three stays the actual contract and accepts with Tartom.
        const lowerXixSignal = action.target === 19 && state.highest?.contract === 'three' && contract === 'one';
        if (state.highest && action.target !== 20 && contract && !lowerXixSignal) {
            next.highest = { playerId, contract, seat: state.currentSeat };
        }
        const invitationBids = bidRecords(state);
        const openerInvitesXixFromThreeTwoOne = action.target === 19 && contract === 'solo'
            && invitationBids.length >= 3
            && invitationBids[0]?.action.contract === 'three'
            && invitationBids[1]?.action.contract === 'two'
            && invitationBids[2]?.action.contract === 'one'
            && invitationBids[0]?.playerId === playerId
            // Three-bidder form only: A:3, B:2, C:1, A:Solo*.
            // If B itself said One after holding, this is the two-bidder
            // continuation A:3, B:2, A:Tartom, B:1, A:Solo* instead.
            && invitationBids[2]?.playerId !== invitationBids[1]?.playerId;
        const responder = openerInvitesXixFromThreeTwoOne
            ? invitationBids[1]?.playerId
            : state.highest?.playerId && state.highest.playerId !== playerId
                ? state.highest.playerId
                : holdOwner(state);
        next.inviteResponderId = responder;
        const recordedAction = contract ? { ...action, contract } : action;
        next.records[next.records.length - 1] = { playerId, action: recordedAction };
        if (responder && !next.out.includes(responder)) {
            // Preserve clockwise response order: players between the inviter and
            // the intended responder still get to speak before the invitation is
            // accepted. The responder is reached only after those seats reply.
            const queue = responseQueueUntilHolder(next, playerId, responder);
            if (queue.length > 1 && queue[0] !== responder) {
                return { ...next, currentSeat: seatOf(next, queue[0]), responseQueue: queue.slice(1) };
            }
            delete next.responseQueue;
            return { ...next, currentSeat: seatOf(next, responder) };
        }
        const ns = nextActive(next, state.currentSeat);
        return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
    }
    const ns = nextActive(next, state.currentSeat);
    return ns === undefined ? finish(next) : { ...next, currentSeat: ns };
}
