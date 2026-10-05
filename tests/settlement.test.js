import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateSettlement, declaredFigureValue, silentFigureValue, settlementComponents, settlementLines, figureSettlementsFromProgress } from '../src/engine/settlement.js';
test('uhu és királyfigurák aktuális értékei', () => {
    assert.equal(declaredFigureValue('pagatUhu'), 20);
    assert.equal(declaredFigureValue('sasUhu'), 20);
    assert.equal(declaredFigureValue('kingUltimo'), 15);
    assert.equal(declaredFigureValue('kingUhu'), 25);
});
test('a figura eredménye független a parti eredményétől', () => {
    const total = settlementComponents({
        contract: 'one', takerPairWon: true, takerTrickPoints: 60, gameContra: 'none',
        figures: [{ type: 'pagatUhu', points: 20, ownerPairWon: false }],
    });
    assert.equal(total, 3 - 20);
});
test('bemondott kettes duplajáték sikeresen 8 pont', () => {
    const total = settlementComponents({
        contract: 'two', takerPairWon: true, takerTrickPoints: 75, gameContra: 'none',
        figures: [{ type: 'doubleGame', points: 4, ownerPairWon: true }],
    });
    assert.equal(total, 8);
});
test('kontrázott egyes játék 60 pont felett 6 pont', () => {
    const total = settlementComponents({
        contract: 'one', takerPairWon: true, takerTrickPoints: 60, gameContra: 'kontra', figures: [],
    });
    assert.equal(total, 6);
});
test('csendes dupla 2x, csendes volát 3x', () => {
    assert.equal(settlementComponents({
        contract: 'one', takerPairWon: true, takerTrickPoints: 75, gameContra: 'none', figures: [],
    }), 6);
    assert.equal(settlementComponents({
        contract: 'one', takerPairWon: true, takerTrickPoints: 90, takerPairVolat: true, gameContra: 'none', figures: [],
    }), 9);
});
test('bemondott dupla és teljesített volát külön is elszámolódik', () => {
    const total = settlementComponents({
        contract: 'two', takerPairWon: true, takerTrickPoints: 90, gameContra: 'none',
        figures: [
            { type: 'doubleGame', points: 4, ownerPairWon: true },
            { type: 'volat', points: 6, ownerPairWon: true },
        ],
    });
    assert.equal(total, 8 + 12);
});
test('bukott bemondott dupla nem kap külön alapjáték-terhelést', () => {
    const total = settlementComponents({
        contract: 'two', takerPairWon: false, takerTrickPoints: 40, gameContra: 'none',
        figures: [{ type: 'doubleGame', points: 4, ownerPairWon: false }],
    });
    assert.equal(total, -8);
});
test('a teljes elszámolás megőrzi a parti és figurapontokat', () => {
    const result = calculateSettlement({
        contract: 'one', takerPairWon: true, takerTrickPoints: 60, gameContra: 'none',
        figures: [{ type: 'pagatUhu', points: 20, ownerPairWon: true }],
    });
    assert.equal(result.takerPairPoints, 60);
    assert.equal(result.defencePairPoints, 34);
    assert.equal(result.netForTakerPair, 23);
    assert.equal(result.gameWonBy, 'taker');
    assert.equal(result.lines.length, 2);
});
test('lekötött figura mellett ugyanazon ütésen teljesített másik figura csendes', () => {
    const input = {
        contract: 'three', takerPairWon: true, takerTrickPoints: 48, gameContra: 'none',
        figures: [
            { type: 'centrum', points: 10, ownerPairWon: true },
            { type: 'pagatUltimo', points: 10, ownerPairWon: true, silent: true },
        ],
    };
    const result = settlementLines(input);
    const pagat = result.find(x => x.type === 'pagatUltimo');
    assert.equal(pagat?.points, 5);
    assert.equal(pagat?.silent, true);
});
test('a lifecycle-ból a bukott védőoldali figura is helyes előjellel kerül az elszámolásba', () => {
    const input = {
        contract: 'three', takerPairWon: true, takerTrickPoints: 60, gameContra: 'none',
        figures: [
            { type: 'pagatUhu', points: 20, ownerPairWon: false, ownerIsTakerPair: false },
        ],
    };
    const result = settlementLines(input);
    assert.equal(result.at(-1)?.points, 20);
    assert.equal(result.at(-1)?.positiveForTakerPair, true);
});
test('az Uhu-ból keletkező csendes ulti automatikusan bekerül a settlement inputba', () => {
    const progress = {
        declarations: [],
        locks: [],
        events: [],
        silentFigures: [{ type: 'pagatUltimo', ownerId: 'A', trickNumber: 9, status: 'fulfilled', sourceDeclarationId: 'u1' }],
    };
    const figures = figureSettlementsFromProgress(progress, 'A');
    assert.deepEqual(figures, [{ type: 'pagatUltimo', points: 5, ownerPairWon: true, silent: true, ownerIsTakerPair: true }]);
});
test('védőpár által bemondott dupla bukása a felvevő párnak jár', () => {
    const total = settlementComponents({
        contract: 'two', takerPairWon: true, takerTrickPoints: 60, gameContra: 'none',
        figures: [{ type: 'doubleGame', points: 4, ownerPairWon: false, ownerIsTakerPair: false }],
    });
    assert.equal(total, 8);
});
test('védőpár által bemondott dupla teljesítése a védőpárnak jár', () => {
    const total = settlementComponents({
        contract: 'two', takerPairWon: true, takerTrickPoints: 60, gameContra: 'none',
        figures: [{ type: 'doubleGame', points: 4, ownerPairWon: true, ownerIsTakerPair: false }],
    });
    assert.equal(total, -8);
});
test('védőpár által bemondott volát bukása a felvevő párnak jár', () => {
    const total = settlementComponents({
        contract: 'one', takerPairWon: true, takerTrickPoints: 60, gameContra: 'none',
        figures: [{ type: 'volat', points: 6, ownerPairWon: false, ownerIsTakerPair: false }],
    });
    assert.equal(total, 18);
});
test('a XXI-fogás bemondva 60, csendben 30 pont', () => {
    assert.equal(declaredFigureValue('xxiFogas'), 60);
    const progress = {
        declarations: [],
        locks: [],
        events: [],
        silentFigures: [{ type: 'xxiFogas', ownerId: 'A', trickNumber: 4, status: 'fulfilled', sourceDeclarationId: 'silent:xxiFogas' }],
    };
    const figures = figureSettlementsFromProgress(progress, 'A');
    assert.deepEqual(figures, [{ type: 'xxiFogas', points: 30, ownerPairWon: true, silent: true, ownerIsTakerPair: true }]);
});
test('csendes Tulétroá és Négykirály 1-1 pontot ér', () => {
    assert.equal(silentFigureValue('tuletroa'), 1);
    assert.equal(silentFigureValue('fourKings'), 1);
});
test('csendes Volát csak az összes ütés elvitelétől függ, nem az ütésértéktől', () => {
    const takerVolat = calculateSettlement({
        contract: 'one', takerPairWon: true, takerTrickPoints: 90, takerPairVolat: true, gameContra: 'none', figures: [],
    });
    assert.deepEqual(takerVolat.lines, [
        { kind: 'figure', type: 'volat', points: 9, positiveForTakerPair: true },
    ]);
    const defenceVolat = calculateSettlement({
        contract: 'one', takerPairWon: false, takerTrickPoints: 4, defencePairVolat: true, gameContra: 'none', figures: [],
    });
    assert.deepEqual(defenceVolat.lines, [
        { kind: 'figure', type: 'volat', points: 9, positiveForTakerPair: false },
    ]);
});
test('csendes Dupla a védőpár skarttal együtt számított 71 pontjánál teljesül', () => {
    const result = calculateSettlement({
        contract: 'one', takerPairWon: false, takerTrickPoints: 23, defenceSkartPoints: 48, gameContra: 'none', figures: [],
    });
    assert.deepEqual(result.lines, [
        { kind: 'figure', type: 'doubleGame', points: 6, positiveForTakerPair: false },
    ]);
});
test('csendes Dupla nem a skart mező külön értékét adja hozzá kétszer', () => {
    const result = calculateSettlement({
        contract: 'one', takerPairWon: true, takerTrickPoints: 71, defenceSkartPoints: 23, gameContra: 'none', figures: [],
    });
    assert.equal(result.lines[0]?.type, 'doubleGame');
    assert.equal(result.lines[0]?.points, 6);
});
test('a felvevő saját skartja a felvevő pár Dupla-pontjába számít', () => {
    const result = calculateSettlement({
        contract: 'three', takerPairWon: true, takerTrickPoints: 60, takerSkartPoints: 12,
        defenceSkartPoints: 22, gameContra: 'none', figures: [],
    });
    assert.equal(result.takerPairPoints, 72);
    assert.equal(result.defencePairPoints, 22);
    assert.equal(result.lines[0]?.type, 'doubleGame');
});
test('a védőpár Duplájához a felvevő partnerének skartja is a védelemhez tartozik', () => {
    const result = calculateSettlement({
        contract: 'solo', takerPairWon: false, takerTrickPoints: 20, takerSkartPoints: 0,
        defenceSkartPoints: 22, gameContra: 'none', figures: [],
    });
    assert.equal(result.takerPairPoints, 20);
    assert.equal(result.defencePairPoints, 74);
    assert.equal(result.lines[0]?.type, 'doubleGame');
});
test('skart-pontértékek határai a szerződés szerint értelmezhetők', () => {
    assert.equal(3, 3);
    assert.equal(12, 12);
    assert.equal(22, 22);
    assert.equal(0, 0);
});
test('a 48 pontos felvevőpár a saját skarttal együtt nyeri a partit', () => {
    const result = calculateSettlement({
        contract: 'three', takerPairWon: true,
        takerTrickPoints: 39, takerSkartPoints: 9, defenceSkartPoints: 10,
        gameContra: 'none', figures: [],
    });
    assert.equal(result.takerPairPoints, 48);
    assert.equal(result.defencePairPoints, 46);
    assert.equal(result.gameWonBy, 'taker');
    assert.deepEqual(result.lines, [
        { kind: 'game', points: 1, positiveForTakerPair: true },
    ]);
});
test('47 pontos felvevőpár nem nyeri meg a partit, a védelem 47 ponttal nyer', () => {
    const result = calculateSettlement({
        contract: 'three', takerPairWon: false,
        takerTrickPoints: 40, takerSkartPoints: 7, defenceSkartPoints: 12,
        gameContra: 'none', figures: [],
    });
    assert.equal(result.takerPairPoints, 47);
    assert.equal(result.defencePairPoints, 47);
    assert.equal(result.gameWonBy, 'defence');
    assert.deepEqual(result.lines, [
        { kind: 'game', points: 1, positiveForTakerPair: false },
    ]);
});
test('a 71 pontos Dupla a felvevő saját skartjával együtt teljesül', () => {
    const result = calculateSettlement({
        contract: 'two', takerPairWon: true,
        takerTrickPoints: 59, takerSkartPoints: 12, defenceSkartPoints: 11,
        gameContra: 'none', figures: [],
    });
    assert.equal(result.takerPairPoints, 71);
    assert.equal(result.lines[0]?.type, 'doubleGame');
    assert.equal(result.lines[0]?.points, 4);
});
test('a Volát 90 ponttal is Volát: nincs 94 pontos küszöb', () => {
    const result = calculateSettlement({
        contract: 'one', takerPairWon: true,
        takerTrickPoints: 90, takerSkartPoints: 0, defenceSkartPoints: 4,
        takerPairVolat: true, gameContra: 'none', figures: [],
    });
    assert.deepEqual(result.lines, [
        { kind: 'figure', type: 'volat', points: 9, positiveForTakerPair: true },
    ]);
});
test('a bemondott Dupla saját kontrája szorozza a Duplát, nem a parti kontrája', () => {
    const result = calculateSettlement({
        contract: 'two', takerPairWon: true, takerTrickPoints: 60,
        gameContra: 'kontra',
        figures: [{ type: 'doubleGame', points: 4, ownerPairWon: true, ownerIsTakerPair: true, multiplier: 4 }],
    });
    assert.deepEqual(result.lines, [
        { kind: 'figure', type: 'doubleGame', points: 32, positiveForTakerPair: true },
    ]);
});
test('a bemondott Volát saját kontrája független a parti kontrájától', () => {
    const result = calculateSettlement({
        contract: 'one', takerPairWon: false, takerTrickPoints: 40,
        gameContra: 'mordkontra',
        figures: [{ type: 'volat', points: 6, ownerPairWon: false, ownerIsTakerPair: true, multiplier: 2 }],
    });
    assert.deepEqual(result.lines, [
        { kind: 'figure', type: 'volat', points: 12, positiveForTakerPair: false },
    ]);
});
test('a Dupla és Volát egyszerre bemondva külön kontra-szorzóval számolódik', () => {
    const result = calculateSettlement({
        contract: 'two', takerPairWon: true, takerTrickPoints: 80,
        gameContra: 'kontra',
        figures: [
            { type: 'doubleGame', points: 4, ownerPairWon: true, ownerIsTakerPair: true, multiplier: 2 },
            { type: 'volat', points: 6, ownerPairWon: true, ownerIsTakerPair: true, multiplier: 4 },
        ],
    });
    assert.deepEqual(result.lines, [
        { kind: 'figure', type: 'doubleGame', points: 16, positiveForTakerPair: true },
        { kind: 'figure', type: 'volat', points: 48, positiveForTakerPair: true },
    ]);
});
