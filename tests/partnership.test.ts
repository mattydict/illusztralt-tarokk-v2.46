import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { resolveCalledPartner } from '../src/engine/partnership.js';

test('called tarokk resolves to its unique holder', () => {
  const deck = createDeck();
  const t18 = deck.find(c => c.id === 'T18')!;
  const players = [
    { id: 'A', hand: [] },
    { id: 'B', hand: [t18] },
    { id: 'C', hand: [] },
    { id: 'D', hand: [] },
  ];
  assert.equal(resolveCalledPartner('A', 18, players), 'B');
});

test('X X self-call resolves to the taker', () => {
  const deck = createDeck();
  const t20 = deck.find(c => c.id === 'T20')!;
  const players = [
    { id: 'A', hand: [t20] },
    { id: 'B', hand: [] },
    { id: 'C', hand: [] },
    { id: 'D', hand: [] },
  ];
  assert.equal(resolveCalledPartner('A', 20, players), 'A');
});

test('called tarokk does not resolve to the taker for XIX', () => {
  const deck = createDeck();
  const t18 = deck.find(c => c.id === 'T18')!;
  const players = [
    { id: 'A', hand: [t18] },
    { id: 'B', hand: [] },
    { id: 'C', hand: [] },
    { id: 'D', hand: [] },
  ];
  assert.equal(resolveCalledPartner('A', 18, players), undefined);
});
