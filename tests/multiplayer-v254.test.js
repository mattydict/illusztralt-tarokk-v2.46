import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

function hand(ranks) {
  return ranks.map((rank, i) => ({kind:'tarokk', rank, id:`${rank}-${i}`, points:[1,21,22].includes(rank)?5:1})).concat([
    {kind:'suit',suit:'hearts',rank:'K',id:'hK',points:5},
    {kind:'suit',suit:'diamonds',rank:'Q',id:'dQ',points:4},
    {kind:'suit',suit:'spades',rank:'C',id:'sC',points:3},
    {kind:'suit',suit:'clubs',rank:'J',id:'cJ',points:2},
  ]);
}

test('v2.54: a Skízt tartó harmadik megszólaló továbbra is megkapja a következő normál licitet', () => {
  const hands = {
    A: hand([21,18,17,16,15]),
    B: hand([19,18,17,16,15]),
    C: hand([20,18,17,16,15]),
    D: hand([22,19,18,17,16]),
  };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'D');
  const actions = legalAuctionActions(a, 'D', hands);
  assert.ok(actions.some(x => x.type === 'bid' && x.contract === 'two'));
});

test('v2.54: honőr nélküli játékosnál a Passz mindig elérhető, nem kerül automatikusan átugrásra', () => {
  const noHonour = hand([18,17,16,15,14]);
  const hands = { A: hand([21,18,17,16,15]), B: hand([20,19,18,17,16]), C: noHonour, D: hand([22,18,17,16,15]) };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'C');
  const actions = legalAuctionActions(a, 'C', hands);
  assert.deepEqual(actions, [{type:'pass'}]);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'D');
});

test('v2.54: Engedés csak az első megszólalónak, csak Három-Kettő után', () => {
  const hands = {
    A: hand([22,20,19,18,17]),
    B: hand([21,20,19,18,17]),
    C: hand([21,18,17,16,15]),
    D: hand([21,18,17,16,15]),
  };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, hands);
  const beforeHold = legalAuctionActions(a, 'A', hands);
  assert.ok(beforeHold.some(x => x.type === 'invite' && x.target === 20));
  a = applyAuctionAction(a, {type:'hold', contract:'two'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'B');
  const secondSpeaker = legalAuctionActions(a, 'B', hands);
  assert.ok(!secondSpeaker.some(x => x.type === 'invite' && x.target === 20));
});

test('v2.54: aukció után minden játékos megkapja a szerződés szerinti talonrészt és azonnal fektethet', () => {
  const room = createAuthoritativeRoom({roomId:'TALON-V254',playerIds:['A','B','C','D'],dealerIndex:0,random:()=>0.123});
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  room.dispatch('C',room.sequence,{type:'auction',action:{type:'pass'}});
  room.dispatch('D',room.sequence,{type:'auction',action:{type:'pass'}});
  room.dispatch('A',room.sequence,{type:'auction',action:{type:'pass'}});
  assert.equal(room.round.phase,'skart');
  for (const p of room.round.players) assert.equal(p.hand.length, 9 + p.receivedTalon.length);
  assert.deepEqual(room.round.players.map(p => p.receivedTalon.length), [1,3,1,1]);
  for (const id of room.playerIds) assert.ok(room.snapshotFor(id).legalActionTypes.includes('skart'));
});

test('v2.55: 3-2-Tartom után a második passza esetén a harmadik megszólaló Skízzel megkapja a következő licitet', () => {
  const hands = {
    A: hand([21,19,18,17,16]),
    B: hand([21,20,19,18,17]),
    C: hand([19,18,17,16,15]),
    D: hand([22,19,18,17,16]),
  };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, hands);
  a = applyAuctionAction(a, {type:'hold', contract:'two'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'B');
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'C');
  assert.deepEqual(legalAuctionActions(a, 'C', hands), [{type:'pass'}]);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'D');
  assert.ok(legalAuctionActions(a, 'D', hands).some(x => x.type === 'bid' && x.contract === 'one'));
});

test('v2.55: régi mentett skart állapotból is visszaépül a talon kiosztása', () => {
  const room = createAuthoritativeRoom({roomId:'MIG-V255',playerIds:['A','B','C','D'],dealerIndex:0,random:()=>0.123});
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  room.dispatch('C',room.sequence,{type:'auction',action:{type:'pass'}});
  room.dispatch('D',room.sequence,{type:'auction',action:{type:'pass'}});
  room.dispatch('A',room.sequence,{type:'auction',action:{type:'pass'}});
  const persisted = room.exportPersistedState();
  persisted.round.players = persisted.round.players.map(p => ({...p, receivedTalon: []}));
  const migrated = createAuthoritativeRoom({roomId:'MIG-V255',playerIds:['A','B','C','D'],dealerIndex:0,persisted});
  assert.equal(migrated.round.phase,'skart');
  assert.deepEqual(migrated.round.players.map(p => p.receivedTalon.length), [1,3,1,1]);
  for (const id of migrated.playerIds) { migrated.connect(id); assert.ok(migrated.snapshotFor(id).legalActionTypes.includes('skart')); }
});
