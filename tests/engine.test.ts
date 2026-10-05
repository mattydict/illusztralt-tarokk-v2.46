import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck, isTarokk } from '../src/engine/cards.js';
import { createInitialState, dealNineCards, legalCardsForPlay, playCard, setPartnership, startPlay } from '../src/engine/game.js';

test('a pakli pontosan 42 lapos', () => {
  const deck = createDeck();
  assert.equal(deck.length, 42);
  assert.equal(deck.filter(isTarokk).length, 22);
  assert.equal(deck.filter(c => c.kind === 'suit').length, 20);
  assert.equal(new Set(deck.map(c => c.id)).size, 42);
});

test('4 játékos mind 9 lapot kap, 6 lap marad a talonban', () => {
  const state = createInitialState(['A', 'B', 'C', 'D']);
  const dealt = dealNineCards(state, () => 0.42).state;
  assert.deepEqual(dealt.players.map(p => p.hand.length), [9, 9, 9, 9]);
  assert.equal(dealt.talon.length, 6);
  assert.equal(dealt.phase, 'bidding');
});

test('színre szín kötelező, ha van a vezetett színből', () => {
  const state = startPlay({
    ...createInitialState(['A', 'B', 'C', 'D']),
    players: [
      { id: 'A', hand: [{ kind: 'suit', suit: 'hearts', rank: 'K', id: 'hK', points: 5 }, { kind: 'tarokk', rank: 10, id: 'T10', points: 1 }], score: 0, active: true },
      { id: 'B', hand: [{ kind: 'suit', suit: 'hearts', rank: '10', id: 'h10', points: 1 }, { kind: 'tarokk', rank: 21, id: 'T21', points: 5 }], score: 0, active: true },
      { id: 'C', hand: [], score: 0, active: true },
      { id: 'D', hand: [], score: 0, active: true }
    ],
    phase: 'play',
    startingPlayerId: 'A'
  }, 0);
  const afterLead = playCard(state, 'A', 'hK');
  assert.deepEqual(legalCardsForPlay(afterLead, 'B').map(c => c.id), ['h10']);
});


test('a felvevő és párja rögzíthető a végső pontozáshoz', () => {
  const state = createInitialState(['A','B','C','D']);
  const paired = setPartnership(state, 'A', 'C');
  assert.equal(paired.takerId, 'A');
  assert.equal(paired.partnerId, 'C');
});
