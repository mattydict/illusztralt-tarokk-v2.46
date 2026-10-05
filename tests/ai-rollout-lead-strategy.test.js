import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
test('v1.83 regression fixture exposes neutral lead candidates in the card model', () => {
    const deck = createDeck();
    const lowSuit = deck.find(c => c.id === 'hearts-10');
    const highTarokk = deck.find(c => c.id === 'T20');
    assert.equal(lowSuit.kind, 'suit');
    assert.equal(lowSuit.points <= 2, true);
    assert.equal(highTarokk.kind, 'tarokk');
    assert.equal(highTarokk.rank >= 20, true);
});
