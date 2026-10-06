import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

function handFromRanks(ranks) {
  const tarokks = ranks.map((rank, i) => ({ kind:'tarokk', rank, id:`T${rank}-${i}`, points:[1,21,22].includes(rank) ? 5 : 1 }));
  return tarokks.concat([
    {kind:'suit', suit:'hearts', rank:'K', id:'hK', points:5},
    {kind:'suit', suit:'diamonds', rank:'Q', id:'dQ', points:4},
    {kind:'suit', suit:'spades', rank:'C', id:'sC', points:3},
    {kind:'suit', suit:'clubs', rank:'J', id:'cJ', points:2},
  ]);
}

// The auction UI/legal-actions must expose XIX and XX invites after a player
// has already entered the auction, with the actual contract value carried by
// the action. This is the case the older implementation was missing.
{
  const hands = {
    A: handFromRanks([22,18,17,16,15]),
    B: handFromRanks([22,20,19,18,17]),
    C: handFromRanks([21,18,17,16,15]),
    D: handFromRanks([21,18,17,16,15]),
  };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, hands);
  a = applyAuctionAction(a, {type:'hold', contract:'two'}, hands);
  const actions = legalAuctionActions(a, 'B', hands);
  assert.ok(actions.some(x => x.type === 'invite' && x.target === 20 && x.contract === 'two'));
  assert.ok(actions.some(x => x.type === 'invite' && x.target === 19 && x.contract === 'solo'));

  a = applyAuctionAction(a, {type:'invite', target:20}, hands);
  assert.equal(a.outstandingInvite?.target, 20);
  assert.equal(a.highest?.contract, 'two');
}

// After 3 -> 2 -> Hold, the second bidder must actually receive the next speaking turn.
// That player may then use both the normal One bid and the two information invites.
{
  const hands = {
    A: handFromRanks([22,18,17,16,15]),
    B: handFromRanks([22,20,19,18,17]),
    C: handFromRanks([21,18,17,16,15]),
    D: handFromRanks([21,18,17,16,15]),
  };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, hands);
  a = applyAuctionAction(a, {type:'hold', contract:'two'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'B');
  const actions = legalAuctionActions(a, 'B', hands);
  assert.ok(actions.some(x => x.type === 'bid' && x.contract === 'one'));
  assert.ok(actions.some(x => x.type === 'invite' && x.target === 20 && x.contract === 'two'));
  assert.ok(actions.some(x => x.type === 'invite' && x.target === 19 && x.contract === 'solo'));
}

// XIX invite is a real jump: Two -> Solo, not a cosmetic label-only action.
{
  const hands = {
    A: handFromRanks([22,18,17,16,15]),
    B: handFromRanks([22,19,18,17,16]),
    C: handFromRanks([21,18,17,16,15]),
    D: handFromRanks([21,18,17,16,15]),
  };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, hands);
  a = applyAuctionAction(a, {type:'hold', contract:'two'}, hands);
  a = applyAuctionAction(a, {type:'invite', target:19, contract:'solo'}, hands);
  assert.equal(a.highest?.playerId, 'B');
  assert.equal(a.highest?.contract, 'solo');
  assert.deepEqual(a.outstandingInvite, {inviterId:'B', target:19});
}

// A client cannot accidentally submit an auction action on behalf of another seat.
{
  const room = createAuthoritativeRoom({ roomId:'TURN-V252', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123 });
  assert.throws(() => room.dispatch('A', 0, {type:'auction', action:{type:'bid', contract:'three'}}), /Most nem ennek a játékosnak kell licitálnia/);
}

// A Hármas itself is never a Tartom candidate.
{
  const hands = Object.fromEntries(['A','B','C','D'].map(id => [id, handFromRanks([22,18,17,16,15])]));
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  const actions = legalAuctionActions(a, 'B', hands);
  assert.equal(actions.some(x => x.type === 'hold' && x.contract === 'three'), false);
}

// The multiplayer UI must visibly group suits and allow card selection during
// parallel skart without relying on the native disabled attribute.
{
  const ui = fs.readFileSync(path.resolve('src/ui/multiplayer.js'), 'utf8');
  const html = fs.readFileSync(path.resolve('src/ui/multiplayer.html'), 'utf8');
  assert.match(ui, /hand-group/);
  assert.match(ui, /Tarokkok/);
  assert.match(ui, /const groupOrder = \['hearts','diamonds','clubs','spades'\]/);
  assert.match(ui, /Number\(b\.rank\) - Number\(a\.rank\)/);
  assert.match(ui, /state\.phase === 'skart' \? ''/);
  assert.match(ui, /Engedés \(XX invit\)/);
  assert.match(ui, /msg\.actionType === 'skart' && msg\.playerId === session\?\.playerId/);
  assert.match(ui, /contract = a\.contract \|\| auction\?\.highest\?\.contract \|\| 'solo'/);
  assert.match(html, /multiplayer\.js\?v=2\.53\.0/);
}

// A complete parallel skart must resolve to the automatic skart-announcement
// stage and then hand the mandatory partner call to the taker.
{
  const room = createAuthoritativeRoom({ roomId:'SKART-V251', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123 });
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  room.dispatch('C',1,{type:'auction',action:{type:'pass'}});
  room.dispatch('D',2,{type:'auction',action:{type:'pass'}});
  room.dispatch('A',3,{type:'auction',action:{type:'pass'}});
  const seqBefore = room.sequence;
  for (const id of ['A','B','C','D']) {
    const h = room.snapshotFor(id).legalActionHints;
    room.dispatch(id, id === 'A' ? seqBefore : room.sequence, {type:'skart', cardIds:h.skartCardIds.slice(0,h.skartCount)});
  }
  if (room.round.phase === 'skart-announcement') {
    const pending = room.playerIds.filter(id => id !== room.round.takerId && (room.round.players.find(p=>p.playerId===id)?.skartTarokkCount ?? 0) > 0);
    for (const id of pending) room.dispatch(id, room.sequence, {type:'skart-announce'});
  }
  assert.equal(room.round.phase, 'partner-call');
  assert.equal(room.currentPlayerId, room.round.takerId);
}
