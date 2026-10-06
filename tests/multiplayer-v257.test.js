import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';
import { createInitialState, setPartnership, recordPartnerCall, declareFigureInGame } from '../src/engine/game.js';
import { createDeclarationWindow, applyDeclarationAction, currentDeclarer } from '../src/engine/declarationWindow.js';
import { createDeck } from '../src/engine/cards.js';

const tarokk = (r) => createDeck().find(c => c.kind === 'tarokk' && c.rank === r);
const suitKing = (s) => createDeck().find(c => c.kind === 'suit' && c.suit === s && c.rank === 'K');

function setPartnerScenario(takerHandRanks) {
  const room = createAuthoritativeRoom({ roomId:`PC-${Math.random()}`, playerIds:['A','B','C','D'], dealerIndex:0 });
  const hands = {
    A: takerHandRanks.map(tarokk).filter(Boolean).concat([suitKing('hearts')]),
    B: [19,18,17,16].map(tarokk).filter(Boolean),
    C: [20,15,14,13].map(tarokk).filter(Boolean),
    D: [21,22,12,11].map(tarokk).filter(Boolean),
  };
  room.round = {
    ...room.round,
    phase:'partner-call',
    takerId:'A',
    contract:'one',
    auctionOutcome:{ contract:'one', takerId:'A' },
    currentPlayerId:'A',
    players: room.round.players.map(p => ({...p, hand:hands[p.playerId], receivedTalon:[], skart:[]})),
  };
  return room;
}

test('v2.57 partner call: no XX means XX is the only normal call', () => {
  const room = setPartnerScenario([19,18,17]);
  const ranks = room.snapshotFor('A').legalActionHints.partnerRanks;
  assert.deepEqual(ranks, [20]);
});

test('v2.57 partner call: XX in hand permits the first missing high tarokk and rare XX self-call', () => {
  const room = setPartnerScenario([20]);
  const ranks = room.snapshotFor('A').legalActionHints.partnerRanks;
  assert.deepEqual(ranks, [19,20]);
});

test('v2.57 partner call: XX+XIX means XVIII or rare XX self-call, not arbitrary lower cards', () => {
  const room = setPartnerScenario([20,19]);
  const ranks = room.snapshotFor('A').legalActionHints.partnerRanks;
  assert.deepEqual(ranks, [18,20]);
});

test('v2.57 partner call: fixed invite overrides normal partner-call menu', () => {
  const room = setPartnerScenario([20,19]);
  room.round.auctionOutcome = { contract:'solo', takerId:'A', calledTarokk:18 };
  room.round.invitedTarokk = 18;
  const ranks = room.snapshotFor('A').legalActionHints.partnerRanks;
  assert.deepEqual(ranks, [18]);
});

test('v2.57 King Ultimo/Uhu can target only a king actually held by the declarer', () => {
  let g = createInitialState(['A','B','C','D']);
  const deck = createDeck();
  const aHand = [deck.find(c => c.id === 'T22'), deck.find(c => c.id === 'T19'), deck.find(c => c.id === 'hearts-K')].filter(Boolean);
  g = { ...g, phase:'declarations', players:g.players.map(p => p.id === 'A' ? {...p, hand:aHand} : p), takerId:'A', partnerId:'B', calledTarokk:19 };
  assert.throws(() => declareFigureInGame(g, 'kingUltimo', 'A', 1, 'spades-K'), /csak a bemondó saját kezében lévő király/i);
  g = declareFigureInGame(g, 'kingUltimo', 'A', 1, 'hearts-K');
  assert.equal(g.declarations.declarations[0].targetCardId, 'hearts-K');
});

test('v2.57 declarations are serial and continue into a second round until three consecutive passes', () => {
  let w = createDeclarationWindow(['A','B','C','D']);
  const hand = createDeck().slice(0, 9);
  w = applyDeclarationAction(w, {type:'declare', playerId:'A', declaration:'doubleGame'}, hand);
  assert.equal(currentDeclarer(w), 'B');
  w = applyDeclarationAction(w, {type:'pass', playerId:'B'}, hand);
  w = applyDeclarationAction(w, {type:'declare', playerId:'C', declaration:'doubleGame'}, hand);
  assert.equal(currentDeclarer(w), 'D');
  w = applyDeclarationAction(w, {type:'declare', playerId:'D', declaration:'doubleGame'}, hand);
  assert.equal(currentDeclarer(w), 'A');
  assert.equal(w.consecutivePasses, 0);
});

test('v2.57 multiplayer UI shows specific contra targets and settlement/last-trick boxes', () => {
  const ui = fs.readFileSync(path.resolve('src/ui/multiplayer.js'), 'utf8');
  assert.match(ui, /declarationContraActions/);
  assert.match(ui, /\$\{esc\(item\.label/);
  assert.match(ui, /Legutóbbi lezárt ütés/);
  assert.match(ui, /nettó/);
  assert.match(ui, /handCards = state\.phase === 'play'/);
});
