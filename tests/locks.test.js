import test from 'node:test';
import assert from 'node:assert/strict';
import { canPlayLockedCard, createLockedCards, nextLockedCard, validateLockedPlay } from '../src/engine/locks.js';
const T = (n) => ({ kind: 'tarokk', rank: n, id: `T${n}`, points: 1 });
test('lekötött lapok lekötési sorrendben játszhatók', () => {
    const locks = [
        { cardId: 'T20', figure: 'centrum', order: 1, ownerId: 'A', resolved: false },
        { cardId: 'T21', figure: 'kismadar', order: 2, ownerId: 'A', resolved: false }
    ];
    assert.equal(nextLockedCard(locks)?.cardId, 'T20');
    assert.equal(canPlayLockedCard(T(21), locks), false);
    assert.equal(canPlayLockedCard(T(20), locks), true);
    assert.throws(() => validateLockedPlay(T(21), locks));
});
test('a bemondásokból automatikusan létrejön a lekötési sorrend', () => {
    const locks = createLockedCards([
        { figure: 'centrum', ownerId: 'A' },
        { figure: 'kismadar', ownerId: 'B' },
        { figure: 'ultimo', ownerId: 'A', cardId: 'T1' }
    ]);
    assert.deepEqual(locks.map(l => [l.cardId, l.order]), [['T20', 1], ['T21', 2], ['T1', 3]]);
});
test('a lekötési sorrend játékosonként érvényesül, nem blokkolja másik játékos lapját', () => {
    const locks = [
        { cardId: 'T20', figure: 'centrum', order: 1, ownerId: 'A', resolved: false },
        { cardId: 'T21', figure: 'kismadar', order: 2, ownerId: 'B', resolved: false },
        { cardId: 'T1', figure: 'ultimo', order: 3, ownerId: 'A', resolved: false }
    ];
    assert.equal(canPlayLockedCard(T(20), locks, 'A'), true);
    assert.equal(canPlayLockedCard(T(1), locks, 'A'), false);
    assert.equal(canPlayLockedCard(T(21), locks, 'B'), true);
    assert.equal(canPlayLockedCard(T(1), locks, 'B'), true);
});
