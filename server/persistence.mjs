import fs from 'node:fs';
import path from 'node:path';

export class JsonRoomStore {
  constructor({ dir = path.resolve(process.env.TAROKK_DATA_DIR ?? '.data/rooms'), fsModule = fs } = {}) {
    this.dir = dir;
    this.fs = fsModule;
    this.isAsync = false;
    this.kind = 'json';
    this.ensureDir();
  }

  ensureDir() { this.fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 }); }

  fileFor(roomId) { return path.join(this.dir, `${String(roomId).toUpperCase()}.json`); }
  archiveDir() { return path.join(this.dir, 'archive'); }
  archiveFileFor(roomId, dealNumber) { return path.join(this.archiveDir(), `${String(roomId).toUpperCase()}-${String(Number(dealNumber)).padStart(6, '0')}.json`); }

  save(record) {
    this.ensureDir();
    const file = this.fileFor(record.roomId);
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(record, null, 2);
    this.fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    this.fs.renameSync(tmp, file);
    try { this.fs.chmodSync(file, 0o600); } catch { /* best effort on non-POSIX filesystems */ }
  }

  loadAll() {
    this.ensureDir();
    const out = [];
    for (const name of this.fs.readdirSync(this.dir)) {
      if (!name.endsWith('.json')) continue;
      const file = path.join(this.dir, name);
      try {
        const raw = this.fs.readFileSync(file, 'utf8');
        const value = JSON.parse(raw);
        if (value?.schemaVersion === 1 && typeof value.roomId === 'string') out.push(value);
      } catch {
        // Corrupt or partial files are ignored at startup; they are never served as rooms.
      }
    }
    return out;
  }

  saveDeal({ roomId, dealNumber, completedAt = Date.now(), review, tokenHashes = {} }) {
    if (!roomId || !Number.isInteger(Number(dealNumber)) || !review) return;
    this.fs.mkdirSync(this.archiveDir(), { recursive: true, mode: 0o700 });
    const file = this.archiveFileFor(roomId, dealNumber);
    if (this.fs.existsSync(file)) return; // completed deal records are immutable and idempotent
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify({ schemaVersion: 1, roomId: String(roomId).toUpperCase(), dealNumber: Number(dealNumber), completedAt: Number(completedAt), tokenHashes, review }, null, 2);
    this.fs.writeFileSync(tmp, payload, { encoding: 'utf8', mode: 0o600 });
    this.fs.renameSync(tmp, file);
    try { this.fs.chmodSync(file, 0o600); } catch { /* best effort on non-POSIX filesystems */ }
  }

  listDeals({ roomId, limit = 5000 } = {}) {
    const dir = this.archiveDir();
    if (!this.fs.existsSync(dir)) return [];
    const wantedRoom = roomId ? String(roomId).toUpperCase() : undefined;
    const deals = [];
    for (const name of this.fs.readdirSync(dir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const record = JSON.parse(this.fs.readFileSync(path.join(dir, name), 'utf8'));
        if (record?.schemaVersion !== 1 || !record.review) continue;
        if (wantedRoom && record.roomId !== wantedRoom) continue;
        deals.push(record);
      } catch { /* ignore incomplete archive files */ }
    }
    return deals.sort((a, b) => Number(b.completedAt) - Number(a.completedAt)).slice(0, Math.max(1, Number(limit) || 5000));
  }

  remove(roomId) {
    try { this.fs.unlinkSync(this.fileFor(roomId)); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    // Intentionally do not remove the independent completed-deal archive.
  }
}
