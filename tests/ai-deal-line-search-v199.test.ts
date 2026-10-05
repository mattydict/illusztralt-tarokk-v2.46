import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { evaluateAuctionDealLine } from '../src/engine/aiDealLineSearch.js';

const deck = createDeck();
const card = (id: string) => deck.find(c => c.id === id)!;

const hand = [
  card('T22'), card('T21'), card('T20'), card('T19'), card('T18'), card('T17'),
  card('hearts-K'), card('diamonds-Q'), card('spades-C'),
];

const weakHand = [
  card('T3'), card('T4'), card('T5'), card('T6'), card('T7'),
  card('hearts-J'), card('diamonds-10'), card('spades-10'), card('clubs-10'),
];

test('v1.99: Szóló downstream vonal determinisztikus és nincs talon-szórása', () => {
  const line = evaluateAuctionDealLine({ hand, contract: 'solo' });
  assert.equal(line.sampleCount, 1);
  assert.equal(line.worlds[0]?.talon.length, 0);
  assert.equal(line.worlds[0]?.skart.length, 0);
  assert.equal(line.valueStdDev, 0);
});

test('v1.99: talonos szerződés több determinisztikus világot vizsgál és valódi AI-fektetést használ', () => {
  const line = evaluateAuctionDealLine({ hand, contract: 'three', samples: 6 });
  assert.equal(line.sampleCount, 6);
  assert.ok(line.worlds.every(world => world.talon.length === 3));
  assert.ok(line.worlds.every(world => world.skart.length === 3));
  assert.ok(line.worlds.every(world => world.remainingHand.length === 9));
});

test('v1.99: az erős downstream kéz magasabb vonalértéket kap, mint a gyenge kéz', () => {
  const strong = evaluateAuctionDealLine({ hand, contract: 'two', samples: 6 });
  const weak = evaluateAuctionDealLine({ hand: weakHand, contract: 'two', samples: 6 });
  assert.ok(strong.expectedValue > weak.expectedValue);
  assert.ok(strong.successProbability > weak.successProbability);
});

test('v1.99: az azonos kéz line search eredménye determinisztikus', () => {
  const a = evaluateAuctionDealLine({ hand, contract: 'one', samples: 8 });
  const b = evaluateAuctionDealLine({ hand, contract: 'one', samples: 8 });
  assert.equal(a.expectedValue, b.expectedValue);
  assert.equal(a.valueStdDev, b.valueStdDev);
  assert.deepEqual(a.worlds.map(w => w.talon.map(c => c.id)), b.worlds.map(w => w.talon.map(c => c.id)));
});

test('v1.99: a downstream keresés nem használhat ellenfél rejtett kezét', () => {
  const line = evaluateAuctionDealLine({ hand, contract: 'three', samples: 4 });
  const ownIds = new Set(hand.map(c => c.id));
  for (const world of line.worlds) {
    for (const card of world.talon) assert.equal(ownIds.has(card.id), false);
  }
});
