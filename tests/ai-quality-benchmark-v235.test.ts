import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAICompleteDeals } from '../src/engine/aiQualityBenchmark.js';

test('v2.35 AI quality gate completes a deterministic sample of full deals', () => {
  const result = benchmarkAICompleteDeals(2, 235100);
  assert.equal(result.seeds.length, 2);
  assert.equal(result.failedDeals, 0);
  assert.equal(result.completedDeals, 2);
  assert.equal(result.averageAuctionActions > 0, true);
  assert.equal(result.averageDeclarationActions > 0, true);
  assert.equal(result.averagePlayMoves, 36);
  assert.equal(result.takerWinRate >= 0 && result.takerWinRate <= 1, true);
});
