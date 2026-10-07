import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { chooseAICardAtDifficulty } from '../src/engine/aiPlay.js';
import { evaluateDeclarations, initialDeclarationProgress } from '../src/engine/declarationLifecycle.js';
import { figureSettlementsFromProgress } from '../src/engine/settlement.js';

const deck = createDeck();
const c = id => deck.find(x => x.id === id);

function lateState(otherTarokksAfterEight) {
  const unplayed = otherTarokksAfterEight === 2
    ? new Set(['T1','T2','T3','T5','T6']) // A: T1,T5; B current T2; C keeps T3; D keeps T6
    : new Set(['T1','T5']);
  const playedTarokks = deck.filter(x => x.kind === 'tarokk' && !unplayed.has(x.id));
  const suits = deck.filter(x => x.kind === 'suit').slice(0, 28 - playedTarokks.length);
  const seq = [...playedTarokks, ...suits];
  const completedTricks = [];
  for (let i = 0; i < 7; i++) {
    const cards = seq.slice(i * 4, i * 4 + 4).map((card, j) => ({ player: ['A','B','C','D'][j], card }));
    completedTricks.push({ leader: 'A', cards, winner: 'A' });
  }
  return {
    playerCount: 4,
    players: [
      { id:'A', hand:[c('T1'), c('T5')], score:0, active:true },
      { id:'B', hand:[c(otherTarokksAfterEight === 2 ? 'T2' : 'T6'), c('hearts-10')], score:0, active:true },
      { id:'C', hand:[c(otherTarokksAfterEight === 2 ? 'T3' : 'T7'), c('diamonds-10')], score:0, active:true },
      { id:'D', hand:[c(otherTarokksAfterEight === 2 ? 'T6' : 'T8'), c('spades-10')], score:0, active:true },
    ],
    dealerIndex:0, phase:'play', talon:[], completedTricks,
    trick:{ leader:'B', cards:[{ player:'B', card:c(otherTarokksAfterEight === 2 ? 'T2' : 'T6') }] },
    leadSuit:null, nextPlayerIndex:0, lockedCards:[],
    declarations: initialDeclarationProgress(), takerId:'A', partnerId:'C', calledTarokk:19,
    singlePlayerPolicy:true, publicAuctionRecords:[],
  };
}

test('v2.77 csendes Pagátultimó: két másik maradó tarokknál a 8. ütésben kiengedés a stratégiai alapvonal', () => {
  const state = lateState(2);
  const d = chooseAICardAtDifficulty(state, 'A', undefined, 'expert', { rolloutSamples:2, terminalRolloutSamples:2, birdSamples:2, multiTrickSamples:2, multiTrickDepth:4 });
  assert.equal(d.card.id, 'T1');
  assert.ok(d.reasons.some(r => r.includes('veszteségminimalizálása')) || d.alternatives?.find(x => x.card.id === 'T1')?.reasons?.some(r => r.includes('veszteségminimalizálása')));
});

test('v2.77 csendes Pagátultimó: ha más tarokk már nincs játékban, a Pagát megőrzendő', () => {
  const state = lateState(0);
  const d = chooseAICardAtDifficulty(state, 'A', undefined, 'expert', { rolloutSamples:2, terminalRolloutSamples:2, birdSamples:2, multiTrickSamples:2, multiTrickDepth:4 });
  assert.equal(d.card.id, 'T5');
});

test('v2.77 csendes Pagátultimó: 9.-ben elfogott Pagát csendes hibaként 5 pontot fizet', () => {
  const tricks = Array.from({length: 8}, () => ({ winner:'A', cards:[{player:'A', card:c('hearts-10')}] }));
  tricks.push({ winner:'B', cards:[{player:'A', card:c('T1')}, {player:'B', card:c('T8')}] });
  const progress = evaluateDeclarations(initialDeclarationProgress(), tricks, id => id === 'A' ? 'taker' : 'defence', 9, { taker:0, defence:0 });
  const silent = progress.silentFigures.find(x => x.type === 'pagatUltimo');
  assert.equal(silent?.status, 'failed');
  const figures = figureSettlementsFromProgress(progress, 'A', 'C');
  assert.equal(figures.find(x => x.type === 'pagatUltimo')?.points, 5);
});


test('v2.77 csendes Pagátultimó: 9.-ben, ha a Pagát nem tud ütni és van alternatíva, inkább kiengedi a másik lapot', () => {
  const state = lateState(2);
  state.completedTricks = Array.from({length: 8}, () => ({ winner:'A', cards:[{player:'A', card:c('hearts-10')}] }));
  state.trick = { leader:'B', cards:[{ player:'B', card:c('T8') }] };
  state.players.find(p => p.id === 'B').hand = [c('T8')];
  state.players.find(p => p.id === 'C').hand = [c('T6')];
  state.players.find(p => p.id === 'D').hand = [c('T7')];
  state.players.find(p => p.id === 'A').hand = [c('T1'), c('T5')];
  state.nextPlayerIndex = 0;
  const d = chooseAICardAtDifficulty(state, 'A', undefined, 'expert', { rolloutSamples:2, terminalRolloutSamples:2, birdSamples:2, multiTrickSamples:2, multiTrickDepth:4 });
  assert.notEqual(d.card.id, 'T1');
  assert.equal(d.card.id, 'T5');
});
