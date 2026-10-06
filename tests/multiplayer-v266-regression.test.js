import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';
import { createDeck } from '../src/engine/cards.js';
import { createDeclarationWindow, applyDeclarationAction, currentDeclarer } from '../src/engine/declarationWindow.js';

function hand(ranks, prefix) {
  return ranks.map((rank, i) => ({kind:'tarokk', rank, id:`${prefix}T${rank}-${i}`, points:[1,21,22].includes(rank)?5:1})).concat([
    {kind:'suit',suit:'hearts',rank:'K',id:`${prefix}hK`,points:5},
    {kind:'suit',suit:'diamonds',rank:'Q',id:`${prefix}dQ`,points:4},
    {kind:'suit',suit:'spades',rank:'C',id:`${prefix}sC`,points:3},
    {kind:'suit',suit:'clubs',rank:'J',id:`${prefix}cJ`,points:2},
  ]);
}

test('v2.66 A:Pass B:Hármas C:Kettes után D is ténylegesen megszólal', () => {
  const noHonour = hand([18,17,16,15,14], 'D');
  const hands = {
    A: hand([18,17,16,15,14], 'A'),
    B: hand([22,20,19,18,17], 'B'),
    C: hand([21,19,18,17,16], 'C'),
    D: noHonour,
  };
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'three'}, hands);
  a = applyAuctionAction(a, {type:'bid', contract:'two'}, hands);
  assert.equal(a.seats[a.currentSeat].playerId, 'D');
  assert.deepEqual(legalAuctionActions(a, 'D', hands), [{type:'pass'}]);
});

test('v2.66 A:Pass B:3 C:2 D:Pass B:Tartom után C zárhatja a licitet, és B felvevőként megkapja a 2-es talont', () => {
  const room = createAuthoritativeRoom({roomId:'V266-TALON', playerIds:['A','B','C','D'], dealerIndex:3, random:()=>0.123});
  const synthetic = {
    A: hand([21,18,17,16,15], 'A'),
    B: hand([22,20,19,18,17], 'B'),
    C: hand([21,19,18,17,16], 'C'),
    D: hand([18,17,16,15,14], 'D'),
  };
  const talon = Array.from({length:6}, (_,i)=>({kind:'suit',suit:['hearts','diamonds','spades','clubs'][i%4],rank:i<4?'K':'Q',id:`TALON-${i}`,points:i<4?5:4}));
  room.round = {...room.round, players:room.round.players.map(p=>({...p, hand:[...synthetic[p.playerId]], receivedTalon:[], skart:[], skartRevealed:false, skartAnnounced:false})), talon};
  room.dispatch('A',0,{type:'auction',action:{type:'pass'}});
  room.dispatch('B',room.sequence,{type:'auction',action:{type:'bid',contract:'three'}});
  room.dispatch('C',room.sequence,{type:'auction',action:{type:'bid',contract:'two'}});
  assert.equal(room.currentPlayerId,'D');
  assert.deepEqual(room.snapshotFor('D').legalActionHints.auctionActions,[{type:'pass'}]);
  room.dispatch('D',room.sequence,{type:'auction',action:{type:'pass'}});
  assert.equal(room.currentPlayerId,'B');
  room.dispatch('B',room.sequence,{type:'auction',action:{type:'hold',contract:'two'}});
  assert.equal(room.currentPlayerId,'C');
  room.dispatch('C',room.sequence,{type:'auction',action:{type:'pass'}});
  assert.equal(room.round.phase,'skart');
  assert.deepEqual(room.round.players.map(p=>p.receivedTalon.length), [1,2,2,1]);
});

test('v2.66 the exact 3-2 gap requires the fourth player to pass manually', () => {
  const hands = {
    A: hand([18,17,16,15,14], 'A'),
    B: hand([22,20,19,18,17], 'B'),
    C: hand([21,19,18,17,16], 'C'),
    D: hand([18,17,16,15,14], 'D'),
  };
  let a=createAuction(['A','B','C','D']);
  a=applyAuctionAction(a,{type:'pass'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'D');
  assert.deepEqual(legalAuctionActions(a,'D',hands),[{type:'pass'}]);
});

test('v2.66 declaration pure-pass streak ignores a declaration-closing Passz', () => {
  let w=createDeclarationWindow(['A','B','C','D']);
  w=applyDeclarationAction(w,{type:'declare',playerId:'A',declaration:'doubleGame'});
  w=applyDeclarationAction(w,{type:'pass',playerId:'A'});
  assert.equal(currentDeclarer(w),'B');
  assert.equal(w.consecutivePasses,0);
  w=applyDeclarationAction(w,{type:'pass',playerId:'B'});
  w=applyDeclarationAction(w,{type:'pass',playerId:'C'});
  assert.equal(w.finished,false);
  assert.equal(w.consecutivePasses,2);
  w=applyDeclarationAction(w,{type:'pass',playerId:'D'});
  assert.equal(w.finished,true);
});

test('v2.66 UI preserves the manual Passz and synced talon states', () => {
  const ui=fs.readFileSync(path.resolve('src/ui/multiplayer.js'),'utf8');
  assert.match(ui,/auctionActions/);
  assert.match(ui,/Szinkronizálás/);
  assert.match(ui,/legalActionHints/);
});
