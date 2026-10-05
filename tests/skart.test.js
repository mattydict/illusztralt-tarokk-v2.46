import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { isForbiddenSkart, validateSkart } from '../src/engine/skart.js';
const deck = createDeck();
const T = (n) => deck.find(c => c.id === `T${n}`);
const K = (s) => deck.find(c => c.id === `${s}-K`);
const ten = deck.find(c => c.id === 'hearts-10');
test('honours, XX and kings are never skartable', () => {
    for (const c of [T(1), T(21), T(22), T(20), K('hearts')])
        assert.equal(isForbiddenSkart(c), true);
    assert.equal(isForbiddenSkart(ten), false);
});
test('invited tarokk is forbidden in addition to the general restrictions', () => {
    assert.equal(isForbiddenSkart(T(19), 19), true);
    assert.equal(isForbiddenSkart(T(18), 19), false);
});
test('validateSkart rejects forbidden cards', () => {
    assert.throws(() => validateSkart([K('hearts')], 1));
    assert.doesNotThrow(() => validateSkart([ten], 1));
});
