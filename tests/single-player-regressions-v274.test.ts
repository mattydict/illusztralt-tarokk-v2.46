// @ts-nocheck
import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIAuctionAction } from '../src/engine/aiAuction.ts';
import { chooseAICardAtDifficulty } from '../src/engine/aiPlay.js';
import { createDeck } from '../src/engine/cards.js';
import { createInitialState, playCard, setPartnership, recordPartnerCall, startPlay } from '../src/engine/game.js';
import { initialDeclarationProgress, evaluateDeclarations } from '../src/engine/declarationLifecycle.js';
import { figureSettlementsFromProgress } from '../src/engine/settlement.js';

function t(rank){ return {id:`T${rank}`,kind:'tarokk',rank,points:rank===22?5:rank>=20?5:4}; }
function s(suit,rank,points=1){ return {id:`${suit}-${rank}`,kind:'suit',suit,rank,points}; }

test('v2.74 single-player nyitó Kettes csak 8 tarokk vagy 7 tarokk + 2 király esetén', () => {
  const auction={seats:[{playerId:'A',seat:0},{playerId:'B',seat:1},{playerId:'C',seat:2},{playerId:'D',seat:3}],currentSeat:0,bids:[],highest:null,finished:false};
  const hands={A:[t(22),t(21),t(20),t(19),t(18),t(17),t(16),s('hearts','K'),s('diamonds','K')]};
  const strong=chooseAIAuctionAction(auction,'A',hands.A,hands,{singlePlayer:true}).action;
  assert.equal(strong.contract,'two');
  const weakHand=[t(22),t(21),t(20),t(19),t(18),t(17),t(16),s('hearts','K'),s('diamonds','Q')];
  const weak=chooseAIAuctionAction(auction,'A',weakHand,{A:weakHand},{singlePlayer:true}).action;
  assert.notEqual(weak.contract,'two');
});

test('v2.74 single-player ellenpár kontra nélkül nem indul tarokkal', () => {
  let g=createInitialState(['A','B','C','D'],0);
  g={...g,phase:'play',takerId:'A',partnerId:'B',calledTarokk:20,contract:'three',players:g.players.map((p,i)=>({...p,active:true,hand:i===2?[t(10),t(19),s('hearts','7'),s('clubs','8')]:[]})),trick:{leader:'C',cards:[]},nextPlayerIndex:2,completedTricks:[],declarations:initialDeclarationProgress(),skartsByPlayer:{A:[],B:[],C:[],D:[]}};
  const d=chooseAICardAtDifficulty(g,'C',undefined,'expert',{singlePlayer:true});
  assert.equal(d.card.kind,'suit');
});

test('v2.74 csendes Pagátultimó bekerül az elszámolásba', () => {
  const tricks=Array.from({length:8},(_,i)=>({winner:'A',cards:[{player:'A',card:s('hearts',String(i+3),1)}]}));
  tricks.push({winner:'A',cards:[{player:'A',card:t(1)},{player:'B',card:s('clubs','K',5)}]});
  const progress=evaluateDeclarations(initialDeclarationProgress(),tricks,id=>id==='A'?'taker':'defence',9,{taker:0,defence:0});
  const figures=figureSettlementsFromProgress(progress,'A','B');
  const pagat=figures.find(x=>x.type==='pagatUltimo');
  assert.equal(pagat?.silent,true);
  assert.equal(pagat?.points,5);
});
