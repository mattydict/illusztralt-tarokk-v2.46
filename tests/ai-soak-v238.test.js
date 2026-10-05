import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAICompleteDeals, benchmarkAISoak } from '../src/engine/aiQualityBenchmark.js';

test('v2.38 soak API exposes strategic quality metrics on full AI deals', () => {
  const result = benchmarkAICompleteDeals(2, 238201);
  assert.equal(result.completedDeals, 2);
  assert.equal(result.failedDeals, 0);
  assert.equal(result.metrics.totalPlayMoves, 72);
  assert.equal(result.metrics.totalTricks, 18);
  assert.ok(result.metrics.overcontrolRate >= 0 && result.metrics.overcontrolRate <= 1);
  assert.ok(result.metrics.partnerTransferRate >= 0 && result.metrics.partnerTransferRate <= 1);
  assert.ok(result.metrics.policyMismatchRate >= 0 && result.metrics.policyMismatchRate <= 1);
  assert.ok(result.metrics.declarationSuccessRate >= 0 && result.metrics.declarationSuccessRate <= 1);
});

test('v2.38 soak benchmark keeps the 100-1000 deal safety bounds', () => {
  assert.throws(() => benchmarkAISoak(99, 238202));
  assert.throws(() => benchmarkAISoak(1001, 238202));
});
