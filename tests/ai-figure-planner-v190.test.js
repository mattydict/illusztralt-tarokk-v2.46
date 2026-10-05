import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { activeOwnBirdDeclaration } from '../src/engine/aiFigurePlanner.js';
test('v1.90 maps bird figures to their correct deadline and target card', () => {
    const specs = [
        ['centrum', 5, 'T20'],
        ['kismadar', 6, 'T21'],
        ['nagymadar', 7, 'T22'],
    ];
    for (const [figure, deadline, target] of specs) {
        const declarations = {
            declarations: [{ id: `d-${figure}`, type: figure, ownerId: 'A', status: 'active', trickNumber: 1, targetCardId: target }],
            locks: [],
            events: [],
            silentFigures: [],
        };
        const state = {
            phase: 'play',
            players: [
                { id: 'A', hand: createDeck().slice(0, 9), active: true },
                { id: 'B', hand: createDeck().slice(9, 18), active: true },
                { id: 'C', hand: createDeck().slice(18, 27), active: true },
                { id: 'D', hand: createDeck().slice(27, 36), active: true },
            ],
            takerId: 'A',
            partnerId: 'C',
            declarations,
            completedTricks: [],
            trick: { leader: 'A', cards: [] },
            nextPlayerIndex: 0,
            lockedCards: [],
        };
        const spec = activeOwnBirdDeclaration(state, 'A');
        assert.equal(spec.figure, figure);
        assert.equal(spec.deadline, deadline);
        assert.equal(spec.targetCardId, target);
    }
});
test('v1.91 planner activates for the declaring partner as well', () => {
    const declarations = {
        declarations: [{ id: 'd-k', type: 'kismadar', ownerId: 'A', status: 'active', trickNumber: 1, targetCardId: 'T21' }],
        locks: [], events: [], silentFigures: [],
    };
    const state = { takerId: 'A', partnerId: 'C', declarations };
    const spec = activeOwnBirdDeclaration(state, 'C');
    assert.equal(spec?.figure, 'kismadar');
    assert.equal(spec?.deadline, 6);
    assert.equal(spec?.targetCardId, 'T21');
});
test('v1.90 planner returns no plan when the player has no active bird declaration', () => {
    const state = { declarations: { declarations: [] } };
    assert.equal(activeOwnBirdDeclaration(state, 'A'), undefined);
});
