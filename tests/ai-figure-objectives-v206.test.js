import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDeclaration } from '../src/engine/aiStrategy.js';
import { evaluateDeclaration } from '../src/engine/figureEvaluator.js';
const tarokk = (rank) => ({ id: `T${rank}`, kind: 'tarokk', rank: rank, points: 5 });
const king = (id) => ({ id, kind: 'suit', rank: 'K', suit: id.split('-')[0], points: 5 });
const baseContext = (gameState = undefined) => ({
    isTaker: true,
    firstRound: false,
    previousDeclarations: [],
    partnersKnown: true,
    ...(gameState ? { gameState } : {}),
});
test('v2.06 Uhu: a strong target/control hand materially outranks a weak target hand', () => {
    const strong = [tarokk(1), tarokk(17), tarokk(18), tarokk(19), tarokk(20), tarokk(21), tarokk(22)];
    const weak = [tarokk(1), tarokk(6), tarokk(7), tarokk(8), tarokk(9)];
    const strongEstimate = estimateDeclaration('pagatUhu', strong, baseContext(), {});
    const weakEstimate = estimateDeclaration('pagatUhu', weak, baseContext(), {});
    assert.ok(strongEstimate.success > weakEstimate.success, `${strongEstimate.success} should exceed ${weakEstimate.success}`);
});
test('v2.06 Ultimo: extra late control improves the target-trick plan', () => {
    const strong = [tarokk(1), tarokk(17), tarokk(18), tarokk(19), tarokk(20), tarokk(21)];
    const weak = [tarokk(1), tarokk(6), tarokk(7), tarokk(8), tarokk(9)];
    const strongEstimate = estimateDeclaration('pagatUltimo', strong, baseContext(), {});
    const weakEstimate = estimateDeclaration('pagatUltimo', weak, baseContext(), {});
    assert.ok(strongEstimate.success > weakEstimate.success);
});
test('v2.06 Volát stays deliberately conservative compared with a strong normal target figure', () => {
    const strong = [tarokk(1), tarokk(17), tarokk(18), tarokk(19), tarokk(20), tarokk(21), tarokk(22), tarokk(16)];
    const ctx = baseContext();
    const volat = estimateDeclaration('volat', strong, ctx, {});
    const ultimo = estimateDeclaration('pagatUltimo', strong, ctx, {});
    assert.ok(volat.success < ultimo.success, `${volat.success} should be below ${ultimo.success}`);
});
test('v2.06 Volát is objectively dead as soon as the declaring side loses a trick', () => {
    const trick = (winner) => ({ winner, cards: [{ player: winner, card: tarokk(10) }] });
    const d = { id: 'v', type: 'volat', ownerId: 'A', declaredAtTrick: 1, status: 'active', contra: { level: 'none', target: 'volat', records: [] } };
    const status = evaluateDeclaration(d, {
        tricks: [trick('B')],
        sideOf: (id) => id === 'A' || id === 'C' ? 'taker' : 'defence',
    });
    assert.equal(status, 'failed');
});
