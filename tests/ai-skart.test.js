import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { chooseAISkart } from '../src/engine/aiSkart.js';
const deck = createDeck();
const card = (id) => deck.find(c => c.id === id);
test('AI skart prefers a point-rich disposable suit card over a tarokk control card', () => {
    const hand = [
        card('T18'),
        card('T10'),
        card('hearts-Q'),
        card('hearts-J'),
        card('diamonds-10'),
    ];
    const decision = chooseAISkart(hand, 1, { isTaker: true });
    assert.equal(decision.cards.length, 1);
    assert.equal(decision.cards[0]?.kind, 'suit');
    assert.notEqual(decision.cards[0]?.id, 'T18');
});
test('AI skart never chooses a forbidden king or big honour', () => {
    const hand = [
        card('T22'),
        card('T21'),
        card('T20'),
        card('hearts-K'),
        card('hearts-Q'),
        card('spades-10'),
    ];
    const decision = chooseAISkart(hand, 2, { isTaker: true });
    const ids = decision.cards.map(c => c.id);
    assert.ok(!ids.includes('T22'));
    assert.ok(!ids.includes('T21'));
    assert.ok(!ids.includes('T20'));
    assert.ok(!ids.includes('hearts-K'));
});
test('AI skart can prefer creating a void when suit quality is otherwise comparable', () => {
    const hand = [
        card('T10'),
        card('hearts-Q'),
        card('hearts-J'),
        card('diamonds-Q'),
        card('spades-10'),
    ];
    const decision = chooseAISkart(hand, 1, {
        isTaker: false,
        preSkartSuitCounts: { hearts: 2, diamonds: 1, spades: 1, clubs: 0 },
    });
    assert.equal(decision.cards[0]?.id, 'diamonds-Q');
});
test('AI skart keeps the invited tarokk even though it is not otherwise a honour', () => {
    const hand = [
        card('T19'),
        card('T18'),
        card('T17'),
        card('hearts-Q'),
        card('spades-10'),
    ];
    const decision = chooseAISkart(hand, 1, { isTaker: true, invitedTarokk: 19 });
    assert.notEqual(decision.cards[0]?.id, 'T19');
});
