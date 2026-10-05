import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { evaluateDealPlan, dealPlanSuccessProbability } from '../src/engine/aiDealPlan.js';
import { estimateGameSuccessProbability } from '../src/engine/aiStake.js';
import { createInitialState } from '../src/engine/game.js';

const deck = createDeck();
const card = (id: string) => deck.find(c => c.id === id)!;

const baseHand = [card('T17'), card('T18'), card('hearts-Q'), card('hearts-J'), card('diamonds-10'), card('spades-10'), card('clubs-10'), card('diamonds-Q'), card('clubs-C')];

test('közös partiérték a három talonlap javítási lehetőségét beárazza', () => {
  const three = evaluateDealPlan({ hand: baseHand, contract: 'three', isTaker: true });
  const solo = evaluateDealPlan({ hand: baseHand, contract: 'solo', isTaker: true });
  assert.equal(three.talonCount, 3);
  assert.equal(solo.talonCount, 0);
  assert.ok(three.reasons.some(r => r.includes('3 talonlap')));
});

test('két nagyhonőr és hosszú tarokkos kéz magasabb sikeresélyt kap', () => {
  const weak = evaluateDealPlan({ hand: baseHand, contract: 'one', isTaker: true });
  const strongHand = [
    card('T22'), card('T21'), card('T20'), card('T19'), card('T18'), card('T17'),
    card('T16'), card('hearts-Q'), card('diamonds-Q'),
  ];
  const strong = evaluateDealPlan({ hand: strongHand, contract: 'one', isTaker: true });
  assert.ok(strong.successProbability > weak.successProbability);
  assert.ok(strong.totalExpectedValue > weak.totalExpectedValue);
});

test('az aiStake ugyanazt a közös success-modellt használja', () => {
  const state = { ...createInitialState(['A', 'B', 'C', 'D']), contract: 'two' as const };
  const expected = dealPlanSuccessProbability(baseHand, 'two');
  const observed = estimateGameSuccessProbability(state, baseHand);
  assert.equal(observed, expected);
});
