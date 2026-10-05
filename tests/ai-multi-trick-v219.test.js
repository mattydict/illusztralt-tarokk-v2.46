import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMultiTrickPlan } from '../src/engine/aiMultiTrickPlanner.js';

function baseState() {
  return {
    phase: 'play',
    players: [
      { id: 'A', active: true, hand: [{ id: 'T22', kind: 'tarokk', rank: 22, points: 5 }, { id: 'T21', kind: 'tarokk', rank: 21, points: 5 }] },
      { id: 'B', active: true, hand: [] },
      { id: 'C', active: true, hand: [] },
      { id: 'D', active: true, hand: [] },
    ],
    completedTricks: [],
    nextPlayerIndex: 0,
    startingPlayerId: 'A',
    trick: { leader: 'A', cards: [] },
    declarations: { declarations: [] },
    lockedCards: [],
  };
}

test('v2.19 multi-trick planner has a bounded three-trick horizon', () => {
  const result = evaluateMultiTrickPlan(baseState(), 'A', { hypotheses: [{ weight: 1, ownership: {} }], partnerId: 'C' }, { id: 'T22', kind: 'tarokk', rank: 22, points: 5 }, 2, 2);
  assert.equal(result?.horizon, 3);
  assert.ok((result?.score ?? 99) <= 8);
  assert.ok((result?.score ?? -99) >= -8);
});

test('v2.19 planner exposes the short-vs-extended continuation', () => {
  const result = evaluateMultiTrickPlan(baseState(), 'A', { hypotheses: [{ weight: 1, ownership: {} }], partnerId: 'C' }, { id: 'T21', kind: 'tarokk', rank: 21, points: 5 }, 2, 2);
  assert.ok(result);
  assert.equal(result.shortHorizon.horizon, 2);
  assert.equal(result.extendedHorizon.horizon, 3);
  assert.ok(Array.isArray(result.reasons));
});
