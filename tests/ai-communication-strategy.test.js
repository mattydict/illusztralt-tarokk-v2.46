import test from 'node:test';
import assert from 'node:assert/strict';
import { declarationStrategicScore } from '../src/engine/aiStrategy.js';
const tarokk = (rank) => ({ id: `T${rank}`, kind: 'tarokk', rank });
const king = (rank) => ({ id: `K${rank}`, kind: 'suit', suit: 'hearts', rank });
const hand = [tarokk(22), tarokk(21), tarokk(20), tarokk(19), tarokk(18), king('K')];
const beliefs = { tarokk: {}, tarokkCountAtLeast: {}, figures: {}, encouragements: {}, excludedTarokk: {} };
function context(previousDeclarations) {
    return {
        isTaker: true,
        firstRound: false,
        previousDeclarations,
        partnersKnown: true,
        trullDeclared: previousDeclarations.includes('tuletroa'),
        speakerSeat: 0,
        partnerSeat: 2,
        starterSeat: 0,
    };
}
test('Trull + four kings gets communication value in declaration strategy', () => {
    const fourKings = declarationStrategicScore('fourKings', hand, context(['tuletroa']), beliefs);
    const bareFourKings = declarationStrategicScore('fourKings', hand, context([]), beliefs);
    assert.ok(fourKings.score > bareFourKings.score);
    assert.ok(fourKings.estimate.communication >= 0.55);
});
test('communication remains soft and does not create certainty', () => {
    const result = declarationStrategicScore('centrum', hand, context(['tuletroa', 'fourKings']), beliefs);
    assert.ok(result.estimate.success >= 0 && result.estimate.success <= 1);
    assert.ok(result.estimate.risk >= 0 && result.estimate.risk <= 1);
});
