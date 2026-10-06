import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';
import { createInitialState, legalCardsForPlay, playCard } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { applyDeclaredFigureLocks, declaredFigureDeadline } from '../src/engine/play.js';

function bid(state, playerId, action, hands) {
  // auction helpers use state.currentSeat, so playerId is asserted by this lookup.
  const actual = state.seats[state.currentSeat].playerId;
  assert.equal(actual, playerId);
  return applyAuctionAction(state, action, hands);
}

test('egyszerű Hármas: a negyedik passz lezárja az aukciót', () => {
  let a = createAuction(['A','B','C','D'], 0);
  const hands = Object.fromEntries(['A','B','C','D'].map(id => [id, createDeck().slice(0,9)]));
  hands.A = createDeck().slice(0,9);
  // Ensure A has an honour.
  const deck = createDeck();
  hands.A = [deck.find(c => c.id === 'T22'), ...deck.filter(c => c.id !== 'T22').slice(0,8)];
  a = bid(a,'A',{type:'bid',contract:'three'},hands);
  a = bid(a,'B',{type:'pass'},hands);
  a = bid(a,'C',{type:'pass'},hands);
  a = bid(a,'D',{type:'pass'},hands);
  assert.equal(a.finished,true);
  assert.equal(a.highest.contract,'three');
  assert.equal(a.simpleThreeReturn,undefined);
});

test('lekötött kártyák közül több választási lehetőség esetén mindkettő lehetséges, ha mindkettő maradt egyedüli kötelezettségként', () => {
  const legal = [
    {id:'T20',kind:'tarokk',rank:20,points:5},
    {id:'T21',kind:'tarokk',rank:21,points:5},
  ];
  const hand = [...legal];
  const declarations = { declarations: [
    {id:'d1',type:'centrum',status:'active',ownerId:'A',targetCardId:'T20'},
    {id:'d2',type:'kismadar',status:'active',ownerId:'A',targetCardId:'T21'},
  ] };
  const filtered = applyDeclaredFigureLocks(legal, hand, declarations, 4, 'A');
  assert.deepEqual(filtered.map(c=>c.id).sort(),['T20','T21']);
});

test('lekötött kártya nem blokkolható, ha nem az egyetlen normálisan kijátszható lap', () => {
  const legal = [
    {id:'T20',kind:'tarokk',rank:20,points:5},
    {id:'H-Q',kind:'suit',suit:'hearts',rank:'Q',points:4},
  ];
  const hand = [...legal];
  const declarations = { declarations: [
    {id:'d1',type:'centrum',status:'active',ownerId:'A',targetCardId:'T20'},
  ] };
  const filtered = applyDeclaredFigureLocks(legal, hand, declarations, 4, 'A');
  assert.deepEqual(filtered.map(c=>c.id),['H-Q']);
});

import { createRound, dealRound } from '../src/engine/round.js';
test('dealRound preserves cumulative player scores', () => {
  const r = createRound(['A','B','C','D'], 1);
  r.players = r.players.map((p, i) => ({ ...p, score: i * 7 }));
  const next = dealRound(r, () => 0);
  assert.deepEqual(next.players.map(p => p.score), [0,7,14,21]);
});
