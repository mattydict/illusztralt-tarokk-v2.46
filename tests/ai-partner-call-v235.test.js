import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { chooseAIPartnerCall } from '../src/engine/aiPartnerCall.js';

const deck = createDeck();
const cards = (...ids) => ids.map(id => deck.find(c => c.id === id)).filter(Boolean);

test('v2.70 partner call calls XX unless an invite fixes the target', () => {
  const decision = chooseAIPartnerCall(cards('T22', 'T21', 'T19', 'T14', 'hearts-K'));
  assert.equal(decision.rank, 20);
  assert.match(decision.reasons.join(' '), /XX|szabályos/i);
});

test('v2.70 fixed invite overrides the normal XX call', () => {
  const decision = chooseAIPartnerCall(cards('T22', 'T21', 'T18', 'T14', 'hearts-K'), { requiredTarokk: 18, invitedTarokk: 18, contract: 'two' });
  assert.equal(decision.rank, 18);
});

test('v2.70 partner-call decision can be evaluated without opponent hands', () => {
  const hand = cards('T22', 'T21', 'T19', 'T14', 'hearts-K');
  const first = chooseAIPartnerCall(hand, { contract: 'one' });
  const second = chooseAIPartnerCall(hand, { contract: 'one', invitedTarokk: 19 });
  assert.equal(first.rank, 20);
  assert.equal(second.rank, 20);
});
