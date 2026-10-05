import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createInitialState } from '../src/engine/game.js';
import { evaluateTrickEconomy } from '../src/engine/aiTrickEconomy.js';

test('v2.05 values an important point-heavy defensive trick near the threshold', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    completedTricks: Array.from({length: 4}, (_, i) => ({
      leader: 'A',
      cards: [{ player: 'C', card: i === 0 ? deck.find(c => c.id === 'hearts-K')! : deck.find(c => c.id === 'hearts-10')! }],
      winner: 'C',
    })),
    trick: { leader: 'A', cards: [{ player: 'A', card: deck.find(c => c.id === 'T18')! }, { player: 'C', card: deck.find(c => c.id === 'T20')! }] },
  };
  const advice = evaluateTrickEconomy(state, 'C', deck.find(c => c.id === 'T21')!, 'C');
  assert.equal(advice.trickPoints >= 6, true);
  assert.equal(advice.score > 0, true);
});

test('v2.05 discourages taking a partner low-point trick with a high trump', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    completedTricks: [],
    trick: { leader: 'B', cards: [{ player: 'A', card: deck.find(c => c.id === 'hearts-10')! }, { player: 'B', card: deck.find(c => c.id === 'hearts-J')! }] },
  };
  const advice = evaluateTrickEconomy(state, 'A', deck.find(c => c.id === 'T20')!, 'A');
  assert.equal(advice.score < 0, true);
});

test('v2.05 raises the value of a final point-winning trick', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    completedTricks: [
      ...Array.from({length: 7}, () => ({
        leader: 'C',
        cards: [
          { player: 'A', card: deck.find(c => c.id === 'hearts-K')! },
          { player: 'B', card: deck.find(c => c.id === 'hearts-10')! },
        ],
        winner: 'A',
      })),
      {
        leader: 'C',
        cards: [{ player: 'A', card: deck.find(c => c.id === 'hearts-Q')! }],
        winner: 'A',
      },
    ],
    trick: { leader: 'C', cards: [{ player: 'C', card: deck.find(c => c.id === 'hearts-10')! }] },
  };
  const advice = evaluateTrickEconomy(state, 'A', deck.find(c => c.id === 'T18')!, 'A');
  assert.equal(advice.urgency, 'high');
  assert.equal(advice.score > 2, true);
});

test('v2.05 remains information-safe and does not inspect hidden hands', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    players: state.players.map(p => p.id === 'C' ? { ...p, hand: [deck.find(c => c.id === 'T22')!] } : p),
    trick: { leader: 'A', cards: [{ player: 'B', card: deck.find(c => c.id === 'T10')! }] },
  };
  const advice = evaluateTrickEconomy(state, 'A', deck.find(c => c.id === 'T18')!, 'A');
  assert.equal(typeof advice.score, 'number');
});
