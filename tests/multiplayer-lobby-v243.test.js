import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/main.mjs';

async function start() {
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  return { app, base: `http://127.0.0.1:${port}` };
}

async function json(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await res.json();
  return { res, body };
}

function waitForMessage(ws, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeEventListener('message', onMessage); reject(new Error('WebSocket message timeout.')); }, timeout);
    const onMessage = event => {
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (!predicate(data)) return;
      clearTimeout(timer); ws.removeEventListener('message', onMessage); resolve(data);
    };
    ws.addEventListener('message', onMessage);
  });
}

async function openWs(base, credentials, since = 0) {
  const wsBase = base.replace(/^http/, 'ws');
  const ws = new WebSocket(`${wsBase}/ws`);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.send(JSON.stringify({ type: 'hello', ...credentials, since }));
  const welcome = await waitForMessage(ws, m => m.type === 'welcome');
  return { ws, welcome };
}

test('v2.43 lobby assigns four seats and only becomes ready at four joined players', async () => {
  const { app, base } = await start();
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'Host' }) });
    assert.equal(created.res.status, 201);
    assert.equal(created.body.playerId, 'P1');
    assert.match(created.body.roomId, /^[A-Z0-9]{6}$/);
    assert.ok(created.body.token);
    assert.equal(created.body.status.joinedCount, 1);
    assert.equal(created.body.status.ready, false);
    assert.equal(created.body.status.seats.filter(s => s.joined).length, 1);
    const ids = [created.body.playerId];
    const tokens = { [created.body.playerId]: created.body.token };
    for (const name of ['Béla', 'Cecília', 'Dénes']) {
      const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: name }) });
      assert.equal(joined.res.status, 200);
      ids.push(joined.body.playerId); tokens[joined.body.playerId] = joined.body.token;
    }
    assert.deepEqual(ids, ['P1','P2','P3','P4']);
    const status = await json(base, `/lobby/rooms/${created.body.roomId}`);
    assert.equal(status.body.ready, true);
    assert.equal(status.body.joinedCount, 4);
    assert.equal(status.body.connectedCount, 4);
    assert.ok(!Object.values(status.body.seats[0]).some(v => typeof v === 'string' && v === created.body.token));
  } finally { await app.close(); }
});

test('v2.43 WebSocket welcome and lobby presence updates are real-time and player-specific', async () => {
  const { app, base } = await start();
  const sockets = [];
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'A' }) });
    const creds = { [created.body.playerId]: created.body.token };
    const players = [{ id: created.body.playerId, token: created.body.token }];
    for (let i = 0; i < 3; i++) {
      const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: String.fromCharCode(66 + i) }) });
      players.push({ id: joined.body.playerId, token: joined.body.token });
      creds[joined.body.playerId] = joined.body.token;
    }
    const p1 = players[0], p2 = players[1];
    const a = await openWs(base, { roomId: created.body.roomId, playerId: p1.id, token: p1.token }); sockets.push(a.ws);
    assert.equal(a.welcome.snapshot.players.find(p => p.id === 'P2')?.hand, undefined);
    const b = await openWs(base, { roomId: created.body.roomId, playerId: p2.id, token: p2.token }); sockets.push(b.ws);
    const lobbyUpdate = await waitForMessage(a.ws, m => m.type === 'lobby' && m.status.seats.some(s => s.playerId === 'P2' && s.connected));
    assert.equal(lobbyUpdate.status.ready, true);
    const room = await json(base, `/lobby/rooms/${created.body.roomId}`);
    assert.equal(room.body.connectedCount, 4);
    // A closes; the other live client sees the presence change without polling.
    a.ws.close();
    const offline = await waitForMessage(b.ws, m => m.type === 'lobby' && m.status.seats.some(s => s.playerId === 'P1' && !s.connected));
    assert.equal(offline.status.seats.find(s => s.playerId === 'P1')?.connected, false);
    assert.equal(creds.P1.length > 10, true);
  } finally {
    for (const ws of sockets) { try { ws.close(); } catch {} }
    await app.close();
  }
});

test('v2.43 WebSocket action fan-out and reconnect resync use the authoritative sequence', async () => {
  const { app, base } = await start();
  const sockets = [];
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'A' }) });
    const players = [{ id: created.body.playerId, token: created.body.token, snapshot: created.body.snapshot }];
    for (let i = 0; i < 3; i++) {
      const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: `P${i + 2}` }) });
      players.push({ id: joined.body.playerId, token: joined.body.token, snapshot: joined.body.snapshot });
    }
    const a = await openWs(base, { roomId: created.body.roomId, playerId: players[0].id, token: players[0].token });
    const b = await openWs(base, { roomId: created.body.roomId, playerId: players[1].id, token: players[1].token });
    sockets.push(a.ws, b.ws);
    let starter = a.welcome.snapshot.currentPlayerId;
    const starterCred = players.find(p => p.id === starter);
    assert.ok(starterCred);
    const hint = starterCred.snapshot.legalActionHints?.auctionActions?.[0];
    if (!hint) {
      const starterWs = starter === players[0].id ? a.ws : starter === players[1].id ? b.ws : null;
      assert.ok(starterWs === null || starterWs.readyState === WebSocket.OPEN);
    }
    const before = a.welcome.snapshot.sequence;
    const eventPromise = waitForMessage(a.ws, m => m.type === 'event' && m.snapshot.sequence === before + 1);
    const bEventPromise = waitForMessage(b.ws, m => m.type === 'event' && m.snapshot.sequence === before + 1);
    // Use HTTP with authenticated player token to exercise the same authority path; all connected WS clients receive the event.
    const action = hint || { type: 'pass' };
    const result = await json(base, `/rooms/${created.body.roomId}/actions?playerId=${encodeURIComponent(starter)}&token=${encodeURIComponent(starterCred.token)}`, { method: 'POST', body: JSON.stringify({ expectedSequence: before, action: { type:'auction', action } }) });
    assert.equal(result.res.status, 200);
    assert.equal(result.body.sequence, before + 1);
    const event = await eventPromise;
    assert.equal(event.snapshot.sequence, before + 1);
    const bEvent = await bEventPromise;
    assert.equal(bEvent.snapshot.sequence, before + 1);
    b.ws.close();
    await new Promise(r => setTimeout(r, 60));
    const reconnect = await openWs(base, { roomId: created.body.roomId, playerId: players[1].id, token: players[1].token }, before);
    sockets.push(reconnect.ws);
    assert.equal(reconnect.welcome.snapshot.sequence, before + 1);
    assert.ok(Array.isArray(reconnect.welcome.events));
    assert.ok(reconnect.welcome.events.some(e => e.sequence === before + 1));
  } finally {
    for (const ws of sockets) { try { ws.close(); } catch {} }
    await app.close();
  }
});

test('v2.43 private room HTTP endpoints require the seat reconnect token', async () => {
  const { app, base } = await start();
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'A' }) });
    const roomId = created.body.roomId;
    const denied = await json(base, `/rooms/${roomId}?playerId=P1`);
    assert.notEqual(denied.res.status, 200);
    const allowed = await json(base, `/rooms/${roomId}?playerId=P1&token=${encodeURIComponent(created.body.token)}`);
    assert.equal(allowed.res.status, 200);
    assert.equal(allowed.body.players.find(p => p.id === 'P1')?.hand?.length, 9);
  } finally { await app.close(); }
});
