import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessDeclarationPlayCommunication } from '../src/engine/aiDeclarationPlayCommunication.js';

const deck=createDeck();
const card=id=>deck.find(c=>c.id===id);
const decl=(id,type,ownerId,trick=1)=>({id,type,ownerId,declaredAtTrick:trick,status:'active',contra:{level:0,history:[]}});
function base(overrides={}) { return {playerCount:4,players:[{id:'A',hand:[card('T21'),card('T15'),card('T5')],score:0,active:true},{id:'B',hand:[card('T18')],score:0,active:true},{id:'C',hand:[card('T19'),card('T17'),card('T8')],score:0,active:true},{id:'D',hand:[card('T12')],score:0,active:true}],dealerIndex:0,phase:'play',talon:[],trick:null,completedTricks:[],leadSuit:null,nextPlayerIndex:2,lockedCards:[],declarations:{declarations:[],locks:[],events:[],silentFigures:[]},takerId:'A',partnerId:'C',...overrides}; }
function chain(){return [decl('d1','tuletroa','C',1),decl('d2','fourKings','C',1),decl('d3','centrum','C',1)];}

test('v2.28 declaration chain rewards a natural low-trump partner lead',()=>{const s=base({declarations:{declarations:chain(),locks:[],events:[],silentFigures:[]},trick:{leader:'C',cards:[]}}); const a=assessDeclarationPlayCommunication(s,'A',card('T5')); assert.equal(a.signalledTarokk,18); assert.ok(a.score>0);});
test('v2.28 declaration chain discourages burning the communicated high trump on lead',()=>{const s=base({declarations:{declarations:chain(),locks:[],events:[],silentFigures:[]},trick:{leader:'C',cards:[]}}); const a=assessDeclarationPlayCommunication(s,'A',card('T21')); assert.equal(a.signalledTarokk,18); assert.ok(a.score<0);});
test('v2.28 partner reply can acknowledge the communicated target',()=>{const s=base({declarations:{declarations:chain(),locks:[],events:[],silentFigures:[]},trick:{leader:'C',cards:[{player:'C',card:card('T10')}]}}); const a=assessDeclarationPlayCommunication(s,'A',card('T18')); assert.equal(a.signalledTarokk,18); assert.ok(a.score>0);});
test('v2.28 ordinary four kings without Trull does not invent a card signal',()=>{const s=base({declarations:{declarations:[decl('d1','fourKings','C',1)],locks:[],events:[],silentFigures:[]},trick:{leader:'C',cards:[]}}); const a=assessDeclarationPlayCommunication(s,'A',card('T5')); assert.equal(a.signalledTarokk,undefined); assert.equal(a.score,0);});
test('v2.28 failed declaration is not used as active communication',()=>{const s=base({declarations:{declarations:[{...decl('d1','tuletroa','C',1),status:'failed'},{...decl('d2','fourKings','C',1),status:'active'},{...decl('d3','centrum','C',1),status:'active'}],locks:[],events:[],silentFigures:[]},trick:{leader:'C',cards:[]}}); const a=assessDeclarationPlayCommunication(s,'A',card('T5')); assert.equal(a.signalledTarokk,undefined); assert.equal(a.score,0);});
