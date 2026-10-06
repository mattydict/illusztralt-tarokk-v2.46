import { createHash, randomBytes } from 'node:crypto';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';
import { JsonRoomStore } from './persistence.mjs';
import { PostgresRoomStore } from './postgresPersistence.mjs';

const SEAT_IDS = ['P1', 'P2', 'P3', 'P4'];

function defaultStore() {
  return process.env.DATABASE_URL ? new PostgresRoomStore() : new JsonRoomStore();
}
const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function normalizeMatchRounds(value) { const n = Number(value); return [1, 2, 4].includes(n) ? n : 4; }

function makeCode(length = 6) {
  const bytes = randomBytes(length);
  return Array.from(bytes, b => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}

function cleanName(value, fallback) {
  const name = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, 28) : '';
  return name || fallback;
}

function makeToken() { return randomBytes(32).toString('base64url'); }
function hashToken(token) { return createHash('sha256').update(String(token)).digest('hex'); }

export class LobbyService {
  constructor({ store = defaultStore(), clock = () => Date.now(), maxRooms = 1000 } = {}) {
    this.rooms = new Map();
    this.maxRooms = maxRooms;
    this.store = store;
    this.clock = clock;
    this.asyncStore = this.store?.isAsync === true;
    const loaded = this.store.loadAll();
    if (loaded && typeof loaded.then === 'function') {
      this.ready = loaded.then(records => this.restore(records));
    } else {
      this.restore(loaded);
      this.ready = Promise.resolve();
    }
  }

  async waitUntilReady() { await this.ready; }

  restore(records) {
    for (const record of records) {
      try {
        const rawTokens = Object.fromEntries(Object.entries(record.tokenHashes ?? {}).map(([id, hash]) => [id, null]));
        const meta = {
          room: createAuthoritativeRoom({ roomId: record.roomId, playerIds: SEAT_IDS, dealerIndex: record.dealerIndex ?? 0, matchRounds: record.roomState?.matchRounds ?? 4, persisted: record.roomState, onCommit: state => this.persistMeta(meta, state) }),
          tokens: rawTokens,
          tokenHashes: { ...record.tokenHashes },
          seats: record.seats,
          createdAt: record.createdAt ?? this.clock(),
          updatedAt: record.updatedAt ?? record.createdAt ?? this.clock(),
        };
        this.rooms.set(record.roomId, meta);
      } catch {
        // Ignore incompatible/corrupt room records rather than preventing server startup.
      }
    }
  }

  createInternal({ displayName, matchRounds = 4 } = {}) {
    if (this.rooms.size >= this.maxRooms) throw new Error('A szerver elérte az aktív szobák maximális számát.');
    let roomId;
    do roomId = makeCode(); while (this.rooms.has(roomId));
    const metaRef = { current: null };
    const room = createAuthoritativeRoom({ roomId, playerIds: SEAT_IDS, dealerIndex: 0, matchRounds: normalizeMatchRounds(matchRounds), onCommit: state => this.persistMeta(metaRef.current, state) });
    for (const id of SEAT_IDS.slice(1)) room.disconnect(id);
    const tokens = Object.fromEntries(SEAT_IDS.map(id => [id, makeToken()]));
    const tokenHashes = Object.fromEntries(SEAT_IDS.map(id => [id, hashToken(tokens[id])]));
    const meta = {
      room,
      tokens,
      seats: Object.fromEntries(SEAT_IDS.map((id, index) => [id, {
        playerId: id,
        displayName: index === 0 ? cleanName(displayName, 'Játékos 1') : `Játékos ${index + 1}`,
        joined: index === 0,
      }])),
      createdAt: this.clock(),
      updatedAt: this.clock(),
      tokenHashes,
    };
    metaRef.current = meta;
    this.rooms.set(roomId, meta);
    return { meta, credentials: this.credentials(meta, 'P1', tokens.P1) };
  }

  create({ displayName, matchRounds = 4 } = {}) {
    if (this.asyncStore) throw new Error('Ez a szerver aszinkron persistence-t használ; használd a createAsync() metódust.');
    const { meta, credentials } = this.createInternal({ displayName, matchRounds });
    this.persistMeta(meta, meta.room.exportPersistedState());
    return credentials;
  }

  async createAsync({ displayName, matchRounds = 4 } = {}) {
    await this.waitUntilReady();
    const { meta, credentials } = this.createInternal({ displayName, matchRounds });
    await this.persistMetaAsync(meta, meta.room.exportPersistedState());
    return credentials;
  }

  joinInternal(roomId, { displayName, playerId, token } = {}) {
    const meta = this.get(roomId);
    let seat;
    if (playerId && meta.seats[playerId]?.joined) {
      if (!this.verifyToken(meta, playerId, token)) throw new Error('Érvénytelen visszacsatlakozási token.');
      seat = playerId;
    } else if (playerId && meta.seats[playerId] && !meta.seats[playerId].joined) {
      if (token) throw new Error('A hely még nincs lefoglalva; token nélkül csatlakozz.');
      seat = playerId;
    } else {
      seat = SEAT_IDS.find(id => !meta.seats[id].joined);
    }
    if (!seat) throw new Error('A szoba megtelt.');
    let presentedToken = token;
    if (!meta.seats[seat].joined) {
      meta.seats[seat].joined = true;
      meta.seats[seat].displayName = cleanName(displayName, meta.seats[seat].displayName);
      presentedToken = makeToken();
      meta.tokens[seat] = presentedToken;
      meta.tokenHashes[seat] = hashToken(presentedToken);
      // HTTP join reserves the seat but does not count as a live realtime connection.
      // The WebSocket hello is the single source of truth for connected presence.
    } else {
      // A reconnecting/resuming player is marked connected only after WebSocket hello.
      if (displayName) meta.seats[seat].displayName = cleanName(displayName, meta.seats[seat].displayName);
    }
    meta.updatedAt = this.clock();
    return { meta, credentials: this.credentials(meta, seat, presentedToken) };
  }

  join(roomId, options = {}) {
    if (this.asyncStore) throw new Error('Ez a szerver aszinkron persistence-t használ; használd a joinAsync() metódust.');
    const { meta, credentials } = this.joinInternal(roomId, options);
    this.persistMeta(meta);
    return credentials;
  }

  async joinAsync(roomId, options = {}) {
    await this.waitUntilReady();
    const { meta, credentials } = this.joinInternal(roomId, options);
    await this.persistMetaAsync(meta);
    return credentials;
  }

  authenticate(roomId, playerId, token) {
    const meta = this.get(roomId);
    if (!meta.seats[playerId]?.joined || !this.verifyToken(meta, playerId, token)) throw new Error('Érvénytelen szoba- vagy játékostoken.');
    return meta;
  }

  verifyToken(meta, playerId, token) {
    if (typeof token !== 'string' || token.length < 20) return false;
    const expected = meta.tokenHashes?.[playerId];
    return typeof expected === 'string' && hashToken(token) === expected;
  }

  persistMeta(meta, roomState) {
    if (!meta) return;
    const record = { schemaVersion: 1, roomId: meta.room.roomId, dealerIndex: meta.room.dealerIndex, createdAt: meta.createdAt, updatedAt: this.clock(), seats: meta.seats, tokenHashes: meta.tokenHashes, roomState: roomState ?? meta.room.exportPersistedState() };
    meta.updatedAt = record.updatedAt;
    return this.store.save(record);
  }

  async persistMetaAsync(meta, roomState) {
    await Promise.resolve(this.persistMeta(meta, roomState));
  }

  pruneInactive(maxAgeMs = 24 * 60 * 60 * 1000) {
    const now = this.clock();
    let removed = 0;
    for (const [roomId, meta] of this.rooms) {
      if (now - (meta.updatedAt ?? meta.createdAt) < maxAgeMs) continue;
      if (meta.room.isReady()) continue;
      if (SEAT_IDS.some(id => meta.room.isConnected(id))) continue;
      this.rooms.delete(roomId);
      try { this.store.remove(roomId); } catch { /* best effort cleanup */ }
      removed += 1;
    }
    return removed;
  }

  status(roomId) {
    const meta = this.get(roomId);
    return {
      roomId,
      ready: meta.room.isReady(),
      seats: SEAT_IDS.map(id => ({
        playerId: id,
        displayName: meta.seats[id].displayName,
        joined: meta.seats[id].joined,
        connected: meta.room.isConnected(id),
      })),
      connectedCount: SEAT_IDS.filter(id => meta.room.isConnected(id)).length,
      joinedCount: SEAT_IDS.filter(id => meta.seats[id].joined).length,
      matchRounds: Number(meta.room.matchRounds ?? 4),
    };
  }

  room(roomId) { return this.get(roomId).room; }

  credentials(meta, playerId, presentedToken) {
    const status = this.status(meta.room.roomId);
    return { roomId: meta.room.roomId, playerId, token: presentedToken ?? meta.tokens[playerId], status, snapshot: meta.room.snapshotFor(playerId) };
  }

  async close() { await this.store.close?.(); }

  get(roomId) {
    const meta = this.rooms.get(String(roomId).toUpperCase());
    if (!meta) throw new Error('A szoba nem található.');
    return meta;
  }
}
