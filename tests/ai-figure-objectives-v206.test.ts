import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateDeclaration } from '../src/engine/aiStrategy.js';
import { evaluateDeclaration } from '../src/engine/figureEvaluator.js';
import { Card } from '../src/engine/cards.js';

const tarokk = (rank: number): Card => ({ id: `T${rank}`, kind: 'tarokk', rank: rank as any, points: 5 } as any);
const king = (id: string): Card => ({ id, kind: 'suit', rank: 'K', suit: id.split('-')[0] as any, points: 5 } as any);

const baseContext = (gameState: any = undefined) => ({
  isTaker: true,
  firstRound: false,
  previousDeclarations: [],
  partnersKnown: true,
  ...(gameState ? { gameState } : {}),
} as any);

test('v2.06 Uhu: a strong target/control hand materially outranks a weak target hand', () => {
  const strong = [tarokk(1), tarokk(17), tarokk(18), tarokk(19), tarokk(20), tarokk(21), tarokk(22)];
  const weak = [tarokk(1), tarokk(6), tarokk(7), tarokk(8), tarokk(9)];
  const strongEstimate = estimateDeclaration('pagatUhu', strong, baseContext(), {} as any);
  const weakEstimate = estimateDeclaration('pagatUhu', weak, baseContext(), {} as any);
  assert.ok(strongEstimate.success > weakEstimate.success, `${strongEstimate.success} should exceed ${weakEstimate.success}`);
});

test('v2.06 Ultimo: extra late control improves the target-trick plan', () => {
  const strong = [tarokk(1), tarokk(17), tarokk(18), tarokk(19), tarokk(20), tarokk(21)];
  const weak = [tarokk(1), tarokk(6), tarokk(7), tarokk(8), tarokk(9)];
  const strongEstimate = estimateDeclaration('pagatUltimo', strong, baseContext(), {} as any);
  const weakEstimate = estimateDeclaration('pagatUltimo', weak, baseContext(), {} as any);
  assert.ok(strongEstimate.success > weakEstimate.success);
});

test('v2.06 Volát stays deliberately conservative compared with a strong normal target figure', () => {
  const strong = [tarokk(1), tarokk(17), tarokk(18), tarokk(19), tarokk(20), tarokk(21), tarokk(22), tarokk(16)];
  const ctx = baseContext();
  const volat = estimateDeclaration('volat', strong, ctx, {} as any);
  const ultimo = estimateDeclaration('pagatUltimo', strong, ctx, {} as any);
  assert.ok(volat.success < ultimo.success, `${volat.success} should be below ${ultimo.success}`);
});

test('v2.06 Volát is objectively dead as soon as the declaring side loses a trick', () => {
  const trick = (winner: string) => ({ winner, cards: [{ player: winner, card: tarokk(10) }] });
  const d: any = { id: 'v', type: 'volat', ownerId: 'A', declaredAtTrick: 1, status: 'active', contra: { level: 'none', target: 'volat', records: [] } };
  const status = evaluateDeclaration(d, {
    tricks: [trick('B')],
    sideOf: (id: string) => id === 'A' || id === 'C' ? 'taker' : 'defence',
  });
  assert.equal(status, 'failed');
});
