import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthoritativeRoom } from '../src/server/authoritativeRoom.js';
import { LobbyService } from '../server/lobby.mjs';

const cardsFor = (room, playerId) => {
  const h = room.snapshotFor(playerId).legalActionHints;
  return h.skartCardIds.slice(0, h.skartCount);
};

test('v2.87 öt fős szoba: az osztó kimarad, a tőle jobbra ülő kezd', () => {
  const room = createAuthoritativeRoom({ roomId:'FIVE-SEAT', playerIds:['P1','P2','P3','P4','P5'], dealerIndex:0, random:()=>0.05 });
  assert.deepEqual(room.activePlayerIds, ['P2','P3','P4','P5']);
  assert.equal(room.dealerPlayerId, 'P1');
  assert.equal(room.round.startingPlayerId, 'P2');
  assert.equal(room.round.players.length, 4);
  assert.equal(room.round.players.some(p => p.playerId === 'P1'), false);
  assert.equal(room.snapshotFor('P1').players.length, 5);
  assert.equal(room.snapshotFor('P1').players.find(p => p.id === 'P1')?.dealer, true);
  assert.equal(room.snapshotFor('P1').players.find(p => p.id === 'P1')?.active, false);
});

test('v2.87 öt fős az első leosztás után az előző induló játékos lesz az új osztó', () => {
  const room = createAuthoritativeRoom({ roomId:'FIVE-ROTATE', playerIds:['P1','P2','P3','P4','P5'], dealerIndex:0, random:()=>0.05 });
  const firstBid = room.snapshotFor('P2').legalActionHints.auctionActions.find(a => a.type === 'bid');
  assert.ok(firstBid);
  room.dispatch('P2',0,{type:'auction',action:firstBid});
  while (room.round.phase === 'auction') {
    const id = room.currentPlayerId;
    const actions = room.snapshotFor(id).legalActionHints.auctionActions || [];
    const pass = actions.find(a => a.type === 'pass');
    room.dispatch(id,room.sequence,{type:'auction',action:pass ?? actions[0]});
  }
  const dealerP = room.snapshotFor('P1');
  assert.equal(dealerP.legalActionTypes.length,0);
  for (const id of room.round.players.map(p => p.playerId)) room.dispatch(id,room.sequence,{type:'skart',cardIds:cardsFor(room,id)});
  const taker='P2';
  for (const id of room.round.players.filter(p=>p.playerId!==taker && p.skartTarokkCount>0).map(p=>p.playerId)) room.dispatch(id,room.sequence,{type:'skart-announce'});
  const call=room.snapshotFor(taker).legalActionHints.partnerRanks[0];
  room.dispatch(taker,room.sequence,{type:'partner-call',rank:call});
  for (const id of room.declarationWindow.order) room.dispatch(id,room.sequence,{type:'declaration',action:{type:'pass'}});
  // Complete the deal by always selecting the first legal play card.
  for (let i=0;i<40 && room.round.phase==='play';i++) {
    const leader=room.currentPlayerId;
    const ids=room.snapshotFor(leader).legalActionHints.playCardIds;
    room.dispatch(leader,room.sequence,{type:'play-card',cardId:ids[0]});
  }
  assert.equal(room.dealerIndex,1);
  assert.equal(room.dealerPlayerId,'P2');
  assert.deepEqual(room.activePlayerIds,['P1','P3','P4','P5']);
  assert.equal(room.round.startingPlayerId,'P3');
  assert.equal(room.round.players.length,4);
  assert.equal(room.round.players.some(p=>p.playerId==='P2'),false);
});

test('v2.87 öt fős azonnali 8 tarokk elszámolásnál az osztó 0 marad', () => {
  const room = createAuthoritativeRoom({ roomId:'FIVE-TAROKK8', playerIds:['P1','P2','P3','P4','P5'], dealerIndex:0, random:()=>0.123 });
  room.recordInstantTarokkScore('P2',8);
  assert.deepEqual(room.matchScores,{P1:0,P2:3,P3:-1,P4:-1,P5:-1});
});

test('v2.87 lobby: 5 fős szoba öt hellyel jön létre', () => {
  const lobby = new LobbyService({ store:{ loadAll(){return[]}, save(){}, remove(){}, close(){} } });
  const c=lobby.create({displayName:'Teszt',playerCount:5,matchRounds:1});
  assert.equal(c.status.playerCount,5);
  assert.equal(c.status.joinedCount,1);
  assert.equal(c.status.dealerPlayerId,'P1');
  assert.deepEqual(c.status.seats.map(s=>s.playerId),['P1','P2','P3','P4','P5']);
  lobby.join(c.roomId,{displayName:'J2'});
  lobby.join(c.roomId,{displayName:'J3'});
  lobby.join(c.roomId,{displayName:'J4'});
  const j5=lobby.join(c.roomId,{displayName:'J5'});
  assert.equal(j5.status.joinedCount,5);
  assert.equal(j5.status.ready,false);
  for (const id of ['P1','P2','P3','P4','P5']) lobby.room(c.roomId).connect(id);
  assert.equal(lobby.status(c.roomId).ready,true);
});
