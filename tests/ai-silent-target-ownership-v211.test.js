import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessSilentFigurePlay } from '../src/engine/aiSilentFigures.js';

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
    playerCount: 4,
    players: [
      { id:'A', hand:[c('T20')], score:0, active:true },
      { id:'B', hand:[c('T19')], score:0, active:true },
      { id:'C', hand:[c('T21')], score:0, active:true },
      { id:'D', hand:[c('T15')], score:0, active:true },
    ],
    dealerIndex:0, phase:'play', talon:[], trick:null, completedTricks:[], leadSuit:null,
    nextPlayerIndex:0, lockedCards:[], declarations:{declarations:[],locks:[],events:[],silentFigures:[]},
    takerId:'A', partnerId:'C', ...overrides,
  };
}

test('v2.11 csendes Tulétroá csak akkor kap közvetlen bónuszt, ha a jelölt nyeri a célkártyát', () => {
  const state = base({
    trick:{ leader:'B', cards:[
      {player:'B',card:c('T20')},
      {player:'C',card:c('T15')},
      {player:'D',card:c('T21')},
    ]},
    nextPlayerIndex:0,
    players:[
      {id:'A',hand:[c('T22')],score:0,active:true},
      {id:'B',hand:[c('T20')],score:0,active:true},
      {id:'C',hand:[c('T15')],score:0,active:true},
      {id:'D',hand:[c('T21')],score:0,active:true},
    ],
    completedTricks:[],
  });
  const landscape = {
    threats:[{type:'tuletroa',relation:'self',probability:1,urgency:0.8,importance:18,label:'csendes Tulétroá',reasons:[]}],
    ownPotential:14.4, partnerPotential:0, opponentThreat:0,
  };
  const r = assessSilentFigurePlay(state,'A',c('T22'),hs({20:'B',21:'D',22:'A'}),landscape);
  assert.ok(Number.isFinite(r.score));
  assert.ok(r.ownSupport > 0, 'A ténylegesen nyeri az ütést T22-vel, ezért lehet saját Tulétroá támogatás');
});

test('v2.11 partneri Tulétroá-cél csak akkor kap partnerbónuszt, ha a partner ténylegesen céllapot visz', () => {
  const state = base({
    trick:{ leader:'B', cards:[
      {player:'B',card:c('T20')},
      {player:'C',card:c('T21')},
      {player:'D',card:c('T15')},
    ]},
    nextPlayerIndex:0,
    players:[
      {id:'A',hand:[c('T14')],score:0,active:true},
      {id:'B',hand:[c('T20')],score:0,active:true},
      {id:'C',hand:[c('T21')],score:0,active:true},
      {id:'D',hand:[c('T15')],score:0,active:true},
    ],
  });
  const landscape = {
    threats:[{type:'fourKings',relation:'partner',probability:1,urgency:0.8,importance:18,label:'csendes Négykirály',reasons:[]}],
    ownPotential:0, partnerPotential:14.4, opponentThreat:0,
  };
  const r = assessSilentFigurePlay(state,'A',c('T14'),hs({20:'B',21:'C',22:'D'}),landscape);
  assert.ok(Number.isFinite(r.score));
  // C wins with T15 (a tarokk), while B owns the king. Merely having a
  // target king anywhere in the trick must not manufacture a partner Four Kings
  // target-capture bonus.
  assert.ok(r.partnerSupport < 10, `unexpected partner support ${r.partnerSupport}`);
});
