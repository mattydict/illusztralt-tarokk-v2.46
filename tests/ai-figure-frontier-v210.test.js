import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessFigureFrontierPlay as assessFigureFrontier } from '../src/engine/aiFigureFrontier.js';
import { assessSilentFigureLandscape } from '../src/engine/aiSilentFigures.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);
const hs = ownership => ({ hypotheses: [{ weight: 1, ownership }], partnerId: 'C', partnerTarokkProfile: [], targetProfiles: { centrumCore:0, kismadarCore:0, nagymadarCore:0, xxiThreat:0, pagatThreat:0, sasThreat:0 } });
function baseState(overrides = {}) {
  return {
    playerCount: 4,
    players: [
      { id:'A', hand:[card('T20'), card('T21')], score:0, active:true },
      { id:'B', hand:[card('T15')], score:0, active:true },
      { id:'C', hand:[card('T22'), card('T1')], score:0, active:true },
      { id:'D', hand:[card('T16')], score:0, active:true },
    ],
    dealerIndex:0, phase:'play', talon:[], trick:null, completedTricks:[], leadSuit:null, nextPlayerIndex:0, lockedCards:[],
    declarations:{ declarations:[], locks:[], events:[], silentFigures:[] }, takerId:'A', partnerId:'C', ...overrides,
  };
}

test('v2.10 own silent Tuletroá frontier rewards taking the missing big honour', () => {
  const state = baseState({
    trick: { leader:'B', cards:[{ player:'B', card:card('T19') }, { player:'C', card:card('T15') }, { player:'D', card:card('T16') }] },
    nextPlayerIndex:0,
    players:[
      { id:'A', hand:[card('T20')], score:0, active:true },
      { id:'B', hand:[card('T19')], score:0, active:true },
      { id:'C', hand:[card('T22')], score:0, active:true },
      { id:'D', hand:[card('T16')], score:0, active:true },
    ],
    completedTricks:[
      { leader:'A', cards:[{player:'A',card:card('T21')}], winner:'A' },
      { leader:'A', cards:[{player:'A',card:card('T22')}], winner:'A' },
    ],
  });
  const landscape = assessSilentFigureLandscape(state,'A',hs({20:'A',21:'A',22:'A'}));
  const a = assessFigureFrontier(state,'A',card('T20'),landscape);
  assert.ok(a.own > 0);
  assert.ok(a.score > 0);
});

test('v2.10 partner frontier rewards letting partner capture a missing king', () => {
  const state = baseState({
    trick: { leader:'A', cards:[{ player:'A', card:card('hearts-10') }, { player:'B', card:card('hearts-Q') }, { player:'C', card:card('hearts-K') }] },
    nextPlayerIndex:3,
    players:[
      { id:'A', hand:[card('hearts-10')], score:0, active:true },
      { id:'B', hand:[card('hearts-Q')], score:0, active:true },
      { id:'C', hand:[card('hearts-K')], score:0, active:true },
      { id:'D', hand:[card('hearts-J')], score:0, active:true },
    ],
    completedTricks:[
      { leader:'A', cards:[{player:'A',card:card('diamonds-K')}], winner:'A' },
      { leader:'A', cards:[{player:'A',card:card('spades-K')}], winner:'A' },
      { leader:'A', cards:[{player:'A',card:card('clubs-K')}], winner:'A' },
    ],
  });
  const landscape = assessSilentFigureLandscape(state,'D',hs({20:'A',21:'A',22:'A'}));
  const a = assessFigureFrontier(state,'D',card('hearts-J'),landscape);
  assert.ok(Number.isFinite(a.partner));
});

test('v2.10 opponent silent Pagátultimó frontier rewards preventing the 9th-trick target', () => {
  const state = baseState({
    trick: { leader:'A', cards:[{ player:'B', card:card('T1') }] },
    nextPlayerIndex:3,
    players:[
      { id:'A', hand:[card('T15')], score:0, active:true },
      { id:'B', hand:[card('T1')], score:0, active:true },
      { id:'C', hand:[card('T20')], score:0, active:true },
      { id:'D', hand:[card('T21')], score:0, active:true },
    ],
    completedTricks:Array.from({length:8}, (_,i)=>({leader:'A', cards:[{player:'A',card:card('T15')}], winner:'A'})),
  });
  const landscape = assessSilentFigureLandscape(state,'D',hs({1:'B',20:'C',21:'D',22:'A'}));
  const a = assessFigureFrontier(state,'D',card('T21'),landscape);
  assert.ok(Number.isFinite(a.opponent));
  assert.ok(a.score > -10);
});
