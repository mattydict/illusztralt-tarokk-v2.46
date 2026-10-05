import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, legalCardsForPlay, setPartnership, startPlay } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { chooseAICard, chooseAICardAtDifficulty } from '../src/engine/aiPlay.js';

function makeState() {
  const ids = ['A','B','C','D'];
  const g0 = createInitialState(ids, 0);
  const deck = createDeck();
  const hands = {
    A: deck.slice(0,9),
    B: deck.slice(9,18),
    C: deck.slice(18,27),
    D: deck.slice(27,36),
  };
  const players = g0.players.map(p => ({...p, hand:[...hands[p.id]], active:true}));
  const partnered = setPartnership({...g0, players, takerId:'A', partnerId:'C', contract:'two', calledTarokk:19, talon:[], startingPlayerId:'A'}, 'A', 'C');
  return startPlay(partnered, 0);
}

test('v2.39 difficulty adapter always returns a legal card', () => {
  const state = makeState();
  const legal = new Set(legalCardsForPlay(state, 'A').map(c => c.id));
  for (const difficulty of ['casual','standard','expert']) {
    const decision = chooseAICardAtDifficulty(state, 'A', undefined, difficulty);
    assert.ok(legal.has(decision.card.id), `${difficulty} selected an illegal card`);
  }
});

test('v2.39 expert difficulty is identical to the expert policy result', () => {
  const state = makeState();
  const base = chooseAICard(state, 'A');
  const expert = chooseAICardAtDifficulty(state, 'A', undefined, 'expert');
  assert.equal(expert.card.id, base.card.id);
  assert.equal(expert.score, base.score);
});

test('v2.39 decision exposes ranked alternatives without hidden-hand access', () => {
  const state = makeState();
  const decision = chooseAICard(state, 'A');
  assert.ok(Array.isArray(decision.alternatives));
  assert.ok((decision.alternatives?.length ?? 0) >= 1);
  for (const alt of decision.alternatives ?? []) {
    assert.equal(typeof alt.card.id, 'string');
    assert.equal(typeof alt.score, 'number');
  }
});
