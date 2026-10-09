import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateDeclaration } from '../src/engine/figureEvaluator.js';

const sideOf = id => (id === 'A' || id === 'D') ? 'taker' : 'defence';
const targetByType = {
  pagatUltimo: 'T1', sasUltimo: 'T2',
  pagatUhu: 'T1', sasUhu: 'T2',
  kingUltimo: 'hearts-K', kingUhu: 'hearts-K',
};
const deadlineByType = {
  pagatUltimo: 9, sasUltimo: 9, kingUltimo: 9,
  pagatUhu: 8, sasUhu: 8, kingUhu: 8,
};
function trick(winner, targetId, targetPlayer = 'B') {
  return {
    winner,
    cards: [
      { player: targetPlayer, card: { id: targetId, kind: targetId.startsWith('T') ? 'tarokk' : 'suit', rank: targetId.startsWith('T') ? Number(targetId.slice(1)) : 'K', suit: 'makk', points: 1 } },
      { player: winner === 'C' ? 'A' : 'C', card: { id: 'other-card', kind: 'suit', rank: 'A', suit: 'makk', points: 1 } },
    ],
  };
}
function declaration(type, targetCardId) {
  return {
    id: `test:${type}`, type, ownerId: 'B', declaredAtTrick: 1,
    status: 'active', targetCardId,
    contra: { level: 'none', target: type, records: [] },
  };
}

for (const type of Object.keys(targetByType)) {
  test(`${type}: csak a célkártyát kijátszó játékos nyerő ütése teljesít`, () => {
    const deadline = deadlineByType[type];
    const targetId = targetByType[type];
    const tricks = Array.from({ length: deadline - 1 }, () => ({ winner: 'B', cards: [] }));
    tricks.push(trick('B', targetId, 'B'));
    assert.equal(evaluateDeclaration(declaration(type, targetId), { tricks, sideOf }), 'fulfilled');
  });

  test(`${type}: a célkártya tulajdonosának partnere által nyert ütés bukás`, () => {
    const deadline = deadlineByType[type];
    const targetId = targetByType[type];
    const tricks = Array.from({ length: deadline - 1 }, () => ({ winner: 'B', cards: [] }));
    tricks.push(trick('C', targetId, 'B'));
    assert.equal(evaluateDeclaration(declaration(type, targetId), { tricks, sideOf }), 'failed');
  });
}
