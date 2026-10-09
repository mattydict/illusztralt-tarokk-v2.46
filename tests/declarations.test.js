import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { availableDeclarations } from '../src/engine/declarations.js';
import { checkPairFigurePrerequisite } from '../src/engine/figurePrerequisites.js';
import { assessFigureGeometry, assessFigurePlayRisk } from '../src/engine/figureGeometry.js';
const deck = createDeck();
const t = (n) => deck.filter(c => c.kind === 'tarokk' && c.rank === n);
const kings = deck.filter(c => c.kind === 'suit' && c.rank === 'K');
test('9 tarokk esetén csak a 9-es tarokkszám mondható', () => {
    const hand = [...deck.filter(c => c.kind === 'tarokk').slice(0, 9)];
    const types = availableDeclarations(hand, { isTaker: true, firstRound: false, previousDeclarations: [], partnersKnown: false }).map(x => x.type);
    assert.equal(types.includes('tarokk8'), false);
    assert.ok(types.includes('tarokk9'));
});
test('figure declarations are offered even without the target cards', () => {
    const hand = [...t(3), ...t(4), ...t(5), ...t(6)];
    const types = availableDeclarations(hand, { isTaker: true, firstRound: true, previousDeclarations: [], partnersKnown: false }).map(x => x.type);
    assert.ok(types.includes('fourKings'));
    assert.ok(types.includes('pagatUltimo'));
    assert.ok(types.includes('sasUhu'));
    assert.ok(types.includes('kingUltimo'));
});
test('volat blocks ordinary declarations after it', () => {
    const hand = [...t(1), ...t(2), ...t(21)];
    const types = availableDeclarations(hand, { isTaker: true, firstRound: false, previousDeclarations: ['volat'], partnersKnown: true }).map(x => x.type);
    assert.ok(!types.includes('tuletroa'));
    assert.ok(!types.includes('fourKings'));
    assert.ok(types.includes('pagatUltimo'));
});
// Centrum/Kismadar/Nagymadar require the preceding tricks as well as the
// deadline honour; winning only the fifth/sixth/seventh trick is insufficient.
import { evaluateDeclaration } from '../src/engine/figureEvaluator.js';
{
    const trick = (winner, id) => ({ winner, cards: [{ player: winner, card: { id, kind: 'tarokk', rank: Number(id.slice(1)), points: 1 } }] });
    const ctx = { tricks: [trick('A', 'T3'), trick('A', 'T4'), trick('A', 'T5'), trick('B', 'T6'), trick('A', 'T20')], sideOf: (id) => id === 'A' ? 'taker' : 'defence' };
    const d = { id: 'd', type: 'centrum', ownerId: 'A', declaredAtTrick: 1, status: 'active', targetCardId: 'T20', contra: { level: 'none', target: 'centrum', records: [] } };
    assert.equal(evaluateDeclaration(d, ctx), 'failed');
}
// The declaring side, not the owner of the target honour, determines success.
// This covers the uncommon case where the defence declares Centrum/Kismadár/
// Nagymadár and the target honour is held by either partnership side.
{
    const trick = (winner, id) => ({
        winner,
        cards: [{ player: winner, card: { id, kind: 'tarokk', rank: Number(id.slice(1)), points: [1, 21, 22].includes(Number(id.slice(1))) ? 5 : 1 } }]
    });
    test('defence can fulfil Centrum even when XX is held by a defence partner', () => {
        const ctx = {
            tricks: [trick('C', 'T3'), trick('D', 'T4'), trick('C', 'T5'), trick('D', 'T6'), trick('D', 'T20')],
            sideOf: (id) => (id === 'A' || id === 'B') ? 'taker' : 'defence'
        };
        const d = { id: 'd', type: 'centrum', ownerId: 'C', declaredAtTrick: 1, status: 'active', targetCardId: 'T20', contra: { level: 'none', target: 'centrum', records: [] } };
        assert.equal(evaluateDeclaration(d, ctx), 'fulfilled');
    });
    test('Centrum does not depend on who holds XX; the declaring side must take the first five tricks', () => {
        const ctx = {
            tricks: [trick('C', 'T3'), trick('C', 'T4'), trick('C', 'T5'), trick('C', 'T6'), trick('D', 'T20')],
            sideOf: (id) => (id === 'A' || id === 'B') ? 'taker' : 'defence'
        };
        const d = { id: 'd', type: 'centrum', ownerId: 'C', declaredAtTrick: 1, status: 'active', targetCardId: 'T20', contra: { level: 'none', target: 'centrum', records: [] } };
        assert.equal(evaluateDeclaration(d, ctx), 'fulfilled');
    });
    test('Kismadar and Nagymadar use the same declaring-side principle', () => {
        const kCtx = {
            tricks: [1, 2, 3, 4, 5, 6].map((n) => trick('C', n === 6 ? 'T21' : `T${n}`)),
            sideOf: (id) => id === 'C' ? 'defence' : 'taker'
        };
        const nCtx = {
            tricks: [1, 2, 3, 4, 5, 6, 7].map((n) => trick('C', n === 7 ? 'T22' : `T${n}`)),
            sideOf: (id) => id === 'C' ? 'defence' : 'taker'
        };
        const kd = { id: 'k', type: 'kismadar', ownerId: 'C', declaredAtTrick: 1, status: 'active', targetCardId: 'T21', contra: { level: 'none', target: 'kismadar', records: [] } };
        const nd = { id: 'n', type: 'nagymadar', ownerId: 'C', declaredAtTrick: 1, status: 'active', targetCardId: 'T22', contra: { level: 'none', target: 'nagymadar', records: [] } };
        assert.equal(evaluateDeclaration(kd, kCtx), 'fulfilled');
        assert.equal(evaluateDeclaration(nd, nCtx), 'fulfilled');
    });
}
function mkTarokk(rank) { return { id: `T${rank}`, kind: 'tarokk', rank, points: 5 }; }
test('Centrum/Kismadár/Nagymadár Trull után, illetve igazolt trull nélküli taker-jelzésben jelenik meg', () => {
    const hand = [mkTarokk(22), mkTarokk(21), mkTarokk(20), mkTarokk(19), mkTarokk(18)];
    const partner = [mkTarokk(22), mkTarokk(21), mkTarokk(20), mkTarokk(19), mkTarokk(17)];
    const types = availableDeclarations(hand, {
        isTaker: true, firstRound: false, previousDeclarations: ['tuletroa'], partnersKnown: true,
        partnerHand: partner, trullDeclared: true,
    }).map(x => x.type);
    assert.ok(types.includes('centrum'));
    assert.ok(types.includes('kismadar'));
    assert.ok(types.includes('nagymadar'));
});
test('Trull nélkül a taker szándékos Trull-kihagyása mellett ajánlható a célfigura', () => {
    const hand = [mkTarokk(22), mkTarokk(21), mkTarokk(20), mkTarokk(18)];
    const partner = [mkTarokk(19), mkTarokk(17), mkTarokk(17)];
    const types = availableDeclarations(hand, {
        isTaker: true, firstRound: false, previousDeclarations: [], partnersKnown: true,
        partnerHand: partner, trullDeclared: false, trullOmittedByTaker: true,
    }).map(x => x.type);
    assert.ok(types.includes('centrum'));
    assert.ok(!types.includes('kismadar'));
    assert.ok(!types.includes('nagymadar'));
});
test('Trull nélkül, explicit taker-kihagyás nélkül a ritka út nem nyílik meg', () => {
    const hand = [mkTarokk(22), mkTarokk(21), mkTarokk(20), mkTarokk(18)];
    const partner = [mkTarokk(19), mkTarokk(17), mkTarokk(17)];
    const types = availableDeclarations(hand, {
        isTaker: true, firstRound: false, previousDeclarations: [], partnersKnown: true,
        partnerHand: partner, trullDeclared: false,
    }).map(x => x.type);
    assert.ok(!types.includes('centrum'));
    assert.ok(!types.includes('kismadar'));
    assert.ok(!types.includes('nagymadar'));
});
test('A konkrét trull nélküli jelzés: Skíz-XXI-XX-XVIII + partneri XIX -> Centrum', () => {
    const taker = [mkTarokk(22), mkTarokk(21), mkTarokk(20), mkTarokk(18)];
    const partner = [mkTarokk(19), mkTarokk(17), mkTarokk(17)];
    const options = availableDeclarations(taker, {
        isTaker: true,
        firstRound: false,
        previousDeclarations: ['tuletroa'],
        partnersKnown: true,
        partnerHand: partner,
        calledTarokk: 19,
        trullDeclared: false,
        trullOmittedByTaker: true,
    });
    assert.equal(options.find(x => x.type === 'centrum')?.type, 'centrum');
});
test('Lyukas Centrum csak igazolt ollós záróhelyzettel nyílik meg', () => {
    const taker = [mkTarokk(22), mkTarokk(21), mkTarokk(20), mkTarokk(18)];
    const partner = [mkTarokk(17), mkTarokk(18), mkTarokk(17)];
    const withoutBridge = availableDeclarations(taker, {
        isTaker: true,
        firstRound: false,
        previousDeclarations: [],
        partnersKnown: true,
        partnerHand: partner,
        trullDeclared: true,
        seatContext: 'lyukasCentrum',
    }).map(x => x.type);
    assert.ok(!withoutBridge.includes('centrum'));
    const withBridge = availableDeclarations(taker, {
        isTaker: true,
        firstRound: false,
        previousDeclarations: [],
        partnersKnown: true,
        partnerHand: partner,
        trullDeclared: true,
        seatContext: 'lyukasCentrum',
        lastSeatHasXVIIAndUnboundHigherTarokk: true,
    }).map(x => x.type);
    assert.ok(withBridge.includes('centrum'));
});
test('availability keeps Double Game + Volát legal together, but closes Double Game after Volát', () => {
    const hand = [...t(1), ...t(2), ...t(21)];
    const before = availableDeclarations(hand, {
        isTaker: true, firstRound: false, previousDeclarations: ['doubleGame'], partnersKnown: false
    }).map(x => x.type);
    assert.ok(before.includes('volat'));
    const after = availableDeclarations(hand, {
        isTaker: true, firstRound: false, previousDeclarations: ['volat'], partnersKnown: false
    }).map(x => x.type);
    assert.ok(!after.includes('doubleGame'));
    assert.ok(!after.includes('tuletroa'));
    assert.ok(!after.includes('fourKings'));
    assert.ok(after.includes('pagatUltimo'));
});
test('figure declarations remain available even when the hand cannot make them', () => {
    const hand = createDeck().filter(c => c.id.startsWith('T') && c.id !== 'T1').slice(0, 4);
    const options = availableDeclarations(hand, {
        isTaker: true,
        firstRound: true,
        previousDeclarations: [],
        partnersKnown: true,
    });
    const types = new Set(options.map(o => o.type));
    assert.ok(types.has('pagatUltimo'));
    assert.ok(types.has('sasUhu'));
    assert.ok(types.has('kingUltimo'));
    assert.ok(types.has('centrum'));
    assert.ok(types.has('kismadar'));
    assert.ok(types.has('nagymadar'));
    assert.ok(!types.has('xxiFogas')); // XXI-fogás is detected from play, not manually declared.
});
test('pair figure assessment keeps holey Kismadar structurally possible', () => {
    const pair = [
        // Both big honours + target XXI, but XIX and XVII are missing.
        { id: 'T22', kind: 'tarokk', rank: 22, points: 5 },
        { id: 'T21', kind: 'tarokk', rank: 21, points: 5 },
        { id: 'T20', kind: 'tarokk', rank: 20, points: 5 },
        { id: 'T18', kind: 'tarokk', rank: 18, points: 5 },
        { id: 'T16', kind: 'tarokk', rank: 16, points: 5 },
    ];
    const result = checkPairFigurePrerequisite('kismadar', {
        speakerHand: pair,
        partnerHand: [],
        trullDeclared: true,
        seatContext: 'special',
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.missingStandardTarokks, [19, 17]);
    assert.equal(result.holeyGeometry, true);
});
test('figure geometry: élő Centrum esetén a saját XX megőrzése látszik', () => {
    const state = {
        declarations: { declarations: [{ ownerId: 'A', type: 'centrum', status: 'active' }] },
        players: [
            { id: 'A', hand: [{ kind: 'tarokk', rank: 20, id: 'T20', points: 1 }] },
            { id: 'B', hand: [] },
            { id: 'C', hand: [] },
            { id: 'D', hand: [] },
        ],
        completedTricks: [],
        trick: null,
        takerId: 'A',
        partnerId: 'C',
    };
    const result = assessFigureGeometry(state, 'A', 'centrum');
    assert.equal(result.status, 'live');
    assert.equal(result.targetInOwnHand, true);
    assert.equal(result.targetPreserved, true);
});
test('figure geometry: lezárható előkészítő ütés ellenoldali győzelme kockázat', () => {
    const state = {
        declarations: { declarations: [{ ownerId: 'A', type: 'kismadar', status: 'active' }] },
        players: [
            { id: 'A', active: true, hand: [{ kind: 'tarokk', rank: 10, id: 'T10', points: 1 }] },
            { id: 'B', active: true, hand: [{ kind: 'tarokk', rank: 18, id: 'T18', points: 1 }] },
            { id: 'C', active: true, hand: [] },
            { id: 'D', active: true, hand: [] },
        ],
        completedTricks: [{ leader: 'A', cards: [], winner: 'A' }, { leader: 'A', cards: [], winner: 'A' }, { leader: 'A', cards: [], winner: 'A' }],
        trick: { leader: 'A', cards: [
                { player: 'B', card: { kind: 'tarokk', rank: 17, id: 'T17', points: 1 } },
                { player: 'C', card: { kind: 'tarokk', rank: 5, id: 'T5', points: 1 } },
                { player: 'D', card: { kind: 'tarokk', rank: 6, id: 'T6', points: 1 } },
            ] },
        takerId: 'A',
        partnerId: 'C',
    };
    const result = assessFigurePlayRisk(state, 'A', 'kismadar', 'T10');
    assert.equal(result.risk, 'prefix');
});
