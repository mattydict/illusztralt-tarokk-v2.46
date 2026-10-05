import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LobbyService } from '../server/lobby.mjs';
import { JsonRoomStore } from '../server/persistence.mjs';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

function tempDir() { return fs.mkdtempSync(path.join(os.tmpdir(), 'tarokk-v244-')); }

async function withDir(fn) {
  const dir = tempDir();
  try { return await fn(dir); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

async function joinAll(lobby, roomId, created) {
  const players = [{ id: created.playerId, token: created.token }];
  for (const name of ['Béla', 'Cecília', 'Dénes']) {
    const joined = lobby.join(roomId, { displayName: name });
    players.push({ id: joined.playerId, token: joined.token });
  }
  return players;
}

test('v2.44 persists the authoritative state and restores it without restoring connections', async () => {
  await withDir(async dir => {
    const store = new JsonRoomStore({ dir });
    const lobby = new LobbyService({ store });
    const created = lobby.create({ displayName: 'Host' });
    const players = await joinAll(lobby, created.roomId, created);
    const room = lobby.room(created.roomId);
    const starter = room.currentPlayerId;
    const before = room.snapshotFor(starter);
    room.dispatch(starter, before.sequence, { type: 'auction', action: { type: 'pass' } });
    const persistedFile = path.join(dir, `${created.roomId}.json`);
    assert.equal(fs.existsSync(persistedFile), true);
    const disk = JSON.parse(fs.readFileSync(persistedFile, 'utf8'));
    assert.equal(disk.schemaVersion, 1);
    assert.equal(disk.roomState.sequence, 1);
    assert.ok(players.every(p => disk.tokenHashes[p.id]?.length === 64));
    assert.equal(JSON.stringify(disk).includes(created.token), false);

    const restoredLobby = new LobbyService({ store: new JsonRoomStore({ dir }) });
    const restored = restoredLobby.room(created.roomId);
    assert.equal(restored.snapshotFor('P1').sequence, 1);
    assert.equal(restoredLobby.status(created.roomId).connectedCount, 0);
    assert.equal(restored.snapshotFor('P1').players.find(p => p.id === 'P1')?.hand?.length, 9);
    for (const p of players) {
      restoredLobby.join(created.roomId, { playerId: p.id, token: p.token, displayName: p.id });
    }
    assert.equal(restoredLobby.status(created.roomId).connectedCount, 4);
    assert.equal(restored.currentPlayerId, room.currentPlayerId);
    assert.deepEqual(restored.snapshotFor('P1').auction, room.snapshotFor('P1').auction);
  });
});

test('v2.44 token persistence stores only hashes and valid reconnect tokens survive restart', async () => {
  await withDir(async dir => {
    const store = new JsonRoomStore({ dir });
    const lobby = new LobbyService({ store });
    const created = lobby.create({ displayName: 'Host' });
    const token = created.token;
    const fresh = new LobbyService({ store: new JsonRoomStore({ dir }) });
    assert.throws(() => fresh.authenticate(created.roomId, 'P1', 'wrong-token'));
    const meta = fresh.authenticate(created.roomId, 'P1', token);
    assert.equal(meta.room.roomId, created.roomId);
    const persisted = JSON.parse(fs.readFileSync(path.join(dir, `${created.roomId}.json`), 'utf8'));
    assert.ok(persisted.tokenHashes.P1);
    assert.equal(persisted.tokens, undefined);
    assert.equal(persisted.token, undefined);
  });
});

test('v2.44 failed persistence rolls an action back atomically', () => {
  const ids = ['A','B','C','D'];
  let writes = 0;
  const room = createAuthoritativeRoom({ roomId: 'atomic', playerIds: ids, onCommit: () => { writes += 1; throw new Error('disk full'); } });
  const starter = room.currentPlayerId;
  const before = room.snapshotFor(starter);
  assert.throws(() => room.dispatch(starter, before.sequence, { type: 'auction', action: { type: 'pass' } }), /disk full/);
  assert.equal(writes, 1);
  const after = room.snapshotFor(starter);
  assert.equal(after.sequence, before.sequence);
  assert.equal(after.auction.records.length, before.auction.records.length);
  assert.equal(after.currentPlayerId, before.currentPlayerId);
});
