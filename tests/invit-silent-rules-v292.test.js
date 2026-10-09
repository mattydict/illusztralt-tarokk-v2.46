import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';
import { resolveAuctionOutcome } from '../src/engine/auctionOutcome.js';
import { settlementLines } from '../src/engine/settlement.js';
import { publicPartnerId } from '../src/engine/partnershipVisibility.js';

function hand({ honour = 22, tarokks = [20, 19, 18, 17, 16] } = {}) {
  const ranks = [...new Set([honour, ...tarokks])].slice(0, 5);
  return ranks.map(rank => ({ kind: 'tarokk', rank, id: `T${rank}`, points: rank === 1 || rank === 21 || rank === 22 ? 5 : 1 }))
    .concat([
      { kind: 'suit', suit: 'hearts', rank: 'K', id: 'hK', points: 5 },
      { kind: 'suit', suit: 'diamonds', rank: 'K', id: 'dK', points: 5 },
      { kind: 'suit', suit: 'spades', rank: 'Q', id: 'sQ', points: 4 },
      { kind: 'suit', suit: 'clubs', rank: 'Q', id: 'cQ', points: 4 },
    ]);
}

// A:3, B holds XIX and signals One-invit; A holds the actual Three, B closes with Passz.
{
  const hands = {
    A: hand({ honour: 22, tarokks: [20, 18, 17, 16] }),
    B: hand({ honour: 21, tarokks: [19, 18, 17, 16] }),
    C: hand(), D: hand(),
  };
  let a = createAuction(['A', 'B']);
  a = applyAuctionAction(a, { type: 'bid', contract: 'three' }, hands);
  const invite = legalAuctionActions(a, 'B', hands).find(x => x.type === 'invite' && x.target === 19 && x.contract === 'one');
  assert.ok(invite, 'B should be offered the lower XIX-invit signal');
  a = applyAuctionAction(a, invite, hands);
  assert.equal(a.highest.playerId, 'A');
  assert.equal(a.highest.contract, 'three', 'the lower One is only a signal, not the actual contract');
  assert.equal(a.seats[a.currentSeat].playerId, 'A');
  const accept = legalAuctionActions(a, 'A', hands).find(x => x.type === 'hold-invite' && x.target === 19 && x.contract === 'three');
  assert.ok(accept, 'A should see the XIX-invit acceptance action');
  a = applyAuctionAction(a, accept, hands);
  assert.equal(a.inviteAcceptedBy, 'A');
  assert.equal(a.highest.playerId, 'A');
  assert.equal(a.seats[a.currentSeat].playerId, 'B');
  assert.deepEqual(legalAuctionActions(a, 'B', hands), [{ type: 'pass' }], 'the inviter closes with Passz');
  a = applyAuctionAction(a, { type: 'pass' }, hands);
  assert.equal(a.finished, true);
  const outcome = resolveAuctionOutcome(a, hands, []);
  assert.equal(outcome.takerId, 'A');
  assert.equal(outcome.contract, 'three');
  assert.equal(outcome.requiredPartnerCallId, 'B');
  assert.equal(outcome.calledTarokk, 19);
}

// A:3, B:2, A holds, B jumps to Solo as an XIX-invit, A accepts, B passes.
{
  const hands = { A: hand(), B: hand({ honour: 21, tarokks: [19, 18, 17, 16] }), C: hand(), D: hand() };
  let a = createAuction(['A', 'B']);
  a = applyAuctionAction(a, { type: 'bid', contract: 'three' }, hands);
  a = applyAuctionAction(a, { type: 'bid', contract: 'two' }, hands);
  assert.ok(a.seats[a.currentSeat].playerId === 'A');
  a = applyAuctionAction(a, { type: 'hold', contract: 'two' }, hands);
  const invite = legalAuctionActions(a, 'B', hands).find(x => x.type === 'invite' && x.target === 19 && x.contract === 'solo');
  assert.ok(invite);
  a = applyAuctionAction(a, invite, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'A');
  const accept = legalAuctionActions(a, 'A', hands).find(x => x.type === 'hold-invite' && x.target === 19 && x.contract === 'solo');
  assert.ok(accept);
  a = applyAuctionAction(a, accept, hands);
  assert.equal(a.inviteAcceptedBy, 'A');
  assert.equal(a.seats[a.currentSeat].playerId, 'B');
  a = applyAuctionAction(a, { type: 'pass' }, hands);
  assert.equal(a.finished, true);
  const outcome = resolveAuctionOutcome(a, hands, []);
  assert.equal(outcome.takerId, 'A');
  assert.equal(outcome.contract, 'solo');
  assert.equal(outcome.calledTarokk, 19);
}

// Before any defence signal, a non-taker's public 8/9-tarokk count identifies their side.
{
  const game = {
    takerId: 'A', partnerId: 'C', players: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
    declarations: { declarations: [] }, gameContraState: { records: [] },
  };
  const publicPartner = publicPartnerId(game, {}, { records: [{ playerId: 'C', type: 'tarokkCount', count: 8 }] });
  assert.equal(publicPartner, 'C');
}

// Silent double and silent Four Kings are parallel figures without silent Volát;
// game kontra is scored in parallel too.
{
  const lines = settlementLines({
    contract: 'one', takerPairWon: false, takerTrickPoints: 20, takerSkartPoints: 0,
    gameContra: 'kontra', takerPairVolat: false, defencePairVolat: false,
    figures: [
      { type: 'tuletroa', points: 1, ownerIsTakerPair: false, ownerPairWon: true, silent: true },
      { type: 'fourKings', points: 1, ownerIsTakerPair: false, ownerPairWon: true, silent: true },
      { type: 'doubleGame', points: 2, ownerIsTakerPair: false, ownerPairWon: true, silent: true },
    ],
  });
  assert.ok(lines.some(x => x.kind === 'game' && x.points === 6));
  assert.ok(lines.some(x => x.type === 'doubleGame' && x.silent));
  assert.ok(lines.some(x => x.type === 'fourKings' && x.silent));
  assert.ok(lines.some(x => x.type === 'tuletroa' && x.silent));
}

// Silent Volát replaces silent Double and silent Four Kings but keeps Trull;
// if the game is contrated, game kontra and Volát are both settled.
{
  const lines = settlementLines({
    contract: 'one', takerPairWon: true, takerTrickPoints: 90, takerSkartPoints: 0,
    gameContra: 'kontra', takerPairVolat: true, defencePairVolat: false,
    figures: [
      { type: 'tuletroa', points: 1, ownerIsTakerPair: true, ownerPairWon: true, silent: true },
      { type: 'fourKings', points: 1, ownerIsTakerPair: true, ownerPairWon: true, silent: true },
      { type: 'doubleGame', points: 2, ownerIsTakerPair: true, ownerPairWon: true, silent: true },
    ],
  });
  assert.ok(lines.some(x => x.kind === 'game' && x.points === 6));
  assert.ok(lines.some(x => x.type === 'volat' && x.silent));
  assert.equal(lines.some(x => x.type === 'doubleGame'), false);
  assert.equal(lines.some(x => x.type === 'fourKings'), false);
  assert.ok(lines.some(x => x.type === 'tuletroa' && x.silent));
}

// Four-seat explicit XIX invitation keeps clockwise responses before the invited holder.
{
  const hands = {
    A: hand({ honour: 22, tarokks: [20, 19, 18, 17, 16] }),
    B: hand({ honour: 21, tarokks: [19, 18, 17, 16, 15] }),
    C: hand({ honour: 22, tarokks: [20, 18, 17, 16, 15] }),
    D: hand({ honour: 22, tarokks: [20, 18, 17, 16, 15] }),
  };
  let a = createAuction(['A', 'B', 'C', 'D']);
  a = applyAuctionAction(a, { type: 'bid', contract: 'three' }, hands);
  a = applyAuctionAction(a, { type: 'bid', contract: 'two' }, hands);
  a = applyAuctionAction(a, { type: 'pass' }, hands); // C responds before the holder
  a = applyAuctionAction(a, { type: 'pass' }, hands); // D responds before the holder
  a = applyAuctionAction(a, { type: 'hold', contract: 'two' }, hands);
  const invitation = legalAuctionActions(a, 'B', hands).find(x => x.type === 'invite' && x.target === 19 && x.contract === 'solo');
  assert.ok(invitation, 'B should be offered the explicit XIX invitation');
  a = applyAuctionAction(a, invitation, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'A', 'C/D have already responded earlier in the auction');
  const acceptance = legalAuctionActions(a, 'A', hands).find(x => x.type === 'hold-invite' && x.target === 19 && x.contract === 'solo');
  assert.ok(acceptance, 'A sees a clear XIX-invite acceptance action');
  a = applyAuctionAction(a, acceptance, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'B');
  a = applyAuctionAction(a, { type: 'pass' }, hands);
  const outcome = resolveAuctionOutcome(a, hands, []);
  assert.equal(outcome.takerId, 'A');
  assert.equal(outcome.contract, 'solo');
  assert.equal(outcome.requiredPartnerCallId, 'B');
  assert.equal(outcome.calledTarokk, 19);
}

// The 3-2-1 response menu explicitly labels both permitted XIX acceptance actions.
{
  const hands = { A: hand(), B: hand({ honour: 21, tarokks: [19, 18, 17, 16, 15] }), C: hand(), D: hand() };
  let a = createAuction(['A', 'B', 'C', 'D']);
  a = applyAuctionAction(a, { type: 'bid', contract: 'three' }, hands);
  a = applyAuctionAction(a, { type: 'bid', contract: 'two' }, hands);
  a = applyAuctionAction(a, { type: 'pass' }, hands);
  a = applyAuctionAction(a, { type: 'pass' }, hands);
  const opener = legalAuctionActions(a, 'A', hands).find(x => x.type === 'bid' && x.contract === 'one');
  assert.equal(opener?.invitationSignalTarget, 19);
  a = applyAuctionAction(a, opener, hands);
  const response = legalAuctionActions(a, 'B', hands);
  assert.ok(response.some(x => x.type === 'hold' && x.contract === 'one' && x.acceptsInviteTarget === 19));
  assert.ok(response.some(x => x.type === 'bid' && x.contract === 'solo' && x.acceptsInviteTarget === 19));
}

// In the 3-2-1-three-bidder variant, the first bidder's Solo is an XIX-invit to the second bidder.
{
  const hands = {
    A: hand({ honour: 22, tarokks: [20, 19, 18, 17, 16] }),
    B: hand({ honour: 21, tarokks: [19, 18, 17, 16, 15] }),
    C: hand({ honour: 22, tarokks: [20, 18, 17, 16, 15] }),
    D: hand({ honour: 22, tarokks: [20, 18, 17, 16, 15] }),
  };
  let a = createAuction(['A', 'B', 'C', 'D']);
  a = applyAuctionAction(a, { type: 'bid', contract: 'three' }, hands);
  a = applyAuctionAction(a, { type: 'bid', contract: 'two' }, hands);
  a = applyAuctionAction(a, { type: 'bid', contract: 'one' }, hands); // C speaks before A regains the hold
  a = applyAuctionAction(a, { type: 'pass' }, hands); // D
  const invite = legalAuctionActions(a, 'A', hands).find(x => x.type === 'invite' && x.target === 19 && x.contract === 'solo');
  assert.ok(invite, 'A may signal XIX with Solo after the 3-2-1 sequence');
  a = applyAuctionAction(a, invite, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'B', 'B, not the immediately previous One bidder C, is invited');
  const accept = legalAuctionActions(a, 'B', hands).find(x => x.type === 'hold-invite' && x.target === 19 && x.contract === 'solo');
  assert.ok(accept);
  a = applyAuctionAction(a, accept, hands);
  a = applyAuctionAction(a, { type: 'pass' }, hands); // C gets the renewed response turn; auction closes because D already passed
  const outcome = resolveAuctionOutcome(a, hands, []);
  assert.equal(outcome.takerId, 'B');
  assert.equal(outcome.contract, 'solo');
  assert.equal(outcome.requiredPartnerCallId, 'A');
  assert.equal(outcome.calledTarokk, 19);
}
