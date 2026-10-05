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
  room.dispatch('A',room.sequence,{type:'skart',cardIds:aCards});
  // B can submit even though A just acted and C is offline; there is no serial turn.
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

// After all four have fektetett, the taker's skart is revealed and the sequential skart-count
// announcements begin. The announcement phase then advances to partner-call after the last count.
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
  assert.equal(room.round.phase,'skart');
  assert.ok(room.currentPlayerId && room.currentPlayerId !== taker);
  const publicToA=room.snapshotFor('A');
  const takerView=publicToA.players.find(p=>p.id===taker);
  assert.ok(Array.isArray(takerView.revealedSkart));
  assert.equal(takerView.revealedSkart.length,3);
  assert.equal(room.snapshotFor('A').players.find(p=>p.id==='C').skartCount,undefined);

  let guard=4;
  while(room.round.phase==='skart' && guard--) {
    const cur=room.currentPlayerId;
    const view=room.snapshotFor(cur);
    assert.deepEqual(view.legalActionTypes,['skart-announce']);
    room.dispatch(cur,room.sequence,{type:'skart-announce'});
  }
  assert.equal(room.round.phase,'partner-call');
  assert.equal(room.currentPlayerId,taker);
}
