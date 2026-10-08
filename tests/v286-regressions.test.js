import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIDeclaration } from '../src/engine/aiDeclarations.js';
import { preferredOpeningLeadCard } from '../src/engine/leadConventions.js';
import { calculateSettlement } from '../src/engine/settlement.js';
import { createInitialState } from '../src/engine/game.js';

const T=(rank)=>({id:`T${rank}`,kind:'tarokk',rank,points:rank===22?5:rank===21?5:rank===1?5:1});
const S=(suit,rank)=>({id:`${suit}${rank}`,kind:'suit',suit,rank,points:rank==='K'?5:rank==='Q'?4:rank==='C'?3:2});

test('XIX-hívott partner 8 tarokk + Skíz + XXI esetén kötelező Trull',()=>{
  const hand=[22,21,20,19,18,17,16,15].map(T).concat([S('hearts','K')]);
  const r=chooseAIDeclaration(hand,{isPartner:true,isTaker:false,calledTarokk:19,previousDeclarations:[],trullDeclared:false,trullOmittedByTaker:false,contract:'three'});
  assert.equal(r.action.type,'tuletroa');
});

test('8 tarokkos felvevő után a partner első vezetése színezés',()=>{
  const g=createInitialState(['P1','P2','P3','P4'],0);
  const state={...g,takerId:'P1',partnerId:'P3',announcedTarokkCounts:{P1:8},players:g.players.map(p=>({
    ...p,
    hand:p.id==='P3'?[S('hearts','Q'),S('spades','10'),T(5),T(10)]:p.hand
  }))};
  const c=preferredOpeningLeadCard(state,'P3',{likelyTarokks:[]});
  assert.equal(c?.kind,'suit');
});

test('teljes elszámolás a 8 tarokk azonnali pontjaival együtt +9 +5 -7 -7',()=>{
  const settlement=calculateSettlement({contract:'three',takerPairWon:false,takerTrickPoints:40,takerSkartPoints:0,defenceSkartPoints:0,gameContra:'kontra',playerIds:['A','B','C','D'],takerId:'A',partnerId:'B',figures:[
    {type:'tuletroa',points:1,ownerPairWon:true,ownerIsTakerPair:true,silent:true},
    {type:'sasUltimo',points:5,ownerPairWon:true,ownerIsTakerPair:false,silent:true}
  ]});
  assert.equal(settlement.netForTakerPair,-6);
  assert.deepEqual(settlement.byPlayer,{A:-6,B:-6,C:6,D:6});
  const instant={A:-1,B:-1,C:3,D:-1};
  const final=Object.fromEntries(Object.entries(instant).map(([k,v])=>[k,v+settlement.byPlayer[k]]));
  assert.deepEqual(final,{A:-7,B:-7,C:9,D:5});
});

test('8 tarokk partneri vezetés nem tarokk, ha van fej nélküli szín',()=>{
  const g=createInitialState(['P1','P2','P3','P4'],0);
  const state={...g,takerId:'P1',partnerId:'P3',contract:'three',announcedTarokkCounts:{P1:9},players:g.players.map(p=>({
    ...p,hand:p.id==='P3'?[S('hearts','Q'),S('spades','10'),T(5),T(10)]:p.hand
  }))};
  const c=preferredOpeningLeadCard(state,'P3',{likelyTarokks:[]});
  assert.equal(c?.kind,'suit');
});
