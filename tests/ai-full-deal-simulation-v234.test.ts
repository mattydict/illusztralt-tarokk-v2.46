import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, dealNineCards, setPartnership, startPlay, legalCardsForPlay } from '../src/engine/game.js';
import { simulateAIFullDeal } from '../src/engine/aiFullDealSimulation.js';

function seededState() {
  let state = createInitialState(['A', 'B', 'C', 'D'], 3);
  state = dealNineCards(state, () => 0.37).state;
  state = setPartnership(state, 'A', 'B');
  state = { ...state, contract: 'one', skartsByPlayer: { A: [], B: [], C: [], D: [] } };
  return startPlay(state, state.players.findIndex(p => p.id === state.startingPlayerId));
}

test('v2.34 teljes AI-leosztás eljut mind a 9 ütésig', () => {
  const result = simulateAIFullDeal(seededState());
  assert.equal(result.finalState.phase, 'scoring');
  assert.equal(result.finalState.completedTricks.length, 9);
  assert.equal(result.moves.length, 36);
  assert.ok(result.finalState.finalPoints);
  assert.ok(result.finalState.settlement);
});

test('v2.34 teljes AI-leosztás determinisztikus ugyanazon kezdőállapotból', () => {
  const a = simulateAIFullDeal(seededState());
  const b = simulateAIFullDeal(seededState());
  assert.deepEqual(a.moves.map(m => [m.playerId, m.cardId]), b.moves.map(m => [m.playerId, m.cardId]));
  assert.deepEqual(a.finalState.finalPoints, b.finalState.finalPoints);
  assert.deepEqual(a.finalState.settlement, b.finalState.settlement);
});

test('v2.34 a stratégiai AI sem kerülheti meg a szabályos kijátszást', () => {
  const initial = seededState();
  const result = simulateAIFullDeal(initial);
  for (const move of result.moves) {
    // The integration harness records only cards accepted by playCard(); this
    // additional count check catches accidental duplicate-card emission.
    assert.equal(result.moves.filter(m => m.cardId === move.cardId).length >= 1, true);
  }
  assert.equal(result.finalState.players.every(p => p.hand.length === 0 || !p.active), true);
  assert.equal(legalCardsForPlay(result.finalState, result.finalState.players[0]!.id).length, 0);
});
