import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';
import { createInitialState, setPartnership, recordPartnerCall, startDeclarations, declareFigureInGame } from '../src/engine/game.js';
import { createDeclarationWindow } from '../src/engine/declarationWindow.js';
import { figureSettlementsFromProgress, calculateSettlement } from '../src/engine/settlement.js';
import { availableDeclarations as releaseAvailableDeclarations } from '../engine/declarations.js';

function buildHiddenDefenceRoom() {
  const ids = ['P1', 'P2', 'P3', 'P4'];
  const room = createAuthoritativeRoom({ roomId: 'V307', playerIds: ids, random: () => 0.37 });
  const sourceRound = room.round;
  const hands = Object.fromEntries(sourceRound.players.map(p => [p.playerId, [...p.hand]]));
  let game = createInitialState(ids, 0);
  game = {
    ...game,
    players: game.players.map(p => ({ ...p, hand: hands[p.id], active: true })),
    startingPlayerId: 'P2', phase: 'deal', contract: 'two',
    talon: [...(sourceRound.talon || [])],
    skartsByPlayer: Object.fromEntries(sourceRound.players.map(p => [p.playerId, [...(p.skart || [])]])),
  };
  game = setPartnership(game, 'P2', 'P3');
  game = recordPartnerCall(game, 20, 'P3');
  game = startDeclarations(game, game.players.findIndex(p => p.id === 'P2'));
  room.game = game;
  room.round = {
    ...sourceRound, phase: 'declarations', contract: 'two', takerId: 'P2', calledTarokk: 20,
    startingPlayerId: 'P2', currentPlayerId: 'P1',
    auctionOutcome: { takerId: 'P2', contract: 'two', calledTarokk: 20 },
  };
  room.declarationWindow = createDeclarationWindow(['P1', 'P2', 'P3', 'P4'], true);
  room.connected.add('P1');
  return room;
}

test('a rejtett ellenpár kontra-piszkozata megnyitja a jogszerű bemondásokat, de előnézetkor nem rögzül', () => {
  const room = buildHiddenDefenceRoom();
  const eventsBefore = room.publicEvents.length;
  const beforeContra = room.legalActionHints('P1').declarationActions.map(a => a.type === 'declare' ? a.declaration : a.type);
  assert.deepEqual(beforeContra, ['pass']);

  const preview = room.previewDeclarationActions('P1', [
    { type: 'game-contra', displayLabel: 'Kontra a játékra' },
    { type: 'declare', declaration: 'tuletroa', displayLabel: 'Trull' },
  ]);
  const offered = preview.map(a => a.type === 'declare' ? a.declaration : a.type);
  assert.ok(offered.includes('fourKings'), 'Kontra után fel kell ajánlani a Négy királyt');
  assert.ok(offered.includes('xxiFogas'), 'XXI-fogás külön bemondásként jelenjen meg');
  assert.ok(offered.includes('centrum'), 'Trull piszkozat után meg kell jelennie a Centrumnak');
  assert.equal(room.game.gameContraState, undefined, 'az előnézet nem módosíthatja a játékot');
  assert.equal(room.game.declarations.declarations.length, 0, 'az előnézet nem rögzítheti a Trullt');
  assert.equal(room.declarationWindow.records.length, 0, 'az előnézet nem írhatja az eseménynaplót');
  assert.equal(room.publicEvents.length, eventsBefore, 'az előnézet nem publikálhat eseményt');
});

test('a kontra és a bemondás csak a Passz véglegesítésekor kerül rögzítésre', () => {
  const room = buildHiddenDefenceRoom();
  const result = room.dispatch('P1', room.sequence, {
    type: 'declaration-batch',
    actions: [
      { type: 'game-contra', displayLabel: 'Kontra a játékra' },
      { type: 'declare', declaration: 'tuletroa', displayLabel: 'Trull' },
    ],
  });
  assert.equal(room.game.gameContraState.level, 'kontra');
  assert.equal(room.game.gameContraState.records.length, 1);
  assert.ok(room.game.declarations.declarations.some(d => d.type === 'tuletroa' && d.ownerId === 'P1'));
  assert.equal(room.declarationWindow.records.at(-1).type, 'pass');
  const lastEvent = room.publicEvents.at(-1);
  assert.equal(lastEvent.type, 'action-accepted');
  assert.match(lastEvent.message, /Kontra a játékra/);
  assert.match(lastEvent.message, /Trull/);
  assert.match(lastEvent.message, /Passz/);
  assert.equal(result.phase, 'declarations');
});

test('a tényleges játékállapotban bemondott és teljesített ellenpár-Trull az ellenpárhoz kerül', () => {
  const ids = ['P1', 'P2', 'P3', 'P4'];
  let game = createInitialState(ids, 0);
  game = setPartnership(game, 'P2', 'P3');
  game = recordPartnerCall(game, 20, 'P3');
  game = startDeclarations(game, game.players.findIndex(p => p.id === 'P2'));
  game = declareFigureInGame(game, 'tuletroa', 'P1', 1);
  assert.match(game.declarations.declarations[0].pairId, /^defence:/, 'a motor a tényleges ellenpár-oldalt rögzítse');
  const progress = {
    ...game.declarations,
    declarations: game.declarations.declarations.map(d => ({ ...d, status: 'fulfilled' })),
  };
  const figures = figureSettlementsFromProgress(progress, 'P2', 'P3');
  assert.equal(figures[0].ownerIsTakerPair, false);
  assert.equal(figures[0].ownerId, 'P1');
  const settlement = calculateSettlement({
    contract: 'three', takerPairWon: true, takerTrickPoints: 60, gameContra: 'none',
    figures, playerIds: ['P1', 'P2', 'P3', 'P4'], takerId: 'P2', partnerId: 'P3',
  });
  const trull = settlement.lines.find(line => line.type === 'tuletroa');
  assert.equal(trull.ownerId, 'P1');
  assert.equal(trull.ownerSide, 'defence');
  assert.equal(trull.positiveForTakerPair, false);
  assert.ok(settlement.byPlayer.P1 > 0, 'a teljesített ellenpár-Trull pontja az ellenpárnak jár');
  assert.ok(settlement.byPlayer.P2 < 0, 'a felvevő pár nettó elszámolása ennek megfelelően csökken');
  assert.equal(settlement.byPlayer.P2, settlement.byPlayer.P3, 'a felvevőpár két tagja azonos nettó elszámolást kap');
  assert.equal(settlement.byPlayer.P1, settlement.byPlayer.P4, 'az ellenpár két tagja azonos nettó elszámolást kap');
});

test('a bemondásra tett ellenpár-kontra is piszkozatként visszavonható és csak Passzkor rögzül', () => {
  const room = buildHiddenDefenceRoom();
  room.game = declareFigureInGame(room.game, 'tuletroa', 'P2', 1);
  const trull = room.game.declarations.declarations.find(d => d.type === 'tuletroa');
  assert.ok(trull);
  const eventsBefore = room.publicEvents.length;

  room.previewDeclarationActions('P1', [{ type: 'declaration-contra', declarationId: trull.id, displayLabel: 'Kontra a Trullra' }]);
  assert.equal(room.game.declarations.declarations.find(d => d.id === trull.id).contra.level, 'none');
  assert.equal(room.publicEvents.length, eventsBefore);

  room.dispatch('P1', room.sequence, {
    type: 'declaration-batch',
    actions: [{ type: 'declaration-contra', declarationId: trull.id, displayLabel: 'Kontra a Trullra' }],
  });
  const committed = room.game.declarations.declarations.find(d => d.id === trull.id);
  assert.equal(committed.contra.level, 'kontra');
  assert.equal(committed.contra.records[0].side, 'defence');
  assert.equal(room.declarationWindow.records.at(-1).type, 'pass');
  assert.match(room.publicEvents.at(-1).message, /Kontra a Trull/);
  assert.match(room.publicEvents.at(-1).message, /Passz/);
});


test('a kiadási JavaScript-motor is felajánlja a XXI-fogást', () => {
  const options = releaseAvailableDeclarations([], {
    isTaker: true, firstRound: true, previousDeclarations: [], partnersKnown: true, trullDeclared: true,
  });
  assert.ok(options.some(option => option.type === 'xxiFogas'));
});


test('a soron kívüli ellenpár-kontra külön, visszavonható előkészítéshez kap jogi lehetőséget', () => {
  const room = buildHiddenDefenceRoom();
  room.game = declareFigureInGame(room.game, 'tuletroa', 'P2', 1);
  const trull = room.game.declarations.declarations.find(d => d.type === 'tuletroa');
  room.round = { ...room.round, currentPlayerId: 'P2' };
  room.declarationWindow = createDeclarationWindow(['P2', 'P3', 'P4', 'P1'], true);
  room.connected.add('P1');
  const hints = room.legalActionHints('P1');
  assert.ok(hints.declarationContraActions?.some(d => d.id === trull.id), 'a védekező játékos lássa a megkontrázható Trullt akkor is, ha nem ő következik');
  assert.ok(hints.gameContra?.level, 'a játékra tett kontra is látszódjon a piszkozatban');
  assert.equal(room.game.gameContraState, undefined, 'a kontra megjelenítése önmagában ne rögzítse a játék-kontrát');
  assert.equal(room.game.declarations.declarations.find(d => d.id === trull.id).contra.level, 'none', 'a megjelenítés önmagában ne rögzítsen bemondás-kontrát');
  assert.ok(room.legalActionTypes('P1').includes('game-contra'));
  assert.ok(room.legalActionTypes('P1').includes('declaration-contra'));
  const beforeRecords = room.declarationWindow.records.length;
  room.dispatch('P1', room.sequence, { type: 'declaration-contra', declarationId: trull.id });
  assert.equal(room.game.declarations.declarations.find(d => d.id === trull.id).contra.level, 'kontra');
  assert.equal(room.round.currentPlayerId, 'P2', 'a soron kívüli kontra ne vegye el a soron következő játékos bemondási körét');
  assert.equal(room.declarationWindow.records.length, beforeRecords, 'a soron kívüli kontra ne módosítsa a másik játékos passz-/bemondási sorát');
});
