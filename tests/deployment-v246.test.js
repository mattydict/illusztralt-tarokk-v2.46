import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';
import { LobbyService } from '../server/lobby.mjs';
import { JsonRoomStore } from '../server/persistence.mjs';
import { createServer } from '../server/main.mjs';

function wait(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

function tempDir() {
  return fs.mkdtempSync(path.join('/tmp', 'tarokk-v246-'));
}

test('v2.46 async commit path waits for durable persistence', async () => {
  let committed = false;
  const room = createAuthoritativeRoom({
    roomId: 'ASYNC',
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    onCommit: async () => {
      await wait(10);
      committed = true;
    },
  });
  const player = room.currentPlayerId;
  const before = room.snapshotFor(player);
  await room.dispatchAsync(player, before.sequence, { type: 'auction', action: { type: 'pass' } });
  assert.equal(committed, true);
  assert.equal(room.snapshotFor(player).sequence, before.sequence + 1);
});

test('v2.46 async persistence failure rolls back the authoritative action', async () => {
  const room = createAuthoritativeRoom({
    roomId: 'ROLLBACK',
    playerIds: ['P1', 'P2', 'P3', 'P4'],
    onCommit: async () => { throw new Error('database unavailable'); },
  });
  const player = room.currentPlayerId;
  const before = room.snapshotFor(player);
  await assert.rejects(() => room.dispatchAsync(player, before.sequence, { type: 'auction', action: { type: 'pass' } }), /database unavailable/);
  const after = room.snapshotFor(player);
  assert.equal(after.sequence, before.sequence);
  assert.deepEqual(after.auction.records, before.auction.records);
  assert.equal(after.currentPlayerId, before.currentPlayerId);
});

test('v2.46 local JSON storage remains the default without DATABASE_URL', async () => {
  const dir = tempDir();
  const old = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    const lobby = new LobbyService({ store: new JsonRoomStore({ dir }) });
    await lobby.waitUntilReady();
    const created = lobby.create({ displayName: 'Local' });
    assert.equal(created.roomId.length, 6);
    assert.equal(fs.existsSync(path.join(dir, `${created.roomId}.json`)), true);
    await lobby.close();
  } finally {
    if (old === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = old;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('v2.46 Render deployment files are present and production client is same-origin aware', () => {
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const render = fs.readFileSync(path.join(root, 'render.yaml'), 'utf8');
  const env = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'src/ui/multiplayer.js'), 'utf8');
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.match(render, /runtime: node/);
  assert.match(render, /buildCommand: npm install && npm run build/);
  assert.match(render, /startCommand: npm start/);
  assert.match(render, /healthCheckPath: \/health/);
  assert.match(render, /key: DATABASE_URL\n\s+sync: false/);
  assert.match(env, /DATABASE_URL=/);
  assert.match(client, /\$\{location\.protocol\}\/\/\$\{location\.host\}/);
  assert.doesNotMatch(client, /location\.hostname.*:8787/);
  assert.match(pkg.version, /^2\.\d+\.0$/);
});

test('v2.46 server serves health through the release surface', async () => {
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  const app = createServer({ staticDir: path.join(root, 'dist'), maxRequestsPerMinute: 100000 });
  await app.lobby.waitUntilReady();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  try {
    const port = app.server.address().port;
    const response = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.storage, 'json');
  } finally {
    await app.close();
  }
});
