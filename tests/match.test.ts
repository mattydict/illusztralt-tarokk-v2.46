import test from 'node:test';
import assert from 'node:assert/strict';
import { activePlayerIds, completeDeal, createMatch, isMatchComplete } from '../src/engine/match.js';

test('4 játékosnál egy forduló 4 parti és minden játékos egyszer oszt', () => {
  let m = createMatch(['A','B','C','D'], 2, 0);
  assert.deepEqual(activePlayerIds(m), ['B','C','D','A']);

  m = completeDeal(m); // A osztott
  assert.equal(m.dealerIndex, 1);
  assert.equal(m.dealNumberInRound, 2);
  assert.equal(m.roundNumber, 1);
  assert.deepEqual(activePlayerIds(m), ['C','D','A','B']);

  m = completeDeal(m); // B
  m = completeDeal(m); // C
  m = completeDeal(m); // D -> első forduló kész
  assert.equal(m.completedRounds, 1);
  assert.equal(m.roundNumber, 2);
  assert.equal(m.dealNumberInRound, 1);
  assert.equal(m.dealerIndex, 0);
  assert.deepEqual(activePlayerIds(m), ['B','C','D','A']);

  m = completeDeal(m);
  m = completeDeal(m);
  m = completeDeal(m);
  m = completeDeal(m);
  assert.equal(m.completedDeals, 8);
  assert.equal(m.completedRounds, 2);
  assert.equal(isMatchComplete(m), true);
});

test('5 játékosnál az osztó kimarad, és a sorrend körbefordul', () => {
  let m0 = createMatch(['A','B','C','D','E'], 1, 4);
  assert.deepEqual(activePlayerIds(m0), ['A','B','C','D']);
  m0 = completeDeal(m0);
  assert.deepEqual(activePlayerIds(m0), ['B','C','D','E']);
});

test('5 játékosnál is a teljes osztókör zár le egy fordulót', () => {
  let m = createMatch(['A','B','C','D','E'], 1, 4);
  assert.deepEqual(activePlayerIds(m), ['A','B','C','D']);

  for (let i = 0; i < 5; i++) m = completeDeal(m);

  assert.equal(m.completedRounds, 1);
  assert.equal(m.completedDeals, 5);
  assert.equal(isMatchComplete(m), true);
});

test('érvénytelen fordulószámot elutasít', () => {
  assert.throws(() => createMatch(['A','B','C','D'], 0));
});
