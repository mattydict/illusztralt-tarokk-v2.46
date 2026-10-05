import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createPartnerBeliefState } from '../src/engine/beliefs.js';
import { assessCommunicationLine } from '../src/engine/aiCommunicationLine.js';
const deck=createDeck(); const card=id=>deck.find(c=>c.id===id);
function base(overrides={}) { return {playerCount:4,players:[{id:'A',hand:[card('T21'),card('T15')],score:0,active:true},{id:'B',hand:[card('T18')],score:0,active:true},{id:'C',hand:[card('T19')],score:0,active:true},{id:'D',hand:[card('T10')],score:0,active:true}],dealerIndex:0,phase:'play',talon:[],trick:{leader:'C',cards:[{player:'C',card:card('T18')}]},completedTricks:[],leadSuit:null,nextPlayerIndex:0,lockedCards:[],declarations:{declarations:[],locks:[],events:[],silentFigures:[]},takerId:'A',partnerId:'C',...overrides}; }
function beliefs(){const b=createPartnerBeliefState(); b.likelyTarokks.find(x=>x.rank===19).score=5; b.likelyTarokks.find(x=>x.rank===21).score=5; return b;}
function multi(score=3, confidence=.9, fragility=.1){return {score, extendedHorizon:{confidence}, miniLine:{score:2,kind:'partner-pass-return'}, counterfactual:{fragility}};}
test('v2.26 stable communication line is stronger than unstable continuation',()=>{const b=beliefs(); const stable=assessCommunicationLine(base(),'A',card('T18'),b,multi(3,.9,.1)); const unstable=assessCommunicationLine(base(),'A',card('T18'),b,multi(-3,.4,.9)); assert.ok(stable.score>unstable.score); assert.ok(stable.partnerSignalPersistence>0);});
test('v2.26 opponent ambiguity remains bounded and information-safe',()=>{const a=assessCommunicationLine(base(),'A',card('T18'),beliefs(),multi(2,.8,.2)); assert.ok(a.opponentAmbiguity>=0&&a.opponentAmbiguity<=1); assert.ok(a.score>=-5&&a.score<=5);});
test('v2.26 no multi-trick evidence does not invent a line',()=>{const a=assessCommunicationLine(base(),'A',card('T15'),beliefs(),undefined); assert.equal(a.stability,0); assert.ok(a.score<=1.5);});
test('v2.26 fragile counterfactual reduces communication value',()=>{const b=beliefs(); const robust=assessCommunicationLine(base(),'A',card('T18'),b,multi(2,.9,.05)); const fragile=assessCommunicationLine(base(),'A',card('T18'),b,multi(2,.9,.95)); assert.ok(robust.score>fragile.score);});
