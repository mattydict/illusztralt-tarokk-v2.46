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

test('A3 BPass C2 gives D a real Pass turn instead of skipping D', () => {
  const hands = {
    A: [{ kind:'tarokk', rank:22, id:'A22', points:5 }, ...Array.from({length:8},(_,i)=>({kind:'suit',suit:'hearts',rank:'Q',id:`Ah${i}`,points:4}))],
    B: [{ kind:'tarokk', rank:21, id:'B21', points:5 }, ...Array.from({length:8},(_,i)=>({kind:'suit',suit:'diamonds',rank:'Q',id:`Bd${i}`,points:4}))],
    C: [{ kind:'tarokk', rank:22, id:'C22', points:5 }, ...Array.from({length:8},(_,i)=>({kind:'suit',suit:'clubs',rank:'Q',id:`Cc${i}`,points:4}))],
    D: [{ kind:'suit',suit:'spades',rank:'Q',id:'Dq0',points:4 }, ...Array.from({length:8},(_,i)=>({kind:'suit',suit:'spades',rank:'J',id:`Ds${i}`,points:3}))],
  };
  let a = createAuction(['A','B','C','D'],0);
  a = bid(a,'A',{type:'bid',contract:'three'},hands);
  a = bid(a,'B',{type:'pass'},hands);
  a = bid(a,'C',{type:'bid',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'D');
  assert.deepEqual(legalAuctionActions(a,'D',hands),[{type:'pass'}]);
});

test('simple Hármas reaches finished auction only after the fourth player manually passes', () => {
  const makeHand = (id, honour) => [{kind:'tarokk',rank:honour,id:`${id}${honour}`,points:5}, ...Array.from({length:8},(_,i)=>({kind:'suit',suit:'hearts',rank:'Q',id:`${id}h${i}`,points:4}))];
  const hands = {A:makeHand('A',22),B:makeHand('B',21),C:makeHand('C',22),D:makeHand('D',22)};
  let a=createAuction(['A','B','C','D'],0);
  a=bid(a,'A',{type:'bid',contract:'three'},hands);
  a=bid(a,'B',{type:'pass'},hands);
  a=bid(a,'C',{type:'pass'},hands);
  a=bid(a,'D',{type:'pass'},hands);
  assert.equal(a.finished,true);
});

test('auction closure immediately distributes the talon in the authoritative multiplayer room', async () => {
  const { AuthoritativeRoom } = await import('../src/server/authoritativeRoom.js');
  const room = new AuthoritativeRoom({ roomId:'talon-regression', playerIds:['A','B','C','D'], dealerIndex:3, random:()=>0 });
  const makeHand = (id, honour) => [{kind:'tarokk',rank:honour,id:`${id}T${honour}`,points:5}, ...Array.from({length:8},(_,i)=>({kind:'suit',suit:'hearts',rank:'Q',id:`${id}H${i}`,points:4}))];
  room.round.players = room.round.players.map((p,i) => ({...p, hand: makeHand(p.playerId,[22,21,22,22][i]), receivedTalon: [], skart: []}));
  let seq = room.exportPersistedState().sequence;
  for (const [playerId, action] of [
    ['A',{type:'auction',action:{type:'bid',contract:'three'}}],
    ['B',{type:'auction',action:{type:'pass'}}],
    ['C',{type:'auction',action:{type:'pass'}}],
    ['D',{type:'auction',action:{type:'pass'}}],
  ]) {
    const snapshot = room.dispatch(playerId, seq, action);
    seq = snapshot.sequence;
  }
  assert.equal(room.round.phase, 'skart');
  assert.deepEqual(room.round.players.map(p => p.receivedTalon.length), [3,1,1,1]);
  assert.deepEqual(room.round.players.map(p => p.hand.length), [12,10,10,10]);
});
