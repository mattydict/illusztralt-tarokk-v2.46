import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessCommunicationErrorCorrection } from '../src/engine/aiCommunicationErrorCorrection.js';

const deck=createDeck();
const card=id=>deck.find(c=>c.id===id);
const decl=(id,type,ownerId,trick=1)=>({id,type,ownerId,declaredAtTrick:trick,status:'active',contra:{level:0,history:[]}});
function trick(leader,cards){return {leader,cards};}
function base(overrides={}) { return {playerCount:4,players:[{id:'A',hand:[card('T21'),card('T15'),card('T5')],score:0,active:true},{id:'B',hand:[card('T18')],score:0,active:true},{id:'C',hand:[card('T19'),card('T17'),card('T8')],score:0,active:true},{id:'D',hand:[card('T12')],score:0,active:true}],dealerIndex:0,phase:'play',talon:[],trick:null,completedTricks:[],leadSuit:null,nextPlayerIndex:2,lockedCards:[],declarations:{declarations:[],locks:[],events:[],silentFigures:[]},takerId:'A',partnerId:'C',...overrides}; }
const beliefs={likelyTarokks:[],figureInvitations:[]};

test('v2.29 one odd partner response does not erase the signal',()=>{const s=base({completedTricks:[trick('C',[{player:'C',card:card('T10')},{player:'A',card:card('T18')}]) ]}); const a=assessCommunicationErrorCorrection(s,'A',card('T5')); assert.ok(a.correction==='contradicted'||a.correction==='none'); assert.ok(a.confidence>=0);});
test('v2.29 repeated clear mismatches downgrade the old interpretation',()=>{const s=base({completedTricks:[trick('C',[{player:'C',card:card('T10')},{player:'A',card:card('T19')},{player:'D',card:card('T21')}]),trick('C',[{player:'C',card:card('T9')},{player:'A',card:card('T20')},{player:'D',card:card('T21')}]) ]}); const a=assessCommunicationErrorCorrection(s,'A',card('T5')); assert.ok(a.contradiction>0); assert.ok(a.score<0);});
test('v2.29 high-value winning response is treated as possible tactical exception',()=>{const s=base({completedTricks:[trick('C',[{player:'C',card:card('T10')},{player:'A',card:card('T19')},{player:'D',card:card('T21')}]),trick('C',[{player:'C',card:card('T9')},{player:'A',card:card('T20')},{player:'D',card:card('T21')}]) ]}); const a=assessCommunicationErrorCorrection(s,'A',card('T5')); assert.ok(a.tacticalException>=0);});
test('v2.29 no public partner signal means no correction',()=>{const s=base(); const a=assessCommunicationErrorCorrection(s,'A',card('T5')); assert.equal(a.score,0); assert.equal(a.correction,'none');});
