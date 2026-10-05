import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessFigurePortfolioPlay } from '../src/engine/aiFigurePortfolio.js';
import { assessSilentFigureLandscape } from '../src/engine/aiSilentFigures.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);
const hs = ownership => ({
  hypotheses: [{ weight: 1, ownership }],
  partnerId: 'C', partnerTarokkProfile: [],
  targetProfiles: { centrumCore:0,kismadarCore:0,nagymadarCore:0,xxiThreat:0,pagatThreat:0,sasThreat:0 },
});

function base(overrides={}) {
  return {
    playerCount:4,
    players:[
      {id:'A',hand:[card('hearts-J'),card('T15')],score:0,active:true},
      {id:'B',hand:[card('hearts-Q')],score:0,active:true},
      {id:'C',hand:[card('hearts-K')],score:0,active:true},
      {id:'D',hand:[card('hearts-10')],score:0,active:true},
    ],
    dealerIndex:0,phase:'play',talon:[],trick:{leader:'B',cards:[
      {player:'B',card:card('hearts-Q')},{player:'C',card:card('hearts-K')}
    ]},completedTricks:[
      {leader:'A',cards:[{player:'C',card:card('diamonds-K')}],winner:'C'},
      {leader:'A',cards:[{player:'C',card:card('spades-K')}],winner:'C'},
      {leader:'A',cards:[{player:'C',card:card('clubs-K')}],winner:'C'},
      {leader:'A',cards:[{player:'C',card:card('T15')}],winner:'C'},
      {leader:'A',cards:[{player:'C',card:card('T16')}],winner:'C'},
    ],leadSuit:null,nextPlayerIndex:0,lockedCards:[],
    declarations:{declarations:[],locks:[],events:[],silentFigures:[]},
    takerId:'A',partnerId:'C',...overrides,
  };
}

test('v2.13 partner coordination rewards sacrificing an immediate trick to save a near-complete silent partner figure',()=>{
  const state=base();
  const landscape=assessSilentFigureLandscape(state,'A',hs({20:'A',21:'A',22:'A'}));
  const letPartner=assessFigurePortfolioPlay(state,'A',card('hearts-J'),hs({20:'A',21:'A',22:'A'}),landscape);
  const steal=assessFigurePortfolioPlay(state,'A',card('T15'),hs({20:'A',21:'A',22:'A'}),landscape);
  assert.ok(letPartner.silentPartner >= steal.silentPartner);
  assert.ok(letPartner.score > steal.score);
});
