import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

const ids = ['A', 'B', 'C', 'D'];
const fixedRandom = (() => { let seed = 42; return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32); })();

test('v2.42 server snapshot never exposes another player hand or the raw talon', () => {
  const room = createAuthoritativeRoom({ roomId: 'r1', playerIds: ids, random: fixedRandom });
  const a = room.snapshotFor('A');
  const b = room.snapshotFor('B');
  assert.equal(a.players.find(p => p.id === 'A')?.hand?.length, 9);
  assert.equal(a.players.find(p => p.id === 'B')?.hand, undefined);
  assert.equal(b.players.find(p => p.id === 'A')?.hand, undefined);
  assert.equal(a.talon, undefined);
  assert.equal(a.round, undefined);
});

test('v2.42 authoritative room rejects illegal and stale actions', () => {
  const room = createAuthoritativeRoom({ roomId: 'r2', playerIds: ids, random: fixedRandom });
  const initial = room.snapshotFor('A');
  assert.equal(initial.sequence, 0);
  assert.throws(() => room.dispatch('A', initial.sequence, { type: 'auction', action: { type: 'hold', contract: 'three' } }), /nem szabályos/i);
  const afterReject = room.snapshotFor('A');
  assert.equal(afterReject.sequence, 0);
  room.dispatch('A', 0, { type: 'auction', action: { type: 'pass' } });
  assert.equal(room.snapshotFor('B').sequence, 1);
  assert.throws(() => room.dispatch('B', 0, { type: 'auction', action: { type: 'pass' } }), /Elavult/i);
});

test('v2.42 action bus emits only public event metadata', () => {
  const room = createAuthoritativeRoom({ roomId: 'r3', playerIds: ids, random: fixedRandom });
  const events = [];
  const off = room.subscribe(event => events.push(event));
  const a = room.snapshotFor('A');
  room.dispatch('A', a.sequence, { type: 'auction', action: { type: 'pass' } });
  off();
  assert.ok(events.some(e => e.type === 'action-accepted'));
  const accepted = events.find(e => e.type === 'action-accepted');
  assert.equal(accepted?.actionType, 'auction');
  assert.equal(accepted?.cardIds, undefined);
});

test('v2.42 phase changes are emitted after the authoritative sequence advances', () => {
  const room = createAuthoritativeRoom({ roomId: 'r4', playerIds: ids, random: fixedRandom });
  let seq = room.snapshotFor('A').sequence;
  const starter = room.snapshotFor('A').currentPlayerId;
  const order = [starter, ids[(ids.indexOf(starter) + 1) % 4], ids[(ids.indexOf(starter) + 2) % 4], ids[(ids.indexOf(starter) + 3) % 4]];
  const starterState = room.round.players.find(p => p.playerId === order[0]);
  if (starterState && !starterState.hand.some(c => c.kind === 'tarokk' && [1, 21, 22].includes(c.rank))) {
    const replacement = starterState.hand.find(c => c.kind === 'tarokk');
    if (replacement) Object.assign(replacement, { rank: 21, id: `${replacement.id}-forced-honour`, points: 5 });
  }
  const opening = room.snapshotFor(order[0]).legalActionHints.auctionActions.find(a => a.type === 'bid');
  assert.ok(opening);
  room.dispatch(order[0], seq, { type: 'auction', action: opening }); seq += 1;
  room.dispatch(order[1], seq, { type: 'auction', action: { type: 'pass' } }); seq += 1;
  room.dispatch(order[2], seq, { type: 'auction', action: { type: 'pass' } }); seq += 1;
  const finalView = room.dispatch(order[3], seq, { type: 'auction', action: { type: 'pass' } });
  assert.equal(finalView.phase, 'skart');
  const events = room.eventsSince(seq);
  assert.ok(events.some(e => e.type === 'phase-changed' && e.phase === 'skart'));
  assert.ok(events.every(e => e.sequence === finalView.sequence));
});
