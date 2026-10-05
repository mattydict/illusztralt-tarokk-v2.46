import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { legalRepliesForLeadForTest } from '../src/engine/aiRollout.js';
test('suit lead: follow-suit rule prevents illegal tarokk response counting', () => {
    const deck = createDeck();
    const lead = deck.find(c => c.id === 'hearts-10');
    const heart = deck.find(c => c.id === 'hearts-K');
    const tarokk = deck.find(c => c.id === 'T22');
    const replies = legalRepliesForLeadForTest([heart, tarokk], lead);
    assert.deepEqual(replies.map(c => c.id), ['hearts-K']);
});
test('suit lead: tarokk becomes legal only when the led suit is absent', () => {
    const deck = createDeck();
    const lead = deck.find(c => c.id === 'hearts-10');
    const tarokk = deck.find(c => c.id === 'T22');
    const replies = legalRepliesForLeadForTest([tarokk], lead);
    assert.deepEqual(replies.map(c => c.id), ['T22']);
});
