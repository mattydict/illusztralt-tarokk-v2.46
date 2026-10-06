import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

function cardsFor(room, id) {
  const h = room.snapshotFor(id).legalActionHints;
  return h.skartCardIds.slice(0, h.skartCount);
}

test('v2.53 multiplayer kéz: tarokk külön blokkban, színenként külön blokkban, rang szerint csökkenően', () => {
  const ui = fs.readFileSync(path.resolve('src/ui/multiplayer.js'), 'utf8');
  const html = fs.readFileSync(path.resolve('src/ui/multiplayer.html'), 'utf8');
  assert.match(ui, /const groupOrder = \['hearts','diamonds','clubs','spades'\]/);
  assert.match(ui, /suitRankOrder = \{ K: 5, Q: 4, C: 3, J: 2, '10': 1 \}/);
  assert.match(ui, /Number\(b\.rank\) - Number\(a\.rank\)/);
  assert.match(ui, /hand-group-\$\{group\.key\}/);
  assert.match(ui, /hand-grid/);
});

test('v2.53 fektetés: minden játékos saját fektetés-akciót kap, nem kell currentPlayerId', () => {
  const room = createAuthoritativeRoom({ roomId:'SKART-V253', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123 });
  room.dispatch('B',0,{type:'auction',action:{type:'bid',contract:'three'}});
  for (const id of ['C','D','A']) room.dispatch(id,room.sequence,{type:'auction',action:{type:'pass'}});
  assert.equal(room.round.phase, 'skart');
  assert.equal(room.round.currentPlayerId, undefined);
  for (const id of room.playerIds) {
    const h = room.snapshotFor(id).legalActionHints;
    assert.ok(h.types.includes('skart'));
    assert.equal(h.skartComplete, false);
    assert.ok(h.skartCardIds.length >= h.skartCount);
  }
  const seq = room.sequence;
  for (const id of room.playerIds) {
    room.dispatch(id, seq, {type:'skart', cardIds:cardsFor(room,id)});
  }
  assert.equal(room.round.phase, 'skart-announcement');
});

test('v2.53 régi talon-distribution állapot helyreállítása közvetlenül párhuzamos fektetésbe lép', () => {
  const room = createAuthoritativeRoom({ roomId:'MIGRATE-V253', playerIds:['A','B','C','D'], dealerIndex:0, random:()=>0.123 });
  const persisted = room.exportPersistedState();
  persisted.round = { ...persisted.round, phase:'talon-distribution', contract:'three', takerId:'B', receivedTalon:undefined };
  for (const p of persisted.round.players) {
    p.receivedTalon = [];
    p.skart = [];
  }
  const restored = createAuthoritativeRoom({ roomId:'MIGRATE-V253', playerIds:['A','B','C','D'], dealerIndex:0, persisted });
  assert.equal(restored.round.phase,'skart');
  for (const id of restored.playerIds) { restored.connect(id); assert.ok(restored.snapshotFor(id).legalActionTypes.includes('skart')); }
});
