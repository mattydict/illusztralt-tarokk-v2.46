import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeclaredFigureLocks } from '../src/engine/play.js';

const card = (id, kind = 'tarokk', rank = Number(id.replace(/\D/g, '')) || 10) => ({ id, kind, rank, ...(kind === 'suit' ? { suit: 'hearts' } : {}), points: 1 });
const progress = (type, targetCardId) => ({ declarations: [{ id: 'd1', type, ownerId: 'A', targetCardId, status: 'active' }] });

test('Centrum target XX is the only legal play on trick 5 when still in hand', () => {
  const hand = [card('T20'), card('T14'), card('hK', 'suit')];
  const legal = applyDeclaredFigureLocks(hand, hand, progress('centrum', 'T20'), 5, 'A', () => 'taker');
  assert.deepEqual(legal.map(c => c.id), ['T20']);
});

test('Kismadár, Nagymadár, Uhu and Ultimó force their target only on the target trick', () => {
  const cases = [['kismadar', 'T21', 6], ['nagymadar', 'T22', 7], ['pagatUhu', 'T1', 8], ['sasUltimo', 'T2', 9]];
  for (const [type, target, trick] of cases) {
    const hand = [card(target), card('T14'), card('hK', 'suit')];
    const legal = applyDeclaredFigureLocks(hand, hand, progress(type, target), trick, 'A', () => 'taker');
    assert.deepEqual(legal.map(c => c.id), [target], `${type} should force ${target} on trick ${trick}`);
  }
});


test('normal follow-suit filtering overrides target obligation on the target trick', () => {
  const target = card('T21');
  const hand = [target, card('hK', 'suit'), card('T14')];
  const normallyPlayable = [hand[1]];
  const legal = applyDeclaredFigureLocks(normallyPlayable, hand, progress('kismadar', 'T21'), 6, 'A', () => 'taker');
  assert.deepEqual(legal.map(c => c.id), ['hK']);
});

test('target card is forced on target trick when it is normally playable', () => {
  const target = card('T21');
  const hand = [target, card('T14')];
  const legal = applyDeclaredFigureLocks(hand, hand, progress('kismadar', 'T21'), 6, 'A', () => 'taker');
  assert.deepEqual(legal.map(c => c.id), ['T21']);
});

test('a target card already out of hand does not create a phantom forced play', () => {
  const hand = [card('T14'), card('hK', 'suit')];
  const legal = applyDeclaredFigureLocks(hand, hand, progress('centrum', 'T20'), 5, 'A', () => 'taker');
  assert.deepEqual(legal.map(c => c.id), ['T14', 'hK']);
});
