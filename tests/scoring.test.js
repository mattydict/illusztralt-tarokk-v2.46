import test from 'node:test';
import assert from 'node:assert/strict';
import { pointsByPlayer, trickPointValue, totalTrickPoints, winnerByPair } from '../src/engine/scoring.js';
const T = (rank, points = 1) => ({ kind: 'tarokk', rank, id: `T${rank}`, points });
test('ütés pontértéke a lapok pontértékeinek összege', () => {
    const trick = { winner: 'A', cards: [{ player: 'A', card: T(21, 5) }, { player: 'B', card: T(10, 1) }] };
    assert.equal(trickPointValue(trick), 6);
});
test('pontok nyertesen játékosonként gyűlnek', () => {
    const tricks = [
        { winner: 'A', cards: [{ player: 'A', card: T(21, 5) }] },
        { winner: 'B', cards: [{ player: 'B', card: T(1, 5) }] },
        { winner: 'A', cards: [{ player: 'A', card: T(10, 1) }] }
    ];
    assert.deepEqual(pointsByPlayer(tricks), { A: 6, B: 5 });
    assert.equal(totalTrickPoints(tricks), 11);
});
test('48 pont a felvevő pár győzelmi küszöbe, 47 az ellenpáré', () => {
    assert.equal(winnerByPair({ takerPair: 48, defencePair: 42 }), 'taker');
    assert.equal(winnerByPair({ takerPair: 47, defencePair: 47 }), 'defence');
});
