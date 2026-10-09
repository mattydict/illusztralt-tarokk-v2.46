import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { publicPartnerId, publicPartnerIdFromState } from '../src/engine/partnershipVisibility.js';
import { createDeclarationWindow, legalDeclarationActions } from '../src/engine/declarationWindow.js';
import { settlementLines, silentFigureValue } from '../src/engine/settlement.js';

function game(overrides = {}) {
  return {
    takerId: 'A', partnerId: 'B', calledTarokk: 19,
    players: ['A', 'B', 'C', 'D'].map(id => ({ id, active: true })),
    declarations: { declarations: [] }, completedTricks: [], trick: null,
    gameContraState: { records: [] },
    ...overrides,
  };
}

const silentFigure = (type, ownerIsTakerPair = false) => ({ type, points: 1, ownerIsTakerPair, ownerPairWon: true, silent: true });

test('Silent Volát replaces only silent Duplajáték and silent Négykirály; independent silent figures remain', () => {
  const lines = settlementLines({
    contract: 'one', takerPairWon: true, takerTrickPoints: 0, takerSkartPoints: 0,
    takerPairVolat: true, defencePairVolat: false, gameContra: 'kontra',
    figures: [silentFigure('doubleGame'), silentFigure('fourKings'), silentFigure('tuletroa'), silentFigure('xxiFogas'), silentFigure('pagatUltimo')],
  });
  assert.ok(lines.some(x => x.type === 'volat' && x.silent));
  assert.equal(lines.some(x => x.type === 'doubleGame'), false);
  assert.equal(lines.some(x => x.type === 'fourKings'), false);
  assert.ok(lines.some(x => x.type === 'tuletroa' && x.silent));
  assert.ok(lines.some(x => x.type === 'xxiFogas' && x.silent));
  assert.ok(lines.some(x => x.type === 'pagatUltimo' && x.silent));
  assert.ok(lines.some(x => x.kind === 'game' && x.points > 0), 'game kontra is scored alongside silent Volát');
});

test('Without silent Volát, game kontra, silent Duplajáték and silent Négykirály are scored in parallel', () => {
  const lines = settlementLines({
    contract: 'one', takerPairWon: false, takerTrickPoints: 20, takerSkartPoints: 0,
    takerPairVolat: false, defencePairVolat: false, gameContra: 'kontra',
    figures: [silentFigure('fourKings', false), silentFigure('tuletroa', false)],
  });
  assert.ok(lines.some(x => x.kind === 'game' && x.points === 6));
  assert.ok(lines.some(x => x.type === 'doubleGame' && x.silent));
  assert.ok(lines.some(x => x.type === 'fourKings' && x.silent));
  assert.ok(lines.some(x => x.type === 'tuletroa' && x.silent));
});

test('A declared Duplajáték can coexist with a silent Volát; silent Dupla/four kings are suppressed', () => {
  const lines = settlementLines({
    contract: 'one', takerPairWon: true, takerTrickPoints: 0, takerSkartPoints: 0,
    takerPairVolat: true, defencePairVolat: false, gameContra: 'none',
    figures: [
      { type: 'doubleGame', points: 4, ownerIsTakerPair: true, ownerPairWon: true, silent: false },
      silentFigure('doubleGame'), silentFigure('fourKings'), silentFigure('tuletroa'),
    ],
  });
  assert.equal(lines.filter(x => x.type === 'doubleGame').length, 1);
  assert.equal(lines.filter(x => x.type === 'volat' && x.silent).length, 1);
  assert.equal(lines.some(x => x.type === 'fourKings'), false);
  assert.ok(lines.some(x => x.type === 'tuletroa' && x.silent));
});

test('Declaration-only figures cannot be silently scored', () => {
  const forbidden = ['kingUltimo', 'kingUhu', 'sasUhu', 'pagatUhu', 'centrum', 'kismadar', 'nagymadar'];
  for (const type of forbidden) {
    assert.equal(silentFigureValue(type), undefined, `${type} must require an announcement`);
  }
  const lines = settlementLines({
    contract: 'one', takerPairWon: true, takerTrickPoints: 40, takerSkartPoints: 0, gameContra: 'none',
    figures: forbidden.map(type => ({ type, points: 20, ownerIsTakerPair: true, ownerPairWon: true, silent: true })),
  });
  assert.equal(lines.filter(x => forbidden.includes(x.type)).length, 0);
});

test('A first non-taker 8/9-tarokk announcement publicly identifies the partner', () => {
  const g = game();
  const window = { records: [{ type: 'tarokkCount', playerId: 'B', count: 8 }] };
  assert.equal(publicPartnerId(g, {}, window), 'B');
});

test('A partner who spoke before the defence contra remains publicly identified', () => {
  const g = game({ gameContraState: { records: [{ byPlayer: 'D', side: 'defence', level: 'kontra' }] } });
  const window = { records: [
    { type: 'tarokkCount', playerId: 'B', count: 8 },
    { type: 'contraSignal', playerId: 'D', target: 'game' },
  ] };
  assert.equal(publicPartnerId(g, {}, window), 'B');
});

test('A non-taker declaration after a defence contra is read as the second defender speaking to the first', () => {
  const g = game({ gameContraState: { records: [{ byPlayer: 'D', side: 'defence', level: 'kontra' }] } });
  const window = { records: [
    { type: 'contraSignal', playerId: 'D', target: 'game' },
    { type: 'declare', playerId: 'C', declaration: 'fourKings' },
  ] };
  assert.equal(publicPartnerId(g, {}, window), 'B');
});

test('A recontra after a public defence contra reveals the partner', () => {
  const g = game({ gameContraState: { records: [
    { byPlayer: 'D', side: 'defence', level: 'kontra' },
    { byPlayer: 'B', side: 'taker', level: 'rekontra' },
  ] } });
  assert.equal(publicPartnerId(g, {}, { records: [{ type: 'contraSignal', playerId: 'D', target: 'game' }, { type: 'contraSignal', playerId: 'B', target: 'game' }] }), 'B');
});

test('Observer-side inference identifies the remaining partner after a second defender speaks following a contra', () => {
  const g = game({
    gameContraState: { records: [{ byPlayer: 'D', side: 'defence', level: 'kontra' }] },
    declarations: { declarations: [{ ownerId: 'C', type: 'fourKings' }] },
  });
  assert.equal(publicPartnerIdFromState(g), 'B');
});

test('An unidentified defender is limited to Passz until they contra; hidden partner must recontra', () => {
  const hand = [
    ...[22, 21, 20, 19].map(rank => ({ id: `T${rank}`, kind: 'tarokk', rank, points: 5 })),
    ...['spades', 'hearts', 'clubs', 'diamonds'].map(suit => ({ id: `K${suit}`, kind: 'suit', rank: 'K', suit, points: 5 })),
    { id: 'T10', kind: 'tarokk', rank: 10, points: 5 },
  ];
  const w = createDeclarationWindow(['C', 'D', 'A', 'B']);
  const hiddenDefence = legalDeclarationActions(w, 'C', hand, { speakerIsDefence: true, speakerRolePubliclyKnown: false, hasPublicDefenceSignal: false });
  assert.deepEqual(hiddenDefence, [{ type: 'pass', playerId: 'C' }]);
  const hiddenPartner = legalDeclarationActions(w, 'C', hand, { speakerIsPartner: true, speakerRolePubliclyKnown: false, hasPublicDefenceSignal: true, turnHadContra: false });
  assert.deepEqual(hiddenPartner, [{ type: 'pass', playerId: 'C' }]);
});


test('After the first defence contra, a second defender may announce without recontra', () => {
  const hand = [
    ...[22, 21, 20, 19, 10].map(rank => ({ id: `T${rank}`, kind: 'tarokk', rank, points: 5 })),
    ...['spades', 'hearts', 'clubs', 'diamonds'].map(suit => ({ id: `K${suit}`, kind: 'suit', rank: 'K', suit, points: 5 })),
  ];
  const w = createDeclarationWindow(['C', 'D', 'A', 'B']);
  const secondDefender = legalDeclarationActions(w, 'C', hand, {
    speakerIsDefence: true,
    speakerRolePubliclyKnown: false,
    hasPublicDefenceSignal: true,
  });
  assert.ok(secondDefender.some(a => a.type === 'declare' && a.declaration === 'tuletroa'));
  assert.ok(secondDefender.some(a => a.type === 'pass'));
});


test('the UI calls the figure Trull, not Tuletroá', () => {
  const main = fs.readFileSync(path.resolve('src/ui/main.js'), 'utf8');
  const multiplayer = fs.readFileSync(path.resolve('src/ui/multiplayer.js'), 'utf8');
  assert.match(main, /tuletroa:\s*'Trull'/);
  assert.match(multiplayer, /tuletroa:\s*'Trull'/);
  assert.doesNotMatch(main, /(?:Tuletroá|Tulétroá)/);
  assert.doesNotMatch(multiplayer, /(?:Tuletroá|Tulétroá)/);
});
