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

  remove(roomId) {
    try { this.fs.unlinkSync(this.fileFor(roomId)); } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}
