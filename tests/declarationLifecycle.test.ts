import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { initialDeclarationProgress, declareFigure, nextRequiredLockedCard, resolveDeclaration, advanceDeclarationLifecycle, evaluateDeclarations } from '../src/engine/declarationLifecycle.js';

describe('declaration lifecycle', () => {
  it('creates lock for centrum and uses XX', () => {
    let p = initialDeclarationProgress();
    p = declareFigure(p, 'centrum', 'A', 1);
    assert.equal(p.locks[0]?.cardId, 'T20');
    assert.equal(nextRequiredLockedCard(p)?.cardId, 'T20');
  });

  it('creates ultimo lock for pagat', () => {
    let p = initialDeclarationProgress();
    p = declareFigure(p, 'pagatUltimo', 'A', 2);
    assert.equal(p.locks[0]?.cardId, 'T1');
  });

  it('can resolve a declaration and its lock together', () => {
    let p = initialDeclarationProgress();
    p = declareFigure(p, 'centrum', 'A', 1);
    const id = p.declarations[0]!.id;
    p = resolveDeclaration(p, id, true, 5);
    assert.equal(p.declarations[0]?.status, 'fulfilled');
    assert.equal(p.locks[0]?.resolved, true);
    assert.equal(nextRequiredLockedCard(p), undefined);
  });
});


test('a kényszerből korán kijátszott lekötött lap csak az ütés lezárásakor buktatja a figurát', () => {
  let p = initialDeclarationProgress();
  p = declareFigure(p, 'centrum', 'A', 1);
  const early = advanceDeclarationLifecycle(p, 2, false, { kind: 'tarokk', rank: 20, id: 'T20', points: 1 }, 'A');
  assert.equal(early.declarations[0]?.status, 'active');
  assert.equal(early.declarations[0]?.earlyTargetFailurePending, true);
  assert.equal(early.locks[0]?.resolved, false);

  const closed = advanceDeclarationLifecycle(early, 2, true, { kind: 'suit', suit: 'makk', rank: 'A', id: 'makk-A', points: 1 }, 'B');
  assert.equal(closed.declarations[0]?.status, 'failed');
  assert.equal(closed.locks[0]?.resolved, true);
  assert.equal(closed.events.at(-1)?.status, 'failed');
});

function figureTrick(winner: string, cards: Array<{ player: string; id: string }>) {
  return {
    winner,
    cards: cards.map(({ player, id }) => ({
      player,
      card: id.startsWith('T')
        ? { kind: 'tarokk' as const, rank: Number(id.slice(1)), id, points: 1 }
        : { kind: 'suit' as const, suit: 'makk' as const, rank: 'A' as const, id, points: 1 },
    })),
  };
}

test('az Uhu lekötött lapjával a 9. ütésben játszott ulti csendes ulti', () => {
  let p = initialDeclarationProgress();
  p = declareFigure(p, 'pagatUhu', 'A', 1);
  const tricks = Array.from({ length: 8 }, () => figureTrick('A', [{ player: 'A', id: 'makk-A' }]));
  tricks.push(figureTrick('A', [
    { player: 'A', id: 'T1' },
    { player: 'B', id: 'makk-A-8' },
    { player: 'C', id: 'makk-A-9' },
  ]));
  p = evaluateDeclarations(p, tricks, id => id === 'A' ? 'taker' : 'defence', 9);
  assert.equal(p.declarations[0]?.status, 'failed');
  assert.deepEqual(p.silentFigures, [{ type: 'pagatUltimo', ownerId: 'A', trickNumber: 9, status: 'fulfilled', sourceDeclarationId: p.declarations[0]!.id }]);
});

test('az Uhu lekötött lapjának elfogása az utolsó ütésben bukott csendes ulti', () => {
  let p = initialDeclarationProgress();
  p = declareFigure(p, 'sasUhu', 'A', 1);
  const tricks = Array.from({ length: 8 }, () => figureTrick('A', [{ player: 'A', id: 'makk-A' }]));
  tricks.push(figureTrick('B', [
    { player: 'A', id: 'T2' },
    { player: 'B', id: 'makk-A-8' },
    { player: 'C', id: 'makk-A-9' },
  ]));
  p = evaluateDeclarations(p, tricks, id => id === 'A' ? 'taker' : 'defence', 9);
  assert.equal(p.declarations[0]?.status, 'failed');
  assert.deepEqual(p.silentFigures, [{ type: 'sasUltimo', ownerId: 'A', trickNumber: 9, status: 'failed', sourceDeclarationId: p.declarations[0]!.id }]);
});


test('Király ultimó nem keletkezik csendes figuraként', () => {
  let p = initialDeclarationProgress();
  p = declareFigure(p, 'kingUhu', 'A', 1, 'Kspade');
  const tricks = Array.from({ length: 8 }, () => figureTrick('A', [{ player: 'A', id: 'makk-A' }]));
  tricks.push(figureTrick('A', [
    { player: 'A', id: 'Kspade' },
    { player: 'B', id: 'makk-A-8' },
    { player: 'C', id: 'makk-A-9' },
  ]));
  p = evaluateDeclarations(p, tricks, id => id === 'A' ? 'taker' : 'defence', 9);
  assert.equal(p.declarations[0]?.status, 'failed');
  assert.deepEqual(p.silentFigures, []);
});

test('csendes Tulétroá automatikusan felismerhető bármelyik oldalon', () => {
  let p = initialDeclarationProgress();
  const tricks = [
    figureTrick('B', [{ player: 'B', id: 'T20' }]),
    figureTrick('B', [{ player: 'B', id: 'T21' }]),
    figureTrick('B', [{ player: 'B', id: 'T22' }]),
    ...Array.from({ length: 6 }, () => figureTrick('B', [{ player: 'B', id: 'makk-A' }])),
  ];
  p = evaluateDeclarations(p, tricks, id => id === 'B' ? 'defence' : 'taker', 9);
  assert.deepEqual(p.silentFigures, [{
    type: 'tuletroa', ownerId: 'B', trickNumber: 3, status: 'fulfilled', sourceDeclarationId: 'silent:tuletroa'
  }]);
});

test('csendes Négykirály automatikusan felismerhető és nem duplázódik deklarált Négykirállyal', () => {
  let p = initialDeclarationProgress();
  p = declareFigure(p, 'fourKings', 'A', 1);
  const tricks = [
    figureTrick('A', [{ player: 'A', id: 'hearts-K' }]),
    figureTrick('A', [{ player: 'A', id: 'diamonds-K' }]),
    figureTrick('A', [{ player: 'A', id: 'spades-K' }]),
    figureTrick('A', [{ player: 'A', id: 'clubs-K' }]),
    ...Array.from({ length: 5 }, () => figureTrick('A', [{ player: 'A', id: 'makk-A' }])),
  ];
  p = evaluateDeclarations(p, tricks, id => id === 'A' ? 'taker' : 'defence', 9);
  assert.equal(p.declarations[0]?.status, 'fulfilled');
  assert.equal(p.silentFigures.filter(s => s.type === 'fourKings').length, 0);
});
