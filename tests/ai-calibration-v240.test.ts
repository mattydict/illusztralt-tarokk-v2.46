import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAIExpertCalibration } from '../src/engine/aiExpertBenchmark.js';
import { calibrateExpertBenchmark } from '../src/engine/aiCalibration.js';
import { benchmarkAIExpertScenarios } from '../src/engine/aiExpertBenchmark.js';

test('v2.41 calibration produces weighted expert score and category diagnostics', () => {
  const result = benchmarkAIExpertCalibration();
  assert.equal(result.legalPassRate, 1);
  assert.equal(result.forbiddenHits, 0);
  assert.ok(result.weightedExpertScore >= 0.9);
  assert.equal(result.weakCategories.length, 0);
  assert.equal(result.reasonCoverageRate, 1);
  assert.ok(result.categoryScores.length >= 8);
});

test('v2.41 calibration remains backwards compatible with the v2.37 benchmark shape', () => {
  const base = benchmarkAIExpertScenarios();
  const result = calibrateExpertBenchmark(base);
  assert.equal(result.total, base.total);
  assert.equal(result.goldPasses, base.goldPasses);
  assert.equal(result.strategicPasses, base.strategicPasses);
});
