import http from 'node:http';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LobbyService } from './lobby.mjs';
import { acceptWebSocketUpgrade } from './websocket.mjs';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';

export function createServer({ lobby = new LobbyService(), maxBodyBytes = 64 * 1024, maxRequestsPerMinute = 240, enableLegacyApi = false, staticDir } = {}) {
  const sessions = new Map();
  const roomUnsubscribers = new Map();
  const legacyRooms = new Map();
  const rateBuckets = new Map();
  const roomCleanupTimer = setInterval(() => { try { lobby.pruneInactive?.(); } catch {} }, 60_000);
  roomCleanupTimer.unref?.();

  function clientKey(req) { return String(req.headers['x-forwarded-for'] ?? req.socket.remoteAddress ?? 'unknown').split(',')[0].trim(); }
  function checkRateLimit(req) {
    const key = clientKey(req);
    const now = Date.now();
    const bucket = rateBuckets.get(key) ?? { windowStart: now, count: 0 };
    if (now - bucket.windowStart >= 60_000) { bucket.windowStart = now; bucket.count = 0; }
    bucket.count += 1;
    rateBuckets.set(key, bucket);
    return bucket.count <= maxRequestsPerMinute;
  }

  function send(res, status, payload) {
    res.statusCode = status;
    if (status === 429) res.setHeader('retry-after', '60');
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.setHeader('access-control-allow-origin', '*');
    res.setHeader('access-control-allow-headers', 'content-type');
    res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
    res.end(JSON.stringify(payload));
  }

  async function readJson(req) {
    const declared = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(declared) && declared > maxBodyBytes) {
      req.resume();
      throw new Error('A kérés túl nagy.');
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBodyBytes) {
        for await (const _ of req) { /* drain oversized request before replying */ }
        throw new Error('A kérés túl nagy.');
      }
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  }

  function route(url) { return new URL(url, 'http://localhost').pathname.split('/').filter(Boolean); }
  const resolvedStaticDir = staticDir ? path.resolve(staticDir) : null;
  const contentTypes = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
  function tryServeStatic(req, res) {
    if (!resolvedStaticDir || !['GET','HEAD'].includes(req.method)) return false;
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const requested = pathname === '/' ? '/index.html' : pathname;
    const normalized = path.posix.normalize(requested);
    if (normalized.includes('..')) return false;
    const file = path.resolve(resolvedStaticDir, `.${normalized}`);
    if (!file.startsWith(resolvedStaticDir + path.sep)) return false;
    try {
      const stat = fs.statSync(file);
      if (!stat.isFile()) return false;
      res.statusCode = 200;
      res.setHeader('content-type', contentTypes[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
      res.setHeader('cache-control', process.env.NODE_ENV === 'production' ? (path.extname(file).toLowerCase() === '.html' ? 'no-cache' : 'public, max-age=300') : 'no-cache');
      if (req.method === 'HEAD') { res.end(); return true; }
      res.end(fs.readFileSync(file));
      return true;
    } catch { return false; }
  }

  function publicLobby(meta) { return lobby.status(meta.room.roomId); }
  function authToken(req, query) {
    const header = req.headers.authorization;
    if (typeof header === 'string' && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
    return query.get('token') ?? '';
  }

  function broadcastRoom(roomId, payloadFactory) {
    for (const session of sessions.values()) {
      if (session.roomId !== roomId) continue;
      session.peer.sendJson(payloadFactory(session));
    }
  }

  function ensureRoomSubscription(roomId) {
    if (roomUnsubscribers.has(roomId)) return;
    const room = lobby.room(roomId);
    const unsubscribe = room.subscribe(event => {
      broadcastRoom(roomId, session => ({ type: 'event', event, snapshot: room.snapshotFor(session.playerId), lobby: publicLobby(lobby.get(roomId)) }));
    });
    roomUnsubscribers.set(roomId, unsubscribe);
  }

  function broadcastLobby(roomId) {
    const status = lobby.status(roomId);
    broadcastRoom(roomId, () => ({ type: 'lobby', status }));
  }

  function broadcastRoomResync(roomId) {
    const room = lobby.room(roomId);
    const status = publicLobby(lobby.get(roomId));
    broadcastRoom(roomId, session => ({ type: 'resync', snapshot: room.snapshotFor(session.playerId), status }));
  }

  function cleanupSession(session) {
    if (!session || session.cleaned) return;
    session.cleaned = true;
    if (session.peer?.pingTimer) clearInterval(session.peer.pingTimer);
    if (session.peer?.helloTimer) clearTimeout(session.peer.helloTimer);
    sessions.delete(session.peer);
    if (session.roomId && session.playerId) {
      try { lobby.room(session.roomId).disconnect(session.playerId); broadcastLobby(session.roomId); broadcastRoomResync(session.roomId); } catch { /* room already gone */ }
    }
  }

  function handleHello(peer, raw) {
    let message;
    try { message = JSON.parse(raw); } catch { peer.sendJson({ type: 'error', code: 'BAD_JSON', message: 'Érvénytelen JSON.' }); return false; }
    if (message?.type !== 'hello') { peer.sendJson({ type: 'error', code: 'HELLO_REQUIRED', message: 'A kapcsolatot hello üzenettel kell inicializálni.' }); return false; }
    try {
      const roomId = String(message.roomId ?? '').toUpperCase();
      const playerId = String(message.playerId ?? '');
      const token = String(message.token ?? '');
      const meta = lobby.authenticate(roomId, playerId, token);
      for (const existing of sessions.values()) {
        if (existing === peer.session) continue;
        if (existing.roomId === roomId && existing.playerId === playerId) {
          try { existing.peer.close(4001, 'A játékos új kapcsolatot nyitott.'); } catch {}
        }
      }
      meta.room.connect(playerId);
      ensureRoomSubscription(roomId);
      if (peer.helloTimer) { clearTimeout(peer.helloTimer); peer.helloTimer = null; }
      const since = Number.isFinite(Number(message.since)) ? Number(message.since) : 0;
      const missed = meta.room.eventsSince(since);
      const status = publicLobby(meta);
      peer.session.roomId = roomId;
      peer.session.playerId = playerId;
      peer.sendJson({ type: 'welcome', roomId, playerId, snapshot: meta.room.snapshotFor(playerId), events: missed, status, resyncRequired: missed.length === 0 && since > 0 && meta.room.snapshotFor(playerId).sequence > since });
      broadcastLobby(roomId);
      broadcastRoomResync(roomId);
      return true;
    } catch (error) {
      peer.sendJson({ type: 'error', code: 'AUTH_FAILED', message: error instanceof Error ? error.message : 'Sikertelen hitelesítés.' });
      return false;
    }
  }

  async function handleMessage(peer, raw) {
    if (!peer.session.roomId) return handleHello(peer, raw);
    let message;
    try { message = JSON.parse(raw); } catch { peer.sendJson({ type: 'error', code: 'BAD_JSON', message: 'Érvénytelen JSON.' }); return; }
    if (message?.type === 'action') {
      try {
        const room = lobby.room(peer.session.roomId);
        const view = await room.dispatchAsync(peer.session.playerId, Number(message.expectedSequence), message.action);
        peer.sendJson({ type: 'action-accepted', actionType: message.action?.type, snapshot: view });
      } catch (error) {
        const room = lobby.room(peer.session.roomId);
        peer.sendJson({ type: 'action-rejected', message: error instanceof Error ? error.message : 'Az akció elutasítva.', snapshot: room.snapshotFor(peer.session.playerId) });
      }
      return;
    }
    if (message?.type === 'resync') {
      const room = lobby.room(peer.session.roomId);
      const since = Number(message.since ?? 0);
      peer.sendJson({ type: 'resync', snapshot: room.snapshotFor(peer.session.playerId), events: room.eventsSince(Number.isFinite(since) ? since : 0), status: publicLobby(lobby.get(peer.session.roomId)) });
      return;
    }
    peer.sendJson({ type: 'error', code: 'UNKNOWN_MESSAGE', message: 'Ismeretlen üzenettípus.' });
  }

  const server = http.createServer(async (req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    try {
      if (tryServeStatic(req, res)) return;
      if (!checkRateLimit(req)) return send(res, 429, { error: 'Túl sok kérés. Próbáld újra később.' });
      const parts = route(req.url ?? '/');
      const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
      if (req.method === 'GET' && parts[0] === 'health' && parts[1] === 'db') {
        await lobby.waitUntilReady();
        const ok = lobby.store?.health ? await lobby.store.health() : true;
        return send(res, ok ? 200 : 503, { ok, service: 'illusztralt-tarokk-database', storage: lobby.store?.kind ?? 'json' });
      }
      if (req.method === 'GET' && parts[0] === 'health') {
        await lobby.waitUntilReady();
        return send(res, 200, { ok: true, service: 'illusztralt-tarokk-authority', version: process.env.npm_package_version ?? '2.46', storage: lobby.store?.kind ?? (lobby.store?.isAsync ? 'postgres' : 'json') });
      }

      if (req.method === 'POST' && parts[0] === 'lobby' && parts[1] === 'rooms' && parts.length === 2) {
        const body = await readJson(req);
        await lobby.waitUntilReady();
        const created = lobby.asyncStore ? await lobby.createAsync({ displayName: body.displayName, matchRounds: body.matchRounds, playerCount: body.playerCount }) : lobby.create({ displayName: body.displayName, matchRounds: body.matchRounds, playerCount: body.playerCount });
        ensureRoomSubscription(created.roomId);
        return send(res, 201, created);
      }
      if (parts[0] === 'lobby' && parts[1] === 'rooms' && parts[2]) {
        const roomId = parts[2].toUpperCase();
        if (req.method === 'GET' && parts.length === 3) return send(res, 200, lobby.status(roomId));
        if (req.method === 'POST' && parts[3] === 'join') {
          const body = await readJson(req);
          await lobby.waitUntilReady();
          const result = lobby.asyncStore ? await lobby.joinAsync(roomId, body) : lobby.join(roomId, body);
          ensureRoomSubscription(roomId);
          broadcastLobby(roomId);
          return send(res, 200, result);
        }
      }

      if (enableLegacyApi && req.method === 'POST' && parts[0] === 'rooms' && parts.length === 1) {
        const body = await readJson(req);
        const playerIds = Array.isArray(body.playerIds) ? body.playerIds.map(String) : [];
        const roomId = typeof body.roomId === 'string' && body.roomId ? body.roomId : randomUUID().slice(0, 8);
        const room = createAuthoritativeRoom({ roomId, playerIds, dealerIndex: Number.isInteger(body.dealerIndex) ? body.dealerIndex : 0 });
        legacyRooms.set(roomId, room);
        return send(res, 201, room.snapshotFor(playerIds[0]));
      }

      if (parts[0] === 'rooms' && parts[1]) {
        if (legacyRooms.has(parts[1]) && !enableLegacyApi) return send(res, 404, { error: 'A legacy room API ki van kapcsolva.' });
        const roomId = parts[1];
        const legacy = legacyRooms.get(roomId);
        let room = legacy;
        if (!room) room = lobby.room(roomId);
        const playerId = query.get('playerId');
        if (!playerId) return send(res, 400, { error: 'A playerId kötelező.' });
        if (!legacy) {
          const token = authToken(req, query);
          lobby.authenticate(roomId, playerId, token);
        }
        if (req.method === 'GET' && parts.length === 2) return send(res, 200, room.snapshotFor(playerId));
        if (req.method === 'GET' && parts[2] === 'events') {
          const since = Number(query.get('since') ?? 0);
          return send(res, 200, { events: room.eventsSince(Number.isFinite(since) ? since : 0) });
        }
        if (req.method === 'GET' && parts[2] === 'legal-actions') return send(res, 200, room.legalActionHints(playerId));
        if (req.method === 'POST' && parts[2] === 'connect') { room.connect(playerId); return send(res, 200, room.snapshotFor(playerId)); }
        if (req.method === 'POST' && parts[2] === 'disconnect') { room.disconnect(playerId); broadcastLobby(parts[1]); return send(res, 200, room.snapshotFor(playerId)); }
        if (req.method === 'POST' && parts[2] === 'actions') {
          const body = await readJson(req);
          const view = await room.dispatchAsync(playerId, Number(body.expectedSequence), body.action);
          return send(res, 200, view);
        }
      }
      return send(res, 404, { error: 'Nem található endpoint.' });
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const status = /túl nagy/i.test(message) ? 413 : /szoba|hely|megtelt|token|játékos|csatlakoz/i.test(message) ? 409 : 400;
      return send(res, status, { error: error instanceof Error ? error.message : 'Ismeretlen hiba.' });
    }
  });

  server.on('upgrade', (req, socket, head) => {
    if (new URL(req.url ?? '/', 'http://localhost').pathname !== '/ws') { socket.destroy(); return; }
    let session;
    const peer = acceptWebSocketUpgrade(req, socket, head, {
      onMessage: raw => { void handleMessage(peer, raw); },
      onClose: () => cleanupSession(peer.session),
      onError: () => cleanupSession(peer.session),
    });
    if (!peer) return;
    session = { peer, roomId: undefined, playerId: undefined, cleaned: false };
    peer.session = session;
    sessions.set(peer, session);
    // Give clients a bounded heartbeat without depending on external websocket packages.
    peer.pingTimer = setInterval(() => peer.ping(), 25000);
    peer.helloTimer = setTimeout(() => { if (!session.roomId) peer.close(1008, 'Hello timeout.'); }, 10_000);
  });

  const close = async () => {
    clearInterval(roomCleanupTimer);
    for (const session of sessions.values()) { try { clearInterval(session.peer.pingTimer); session.peer.close(1001, 'Szerver leáll.'); } catch {} }
    for (const unsub of roomUnsubscribers.values()) unsub();
    await lobby.close?.();
    if (server.listening) await new Promise(resolve => server.close(resolve));
  };
  return { server, lobby, close };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 8787);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const staticDir = path.resolve(process.env.TAROKK_STATIC_DIR ?? path.join(root, 'dist'));
  const app = createServer({ staticDir });
  await app.lobby.waitUntilReady();
  app.server.listen(port, process.env.HOST ?? '0.0.0.0', () => console.log(`Illusztrált Tarokk authority v${process.env.npm_package_version ?? '2.46'} listening on :${port}`));
}
