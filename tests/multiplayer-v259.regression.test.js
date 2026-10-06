import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';
import { createDeclarationWindow } from '../src/engine/declarationWindow.js';
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


test('A:Passz B:Hármas C:Kettő does not skip D when a pass-gap exists', () => {
  const h=(id,rank)=>[{kind:'tarokk',rank,id:`${id}${rank}`,points:5}, ...Array.from({length:8},(_,i)=>({kind:'suit',suit:'hearts',rank:'Q',id:`${id}q${i}`,points:4}))];
  const hands={A:h('A',22),B:h('B',21),C:h('C',22),D:h('D',19)};
  let a=createAuction(['A','B','C','D'],0);
  a=bid(a,'A',{type:'pass'},hands);
  a=bid(a,'B',{type:'bid',contract:'three'},hands);
  a=bid(a,'C',{type:'bid',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'D');
  assert.deepEqual(legalAuctionActions(a,'D',hands),[{type:'pass'}]);
});

test('all-four-pass auction triggers a fresh auction deal in authoritative multiplayer', async () => {
  const { AuthoritativeRoom } = await import('../src/server/authoritativeRoom.js');
  const room=new AuthoritativeRoom({roomId:'all-pass-redeal',playerIds:['A','B','C','D'],dealerIndex:0,random:()=>0.1});
  const oldFirst=room.round.startingPlayerId;
  let seq=room.exportPersistedState().sequence;
  for (let i=0; i<4; i++) {
    const id=room.round.auction.seats[room.round.auction.currentSeat].playerId;
    const snap=room.dispatch(id,seq,{type:'auction',action:{type:'pass'}});
    seq=snap.sequence;
  }
  assert.equal(room.round.phase,'auction');
  assert.equal(room.round.startingPlayerId,oldFirst);
  assert.equal(room.round.players.every(p=>p.hand.length===9),true);
  assert.equal(room.round.auction.records.length,0);
});

test('pre-skart redeal conditions are detected after talon distribution', async () => {
  const { createRound } = await import('../src/engine/round.js');
  const { preSkartRedealReason } = await import('../src/engine/round.js');
  const deck=createDeck();
  const kings=deck.filter(c=>c.kind==='suit'&&c.rank==='K');
  const noTarokk=deck.filter(c=>c.kind==='suit').slice(0,10);
  const soloPagat=[deck.find(c=>c.id==='T1'), ...deck.filter(c=>c.kind==='suit').slice(0,9)];
  const soloXxi=[deck.find(c=>c.id==='T21'), ...deck.filter(c=>c.kind==='suit').slice(10,19)];
  const pagatXxi=[deck.find(c=>c.id==='T1'),deck.find(c=>c.id==='T21'), ...deck.filter(c=>c.kind==='suit').slice(19,27)];
  const mk=(hand,id)=>({playerId:id,hand,receivedTalon:[],skart:[]});
  assert.match(preSkartRedealReason({takerId:'A',players:[mk([...kings,...noTarokk.slice(0,6)],'A'),mk(noTarokk,'B'),mk(soloPagat,'C'),mk(soloXxi,'D')]}),/A: mind a négy király/);
  assert.match(preSkartRedealReason({takerId:'A',players:[mk(noTarokk,'A'),mk(noTarokk,'B'),mk(noTarokk,'C'),mk(noTarokk,'D')]}),/A: nincs tarokk/);
  assert.match(preSkartRedealReason({takerId:'A',players:[mk(soloPagat,'A'),mk(noTarokk,'B'),mk(noTarokk,'C'),mk(noTarokk,'D')]}),/A: szóló Pagát/);
  assert.match(preSkartRedealReason({takerId:'A',players:[mk(soloXxi,'A'),mk(noTarokk,'B'),mk(noTarokk,'C'),mk(noTarokk,'D')]}),/A: szóló XXI/);
  assert.match(preSkartRedealReason({takerId:'A',players:[mk(pagatXxi,'A'),mk(noTarokk,'B'),mk(noTarokk,'C'),mk(noTarokk,'D')]}),/A: csak Pagát és XXI/);
});

test('8/9 tarokk is settled immediately to all three opponents including partner', async () => {
  const { AuthoritativeRoom } = await import('../src/server/authoritativeRoom.js');
  const { createInitialState, setPartnership, recordPartnerCall, startDeclarations } = await import('../src/engine/game.js');
  const room=new AuthoritativeRoom({roomId:'instant-tarokk-score',playerIds:['A','B','C','D'],dealerIndex:0,random:()=>0.2});
  const hand=Array.from({length:9},(_,i)=>({id:`T${i+1}`,kind:'tarokk',rank:i+1,points:i===0?5:1}));
  room.round={...room.round,phase:'declarations',contract:'three',takerId:'A',startingPlayerId:'A',calledTarokk:19,currentPlayerId:'A',players:room.round.players.map(p=>p.playerId==='A'?{...p,hand,receivedTalon:[],skart:[]}:{...p,receivedTalon:[],skart:[]})};
  let g=createInitialState(['A','B','C','D'],0);
  g=setPartnership(g,'A','B');
  g=recordPartnerCall(g,19,'B');
  g=startDeclarations(g,0);
  g={...g,players:g.players.map(p=>p.id==='A'?{...p,hand}:p),contract:'three'};
  room.game=g;
  room.declarationWindow=createDeclarationWindow(['A','B','C','D']);
  room.applyDeclaration('A',{type:'tarokkCount',count:9});
  assert.deepEqual(room.matchScores,{A:6,B:-2,C:-2,D:-2});
  assert.equal(room.instantScoreHistory.at(-1).pointsEach,2);
});

test('8 tarokk is also an immediate three-opponent payment and does not wait for settlement', async () => {
  const { AuthoritativeRoom } = await import('../src/server/authoritativeRoom.js');
  const { createInitialState, setPartnership, recordPartnerCall, startDeclarations } = await import('../src/engine/game.js');
  const room=new AuthoritativeRoom({roomId:'instant-8-score',playerIds:['A','B','C','D'],dealerIndex:0,random:()=>0.2});
  const hand=Array.from({length:8},(_,i)=>({id:`T${i+1}`,kind:'tarokk',rank:i+1,points:i===0?5:1}));
  room.round={...room.round,phase:'declarations',contract:'three',takerId:'A',startingPlayerId:'A',calledTarokk:19,currentPlayerId:'A',players:room.round.players.map(p=>p.playerId==='A'?{...p,hand,receivedTalon:[],skart:[]}:{...p,receivedTalon:[],skart:[]})};
  let g=createInitialState(['A','B','C','D'],0);
  g=setPartnership(g,'A','B');
  g=recordPartnerCall(g,19,'B');
  g=startDeclarations(g,0);
  g={...g,players:g.players.map(p=>p.id==='A'?{...p,hand}:p),contract:'three'};
  room.game=g;
  room.declarationWindow=createDeclarationWindow(['A','B','C','D']);
  room.applyDeclaration('A',{type:'tarokkCount',count:8});
  assert.deepEqual(room.matchScores,{A:3,B:-1,C:-1,D:-1});
  assert.equal(room.instantScoreHistory.at(-1).pointsEach,1);
});


test('declaration turn never skips the player who has not yet spoken', async () => {
  const { AuthoritativeRoom } = await import('../src/server/authoritativeRoom.js');
  const { createInitialState, setPartnership, recordPartnerCall, startDeclarations } = await import('../src/engine/game.js');
  const room = new AuthoritativeRoom({roomId:'declaration-no-skip',playerIds:['A','B','C','D'],dealerIndex:0,random:()=>0.2});
  const simpleHand = id => [{id:`${id}T20`,kind:'tarokk',rank:20,points:5}, ...Array.from({length:9},(_,i)=>({id:`${id}h${i}`,kind:'suit',suit:'hearts',rank:'Q',points:4}))].slice(0,10);
  let g=createInitialState(['A','B','C','D'],0);
  g=setPartnership(g,'B','D');
  g=recordPartnerCall(g,19,'D');
  g=startDeclarations(g,1);
  g={...g,players:g.players.map(p=>({...p,hand:simpleHand(p.id)})),contract:'three'};
  room.game=g;
  room.declarationWindow=createDeclarationWindow(['B','C','D','A']);
  room.round={...room.round,phase:'declarations',takerId:'B',contract:'three',startingPlayerId:'B',currentPlayerId:'B'};
  room.applyDeclaration('B',{type:'pass'});
  assert.equal(room.round.currentPlayerId,'C');
  const hints=room.legalActionHints('C');
  assert.ok(hints.declarationActions.some(a=>a.type==='pass'));
  assert.throws(()=>room.applyDeclaration('D',{type:'pass'}),/bemondási akció ebben a helyzetben nem szabályos|Most nem ennek a játékosnak kell megszólalnia/);
});
