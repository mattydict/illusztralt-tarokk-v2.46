import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeclarationCall } from '../src/engine/declarationRules.js';
describe('declaration restrictions', () => {
    it('blocks a second figure by the same pair on the same trick', () => {
        const r = validateDeclarationCall('sasUltimo', {
            previousDeclarations: [],
            declarationsOnCurrentTrick: ['pagatUltimo'],
            pairId: 'AB'
        });
        assert.equal(r.ok, false);
    });
    it('blocks repeating an already declared figure', () => {
        const r = validateDeclarationCall('centrum', {
            previousDeclarations: ['centrum'],
            declarationsOnCurrentTrick: [],
            pairId: 'AB',
            previousPairIds: [{ type: 'centrum', pairId: 'AB' }]
        });
        assert.equal(r.ok, false);
    });
    it('blocks ordinary declarations after volát', () => {
        for (const type of ['tuletroa', 'fourKings', 'doubleGame']) {
            const r = validateDeclarationCall(type, {
                previousDeclarations: ['volat'],
                declarationsOnCurrentTrick: []
            });
            assert.equal(r.ok, false);
        }
    });
    it('blocks ultimo to uhu escalation', () => {
        const r = validateDeclarationCall('pagatUhu', {
            previousDeclarations: ['pagatUltimo'],
            declarationsOnCurrentTrick: []
        });
        assert.equal(r.ok, false);
    });
    it('allows the first figure on a trick', () => {
        const r = validateDeclarationCall('centrum', {
            previousDeclarations: [],
            declarationsOnCurrentTrick: []
        });
        assert.equal(r.ok, true);
    });
});
test('allows Double Game and Volát to coexist in either declaration order', () => {
    assert.equal(validateDeclarationCall('volat', {
        previousDeclarations: ['doubleGame'],
        declarationsOnCurrentTrick: []
    }).ok, true);
    assert.equal(validateDeclarationCall('doubleGame', {
        previousDeclarations: [],
        declarationsOnCurrentTrick: []
    }).ok, true);
});
test('does not reopen Double Game after Volát', () => {
    assert.equal(validateDeclarationCall('doubleGame', {
        previousDeclarations: ['volat'],
        declarationsOnCurrentTrick: []
    }).ok, false);
});
