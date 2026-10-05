import { performance } from 'node:perf_hooks';
import { createServer } from '../server/main.mjs';

const count = Math.max(1, Number(process.argv[2] ?? 50));
const app = createServer({ maxRooms: count + 10, maxRequestsPerMinute: 100000 });
await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
const port = app.server.address().port;
const base = `http://127.0.0.1:${port}`;
async function json(path, options = {}) {
  const res = await fetch(base + path, { ...options, headers: { 'content-type': 'application/json', ...(options.headers ?? {}) } });
  const body = await res.json();
  if (!res.ok) throw new Error(`${res.status}: ${JSON.stringify(body)}`);
  return body;
}
const started = performance.now();
const rooms = [];
for (let i = 0; i < count; i++) {
  const host = await json('/lobby/rooms', { method: 'POST', body: JSON.stringify({ displayName: `Load-${i}-A` }) });
  rooms.push(host);
}
await Promise.all(rooms.map(async room => {
  await json(`/lobby/rooms/${room.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: 'B' }) });
  await json(`/lobby/rooms/${room.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: 'C' }) });
  await json(`/lobby/rooms/${room.roomId}/join`, { method: 'POST', body: JSON.stringify({ displayName: 'D' }) });
}));
const statuses = await Promise.all(rooms.map(r => json(`/lobby/rooms/${r.roomId}`)));
const elapsed = performance.now() - started;
if (statuses.some(s => s.joinedCount !== 4 || !s.ready || s.connectedCount !== 4)) throw new Error('Load test room readiness mismatch.');
console.log(JSON.stringify({ rooms: count, httpOperations: count * 4 + count, elapsedMs: Math.round(elapsed), opsPerSec: Number(((count * 4 + count) / (elapsed / 1000)).toFixed(1)), readyRooms: statuses.filter(s => s.ready).length }, null, 2));
await app.close();
