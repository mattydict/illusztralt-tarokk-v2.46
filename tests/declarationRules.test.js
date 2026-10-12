import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeclarationCall } from '../src/engine/declarationRules.js';
describe('declaration restrictions', () => {
    it('allows multiple distinct figures by the same pair in one speaking turn', () => {
        const r = validateDeclarationCall('sasUltimo', {
            previousDeclarations: [],
            declarationsOnCurrentTrick: ['pagatUltimo'],
            pairId: 'AB'
        });
        assert.equal(r.ok, true);
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
    it('keeps Trull blocked after Volát but lets Four Kings and Double Game coexist until Pass fixes the pair declaration', () => {
        assert.equal(validateDeclarationCall('tuletroa', { previousDeclarations: ['volat'], declarationsOnCurrentTrick: [] }).ok, false);
        assert.equal(validateDeclarationCall('fourKings', { previousDeclarations: ['volat'], declarationsOnCurrentTrick: [] }).ok, true);
        assert.equal(validateDeclarationCall('doubleGame', { previousDeclarations: ['volat'], declarationsOnCurrentTrick: [] }).ok, true);
        for (const type of ['fourKings', 'doubleGame']) {
            assert.equal(validateDeclarationCall(type, { previousDeclarations: ['volat'], declarationsOnCurrentTrick: [], pairVolatAlreadyFixed: true }).ok, false);
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
test('blocks Double Game after a Pass-fixed Volát by the same pair, not merely because any Volát exists', () => {
    assert.equal(validateDeclarationCall('doubleGame', { previousDeclarations: ['volat'], declarationsOnCurrentTrick: [], pairVolatAlreadyFixed: true }).ok, false);
    assert.equal(validateDeclarationCall('doubleGame', { previousDeclarations: ['volat'], declarationsOnCurrentTrick: [], pairVolatAlreadyFixed: false }).ok, true);
});
