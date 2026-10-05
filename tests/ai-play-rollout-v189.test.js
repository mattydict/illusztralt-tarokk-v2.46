import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createInitialState } from '../src/engine/game.js';
import { buildAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';
import { buildHandHypotheses } from '../src/engine/aiHandHypotheses.js';
import { evaluateCardContinuation } from '../src/engine/aiRollout.js';
import { chooseAICard } from '../src/engine/aiPlay.js';
const deck = createDeck();
const card = (id) => {
    const found = deck.find(c => c.id === id);
    assert.ok(found, `Hiányzó tesztlap: ${id}`);
    return found;
};
test('v1.89 continuation rollout evaluates every candidate against the same hidden worlds', () => {
    let state = createInitialState(['A', 'B', 'C', 'D']);
    state = {
        ...state,
        phase: 'play',
        takerId: 'A',
        partnerId: 'B',
        startingPlayerId: 'B',
        nextPlayerIndex: 1,
        trick: { leader: 'B', cards: [] },
        players: state.players.map(p => ({
            ...p,
            hand: p.id === 'A'
                ? [card('T22'), card('T21'), card('T20'), card('T19'), card('hearts-10')]
                : p.id === 'B'
                    ? [card('T18'), card('T15'), card('diamonds-10'), card('spades-10'), card('clubs-10')]
                    : p.id === 'C'
                        ? [card('T17'), card('T16'), card('hearts-J'), card('diamonds-J'), card('spades-J')]
                        : [card('T14'), card('T13'), card('T12'), card('clubs-J'), card('hearts-Q')],
        })),
    };
    const hypotheses = buildHandHypotheses(state, 'B', buildAIBeliefSnapshot(state, 'B'));
    const a = evaluateCardContinuation(state, 'B', hypotheses, card('T18'), 2, 16);
    const b = evaluateCardContinuation(state, 'B', hypotheses, card('T15'), 2, 16);
    assert.equal(a.samples, b.samples);
    assert.ok(a.samples > 0);
    assert.ok(a.expectedValue !== b.expectedValue);
    assert.ok(a.confidence > 0 && a.confidence <= 1);
    assert.ok(a.sideWinRate >= 0 && a.sideWinRate <= 1);
    assert.ok(b.sideWinRate >= 0 && b.sideWinRate <= 1);
});
test('v1.89 continuation rollout is a secondary strategic layer, not a legality bypass', () => {
    let state = createInitialState(['A', 'B', 'C', 'D']);
    state = {
        ...state,
        phase: 'play',
        takerId: 'A',
        partnerId: 'B',
        startingPlayerId: 'B',
        nextPlayerIndex: 1,
        trick: { leader: 'B', cards: [{ player: 'C', card: card('hearts-10') }] },
        leadSuit: 'hearts',
        players: state.players.map(p => ({
            ...p,
            hand: p.id === 'B'
                ? [card('hearts-K'), card('T18'), card('T15'), card('diamonds-10'), card('spades-10')]
                : p.id === 'A'
                    ? [card('hearts-Q'), card('T22'), card('T21'), card('T20'), card('T19')]
                    : p.id === 'C'
                        ? [card('hearts-10')]
                        : [card('T17'), card('T16'), card('T14'), card('clubs-J'), card('clubs-Q')],
        })),
    };
    const hypotheses = buildHandHypotheses(state, 'B', buildAIBeliefSnapshot(state, 'B'));
    assert.throws(() => evaluateCardContinuation(state, 'B', hypotheses, card('T18'), 2, 16), /szabályosan kijátszhatónak/i);
});
test('v1.89 real-play decision exposes a continuation score when a consistent rollout world exists', () => {
    let state = createInitialState(['A', 'B', 'C', 'D']);
    state = {
        ...state,
        phase: 'play',
        takerId: 'A',
        partnerId: 'B',
        startingPlayerId: 'B',
        nextPlayerIndex: 1,
        trick: { leader: 'B', cards: [] },
        players: state.players.map(p => ({
            ...p,
            hand: p.id === 'A'
                ? [card('T22'), card('T21'), card('T20'), card('T19'), card('hearts-10')]
                : p.id === 'B'
                    ? [card('T18'), card('T15'), card('diamonds-10'), card('spades-10'), card('clubs-10')]
                    : p.id === 'C'
                        ? [card('T17'), card('T16'), card('hearts-J'), card('diamonds-J'), card('spades-J')]
                        : [card('T14'), card('T13'), card('T12'), card('clubs-J'), card('hearts-Q')],
        })),
    };
    const decision = chooseAICard(state, 'B');
    assert.ok(decision.continuationScore !== undefined);
    assert.ok(Number.isFinite(decision.continuationScore));
    assert.ok(Number.isFinite(decision.score));
});
