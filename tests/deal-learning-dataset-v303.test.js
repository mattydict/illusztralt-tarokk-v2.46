import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDealLearningDataset } from '../src/engine/dealLearningDataset.js';

const t = (rank, id = `T${rank}`) => ({ id, kind: 'tarokk', rank, points: [1, 21, 22].includes(rank) ? 5 : 1 });
const c = (suit, rank, id = `${suit}-${rank}`) => ({ id, kind: 'suit', suit, rank, points: rank === 'K' ? 5 : rank === 'Q' ? 4 : 1 });

function sampleDeal() {
  return {
    roomId: 'LEARN1', dealNumber: 1, completedAt: 123,
    review: {
      dealNumber: 1, contract: 'two', takerId: 'A', partnerId: 'B', defenceIds: ['C', 'D'], calledTarokk: 20,
      auction: [
        { order: 1, playerId: 'A', action: { type: 'bid', contract: 'three' } },
        { order: 2, playerId: 'B', action: { type: 'bid', contract: 'two' } },
      ],
      players: [
        { playerId: 'A', dealtHand: [t(22), t(20), c('hearts', 'K')], receivedTalon: [t(19)], skart: [c('hearts', 'K')] },
        { playerId: 'B', dealtHand: [t(21), t(18), c('hearts', 'Q')], receivedTalon: [], skart: [] },
        { playerId: 'C', dealtHand: [t(17), t(16), c('clubs', 'K')], receivedTalon: [], skart: [] },
        { playerId: 'D', dealtHand: [t(15), t(14), c('spades', 'K')], receivedTalon: [], skart: [] },
      ],
      declarations: [{ order: 1, type: 'pagatUltimo', ownerId: 'A', status: 'fulfilled', contra: 'none' }],
      tricks: [{ number: 1, leader: 'A', winner: 'A', cards: [
        { player: 'A', card: t(22) }, { player: 'B', card: t(21) }, { player: 'C', card: t(17) }, { player: 'D', card: t(15) },
      ] }],
      finalPoints: { result: 'taker', takerPair: 12, defencePair: -12 },
      settlement: { result: 'taker' },
    },
  };
}

test('v3.03 learning dataset builds auction, skart, partner-call, declaration and play examples', () => {
  const result = buildDealLearningDataset([sampleDeal()]);
  assert.equal(result.stats.dealCount, 1);
  assert.equal(result.stats.skippedDealCount, 0);
  for (const kind of ['auction', 'skart', 'partner-call', 'declaration', 'play-card']) assert.ok(result.stats.byKind[kind] > 0, kind);
  assert.equal(result.stats.exampleCount, result.examples.length);
});

test('v3.03 a decision example never includes an opponent hand or future cards in its features', () => {
  const result = buildDealLearningDataset([sampleDeal()]);
  const firstAuction = result.examples.find(x => x.kind === 'auction' && x.actorId === 'A');
  assert.deepEqual(firstAuction.features.priorAuction, []);
  assert.ok(firstAuction.features.hand.some(card => card.id === 'T22'));
  assert.equal(JSON.stringify(firstAuction.features).includes('T21'), false, 'other player hand must stay hidden');

  const firstPlay = result.examples.find(x => x.kind === 'play-card' && x.actorId === 'A');
  assert.deepEqual(firstPlay.features.hand.map(card => card.id).sort(), ['T19', 'T20', 'T22'].sort());
  assert.equal(firstPlay.features.hand.some(card => card.id === 'T21'), false);
  assert.deepEqual(firstPlay.features.currentTrick, []);
  assert.equal(firstPlay.label.cardId, 'T22');
  assert.equal(firstPlay.outcome.trickWinner, 'A');
  assert.equal(JSON.stringify(firstPlay.features).includes('declarationStatus'), false);
  assert.equal('partnerId' in firstPlay.features, false, 'hidden partner identity must not enter play features');
  const declaration = result.examples.find(x => x.kind === 'declaration');
  assert.equal('partnerId' in declaration.features, false, 'hidden partner identity must not enter declaration features');
  const skartActors = new Set(result.examples.filter(x => x.kind === 'skart').map(x => x.actorId));
  assert.deepEqual([...skartActors], ['A'], 'only the taker makes a skart decision');
});

test('v3.03 declaration outcome is a label, never part of the decision features', () => {
  const result = buildDealLearningDataset([sampleDeal()]);
  const declaration = result.examples.find(x => x.kind === 'declaration');
  assert.equal(declaration.label.declaration, 'pagatUltimo');
  assert.equal(declaration.outcome.declarationStatus, 'fulfilled');
  assert.equal(JSON.stringify(declaration.features).includes('fulfilled'), false);
});

test('v3.03 malformed archive entries are skipped without crashing the full export', () => {
  const result = buildDealLearningDataset([null, {}, sampleDeal()]);
  assert.equal(result.stats.dealCount, 3);
  assert.ok(result.stats.skippedDealCount >= 2);
  assert.ok(result.examples.length > 0);
});

test('v3.03 learning export endpoint requires a room token and streams NDJSON decision examples', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { JsonRoomStore } = await import('../server/persistence.mjs');
  const { LobbyService } = await import('../server/lobby.mjs');
  const { createServer } = await import('../server/main.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tarokk-learn-export-'));
  const lobby = new LobbyService({ store: new JsonRoomStore({ dir }), clock: () => 1234 });
  const created = lobby.create({ displayName: 'Adatgazda' });
  const meta = lobby.get(created.roomId);
  const review = sampleDeal().review;
  review.dealNumber = 1;
  lobby.persistMeta(meta, { ...meta.room.exportPersistedState(), lastDealReview: review });
  const app = createServer({ lobby, staticDir: path.join(dir, 'no-static-files'), maxRequestsPerMinute: 10000 });
  try {
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = `http://127.0.0.1:${app.server.address().port}`;
    const noAuth = await fetch(`${base}/archives/${created.roomId}/learning-export`);
    assert.equal(noAuth.status, 403);
    const query = new URLSearchParams({ playerId: created.playerId, token: created.token });
    const response = await fetch(`${base}/archives/${created.roomId}/learning-export?${query}`);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') || '', /application\/x-ndjson/);
    assert.match(response.headers.get('content-disposition') || '', /learning-v1\.jsonl/);
    const body = await response.text();
    const rows = body.trim().split('\n').map(line => JSON.parse(line));
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.schemaVersion === 1 && row.features && row.label));
    assert.equal(body.includes('tokenHashes'), false);
  } finally {
    await app.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
