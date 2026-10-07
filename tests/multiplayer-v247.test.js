import assert from 'node:assert/strict';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

function chooseCards(room, playerId, count) {
  const h = room.snapshotFor(playerId).legalActionHints;
  assert.equal(h.types.includes('skart'), true);
  assert.equal(h.skartCardIds.length >= count, true);
  return h.skartCardIds.slice(0, count);
}

// The skart phase is parallel: currentPlayerId is not a turn owner, and multiple connected
// players can independently submit their fektetés. A disconnect does not freeze the phase.
{
  const room = createAuthoritativeRoom({roomId:'SKART-PARALLEL', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123});
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  room.dispatch('C',1,{type:'auction',action:{type:'pass'}});
  room.dispatch('D',2,{type:'auction',action:{type:'pass'}});
  room.dispatch('A',3,{type:'auction',action:{type:'pass'}});
  assert.equal(room.round.phase,'skart');
  assert.equal(room.currentPlayerId,undefined);
  room.disconnect('C');
  const before = room.snapshotFor('A');
  assert.ok(before.legalActionTypes.includes('skart'));
  const aCards = chooseCards(room,'A',before.legalActionHints.skartCount);
  const parallelBaseSequence = room.sequence;
  room.dispatch('A',parallelBaseSequence,{type:'skart',cardIds:aCards});
  // B may still submit using the sequence it saw before A acted; these are independent parallel actions.
  assert.ok(room.snapshotFor('B').legalActionTypes.includes('skart'));
  const bCards = chooseCards(room,'B',room.snapshotFor('B').legalActionHints.skartCount);
  room.dispatch('B',room.sequence,{type:'skart',cardIds:bCards});
  const dCards = chooseCards(room,'D',room.snapshotFor('D').legalActionHints.skartCount);
  room.dispatch('D',room.sequence,{type:'skart',cardIds:dCards});
  // C is deliberately offline: its UI has no legal action, while the other three players remain free to act.
  assert.deepEqual(room.snapshotFor('C').legalActionTypes, []);
  room.connect('C');
  const cCards = chooseCards(room,'C',room.snapshotFor('C').legalActionHints.skartCount);
  room.dispatch('C',room.sequence,{type:'skart',cardIds:cCards});
}

// After all four have fektetett, the multiplayer room may enter the automatic
// fektetés-közlés phase before the mandatory partner-call, when a defender fektetett tarokkot.
{
  const room = createAuthoritativeRoom({roomId:'SKART-REVEAL', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123});
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  room.dispatch('C',1,{type:'auction',action:{type:'pass'}});
  room.dispatch('D',2,{type:'auction',action:{type:'pass'}});
  room.dispatch('A',3,{type:'auction',action:{type:'pass'}});
  const taker='B';
  const order=['A','C','D','B'];
  for (const id of order) {
    const count=room.snapshotFor(id).legalActionHints.skartCount;
    room.dispatch(id,room.sequence,{type:'skart',cardIds:chooseCards(room,id,count)});
  }
  assert.equal(room.round.phase,'skart-announcement');
  assert.equal(room.currentPlayerId,undefined);
  const publicToA=room.snapshotFor('A');
  const takerView=publicToA.players.find(p=>p.id===taker);
  assert.ok(Array.isArray(takerView.revealedSkart));
  assert.equal(takerView.revealedSkart.length,3);
  const announcementActors = room.playerIds.filter(id => id !== taker && (room.round.players.find(p=>p.playerId===id)?.skartTarokkCount ?? 0) > 0);
  assert.ok(announcementActors.length > 0);
  for (const id of announcementActors) {
    assert.ok(room.snapshotFor(id).legalActionTypes.includes('skart-announce'));
    room.dispatch(id, room.sequence, {type:'skart-announce'});
  }
  assert.equal(room.round.phase,'partner-call');
  assert.equal(room.currentPlayerId,taker);
  assert.ok(room.snapshotFor(taker).legalActionTypes.includes('partner-call'));

  const partnerRank=room.snapshotFor(taker).legalActionHints.partnerRanks[0];
  room.dispatch(taker,room.sequence,{type:'partner-call',rank:partnerRank});
  assert.equal(room.round.phase,'declarations');
  assert.equal(room.currentPlayerId,taker);
  assert.equal(room.snapshotFor(taker).legalActionTypes.includes('declaration'), true);

  // The partner call is outside the declaration pass counter. The taker now
  // gets the first actual declaration turn; that opening turn is excluded
  // from the three-pass streak. B must therefore pass first, followed by C-D-A.
  const declOrder=[...room.declarationWindow.order];
  for (const id of declOrder) {
    assert.equal(room.snapshotFor(id).legalActionHints.declarationActions.some(a=>a.type==='pass'), true);
    room.dispatch(id,room.sequence,{type:'declaration',action:{type:'pass'}});
  }
  assert.equal(room.round.phase,'play');
  assert.equal(room.game.phase,'play');
  assert.equal(room.currentPlayerId,room.round.startingPlayerId);
}
