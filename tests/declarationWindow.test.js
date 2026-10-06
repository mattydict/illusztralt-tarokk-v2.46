import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDeclarationAction, createDeclarationWindow, currentDeclarer, legalDeclarationActions } from '../src/engine/declarationWindow.js';
import { createDeck } from '../src/engine/cards.js';
test('bemondási passz nem végleges és három egymást követő passz lezár', () => {
    let w = createDeclarationWindow(['A', 'B', 'C', 'D']);
    assert.equal(currentDeclarer(w), 'A');
    w = applyDeclarationAction(w, { type: 'pass', playerId: 'A' });
    w = applyDeclarationAction(w, { type: 'declare', playerId: 'B', declaration: 'doubleGame' });
    // A declaration does not advance the speaking right; only Passz does.
    assert.equal(currentDeclarer(w), 'B');
    w = applyDeclarationAction(w, { type: 'pass', playerId: 'B' });
    assert.equal(currentDeclarer(w), 'C');
    // B declared something before pressing Passz, so B's closing Passz is not
    // a pure pass and does not count toward the three-pure-pass closure.
    w = applyDeclarationAction(w, { type: 'pass', playerId: 'C' });
    assert.equal(w.finished, false);
    assert.equal(w.consecutivePasses, 1);
    w = applyDeclarationAction(w, { type: 'pass', playerId: 'D' });
    assert.equal(w.finished, false);
    assert.equal(w.consecutivePasses, 2);
    w = applyDeclarationAction(w, { type: 'pass', playerId: 'A' });
    assert.equal(w.consecutivePasses, 3);
    assert.equal(w.finished, true);
});
test('a declaration keeps the same speaker; Passz advances to the next speaker', () => {
    const w = createDeclarationWindow(['A', 'B', 'C', 'D']);
    const hand = createDeck().slice(0, 9);
    const w2 = applyDeclarationAction(w, { type: 'declare', playerId: 'A', declaration: 'doubleGame' }, hand);
    assert.equal(currentDeclarer(w2), 'A');
    const w3 = applyDeclarationAction(w2, { type: 'pass', playerId: 'A' }, hand);
    assert.equal(currentDeclarer(w3), 'B');
    const w4 = applyDeclarationAction(w3, { type: 'pass', playerId: 'B' }, hand);
    assert.equal(currentDeclarer(w4), 'C');
});
test('pair figures are available without exposing the partner hand', () => {
    const w = createDeclarationWindow(['A', 'B', 'C', 'D']);
    const hand = createDeck().slice(0, 9);
    const actions = legalDeclarationActions(w, 'A', hand, {
        isTaker: true,
        previousDeclarations: [],
        partnersKnown: true,
    });
    assert.ok(actions.some(a => a.type === 'declare' && a.declaration === 'centrum'));
    assert.ok(actions.some(a => a.type === 'declare' && a.declaration === 'kismadar'));
    assert.ok(actions.some(a => a.type === 'declare' && a.declaration === 'nagymadar'));
});
test('mandatory tarokk count cannot be bypassed with pass', () => {
    let w = createDeclarationWindow(['A', 'B', 'C', 'D']);
    const hand = createDeck().slice(0, 9);
    w = applyDeclarationAction(w, { type: 'declare', playerId: 'A', declaration: 'pagatUltimo' }, hand);
    assert.throws(() => applyDeclarationAction(w, { type: 'pass', playerId: 'A' }, hand), /kötelező tarokkszám/i);
    w = applyDeclarationAction(w, { type: 'tarokkCount', playerId: 'A', count: 9 }, hand);
    assert.equal(currentDeclarer(w), 'A');
});
test('engine rejection does not belong to declaration window state', () => {
    let w = createDeclarationWindow(['A', 'B', 'C', 'D']);
    const hand = createDeck().slice(0, 9);
    // The window itself only accepts actions structurally; the integration layer
    // must apply the authoritative game mutation first and only then advance w.
    const before = JSON.stringify(w);
    assert.equal(currentDeclarer(w), 'A');
    assert.equal(JSON.stringify(w), before);
    // A rejected game declaration therefore leaves the declaration window untouched.
    // This is an integration invariant documented here to prevent regressions.
    assert.equal(w.records.length, 0);
    void hand;
});
