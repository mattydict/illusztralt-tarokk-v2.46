import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDeclarationDecision, evaluateCounterDecision } from '../src/engine/aiDecisionEvaluator.js';

test('communication does not make a hopeless declaration automatically good', () => {
  const hopeless = evaluateDeclarationDecision('centrum', { successProbability: 0.02, communicationValue: 2, nominalValue: 10 });
  const plausible = evaluateDeclarationDecision('centrum', { successProbability: 0.65, communicationValue: 0, nominalValue: 10 });
  assert.ok(plausible.score > hopeless.score);
});

test('a strong communication signal can justify moderate risk', () => {
  const silent = evaluateDeclarationDecision('fourKings', { successProbability: 0.55, communicationValue: 0, nominalValue: 2 });
  const signal = evaluateDeclarationDecision('fourKings', { successProbability: 0.45, communicationValue: 1.5, nominalValue: 2 });
  assert.ok(signal.score > silent.score);
});

test('counter value rises with realistic break probability', () => {
  const weak = evaluateCounterDecision(10, 0.15);
  const strong = evaluateCounterDecision(10, 0.75);
  assert.ok(strong.score > weak.score);
});
