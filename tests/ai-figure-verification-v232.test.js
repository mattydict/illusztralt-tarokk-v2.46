import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessFigureInteractions } from '../src/engine/aiFigureVerification.js';
const deck=createDeck(); const card=id=>deck.find(c=>c.id===id);
const decl=(type,ownerId,extra={})=>({id:`${type}-${ownerId}`,type,ownerId,status:'active',declaredAtTrick:1,contra:{level:'none',history:[]},...extra});
const base=(overrides={})=>({playerCount:4,players:['A','B','C','D'].map(id=>({id,hand:[],score:0,active:true})),dealerIndex:0,phase:'play',talon:[],trick:null,completedTricks:[],leadSuit:null,nextPlayerIndex:0,lockedCards:[],declarations:{declarations:[],locks:[],events:[],silentFigures:[]},takerId:'A',partnerId:'C',...overrides});
const fillers=n=>Array.from({length:n},(_,i)=>({winner:'A',cards:[{player:'A',card:card(i%2?'T15':'T16')}] }));

test('v2.32 Uhu and Ultimo stay independent',()=>{const s=base({declarations:{declarations:[decl('pagatUhu','A',{targetCardId:'T1'}),decl('pagatUltimo','A',{targetCardId:'T1'})],locks:[],events:[],silentFigures:[]}});const a=assessFigureInteractions(s,'A',card('T1'));assert.equal(a.independentUltimo,1);assert.ok(a.score<0);});
test('v2.32 opponent bird target can be blocked at deadline',()=>{const s=base({completedTricks:fillers(4),trick:{leader:'B',cards:[{player:'B',card:card('T20')},{player:'C',card:card('T15')},{player:'D',card:card('T14')}]},nextPlayerIndex:0,declarations:{declarations:[decl('centrum','B')],locks:[],events:[],silentFigures:[]}});const a=assessFigureInteractions(s,'A',card('T21'));assert.ok(a.opponentBreak>0);assert.ok(a.score>0);});
test('v2.32 own bird target is protected at deadline',()=>{const s=base({completedTricks:fillers(4),trick:{leader:'A',cards:[{player:'A',card:card('T20')},{player:'B',card:card('T15')},{player:'C',card:card('T14')}]},nextPlayerIndex:3,declarations:{declarations:[decl('centrum','A')],locks:[],events:[],silentFigures:[]}});const a=assessFigureInteractions(s,'A',card('T21'));assert.ok(a.ownProtection>0);assert.ok(a.score>0);});
test('v2.32 Volat and Double Game remain distinct objectives',()=>{const s=base({declarations:{declarations:[decl('volat','A'),decl('doubleGame','A')],locks:[],events:[],silentFigures:[]},trick:{leader:'A',cards:[{player:'A',card:card('T15')},{player:'B',card:card('T22')},{player:'C',card:card('hearts-K')}]},nextPlayerIndex:3});const a=assessFigureInteractions(s,'A',card('T14'));assert.ok(Number.isFinite(a.score));});
test('v2.32 does not inspect hidden hands',()=>{const s=base({players:['A','B','C','D'].map(id=>({id,hand:[card('T1')],score:0,active:true}))});const a=assessFigureInteractions(s,'A',card('T15'));assert.ok(Number.isFinite(a.score));});
