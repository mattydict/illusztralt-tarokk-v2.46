import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateStakeEscalation, stakeNominalValue } from '../src/engine/aiStake.js';

test('a higher contra level prices the marginal stake, not the whole stake', () => {
  const e = evaluateStakeEscalation({ target: 'game', contract: 'solo', currentLevel: 'kontra', successProbability: 0.75 });
  assert.ok(e);
  assert.equal(e.nominalValue, 4);
  assert.equal(e.currentMultiplier, 2);
  assert.equal(e.nextMultiplier, 4);
  assert.equal(e.marginalStake, 8);
  assert.equal(e.expectedMarginalValue, 4);
});

test('a counter below the 50% success threshold has negative marginal value', () => {
  const e = evaluateStakeEscalation({ target: 'centrum', currentLevel: 'none', successProbability: 0.30 });
  assert.ok(e);
  assert.ok(e.expectedMarginalValue < 0);
  assert.equal(e.attractive, false);
});

test('high-value figures create larger marginal exposure', () => {
  assert.ok(stakeNominalValue('kingUhu') > stakeNominalValue('fourKings'));
});

test('mordkontra has no further escalation', () => {
  const e = evaluateStakeEscalation({ target: 'game', contract: 'three', currentLevel: 'mordkontra', successProbability: 1 });
  assert.equal(e, undefined);
});

test('a 50% estimate is neutral before communication/position bonuses', () => {
  const e = evaluateStakeEscalation({ target: 'game', contract: 'two', currentLevel: 'none', successProbability: 0.5 });
  assert.ok(e);
  assert.equal(e.expectedMarginalValue, 0);
});
