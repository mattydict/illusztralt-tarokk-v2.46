import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createPartnerBeliefState } from '../src/engine/beliefs.js';
import { assessPartnerMetaCommunication } from '../src/engine/aiPartnerMetaCommunication.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);

function base(overrides={}) {
  return {
    playerCount:4,
    players:[
      {id:'A',hand:[card('T21'),card('T15')],score:0,active:true},
      {id:'B',hand:[card('T18')],score:0,active:true},
      {id:'C',hand:[card('T19')],score:0,active:true},
      {id:'D',hand:[card('T10')],score:0,active:true},
    ],
    dealerIndex:0,phase:'play',talon:[],trick:{leader:'C',cards:[{player:'C',card:card('T18')}]},completedTricks:[],leadSuit:null,nextPlayerIndex:0,lockedCards:[],
    declarations:{declarations:[],locks:[],events:[],silentFigures:[]},takerId:'A',partnerId:'C',...overrides,
  };
}

function beliefs() {
  const b=createPartnerBeliefState();
  b.likelyTarokks.find(x=>x.rank===19).score=5;
  b.likelyTarokks.find(x=>x.rank===21).score=5;
  return b;
}

test('v2.24 partner meta layer rewards a coherent acknowledgement',()=>{
  const a=assessPartnerMetaCommunication(base(), 'A', card('T21'), beliefs());
  const b=assessPartnerMetaCommunication(base(), 'A', card('T15'), beliefs());
  assert.ok(a.score > b.score);
  assert.ok(a.reasons.length > 0);
});

test('v2.24 meta layer stays soft when no partner signal exists',()=>{
  const b=createPartnerBeliefState();
  const a=assessPartnerMetaCommunication(base(), 'A', card('T15'), b);
  assert.ok(Math.abs(a.score) <= 2);
});

test('v2.24 a single odd response does not become hidden-card certainty',()=>{
  const b=createPartnerBeliefState();
  b.likelyTarokks.find(x=>x.rank===19).score=3;
  const a=assessPartnerMetaCommunication(base(), 'A', card('T22'), b);
  assert.ok(a.score < 2);
  assert.ok(!a.reasons.some(r=>r.includes('biztos')));
});

test('v2.24 urgent partner figure limits signalling bonus',()=>{
  const b=beliefs();
  const state=base({completedTricks:[
    {leader:'A',cards:[{player:'C',card:card('T10')}],winner:'C'},
    {leader:'A',cards:[{player:'C',card:card('T11')}],winner:'C'},
    {leader:'A',cards:[{player:'C',card:card('T12')}],winner:'C'},
    {leader:'A',cards:[{player:'C',card:card('T13')}],winner:'C'},
  ],declarations:{declarations:[{ownerId:'C',type:'centrum',status:'active',contra:{level:'none',records:[]}}],locks:[],events:[],silentFigures:[]}});
  const a=assessPartnerMetaCommunication(state,'A',card('T21'),b);
  assert.ok(a.ambiguityPenalty > 0);
});
