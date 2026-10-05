import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { buildAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';

const card = (id: string) => createDeck().find(c => c.id === id)!;

function baseState() {
  const state = createInitialState(['A', 'B', 'C', 'D']);
  return {
    ...state,
    phase: 'play' as const,
    takerId: 'A',
    partnerId: 'B',
    calledTarokk: 19 as const,
    skartsByPlayer: {
      A: [card('T18'), card('hearts-10')],
      B: [card('T17')],
      C: [card('T16')],
      D: [card('T15')],
    },
  };
}

test('v2.04: taker skart tarokks are public before the first trick closes', () => {
  const snapshot = buildAIBeliefSnapshot(baseState(), 'C');
  assert.ok(snapshot.visibleTarokks.includes(18));
  assert.ok(!snapshot.visibleTarokks.includes(17));
  assert.ok(snapshot.visibleTarokks.includes(16)); // C saját skartja ismert számára
  assert.ok(!snapshot.visibleTarokks.includes(15));
});

test('v2.04: other players skart tarokks never become visible by the belief model', () => {
  const snapshot = buildAIBeliefSnapshot(baseState(), 'C');
  assert.equal(snapshot.visibleTarokks.includes(17), false);
  assert.equal(snapshot.visibleTarokks.includes(15), false);
});

test('v2.04: after the first trick closes, the taker skart reveal leaves the public belief pool', () => {
  const state = baseState();
  const closed = {
    ...state,
    completedTricks: [{
      leader: 'A',
      cards: [
        { player: 'A', card: card('T11') },
        { player: 'B', card: card('T12') },
        { player: 'C', card: card('T13') },
        { player: 'D', card: card('T14') },
      ],
      winner: 'B',
    }],
    trick: null,
  };
  const snapshot = buildAIBeliefSnapshot(closed, 'C');
  assert.equal(snapshot.visibleTarokks.includes(18), false);
});

test('v2.04: the taker always knows their own discarded tarokks', () => {
  const state = {
    ...baseState(),
    completedTricks: [{
      leader: 'A',
      cards: [
        { player: 'A', card: card('T11') },
        { player: 'B', card: card('T12') },
        { player: 'C', card: card('T13') },
        { player: 'D', card: card('T14') },
      ],
      winner: 'B',
    }],
    trick: null,
  };
  const snapshot = buildAIBeliefSnapshot(state, 'A');
  assert.ok(snapshot.visibleTarokks.includes(18));
});
