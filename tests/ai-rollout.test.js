import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { buildHandHypotheses } from '../src/engine/aiHandHypotheses.js';
import { buildAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';
import { rolloutDeclaration, rolloutPartnerCoordinationValue } from '../src/engine/aiRollout.js';
test('AI rollout is information-safe and returns bounded probabilities', () => {
    const state = createInitialState(['A', 'B', 'C', 'D']);
    state.phase = 'declarations';
    state.takerId = 'A';
    state.partnerId = 'B';
    state.calledTarokk = 19;
    state.players[0].hand = [
        { kind: 'tarokk', rank: 22, id: 'T22', points: 5 },
        { kind: 'tarokk', rank: 21, id: 'T21', points: 5 },
        { kind: 'tarokk', rank: 20, id: 'T20', points: 1 },
    ];
    const beliefs = buildAIBeliefSnapshot(state, 'A');
    const hypotheses = buildHandHypotheses(state, 'A', beliefs);
    const result = rolloutDeclaration(state, 'A', hypotheses, 'centrum', 128);
    assert.equal(result.samples, 128);
    assert.ok(result.successProbability >= 0 && result.successProbability <= 1);
    assert.ok(result.confidence > 0 && result.confidence <= 1);
});
test('rollout partner coordination rewards handing an early prefix trick to a partner who hypothetically owns the target', () => {
    const ctx = {
        declaration: 'kismadar',
        playerId: 'A',
        observerId: 'A',
        partnerId: 'B',
        hands: {
            A: [{ kind: 'tarokk', rank: 18, id: 'T18', points: 1 }],
            B: [{ kind: 'tarokk', rank: 21, id: 'T21', points: 5 }, { kind: 'tarokk', rank: 19, id: 'T19', points: 1 }],
            C: [], D: [],
        },
        declaringSide: new Set(['A', 'B']),
        targetDeadline: 6,
        target: 'T21',
        deadline: 6,
        trickNumber: 3,
    };
    const partnerWin = rolloutPartnerCoordinationValue('B', ctx.hands.A[0], ctx, true);
    const selfWin = rolloutPartnerCoordinationValue('A', ctx.hands.A[0], ctx, true);
    assert.ok(partnerWin.communicationValue > selfWin.communicationValue);
});
test('partner hand-off gains value only when the partner also has useful next leads', () => {
    const base = {
        declaration: 'kismadar',
        playerId: 'A',
        observerId: 'A',
        partnerId: 'B',
        declaringSide: new Set(['A', 'B']),
        targetDeadline: 6,
        target: 'T21',
        deadline: 6,
        trickNumber: 3,
    };
    const useful = rolloutPartnerCoordinationValue('B', { kind: 'tarokk', rank: 18, id: 'T18', points: 1 }, {
        ...base,
        hands: {
            A: [{ kind: 'tarokk', rank: 18, id: 'T18', points: 1 }],
            B: [
                { kind: 'tarokk', rank: 21, id: 'T21', points: 5 },
                { kind: 'tarokk', rank: 15, id: 'T15', points: 1 },
                { kind: 'suit', suit: 'hearts', rank: 'A', id: 'hearts-A', points: 1 },
            ], C: [], D: [],
        },
    }, true);
    const cramped = rolloutPartnerCoordinationValue('B', { kind: 'tarokk', rank: 18, id: 'T18', points: 1 }, {
        ...base,
        hands: {
            A: [{ kind: 'tarokk', rank: 18, id: 'T18', points: 1 }],
            B: [{ kind: 'tarokk', rank: 21, id: 'T21', points: 5 }],
            C: [], D: [],
        },
    }, true);
    assert.ok(useful.communicationValue > cramped.communicationValue);
});
