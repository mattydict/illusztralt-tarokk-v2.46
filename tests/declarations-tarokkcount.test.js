import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { availableDeclarations } from '../src/engine/declarations.js';
const deck = createDeck();
test('8 tarokk: önkéntes 8-as tarokkszám elérhető', () => {
    const hand = deck.filter(c => c.kind === 'tarokk').slice(0, 8);
    const types = availableDeclarations(hand, {
        isTaker: true, firstRound: false, previousDeclarations: [], partnersKnown: true
    }).map(x => x.type);
    assert.ok(types.includes('tarokk8'));
    assert.ok(!types.includes('tarokk9'));
});
test('9 tarokk: csak 9 tarokkszám érhető el', () => {
    const hand = deck.filter(c => c.kind === 'tarokk').slice(0, 9);
    const types = availableDeclarations(hand, {
        isTaker: true, firstRound: false, previousDeclarations: [], partnersKnown: true
    }).map(x => x.type);
    assert.ok(!types.includes('tarokk8'));
    assert.ok(types.includes('tarokk9'));
});
