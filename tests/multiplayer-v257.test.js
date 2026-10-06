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

test('v2.59 declarations are serial, allow multiple declarations per turn, and continue into later rounds until three passes', () => {
  let w = createDeclarationWindow(['A','B','C','D']);
  const hand = createDeck().slice(0, 9);
  w = applyDeclarationAction(w, {type:'declare', playerId:'A', declaration:'doubleGame'}, hand);
  w = applyDeclarationAction(w, {type:'declare', playerId:'A', declaration:'fourKings'}, hand);
  assert.equal(currentDeclarer(w), 'A');
  w = applyDeclarationAction(w, {type:'pass', playerId:'A'}, hand);
  assert.equal(currentDeclarer(w), 'B');
  w = applyDeclarationAction(w, {type:'declare', playerId:'B', declaration:'doubleGame'}, hand);
  assert.equal(currentDeclarer(w), 'B');
  w = applyDeclarationAction(w, {type:'pass', playerId:'B'}, hand);
  w = applyDeclarationAction(w, {type:'pass', playerId:'C'}, hand);
  assert.equal(currentDeclarer(w), 'D');
  w = applyDeclarationAction(w, {type:'pass', playerId:'D'}, hand);
  assert.equal(w.finished, true);
});

test('v2.57 multiplayer UI shows specific contra targets and settlement/last-trick boxes', () => {
  const ui = fs.readFileSync(new URL('../src/ui/multiplayer.js', import.meta.url), 'utf8');
  assert.match(ui, /declarationContraActions/);
  assert.match(ui, /\$\{esc\(item\.label/);
  assert.match(ui, /Legutóbbi lezárt ütés/);
  assert.match(ui, /nettó/);
  assert.match(ui, /handCards = state\.phase === 'play'/);
});


test('v2.59 simple Hármas ends after the fourth player passes', async () => {
  const { createAuction, legalAuctionActions, applyAuctionAction } = await import('../src/engine/auction.js');
  const hand = { A: [22], B: [21], C: [20], D: [19] };
  let a = createAuction(['A','B','C','D'], 0);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hand);
  a = applyAuctionAction(a, {type:'pass'}, hand);
  a = applyAuctionAction(a, {type:'pass'}, hand);
  a = applyAuctionAction(a, {type:'pass'}, hand);
  assert.equal(a.finished, true);
  assert.deepEqual(legalAuctionActions(a, 'A', hand), []);
});

test('v2.58 one declaration turn may contain multiple declarations before passing', async () => {
  const { createDeclarationWindow, applyDeclarationAction, currentDeclarer } = await import('../src/engine/declarationWindow.js');
  let w = createDeclarationWindow(['A','B','C','D']);
  const hand = createDeck().slice(0, 9);
  w = applyDeclarationAction(w, {type:'declare', playerId:'A', declaration:'doubleGame'}, hand);
  w = applyDeclarationAction(w, {type:'declare', playerId:'A', declaration:'fourKings'}, hand);
  assert.equal(currentDeclarer(w), 'A');
  assert.equal(w.records.length, 2);
  w = applyDeclarationAction(w, {type:'pass', playerId:'A'}, hand);
  assert.equal(currentDeclarer(w), 'B');
});

test('v2.58 locked cards may be played early only when they are the sole legal card', async () => {
  const { createInitialState, setPartnership, recordPartnerCall, declareFigureInGame, legalCardsForPlay, playCard } = await import('../src/engine/game.js');
  const deck = createDeck();
  let g = createInitialState(['A','B','C','D']);
  g = { ...g, phase:'declarations', players:g.players.map(p => ({...p, hand: p.id === 'A' ? [deck.find(c => c.id === 'T20'), deck.find(c => c.id === 'hearts-Q')].filter(Boolean) : []})) };
  g = setPartnership(g, 'A', 'B');
  g = recordPartnerCall(g, 19, 'B');
  g = declareFigureInGame(g, 'centrum', 'A', 1);
  g = { ...g, phase:'play', trick:{leader:'C', cards:[{player:'C', card:deck.find(c => c.id === 'hearts-K')}]}, leadSuit:'hearts', nextPlayerIndex:0 };
  const legal = legalCardsForPlay(g, 'A');
  assert.deepEqual(legal.map(c=>c.id), ['hearts-Q']);
  g = { ...g, players:g.players.map(p => p.id==='A' ? {...p, hand:[deck.find(c=>c.id==='T20')] } : p), trick:{leader:'C', cards:[{player:'C', card:deck.find(c=>c.id==='hearts-K')}]}, leadSuit:'hearts', nextPlayerIndex:0 };
  assert.doesNotThrow(() => playCard(g,'A','T20'));
});

test('v2.58 current-turn contra only exposes the correct side, allowing rekontra on the responding turn', async () => {
  const { createInitialState, setPartnership, recordPartnerCall, declareFigureInGame, canRaiseDeclarationContraInGame, raiseDeclarationContraInGame } = await import('../src/engine/game.js');
  let g = setPartnership(createInitialState(['A','B','C','D']), 'A','B');
  g = recordPartnerCall(g,19,'B');
  g = { ...g, phase:'declarations' };
  g = declareFigureInGame(g,'fourKings','A',1);
  const id = g.declarations.declarations[0].id;
  g = raiseDeclarationContraInGame(g,id,'C');
  assert.equal(canRaiseDeclarationContraInGame(g,id,'A'), true);
  assert.equal(canRaiseDeclarationContraInGame(g,id,'C'), false);
  g = raiseDeclarationContraInGame(g,id,'A');
  assert.equal(g.declarations.declarations[0].contra.level,'rekontra');
});
