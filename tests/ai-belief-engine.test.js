import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';
import { createInitialState } from '../src/engine/game.js';
test('AI belief engine does not inspect hidden opponent hands', () => {
    const state = createInitialState(['A', 'B', 'C', 'D']);
    state.takerId = 'A';
    state.partnerId = 'C';
    state.calledTarokk = 19;
    state.startingPlayerId = 'B';
    state.players[0].hand = [{ kind: 'tarokk', rank: 22, id: 'T22', points: 5 }];
    state.players[1].hand = [{ kind: 'tarokk', rank: 21, id: 'T21', points: 5 }];
    state.players[2].hand = [{ kind: 'tarokk', rank: 18, id: 'T18', points: 1 }];
    state.players[3].hand = [{ kind: 'tarokk', rank: 17, id: 'T17', points: 1 }];
    const beliefs = buildAIBeliefSnapshot(state, 'A');
    assert.equal(beliefs.observerId, 'A');
    assert.equal(beliefs.partnerId, 'C');
    assert.equal(beliefs.starterId, 'B');
    assert.equal(beliefs.observerSeat, 0);
    assert.ok((beliefs.ownership.C[19]?.probability ?? 0) > (beliefs.ownership.B[19]?.probability ?? 0));
    assert.ok(!beliefs.visibleTarokks.includes(19));
});
test('called tarokk and declaration chain raise partner ownership prior without making it certain', () => {
    const state = createInitialState(['A', 'B', 'C', 'D']);
    state.takerId = 'A';
    state.partnerId = 'C';
    state.calledTarokk = 19;
    state.declarations.declarations = [
        { id: '1', type: 'tuletroa', ownerId: 'A', declaredAtTrick: 1, status: 'declared', contra: 'none' },
        { id: '2', type: 'fourKings', ownerId: 'C', declaredAtTrick: 1, status: 'declared', contra: 'none' },
    ];
    const beliefs = buildAIBeliefSnapshot(state, 'A');
    const p = beliefs.ownership.C[19]?.probability ?? 0;
    assert.ok(p > 0.25 && p < 0.95);
});
