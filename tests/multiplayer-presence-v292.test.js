import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from '../server/main.mjs';

async function start() {
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}
async function json(base, route, options = {}) {
  const res = await fetch(`${base}${route}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  return { res, body: await res.json() };
}
function waitForMessage(ws, predicate, timeout = 2500) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeEventListener('message', onMessage); reject(new Error('WebSocket message timeout')); }, timeout);
    const onMessage = event => {
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (!predicate(msg)) return;
      clearTimeout(timer); ws.removeEventListener('message', onMessage); resolve(msg);
    };
    ws.addEventListener('message', onMessage);
  });
}
async function openWs(base, credentials) {
  const ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.send(JSON.stringify({ type: 'hello', ...credentials, since: 0 }));
  const welcome = await waitForMessage(ws, m => m.type === 'welcome');
  return { ws, welcome };
}

test('v2.91.2 multiplayer presence: four seats stay online if the fourth seat reconnects', async () => {
  const { app, base } = await start();
  const sockets = [];
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'Első' }) });
    assert.equal(created.res.status, 201);
    const players = [{ roomId: created.body.roomId, playerId: created.body.playerId, token: created.body.token }];
    for (const name of ['Második', 'Harmadik', 'Negyedik']) {
      const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: name }) });
      assert.equal(joined.res.status, 200);
      players.push({ roomId: joined.body.roomId, playerId: joined.body.playerId, token: joined.body.token });
    }
    for (const player of players) {
      const client = await openWs(base, player);
      sockets.push(client.ws);
    }
    let status = await json(base, `/lobby/rooms/${created.body.roomId}`);
    assert.equal(status.body.connectedCount, 4);
    assert.equal(status.body.ready, true);

    // A reload/reconnect replaces the active P4 socket. Its predecessor's late close
    // must not incorrectly mark P4 offline or stop the room from becoming ready.
    const replacement = await openWs(base, players[3]);
    sockets.push(replacement.ws);
    await new Promise(resolve => setTimeout(resolve, 40));
    status = await json(base, `/lobby/rooms/${created.body.roomId}`);
    assert.equal(status.body.seats.find(s => s.playerId === 'P4').connected, true);
    assert.equal(status.body.connectedCount, 4);
    assert.equal(status.body.ready, true);
  } finally {
    for (const ws of sockets) { try { ws.close(); } catch {} }
    await app.close();
  }
});

test('v2.91.2 server closes an unauthenticated hello instead of leaving a false-open connection', async () => {
  const { app, base } = await start();
  let ws;
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'Host' }) });
    const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: 'Második' }) });
    ws = new WebSocket(`${base.replace(/^http/, 'ws')}/ws`);
    await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
    const errorMessage = waitForMessage(ws, m => m.type === 'error');
    ws.send(JSON.stringify({ type: 'hello', roomId: created.body.roomId, playerId: joined.body.playerId, token: 'wrong-token' }));
    const error = await errorMessage;
    assert.equal(error.code, 'AUTH_FAILED');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Unauthenticated socket was not closed')), 1500);
      ws.addEventListener('close', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
    const status = await json(base, `/lobby/rooms/${created.body.roomId}`);
    assert.equal(status.body.seats.find(s => s.playerId === 'P2').connected, false);
  } finally {
    try { ws?.close(); } catch {}
    await app.close();
  }
});

test('v2.91.2 client isolates player credentials per tab and checks authenticated WebSocket state', () => {
  const ui = fs.readFileSync(path.resolve('src/ui/multiplayer.js'), 'utf8');
  assert.match(ui, /sessionStorage\.setItem\(storageKey/);
  assert.match(ui, /sessionStorage\.getItem\(storageKey/);
  assert.doesNotMatch(ui, /localStorage\.(?:setItem|getItem|removeItem)\(storageKey/);
  assert.match(ui, /socketAuthenticated = true/);
  assert.match(ui, /socket\?\.readyState === WebSocket\.OPEN && socketAuthenticated/);
  assert.match(ui, /if \(!socketAuthenticated\)/);
  assert.match(ui, /const seatHtml =/);
  assert.match(ui, /const currentTrickLabel =/);
  assert.match(ui, /const eventHtml =/);
  assert.match(ui, /const dealerNote =/);
});
