/**
 * Neon PostgreSQL-backed room store.
 * Loaded lazily so local development keeps working without DATABASE_URL or the
 * Neon package installed until the PostgreSQL store is actually selected.
 */
export class PostgresRoomStore {
  constructor({ databaseUrl = process.env.DATABASE_URL, schema = 'public' } = {}) {
    if (!databaseUrl) throw new Error('DATABASE_URL nincs beállítva a PostgreSQL persistence használatához.');
    this.databaseUrl = databaseUrl;
    this.schema = schema;
    this.isAsync = true;
    this.kind = 'postgres';
    this.sql = null;
    this.ready = null;
  }

  async client() {
    if (this.sql) return this.sql;
    const { neon } = await import('@neondatabase/serverless');
    this.sql = neon(this.databaseUrl);
    return this.sql;
  }

  async ensureSchema() {
    if (this.ready) return this.ready;
    this.ready = (async () => {
      const sql = await this.client();
      await sql`
        CREATE TABLE IF NOT EXISTS tarokk_rooms (
          room_id TEXT PRIMARY KEY,
          schema_version INTEGER NOT NULL,
          dealer_index INTEGER NOT NULL,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL,
          seats JSONB NOT NULL,
          token_hashes JSONB NOT NULL,
          room_state JSONB NOT NULL
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS tarokk_rooms_updated_at_idx ON tarokk_rooms (updated_at)`;
    })();
    return this.ready;
  }

  async save(record) {
    await this.ensureSchema();
    const sql = await this.client();
    await sql`
      INSERT INTO tarokk_rooms
        (room_id, schema_version, dealer_index, created_at, updated_at, seats, token_hashes, room_state)
      VALUES
        (${record.roomId}, ${record.schemaVersion}, ${record.dealerIndex}, ${record.createdAt}, ${record.updatedAt},
         CAST(${JSON.stringify(record.seats)} AS jsonb), CAST(${JSON.stringify(record.tokenHashes)} AS jsonb), CAST(${JSON.stringify(record.roomState)} AS jsonb))
      ON CONFLICT (room_id) DO UPDATE SET
        schema_version = EXCLUDED.schema_version,
        dealer_index = EXCLUDED.dealer_index,
        updated_at = EXCLUDED.updated_at,
        seats = EXCLUDED.seats,
        token_hashes = EXCLUDED.token_hashes,
        room_state = EXCLUDED.room_state
    `;
  }

  async loadAll() {
    await this.ensureSchema();
    const sql = await this.client();
    const rows = await sql`
      SELECT room_id, schema_version, dealer_index, created_at, updated_at, seats, token_hashes, room_state
      FROM tarokk_rooms
      ORDER BY created_at ASC
    `;
    return rows.map(row => ({
      roomId: row.room_id,
      schemaVersion: Number(row.schema_version),
      dealerIndex: Number(row.dealer_index),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      seats: row.seats,
      tokenHashes: row.token_hashes,
      roomState: row.room_state,
    }));
  }

  async remove(roomId) {
    await this.ensureSchema();
    const sql = await this.client();
    await sql`DELETE FROM tarokk_rooms WHERE room_id = ${String(roomId).toUpperCase()}`;
  }

  async health() {
    try {
      await this.ensureSchema();
      const sql = await this.client();
      await sql`SELECT 1 AS ok`;
      return true;
    } catch {
      return false;
    }
  }
}
