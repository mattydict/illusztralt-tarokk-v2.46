import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAIExpertCalibration, benchmarkAIAdvisoryScenarios } from '../src/engine/aiExpertBenchmark.js';

test('v2.41 release calibration remains green', () => {
  const result = benchmarkAIExpertCalibration();
  assert.equal(result.total, 13);
  assert.equal(result.legalPassRate, 1);
  assert.equal(result.strategicPassRate, 1);
  assert.equal(result.goldPassRate, 1);
  assert.equal(result.forbiddenHits, 0);
});

test('v2.41 rare/silent figure advisory scenarios are legal and strategically acceptable', () => {
  const result = benchmarkAIAdvisoryScenarios();
  assert.equal(result.total, 4);
  assert.equal(result.legalPassRate, 1);
  assert.equal(result.strategicPassRate, 1);
  assert.equal(result.forbiddenHits, 0);
});
