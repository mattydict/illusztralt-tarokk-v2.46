import test from 'node:test';
import assert from 'node:assert/strict';
import { simulateAICompleteDeal } from '../src/engine/aiRoundSimulation.js';

function rng(seed0: number) {
  let x = seed0 >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

test('v2.35 AI-only round runs from auction to settlement', () => {
  const result = simulateAICompleteDeal(['A', 'B', 'C', 'D'], 0, rng(235001));
  assert.ok(result.auctionActions.length >= 1);
  assert.ok(result.declarationActions.length >= 1);
  assert.equal(result.playMoves.length, 36);
  assert.equal(result.finalGame.completedTricks.length, 9);
  assert.equal(result.finalGame.phase, 'scoring');
  assert.ok(result.finalGame.settlement);
});

test('v2.35 AI-only round is deterministic for the same seed', () => {
  const a = simulateAICompleteDeal(['A', 'B', 'C', 'D'], 0, rng(235002));
  const b = simulateAICompleteDeal(['A', 'B', 'C', 'D'], 0, rng(235002));
  assert.deepEqual(a.auctionActions, b.auctionActions);
  assert.deepEqual(a.skartActions, b.skartActions);
  assert.deepEqual(a.partnerCall, b.partnerCall);
  assert.deepEqual(a.declarationActions, b.declarationActions);
  assert.deepEqual(a.playMoves, b.playMoves);
  assert.deepEqual(a.finalGame.finalPoints, b.finalGame.finalPoints);
  assert.deepEqual(a.finalGame.settlement, b.finalGame.settlement);
});
