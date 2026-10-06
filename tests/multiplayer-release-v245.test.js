import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/main.mjs';

async function start() {
  const app = createServer({ maxRequestsPerMinute: 100000 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}
async function json(base, path, options = {}) {
  const res = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const body = await res.json().catch(() => ({}));
  return { res, body };
}
function waitMessage(ws, predicate, timeout = 5000) {
  return new Promise((resolve, reject) => {
    let timer;
    const onMessage = event => {
      let data; try { data = JSON.parse(event.data); } catch { return; }
      if (!predicate(data)) return;
      clearTimeout(timer); ws.removeEventListener('message', onMessage); resolve(data);
    };
    timer = setTimeout(() => { ws.removeEventListener('message', onMessage); reject(new Error('WebSocket timeout')); }, timeout);
    ws.addEventListener('message', onMessage);
  });
}
async function openWs(base, credentials) {
  const ws = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  ws.send(JSON.stringify({ type: 'hello', ...credentials, since: 0 }));
  const welcome = await waitMessage(ws, m => m.type === 'welcome');
  return { ws, snapshot: welcome.snapshot };
}

function chooseAction(snapshot) {
  const hints = snapshot.legalActionHints ?? {};
  if (snapshot.phase === 'auction') {
    const actions = hints.auctionActions ?? [];
    const ordinary = actions.filter(a => a.type === 'bid');
    if (ordinary.length) return { type: 'auction', action: ordinary.at(-1) };
    const fallback = actions.find(a => a.type === 'hold') ?? actions.find(a => a.type === 'hold-invite') ?? actions.find(a => a.type === 'invite') ?? actions[0];
    return { type: 'auction', action: fallback ?? { type: 'pass' } };
  }
  if (snapshot.phase === 'skart') {
    const ids = hints.skartCardIds ?? [];
    const count = hints.skartCount ?? 0;
    if (!(hints.skartComplete)) return { type: 'skart', cardIds: ids.slice(0, count) };
    return { type: 'skart-announce' };
  }
  if (snapshot.phase === 'skart-announcement') {
    if (hints.types?.includes('skart-announce')) return { type: 'skart-announce' };
    return null;
  }
  if (snapshot.phase === 'partner-call') return { type: 'partner-call', rank: (hints.partnerRanks ?? [18])[0] };
  if (snapshot.phase === 'declarations') {
    const actions = hints.declarationActions ?? [];
    const pass = actions.find(a => a.type === 'pass');
    return { type: 'declaration', action: pass ?? actions[0] };
  }
  if (snapshot.phase === 'play') return { type: 'play-card', cardId: (hints.playCardIds ?? [])[0] };
  return null;
}

test('v2.52 full multiplayer lifecycle runs from lobby to completed scoring without leaking hidden cards', async () => {
  const { app, base } = await start();
  const sockets = [];
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'Host' }) });
    assert.equal(created.res.status, 201);
    const players = [{ id: created.body.playerId, token: created.body.token }];
    for (const name of ['B', 'C', 'D']) {
      const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: name }) });
      assert.equal(joined.res.status, 200);
      players.push({ id: joined.body.playerId, token: joined.body.token });
    }
    const clients = new Map();
    for (const p of players) {
      const c = await openWs(base, { roomId: created.body.roomId, playerId: p.id, token: p.token });
      sockets.push(c.ws); clients.set(p.id, c);
    }
    // Existing sockets receive a resync when a later player connects; refresh the test snapshots explicitly.
    for (const p of players) {
      const fresh = await json(base, `/rooms/${created.body.roomId}?playerId=${encodeURIComponent(p.id)}&token=${encodeURIComponent(p.token)}`);
      clients.get(p.id).snapshot = fresh.body;
    }
    let guard = 400;
    let sawPlay = false;
    let sawSettlement = false;
    while (guard-- > 0) {
      const any = [...clients.values()][0].snapshot;
      if (any.lastSettlement || Number(any.scoreboard?.dealsPlayed || 0) > 0) sawSettlement = true;
      if (sawSettlement && any.phase === 'auction' && Number(any.scoreboard?.dealsPlayed || 0) > 0) break;
      const current = any.currentPlayerId;
      const client = current && clients.get(current)
        ? clients.get(current)
        : [...clients.values()].find(c => c.snapshot?.legalActionTypes?.length);
      assert.ok(client?.snapshot?.legalActionTypes?.length, `no client has a legal action view in phase ${any.phase}`);
      assert.ok(client, `missing actor for phase ${any.phase}`);
      const before = client.snapshot.sequence;
      const action = chooseAction(client.snapshot);
      assert.ok(action, `no action for phase ${client.snapshot.phase}`);
      if (client.snapshot.phase === 'play') sawPlay = true;
      const clientEntries = [...clients.entries()];
      const eventPromises = clientEntries.map(([, c]) => waitMessage(c.ws, m => m.type === 'event' && m.snapshot?.sequence === before + 1));
      client.ws.send(JSON.stringify({ type: 'action', expectedSequence: before, action }));
      const events = await Promise.all(eventPromises);
      clientEntries.forEach(([id, c], index) => { c.snapshot = events[index].snapshot; clients.set(id, c); });
      // The actor may receive an action-accepted snapshot with the same next sequence;
      // the public event carries the player-specific snapshot needed by every client.
      for (const [id, c] of clients) {
        assert.equal(c.snapshot.sequence, before + 1);
        const me = c.snapshot.players.find(p => p.id === id);
        assert.equal(me?.hand === undefined || Array.isArray(me.hand), true);
        for (const p of c.snapshot.players) if (p.id !== id) assert.equal(p.hand, undefined);
      }
    }
    const final = [...clients.values()][0].snapshot;
    assert.equal(sawPlay, true);
    assert.ok(final.lastSettlement || final.scoreboard?.dealsPlayed > 0);
    assert.equal(final.phase, 'auction');
  } finally {
    for (const ws of sockets) try { ws.close(); } catch {}
    await app.close();
  }
});

test('v2.52 release static build exposes versioned single-player and multiplayer entry points', async () => {
  const { readFile, access } = await import('node:fs/promises');
  const { default: path } = await import('node:path');
  const root = path.resolve(new URL('..', import.meta.url).pathname);
  await access(path.join(root, 'dist', 'index.html'));
  await access(path.join(root, 'dist', 'multiplayer.html'));
  await access(path.join(root, 'dist', 'main.js'));
  await access(path.join(root, 'dist', 'multiplayer.js'));
  const index = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
  assert.match(index, /v2\.63/);
  assert.match(index, /\.\/main\.js/);
});

test('v2.52 skart hints are generated by the same legal-skart rule as the authority', async () => {
  const { createAuthoritativeRoom } = await import('../src/server/authoritativeRoom.js');
  const room = createAuthoritativeRoom({ roomId: 'SKARTHINTS', playerIds: ['P1','P2','P3','P4'], dealerIndex: 0 });
  const starter = room.currentPlayerId;
  const starterState = room.round.players.find(p => p.playerId === starter);
  if (starterState && !starterState.hand.some(c => c.kind === 'tarokk' && [1, 21, 22].includes(c.rank))) {
    const replacement = starterState.hand.find(c => c.kind === 'tarokk' && ![1, 21, 22].includes(c.rank));
    if (replacement) Object.assign(replacement, { rank: 21, id: `${replacement.id}-forced-honour`, points: 5 });
  }
  const legalById = new Map(starterState?.hand.map(c => [c.id, c]) ?? []);
  // Force a valid auction winner by taking the first available bid.
  let seq = 0;
  const auction = room.snapshotFor(starter).legalActionHints.auctionActions;
  const bid = auction.find(a => a.type === 'bid' && a.contract === 'solo') ?? auction.find(a => a.type === 'bid');
  assert.ok(bid);
  room.dispatch(starter, seq++, { type: 'auction', action: bid });
  const skarter = room.round.players.find(p => p.skart.length < p.receivedTalon.length)?.playerId;
  assert.ok(skarter);
  const hints = room.snapshotFor(skarter).legalActionHints;
  assert.ok(hints.skartCount > 0);
  for (const id of hints.skartCardIds) {
    const card = room.round.players.find(p => p.playerId === skarter)?.hand.find(c => c.id === id);
    assert.ok(card);
    assert.notEqual(card.kind === 'suit' && card.rank === 'K', true);
    assert.notEqual(card.kind === 'tarokk' && [1,20,21,22].includes(card.rank), true);
  }
});
