import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { JsonRoomStore } from '../server/persistence.mjs';
import { LobbyService } from '../server/lobby.mjs';
import { buildDealReview } from '../src/engine/dealReview.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'tarokk-archive-')); }

 test('JSON deal archive survives room cleanup and retains player names', async () => {
  const dir = tempDir();
  try {
    const store = new JsonRoomStore({ dir });
    const lobby = new LobbyService({ store, clock: () => 123456 });
    const created = lobby.create({ displayName: 'Tapasztalt A', matchRounds: 1 });
    const meta = lobby.get(created.roomId);
    meta.seats.P2.displayName = 'Tapasztalt B';
    const review = {
      dealNumber: 1,
      takerId: 'P1',
      partnerId: 'P3',
      defenceIds: ['P2', 'P4'],
      declarations: [{ ownerId: 'P2', type: 'pagatUltimo', status: 'failed' }],
      auction: [{ playerId: 'P1', action: { type: 'bid', contract: 'two' } }],
      players: [], tricks: [],
    };
    lobby.persistMeta(meta, { ...meta.room.exportPersistedState(), lastDealReview: review, lastSettlement: { dealNumber: 1, result: 'taker' } });

    const archived = await lobby.listArchivedDeals({ roomId: created.roomId });
    assert.equal(archived.length, 1);
    assert.equal(archived[0].review.playerNames.P2, 'Tapasztalt B');
    assert.equal(archived[0].review.declarations[0].status, 'failed');

    store.remove(created.roomId);
    assert.equal((await store.listDeals({ roomId: created.roomId })).length, 1, 'room removal must not remove completed deal history');
    await lobby.close();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('JSON archive is idempotent for the same room and deal number', () => {
  const dir = tempDir();
  try {
    const store = new JsonRoomStore({ dir });
    store.saveDeal({ roomId: 'ROOM1', dealNumber: 2, review: { dealNumber: 2, marker: 'first' } });
    store.saveDeal({ roomId: 'ROOM1', dealNumber: 2, review: { dealNumber: 2, marker: 'second' } });
    const deals = store.listDeals({ roomId: 'ROOM1' });
    assert.equal(deals.length, 1);
    assert.equal(deals[0].review.marker, 'first');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('archive HTTP API lists archived deal summaries and fetches the full review', async () => {
  const { createServer } = await import('../server/main.mjs');
  const dir = tempDir();
  const store = new JsonRoomStore({ dir });
  const lobby = new LobbyService({ store, clock: () => 654321 });
  const created = lobby.create({ displayName: 'Archív teszt' });
  const meta = lobby.get(created.roomId);
  lobby.persistMeta(meta, {
    ...meta.room.exportPersistedState(),
    lastDealReview: {
      dealNumber: 1, contract: 'two', takerId: 'P1', partnerId: 'P3',
      declarations: [{ ownerId: 'P2', type: 'pagatUltimo', status: 'failed' }],
      players: [], tricks: [],
    },
  });
  const app = createServer({ lobby, staticDir: path.join(dir, 'no-static-files') });
  try {
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const authQuery = `roomId=${encodeURIComponent(created.roomId)}&playerId=P1&token=${encodeURIComponent(created.token)}`;
    const deniedResponse = await fetch(`${base}/archives?limit=5`);
    assert.equal(deniedResponse.status, 403, 'archive review should not be public');
    const listResponse = await fetch(`${base}/archives?limit=5&${authQuery}`);
    assert.equal(listResponse.status, 200);
    const listBody = await listResponse.json();
    assert.equal(listBody.deals.length, 1);
    assert.equal(listBody.deals[0].failedDeclarations, 1);

    const detailResponse = await fetch(`${base}/archives/${created.roomId}/1?playerId=P1&token=${encodeURIComponent(created.token)}`);
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.review.contract, 'two');
    assert.equal(detail.review.playerNames.P1, 'Archív teszt');
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});


test('review does not classify a five-player sitting-out dealer as a defender', () => {
  const round = { players: ['P2', 'P3', 'P4', 'P5'].map(playerId => ({ playerId })), auction: { records: [] } };
  const game = {
    takerId: 'P2', partnerId: 'P4',
    players: [
      { id: 'P1', active: false }, { id: 'P2', active: true }, { id: 'P3', active: true },
      { id: 'P4', active: true }, { id: 'P5', active: true },
    ],
    completedTricks: [], declarations: { declarations: [], silentFigures: [] },
  };
  const review = buildDealReview(round, game, 1);
  assert.deepEqual(review.defenceIds, ['P3', 'P5']);
});
