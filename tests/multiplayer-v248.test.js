import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

function cardsFor(room, playerId) {
  const h = room.snapshotFor(playerId).legalActionHints;
  return h.skartCardIds.slice(0, h.skartCount);
}

test('v2.48 párhuzamos skart: két játékos ugyanarról a szerver-szekvenciáról is fektethet', () => {
  const room = createAuthoritativeRoom({ roomId:'SKART-CONCURRENT', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123 });
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  room.dispatch('C',1,{type:'auction',action:{type:'pass'}});
  room.dispatch('D',2,{type:'auction',action:{type:'pass'}});
  room.dispatch('A',3,{type:'auction',action:{type:'pass'}});
  const seq = room.sequence;
  room.dispatch('A',seq,{type:'skart',cardIds:cardsFor(room,'A')});
  room.dispatch('B',seq,{type:'skart',cardIds:cardsFor(room,'B')});
  assert.equal(room.round.players.find(p=>p.playerId==='A').skart.length > 0, true);
  assert.equal(room.round.players.find(p=>p.playerId==='B').skart.length > 0, true);
});

test('v2.50-ben a fektetés közlése köztes, automatikusan vezérelt fázis és megelőzi a partnerhívást', () => {
  const ui = fs.readFileSync(path.resolve('src/ui/multiplayer.js'),'utf8');
  assert.match(ui, /Fektetés közlése/);
  assert.match(ui, /sendAction\(\{type:'skart-announce'\}\)/);
  assert.match(ui, /auctionLabel\(a, state\.auction\)/);
  assert.match(ui, /const contract = a\.contract \|\| auction\?\.highest\?\.contract/);
});


test('v2.50 a felvevő fektetett tarokkjai az első ütés végéig nyilvánosak, utána eltűnnek', () => {
  const room = createAuthoritativeRoom({ roomId:'SKART-PUBLIC-WINDOW', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123 });
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  for (const id of ['C','D','A']) room.dispatch(id,room.sequence,{type:'auction',action:{type:'pass'}});
  const taker = 'B';
  for (const id of ['A','C','D','B']) {
    const h = room.snapshotFor(id).legalActionHints;
    const tarokk = h.skartCardIds.find(x => x.startsWith('T'));
    assert.ok(tarokk, `${id} should have a legal skart tarokk in this deterministic deal`);
    const cards = [tarokk, ...h.skartCardIds.filter(x => x !== tarokk)].slice(0, h.skartCount);
    room.dispatch(id, room.sequence, {type:'skart', cardIds:cards});
  }
  for (const id of room.playerIds.filter(id => id !== taker)) room.dispatch(id, room.sequence, {type:'skart-announce'});
  assert.equal(room.round.phase, 'partner-call');
  const called = room.snapshotFor(taker).legalActionHints.partnerRanks[0];
  room.dispatch(taker, room.sequence, {type:'partner-call', rank:called});
  for (const id of [taker, ...room.playerIds.filter(id => id !== taker).slice(0,2)]) room.dispatch(id, room.sequence, {type:'declaration',action:{type:'pass'}});
  assert.equal(room.round.phase, 'play');
  assert.ok(room.snapshotFor('A').players.find(p => p.id === taker)?.revealedSkart?.length > 0);
  for (let i=0;i<4;i++) {
    const leader = room.currentPlayerId;
    const cardId = room.snapshotFor(leader).legalActionHints.playCardIds[0];
    room.dispatch(leader, room.sequence, {type:'play-card', cardId});
  }
  assert.equal(room.game.completedTricks.length, 1);
  assert.equal(room.snapshotFor('A').players.find(p => p.id === taker)?.revealedSkart, undefined);
});


test('v2.50 nincs külön fektetésközlési várakozás, ha egyetlen védő sem fektet tarokkot', () => {
  const room = createAuthoritativeRoom({ roomId:'SKART-NO-ANNOUNCEMENT', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123 });
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  for (const id of ['C','D','A']) room.dispatch(id,room.sequence,{type:'auction',action:{type:'pass'}});
  const taker='B';
  for (const id of ['A','C','D','B']) {
    const h=room.snapshotFor(id).legalActionHints;
    const suit=h.skartCardIds.find(x=>!x.startsWith('T'));
    const cards=[suit,...h.skartCardIds.filter(x=>x!==suit)].slice(0,h.skartCount);
    room.dispatch(id,room.sequence,{type:'skart',cardIds:cards});
  }
  assert.equal(room.round.phase,'partner-call');
  assert.equal(room.snapshotFor('A').legalActionTypes.includes('skart-announce'),false);
  assert.ok(room.snapshotFor(taker).legalActionTypes.includes('partner-call'));
});
