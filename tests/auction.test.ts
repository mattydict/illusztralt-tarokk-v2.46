import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';


function noHonourHand() {
  return [20,19,18,17,16,15,14,13].map(rank => ({kind:'tarokk' as const, rank, id:`T${rank}`, points:1}));
}

// Honőr nélküli C és D nem maradhat ki a licitből: egy későbbi licit után
// mindkettőnek ténylegesen meg kell kapnia a Passz lehetőséget.
{
  const aHand = noHonourHand();
  aHand[0] = {kind:'tarokk', rank:22, id:'T22', points:5};
  const bHand = noHonourHand();
  bHand[0] = {kind:'tarokk', rank:21, id:'T21', points:5};
  const hands = {A:aHand, B:bHand, C:noHonourHand(), D:noHonourHand()};
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'C');
  assert.deepEqual(legalAuctionActions(a, 'C', hands), [{type:'pass'}]);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'D');
  assert.deepEqual(legalAuctionActions(a, 'D', hands), [{type:'pass'}]);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'A');
}


{
  // A=3, B=2, C=1. A holds the 1; B may Solo or pass. If B passes, C may
  // still say Solo; C's Solo can then be held/passed by A.
  let a = createAuction(['A','B','C'], 0);
  a = applyAuctionAction(a, {type:'bid', contract:'three'});
  a = applyAuctionAction(a, {type:'bid', contract:'two'});
  a = applyAuctionAction(a, {type:'bid', contract:'one'});
  assert.equal(a.currentSeat, 0);
  assert.ok(legalAuctionActions(a, 'A').some(x => x.type === 'hold' && x.contract === 'one'));
  assert.ok(legalAuctionActions(a, 'A').some(x => x.type === 'pass'));

  a = applyAuctionAction(a, {type:'hold', contract:'one'});
  assert.equal(a.currentSeat, 1); // B
  assert.ok(legalAuctionActions(a, 'B').some(x => x.type === 'bid' && x.contract === 'solo'));
  assert.ok(legalAuctionActions(a, 'B').some(x => x.type === 'pass'));

  a = applyAuctionAction(a, {type:'pass'}); // B is out permanently
  assert.equal(a.currentSeat, 2); // C
  assert.ok(legalAuctionActions(a, 'C').some(x => x.type === 'bid' && x.contract === 'solo'));

  a = applyAuctionAction(a, {type:'bid', contract:'solo'});
  assert.equal(a.currentSeat, 0); // A may hold/pass C's Solo
  assert.ok(legalAuctionActions(a, 'A').some(x => x.type === 'hold' && x.contract === 'solo'));
  assert.ok(legalAuctionActions(a, 'A').some(x => x.type === 'pass'));

  a = applyAuctionAction(a, {type:'pass'});
  assert.equal(a.finished, true);
  assert.equal(a.highest?.playerId, 'C');
  assert.equal(a.highest?.contract, 'solo');
}

{
  // A=3, B=2, C=1. If A passes before the hold, B may pass and C wins the
  // original 1 without receiving a new Solo decision.
  let a = createAuction(['A','B','C'], 0);
  a = applyAuctionAction(a, {type:'bid', contract:'three'});
  a = applyAuctionAction(a, {type:'bid', contract:'two'});
  a = applyAuctionAction(a, {type:'bid', contract:'one'});
  a = applyAuctionAction(a, {type:'pass'}); // A out
  a = applyAuctionAction(a, {type:'pass'}); // B out
  assert.equal(a.finished, true);
  assert.equal(a.highest?.playerId, 'C');
  assert.equal(a.highest?.contract, 'one');
}

{
  // If A holds C's 1 and B says Solo, C is out: A still has a hold/pass
  // response, but C cannot speak again.
  let a = createAuction(['A','B','C'], 0);
  a = applyAuctionAction(a, {type:'bid', contract:'three'});
  a = applyAuctionAction(a, {type:'bid', contract:'two'});
  a = applyAuctionAction(a, {type:'bid', contract:'one'});
  a = applyAuctionAction(a, {type:'hold', contract:'one'});
  a = applyAuctionAction(a, {type:'bid', contract:'solo'});
  assert.equal(a.currentSeat, 0);
  assert.deepEqual(legalAuctionActions(a, 'C'), []);
}

{
  // An invite can start the auction. If a later bidder who holds the invited
  // tarokk bids, the invite is marked accepted and the inviter cannot bid again.
  const t19 = { kind:'tarokk' as const, rank:19 as const, id:'T19', points:1 };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'invite', target:19}, {
    A:[t19], B:[], C:[], D:[]
  });
  assert.deepEqual(a.outstandingInvite, {inviterId:'A', target:19});
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, {
    A:[t19], B:[t19], C:[], D:[]
  });
  assert.equal(a.inviteAcceptedBy, 'B');
  assert.equal(a.inviterLockedOut, true);
  assert.equal(a.currentSeat, 2);
}

{
  // Once accepted, the inviter is skipped rather than forced to say pass.
  const t20 = { kind:'tarokk' as const, rank:20 as const, id:'T20', points:1 };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'invite', target:20});
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, {
    A:[], B:[t20], C:[], D:[]
  });
  assert.equal(a.currentSeat, 2);
  a = applyAuctionAction(a, {type:'pass'});
  a = applyAuctionAction(a, {type:'pass'});
  assert.equal(a.finished, true);
  assert.equal(a.highest?.playerId, 'B');
}

{
  // A starts with 2. B may interpret B's 1 as an XIX invite. If A actually
  // holds XIX, A's response is the invite-bearing Passz, not an ordinary hold.
  const t19 = { kind:'tarokk' as const, rank:19 as const, id:'T19', points:1 };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, {A:[t19], B:[], C:[], D:[]});
  a = applyAuctionAction(a, {type:'bid', contract:'one'}, {A:[t19], B:[t19], C:[], D:[]});
  a = applyAuctionAction(a, {type:'pass'}, {A:[t19], B:[t19], C:[], D:[]});
  a = applyAuctionAction(a, {type:'pass'}, {A:[t19], B:[t19], C:[], D:[]});
  assert.ok(legalAuctionActions(a, 'A', {A:[t19], B:[t19], C:[], D:[]}).some(x => x.type === 'pass' && x.inviteTarget === 19));
  assert.equal(legalAuctionActions(a, 'A', {A:[t19], B:[t19], C:[], D:[]}).some(x => x.type === 'hold' && x.contract === 'one'), false);
  a = applyAuctionAction(a, {type:'pass', inviteTarget:19}, {A:[t19], B:[t19], C:[], D:[]});
  assert.deepEqual(a.outstandingInvite, {inviterId:'A', target:19});
  assert.equal(a.inviteAcceptedBy, 'B');
}

{
  // Same opening sequence, but A does not own XIX: the 2 was a strong opening,
  // not an invite. A must be allowed to hold the 1 as an ordinary bid.
  const t20 = { kind:'tarokk' as const, rank:20 as const, id:'T20', points:1 };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, {A:[t20], B:[], C:[], D:[]});
  a = applyAuctionAction(a, {type:'bid', contract:'one'}, {A:[t20], B:[], C:[], D:[]});
  a = applyAuctionAction(a, {type:'pass'});
  a = applyAuctionAction(a, {type:'pass'});
  assert.ok(legalAuctionActions(a, 'A', {A:[t20], B:[], C:[], D:[]}).some(x => x.type === 'hold' && x.contract === 'one'));
  assert.equal(legalAuctionActions(a, 'A', {A:[t20], B:[], C:[], D:[]}).some(x => x.type === 'pass' && x.inviteTarget !== undefined), false);
  a = applyAuctionAction(a, {type:'hold', contract:'one'}, {A:[t20], B:[], C:[], D:[]});
  assert.equal(a.outstandingInvite, undefined);
}
