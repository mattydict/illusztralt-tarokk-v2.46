import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessSilentFigureLandscape } from '../src/engine/aiSilentFigures.js';

const deck = createDeck();
const c = id => deck.find(x => x.id === id);
const hs = ownership => ({
  hypotheses: [{ weight: 1, ownership }],
  partnerId: 'C',
  partnerTarokkProfile: [],
  targetProfiles: { centrumCore:0,kismadarCore:0,nagymadarCore:0,xxiThreat:0,pagatThreat:0,sasThreat:0 },
});

function base(overrides={}) {
  return {
    playerCount:4,
    players:[
      {id:'A',hand:[c('T20'),c('T21')],score:0,active:true},
      {id:'B',hand:[c('T15')],score:0,active:true},
      {id:'C',hand:[c('T1')],score:0,active:true},
      {id:'D',hand:[c('T16')],score:0,active:true},
    ],
    dealerIndex:0, phase:'play', talon:[], trick:null, completedTricks:[], leadSuit:null,
    nextPlayerIndex:0, lockedCards:[],
    declarations:{declarations:[],locks:[],events:[],silentFigures:[]},
    takerId:'A',partnerId:'C',...overrides,
  };
}

test('v2.12 a már teljesült csendes Tulétroá eltűnik az élő AI-célok közül',()=>{
  const state=base({
    completedTricks:[
      {leader:'A',cards:[{player:'A',card:c('T20')}],winner:'A'},
      {leader:'A',cards:[{player:'A',card:c('T21')}],winner:'A'},
      {leader:'A',cards:[{player:'A',card:c('T22')}],winner:'A'},
    ],
    players:[
      {id:'A',hand:[c('T19')],score:0,active:true},
      {id:'B',hand:[c('T15')],score:0,active:true},
      {id:'C',hand:[c('T1')],score:0,active:true},
      {id:'D',hand:[c('T16')],score:0,active:true},
    ],
    declarations:{declarations:[],locks:[],events:[],silentFigures:[{type:'tuletroa',ownerId:'A',trickNumber:3,status:'fulfilled',sourceDeclarationId:'silent:tuletroa'}]},
  });
  const landscape=assessSilentFigureLandscape(state,'A',hs({}));
  assert.equal(landscape.threats.some(t=>t.type==='tuletroa'),false);
});

test('v2.12 a már sikertelen csendes Ultimó nem marad élő cél',()=>{
  const state=base({
    completedTricks:[
      {leader:'B',cards:[{player:'C',card:c('T1')}, {player:'B',card:c('T21')}],winner:'B'},
    ],
    players:[
      {id:'A',hand:[c('T20')],score:0,active:true},
      {id:'B',hand:[c('T15')],score:0,active:true},
      {id:'C',hand:[c('T19')],score:0,active:true},
      {id:'D',hand:[c('T16')],score:0,active:true},
    ],
    declarations:{declarations:[],locks:[],events:[],silentFigures:[{type:'pagatUltimo',ownerId:'C',trickNumber:9,status:'failed',sourceDeclarationId:'silent:pagatUltimo'}]},
  });
  const landscape=assessSilentFigureLandscape(state,'A',hs({1:'C'}));
  assert.equal(landscape.threats.some(t=>t.type==='pagatUltimo'),false);
});
