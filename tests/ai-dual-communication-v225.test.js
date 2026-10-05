import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createPartnerBeliefState } from '../src/engine/beliefs.js';
import { assessDualCommunication } from '../src/engine/aiDualCommunication.js';
const deck=createDeck(); const card=id=>deck.find(c=>c.id===id);
function base(overrides={}) { return {playerCount:4,players:[{id:'A',hand:[card('T21'),card('T15')],score:0,active:true},{id:'B',hand:[card('T18')],score:0,active:true},{id:'C',hand:[card('T19')],score:0,active:true},{id:'D',hand:[card('T10')],score:0,active:true}],dealerIndex:0,phase:'play',talon:[],trick:{leader:'C',cards:[{player:'C',card:card('T18')}]},completedTricks:[],leadSuit:null,nextPlayerIndex:0,lockedCards:[],declarations:{declarations:[],locks:[],events:[],silentFigures:[]},takerId:'A',partnerId:'C',...overrides}; }
function beliefs(){const b=createPartnerBeliefState(); b.likelyTarokks.find(x=>x.rank===19).score=5; b.likelyTarokks.find(x=>x.rank===21).score=5; return b;}
test('v2.25 dual layer rewards partner acknowledgement with restrained opponent exposure',()=>{const b=beliefs(); const low=assessDualCommunication(base(),'A',card('T15'),b); const clear=assessDualCommunication(base(),'A',card('T21'),b); assert.ok(clear.score>low.score);});
test('v2.25 very high tarokk carries opponent-read risk when several partner hypotheses exist',()=>{const a=assessDualCommunication(base(),'A',card('T22'),beliefs()); assert.ok(a.opponentReadRisk>0);});
test('v2.25 opponent figure can increase value of a natural controlled tarokk',()=>{const s=base({declarations:{declarations:[{ownerId:'D',type:'pagatUltimo',status:'active'}],locks:[],events:[],silentFigures:[]}}); const a=assessDualCommunication(s,'A',card('T18'),beliefs()); assert.ok(a.deceptionValue>0);});
test('v2.25 dual communication remains bounded',()=>{const a=assessDualCommunication(base(),'A',card('T22'),beliefs()); assert.ok(a.score>=-4 && a.score<=5);});
