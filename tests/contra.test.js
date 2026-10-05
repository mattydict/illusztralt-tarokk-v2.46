import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canRaiseContra, contraMultiplier, initialContraState, raiseContra } from '../src/engine/contra.js';
describe('contra state machine', () => {
    it('game: defence starts and sides alternate', () => {
        let s = initialContraState('game');
        assert.equal(canRaiseContra(s, 'defence'), true);
        s = raiseContra(s, 'D', 'defence');
        assert.equal(canRaiseContra(s, 'defence'), false);
        assert.equal(canRaiseContra(s, 'taker'), true);
        s = raiseContra(s, 'T', 'taker');
        assert.equal(s.level, 'rekontra');
    });
    it('figure owned by defence: taker starts the contra', () => {
        let s = initialContraState('fourKings', 'defence');
        assert.equal(canRaiseContra(s, 'taker'), true);
        assert.equal(canRaiseContra(s, 'defence'), false);
        s = raiseContra(s, 'T', 'taker');
        assert.equal(canRaiseContra(s, 'defence'), true);
    });
    it('stops at mordkontra', () => {
        let s = initialContraState('game');
        s = raiseContra(s, 'D', 'defence');
        s = raiseContra(s, 'T', 'taker');
        s = raiseContra(s, 'D', 'defence');
        s = raiseContra(s, 'T', 'taker');
        assert.equal(s.level, 'mordkontra');
        assert.equal(canRaiseContra(s, 'defence'), false);
        assert.equal(contraMultiplier(s.level), 16);
    });
    it('does not allow a side to contra itself repeatedly', () => {
        let s = initialContraState('game');
        s = raiseContra(s, 'D', 'defence');
        assert.throws(() => raiseContra(s, 'D2', 'defence'));
    });
});
describe('game integration of contra', () => {
    it('keeps the complete game-level contra history', async () => {
        const { createInitialState, setPartnership, raiseGameContraInGame } = await import('../src/engine/game.js');
        let g = setPartnership(createInitialState(['A', 'B', 'C', 'D']), 'A', 'B');
        g = { ...g, phase: 'declarations' };
        g = raiseGameContraInGame(g, 'C');
        assert.equal(g.gameContra, 'kontra');
        assert.equal(g.gameContraState?.records.length, 1);
        g = raiseGameContraInGame(g, 'A');
        assert.equal(g.gameContra, 'rekontra');
    });
    it('stores declaration-specific contra and settlement multiplier', async () => {
        const { createInitialState, setPartnership, recordPartnerCall, declareFigureInGame, raiseDeclarationContraInGame } = await import('../src/engine/game.js');
        const { figureSettlementsFromProgress } = await import('../src/engine/settlement.js');
        let g = setPartnership(createInitialState(['A', 'B', 'C', 'D']), 'A', 'B');
        g = recordPartnerCall(g, 19, 'B');
        g = { ...g, phase: 'declarations' };
        g = declareFigureInGame(g, 'fourKings', 'C', 1);
        const id = g.declarations.declarations[0].id;
        g = raiseDeclarationContraInGame(g, id, 'A');
        const declaration = g.declarations.declarations[0];
        assert.equal(declaration.contra.level, 'kontra');
        const closed = { ...g.declarations, declarations: g.declarations.declarations.map(d => d.id === declaration.id ? { ...d, status: 'fulfilled' } : d) };
        const figures = figureSettlementsFromProgress(closed, 'A', 'B');
        assert.equal(figures[0].multiplier, 2);
    });
});
describe('contra timing and eligibility', () => {
    it('game contra is only open during declarations', async () => {
        const { createInitialState, setPartnership, canRaiseGameContraInGame, raiseGameContraInGame } = await import('../src/engine/game.js');
        let g = setPartnership(createInitialState(['A', 'B', 'C', 'D']), 'A', 'B');
        assert.equal(canRaiseGameContraInGame(g, 'C'), false);
        g = { ...g, phase: 'declarations' };
        assert.equal(canRaiseGameContraInGame(g, 'C'), true);
        g = raiseGameContraInGame(g, 'C');
        assert.equal(g.gameContraState?.level, 'kontra');
        g = { ...g, phase: 'play' };
        assert.equal(canRaiseGameContraInGame(g, 'A'), false);
        assert.throws(() => raiseGameContraInGame(g, 'A'));
    });
    it('a completed or failed declaration cannot be raised', async () => {
        const { createInitialState, setPartnership, recordPartnerCall, declareFigureInGame, raiseDeclarationContraInGame, canRaiseDeclarationContraInGame } = await import('../src/engine/game.js');
        let g = setPartnership(createInitialState(['A', 'B', 'C', 'D']), 'A', 'B');
        g = recordPartnerCall(g, 19, 'B');
        g = { ...g, phase: 'declarations' };
        g = declareFigureInGame(g, 'fourKings', 'C', 1);
        const id = g.declarations.declarations[0].id;
        assert.equal(canRaiseDeclarationContraInGame(g, id, 'A'), true);
        g = { ...g, declarations: { ...g.declarations, declarations: g.declarations.declarations.map(d => d.id === id ? { ...d, status: 'fulfilled' } : d) } };
        assert.equal(canRaiseDeclarationContraInGame(g, id, 'A'), false);
        assert.throws(() => raiseDeclarationContraInGame(g, id, 'A'));
    });
});
test('declaration contra alternates correctly for a defence-owned figure', async () => {
    const { createInitialState, setPartnership, recordPartnerCall, declareFigureInGame, raiseDeclarationContraInGame, canRaiseDeclarationContraInGame } = await import('../src/engine/game.js');
    let g = createInitialState(['A', 'B', 'C', 'D']);
    g = { ...g, phase: 'declarations' };
    g = setPartnership(g, 'A', 'B');
    g = recordPartnerCall(g, 19, 'B');
    g = declareFigureInGame(g, 'centrum', 'C', 1);
    const id = g.declarations.declarations[0].id;
    assert.equal(canRaiseDeclarationContraInGame(g, id, 'A'), true);
    g = raiseDeclarationContraInGame(g, id, 'A');
    assert.equal(g.declarations.declarations[0].contra.level, 'kontra');
    assert.equal(canRaiseDeclarationContraInGame(g, id, 'C'), true);
    assert.equal(canRaiseDeclarationContraInGame(g, id, 'A'), false);
    g = raiseDeclarationContraInGame(g, id, 'C');
    assert.equal(g.declarations.declarations[0].contra.level, 'rekontra');
});
test('a kontra lánc legfeljebb mordkontráig emelhető', () => {
    let s = initialContraState('game', 'taker');
    s = raiseContra(s, 'D1', 'defence');
    s = raiseContra(s, 'T1', 'taker');
    s = raiseContra(s, 'D2', 'defence');
    s = raiseContra(s, 'T2', 'taker');
    assert.equal(s.level, 'mordkontra');
    assert.equal(canRaiseContra(s, 'defence'), false);
    assert.throws(() => raiseContra(s, 'D3', 'defence'));
});
