import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluatePlayDecision } from '../src/engine/aiDecisionEvaluator.js';
test('play evaluator rewards partner communication without overpowering tactics', () => {
    const neutral = evaluatePlayDecision({ immediateTrickValue: 5 });
    const supportive = evaluatePlayDecision({ immediateTrickValue: 5, communicationValue: 1 });
    const stronglyConflicting = evaluatePlayDecision({ immediateTrickValue: 5, communicationValue: -1 });
    assert.ok(supportive.score > neutral.score);
    assert.ok(stronglyConflicting.score < neutral.score);
    assert.ok(supportive.score - neutral.score < 1);
});
