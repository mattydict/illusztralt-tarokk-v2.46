import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../server/main.mjs';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';
import { createInitialState, setPartnership, recordPartnerCall, startDeclarations } from '../src/engine/game.js';
import { createDeclarationWindow, declarationOrderFromTaker } from '../src/engine/declarationWindow.js';

async function start() {
  const app = createServer();
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  return { app, base: `http://127.0.0.1:${app.server.address().port}` };
}
async function json(base, path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { 'content-type': 'application/json', ...(options.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}
function waitForMessage(ws, predicate = () => true, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { ws.removeEventListener('message', onMessage); reject(new Error('WebSocket üzenet-időtúllépés.')); }, timeout);
    const onMessage = event => {
      let message;
      try { message = JSON.parse(event.data); } catch { return; }
      if (!predicate(message)) return;
      clearTimeout(timer); ws.removeEventListener('message', onMessage); resolve(message);
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

function buildDeclarationRoom() {
  const ids = ['P1', 'P2', 'P3', 'P4'];
  const room = createAuthoritativeRoom({ roomId: 'DRAFT1', playerIds: ids, random: () => 0.37 });
  const sourceRound = room.round;
  const hands = Object.fromEntries(sourceRound.players.map(p => [p.playerId, [...p.hand]]));
  const initial = createInitialState(ids, 0);
  let game = {
    ...initial,
    players: initial.players.map(p => ({ ...p, hand: hands[p.id], active: true })),
    startingPlayerId: 'P1',
    phase: 'deal',
    contract: 'two',
    talon: [...(sourceRound.talon || [])],
    skartsByPlayer: Object.fromEntries(sourceRound.players.map(p => [p.playerId, [...(p.skart || [])]])),
  };
  game = setPartnership(game, 'P1', 'P2');
  game = recordPartnerCall(game, 20, 'P2');
  game = startDeclarations(game, game.players.findIndex(p => p.id === 'P1'));
  room.game = game;
  room.round = { ...sourceRound, phase: 'declarations', contract: 'two', takerId: 'P1', calledTarokk: 20, startingPlayerId: 'P1', currentPlayerId: 'P1', auctionOutcome: { takerId: 'P1', contract: 'two', calledTarokk: 20 } };
  room.declarationWindow = createDeclarationWindow(declarationOrderFromTaker(ids, 'P1'), true);
  return room;
}

test('v3.0.6 nyitott szobalista csak csatlakozható várakozó szobákat tesz közzé, tokenek nélkül', async () => {
  const { app, base } = await start();
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'Házigazda' }) });
    assert.equal(created.response.status, 201);
    const list = await json(base, '/lobby/rooms?limit=50');
    assert.equal(list.response.status, 200);
    const entry = list.body.rooms.find(room => room.roomId === created.body.roomId);
    assert.ok(entry);
    assert.equal(entry.openSeats, 3);
    assert.equal(entry.joinedCount, 1);
    assert.equal('token' in entry, false);
    for (const name of ['Béla', 'Cecília', 'Dénes']) {
      const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: name }) });
      assert.equal(joined.response.status, 200);
    }
    const fullList = await json(base, '/lobby/rooms?limit=50');
    assert.equal(fullList.body.rooms.some(room => room.roomId === created.body.roomId), false);
  } finally { await app.close(); }
});

test('v3.0.6 szobachat csak ugyanazon szoba tagjainak szól, és nem kerül a rögzített eseménynaplóba', async () => {
  const { app, base } = await start();
  const sockets = [];
  try {
    const created = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'A' }) });
    const players = [{ id: created.body.playerId, token: created.body.token }];
    for (const displayName of ['B', 'C', 'D']) {
      const joined = await json(base, `/lobby/rooms/${created.body.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName }) });
      players.push({ id: joined.body.playerId, token: joined.body.token });
    }
    const other = await json(base, '/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: 'Másik szoba' }) });
    const a = await openWs(base, { roomId: created.body.roomId, playerId: players[0].id, token: players[0].token }); sockets.push(a.ws);
    const b = await openWs(base, { roomId: created.body.roomId, playerId: players[1].id, token: players[1].token }); sockets.push(b.ws);
    const outsider = await openWs(base, { roomId: other.body.roomId, playerId: other.body.playerId, token: other.body.token }); sockets.push(outsider.ws);
    const aMessage = waitForMessage(a.ws, m => m.type === 'chat-message' && m.chat?.text === 'Sziasztok!');
    const bMessage = waitForMessage(b.ws, m => m.type === 'chat-message' && m.chat?.text === 'Sziasztok!');
    a.ws.send(JSON.stringify({ type: 'chat-send', text: '  Sziasztok!  ' }));
    const [m1, m2] = await Promise.all([aMessage, bMessage]);
    assert.equal(m1.chat.text, 'Sziasztok!');
    assert.equal(m2.chat.displayName, 'A');
    await assert.rejects(waitForMessage(outsider.ws, m => m.type === 'chat-message' && m.chat?.text === 'Sziasztok!', 250));
    const events = await json(base, `/rooms/${created.body.roomId}/events?playerId=${players[0].id}&token=${encodeURIComponent(players[0].token)}&since=0`);
    assert.equal(events.response.status, 200);
    assert.equal(events.body.events.some(event => String(event.message || '').includes('Sziasztok!')), false);
  } finally {
    for (const ws of sockets) { try { ws.close(); } catch {} }
    await app.close();
  }
});

test('v3.0.6 bemondási előnézet nem rögzít parti-eseményt, a Passz pedig egyben rögzíti a bemondást', () => {
  const room = buildDeclarationRoom();
  const beforeScore = { ...room.matchScores };
  const beforeEvents = [...room.publicEvents];
  const beforeDeclared = room.game.declarations.declarations.length;
  const preview = room.previewDeclarationActions('P1', [{ type: 'declare', declaration: 'doubleGame' }]);
  assert.ok(preview.some(action => action.type === 'pass'));
  assert.equal(room.game.declarations.declarations.length, beforeDeclared);
  assert.deepEqual(room.matchScores, beforeScore);
  assert.deepEqual(room.publicEvents, beforeEvents);
  room.dispatch('P1', room.sequence, { type: 'declaration-batch', actions: [{ type: 'declare', declaration: 'doubleGame' }] });
  assert.equal(room.game.declarations.declarations.some(d => d.type === 'doubleGame' && d.ownerId === 'P1'), true);
  const batchEvent = room.publicEvents.find(event => event.type === 'action-accepted' && event.actionType === 'declaration-batch');
  assert.ok(batchEvent);
  assert.match(batchEvent.message, /Duplajáték/);
  assert.match(batchEvent.message, /Passz/);
  assert.equal(room.round.currentPlayerId, 'P2');
});

test('v3.0.6 királyos bemondás célkártyája magyar színnévvel kerül az eseménybe', () => {
  const room = buildDeclarationRoom();
  const king = room.game.players.flatMap(player => player.hand.map(card => ({ ...card, owner: player.id }))).find(card => card.kind === 'suit' && card.rank === 'K');
  assert.ok(king, 'a pakliban szereplő király megtalálható');
  const p1 = room.game.players.find(player => player.id === 'P1');
  if (!p1.hand.some(card => card.id === king.id)) {
    const other = room.game.players.find(player => player.id === king.owner);
    other.hand = other.hand.filter(card => card.id !== king.id);
    p1.hand.push({ id: king.id, kind: king.kind, suit: king.suit, rank: king.rank, points: king.points });
  }
  room.dispatch('P1', room.sequence, { type: 'declaration-batch', actions: [{ type: 'declare', declaration: 'kingUhu', targetCardId: king.id }] });
  const event = room.publicEvents.find(item => item.type === 'action-accepted' && item.actionType === 'declaration-batch');
  assert.ok(event);
  assert.match(event.message, /(kőr|káró|treff|pikk) király/);
  assert.doesNotMatch(event.message, /hearts-K|diamonds-K|clubs-K|spades-K/);
});
