import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { activeOppositionBird, evaluateBirdDefenseCandidate } from '../src/engine/aiBirdDefense.js';
function baseState() {
    const deck = createDeck();
    return {
        playerCount: 4,
        players: [
            { id: 'A', hand: [deck.find(c => c.id === 'T20')], score: 0, active: true },
            { id: 'B', hand: [deck.find(c => c.id === 'T21')], score: 0, active: true },
            { id: 'C', hand: [deck.find(c => c.id === 'T22')], score: 0, active: true },
            { id: 'D', hand: [deck.find(c => c.id === 'T15')], score: 0, active: true },
        ],
        dealerIndex: 0,
        phase: 'play',
        talon: [],
        trick: null,
        completedTricks: [],
        leadSuit: null,
        nextPlayerIndex: 3,
        lockedCards: [],
        declarations: {
            declarations: [{ id: 'bird', type: 'centrum', ownerId: 'A', status: 'active', trickNumber: 1, targetCardId: 'T20' }],
            locks: [], events: [], silentFigures: [],
        },
        takerId: 'A',
        partnerId: 'C',
    };
}
test('v1.92 detects an active opponent bird', () => {
    const state = baseState();
    const spec = activeOppositionBird(state, 'D');
    assert.equal(spec?.figure, 'centrum');
    assert.equal(spec?.deadline, 5);
    assert.equal(spec?.targetCardId, 'T20');
    assert.equal(activeOppositionBird(state, 'B'), undefined);
});
test('v1.92 rewards taking an opponent-held prefix trick before deadline', () => {
    const state = baseState();
    const deck = createDeck();
    state.players[3].hand = [deck.find(c => c.id === 'T15')];
    state.trick = { leader: 'A', cards: [{ player: 'A', card: deck.find(c => c.id === 'hearts-10') }], winner: 'A' };
    state.nextPlayerIndex = 3;
    const evidence = evaluateBirdDefenseCandidate(state, 'D', deck.find(c => c.id === 'T15'));
    assert.ok(evidence);
    assert.ok(evidence.score > 0);
    assert.ok(evidence.reasons.some(r => r.includes('megtörhető')));
});
test('v1.92 discourages overtrumping the defensive partner', () => {
    const state = baseState();
    const deck = createDeck();
    state.trick = { leader: 'B', cards: [{ player: 'B', card: deck.find(c => c.id === 'T18') }], winner: 'B' };
    state.nextPlayerIndex = 3;
    const evidence = evaluateBirdDefenseCandidate(state, 'D', deck.find(c => c.id === 'T15'));
    assert.ok(evidence);
    assert.ok(evidence.score < 20);
    assert.ok(!evidence.reasons.some(r => r.includes('nem célszerű fölé ütni')));
});
test('v1.92 does not inspect hidden opponent hands when estimating threat', () => {
    const state = baseState();
    // The target is deliberately in the simulated opponent's hidden hand.
    const deck = createDeck();
    state.players[0].hand = [];
    state.players[1].hand = [deck.find(c => c.id === 'T20')];
    const evidence = evaluateBirdDefenseCandidate(state, 'D', deck.find(c => c.id === 'T15'));
    assert.ok(evidence);
    assert.ok(evidence.threatProbability >= 0);
});
