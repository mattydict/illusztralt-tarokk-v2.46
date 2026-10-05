import assert from 'node:assert/strict';
import test from 'node:test';
import { estimateDeclaration, declarationStrategicScore } from '../src/engine/aiStrategy.js';
import { chooseAIDeclaration } from '../src/engine/aiDeclarations.js';
import { emptyPartnerBeliefState } from '../src/engine/partnerBeliefs.js';
const t = (rank, id = `T${rank}`) => ({ kind: 'tarokk', rank, id, points: 5 });
const s = (rank, id = `S${rank}`) => ({ kind: 'suit', suit: 'pikk', rank, id, points: rank === 'A' || rank === 'B' ? 1 : rank === 'L' ? 3 : rank === 'Q' ? 4 : 5 });
test('AI nem rejti el a bukható bemondást, csak alacsonyabbra pontozza', () => {
    const hand = [t(22), t(21), t(18), t(17), s('A'), s('K'), s('Q')];
    const ctx = { isTaker: true, firstRound: true, previousDeclarations: [], partnersKnown: true };
    const options = chooseAIDeclaration(hand, ctx);
    assert.ok(options.action);
    const weak = estimateDeclaration('volat', hand, ctx, emptyPartnerBeliefState());
    assert.ok(weak.success < 1);
});
test('kommunikáció emelhet egy önmagában kockázatos bemondást', () => {
    const hand = [t(22), t(21), t(20), t(19), t(18), s('A'), s('K')];
    const base = { isTaker: false, firstRound: false, previousDeclarations: ['tuletroa', 'fourKings'], partnersKnown: true, trullDeclared: true };
    const a = declarationStrategicScore('fourKings', hand, base, emptyPartnerBeliefState());
    const b = declarationStrategicScore('centrum', hand, base, emptyPartnerBeliefState());
    assert.ok(a.estimate.communication > 0);
    assert.ok(b.estimate.communication > 0);
});
