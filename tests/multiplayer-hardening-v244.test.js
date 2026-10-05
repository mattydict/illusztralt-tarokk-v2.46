import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createServer } from '../server/main.mjs';

async function start(opts) {
  const app = createServer(opts);
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}

async function json(base, path, options = {}) {
  const res = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await res.text();
  return { res, body: body ? JSON.parse(body) : null };
}

test('v2.44 HTTP body limit rejects oversized JSON requests', async () => {
  const { app, base } = await start({ maxBodyBytes: 100 });
  try {
    const payload = JSON.stringify({ displayName: 'x'.repeat(500) });
    const result = await json(base, '/lobby/rooms', { method: 'POST', body: payload });
    assert.equal(result.res.status, 413);
    assert.match(result.body.error, /túl nagy/i);
  } finally { await app.close(); }
});

test('v2.44 HTTP rate limiting returns 429 without changing room state', async () => {
  const { app, base } = await start({ maxRequestsPerMinute: 2 });
  try {
    const a = await json(base, '/health');
    const b = await json(base, '/health');
    const c = await json(base, '/health');
    assert.equal(a.res.status, 200);
    assert.equal(b.res.status, 200);
    assert.equal(c.res.status, 429);
  } finally { await app.close(); }
});

test('v2.44 legacy /rooms API is disabled by default', async () => {
  const { app, base } = await start();
  try {
    const result = await json(base, '/rooms', { method: 'POST', body: JSON.stringify({ playerIds: ['A','B','C','D'] }) });
    assert.equal(result.res.status, 404);
  } finally { await app.close(); }
});

test('v2.44 private room auth accepts Authorization: Bearer without putting the token in the URL', async () => {
  const { app, base } = await start();
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'A' }) });
    const result = await json(base, `/rooms/${created.body.roomId}?playerId=P1`, { headers: { authorization: `Bearer ${created.body.token}` } });
    assert.equal(result.res.status, 200);
    assert.equal(result.body.players.find(p => p.id === 'P1')?.hand?.length, 9);
  } finally { await app.close(); }
});

test('v2.44 duplicate WebSocket login closes the older seat session', async () => {
  // Use the global WHATWG WebSocket implementation exposed by modern Node.
  const { app, base } = await start();
  const sockets = [];
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'A' }) });
    for (const name of ['B','C','D']) await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: name }) });
    const open = async () => {
      const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
      await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
      ws.send(JSON.stringify({ type:'hello', roomId:created.body.roomId, playerId:'P1', token:created.body.token }));
      await new Promise((resolve, reject) => { const t=setTimeout(()=>reject(new Error('welcome timeout')),2000); ws.addEventListener('message', e => { const m=JSON.parse(e.data); if(m.type==='welcome'){clearTimeout(t);resolve();}}, {once:false}); });
      return ws;
    };
    const first = await open(); sockets.push(first);
    const second = await open(); sockets.push(second);
    const closed = await new Promise(resolve => { const t=setTimeout(()=>resolve(false),2000); first.addEventListener('close', () => { clearTimeout(t); resolve(true); }, {once:true}); });
    assert.equal(closed, true);
    assert.equal(second.readyState, WebSocket.OPEN);
  } finally { for (const ws of sockets) { try { ws.close(); } catch {} } await app.close(); }
});
