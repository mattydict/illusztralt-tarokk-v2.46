import test from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../src/engine/cards.js';
import { createInitialState } from '../src/engine/game.js';
import { buildHandHypotheses } from '../src/engine/aiHandHypotheses.js';
import { buildAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';
import { selectBeliefWorlds } from '../src/engine/aiWorldSampler.js';
import { evaluateCardContinuation } from '../src/engine/aiRollout.js';

const t = (rank:number): Card => ({ kind:'tarokk', rank, id:`T${rank}`, points: rank >= 20 ? 5 : 1 });

test('v2.00 play-beam respects known hidden-hand capacities and does not use unknown owner', () => {
  const state = createInitialState(['A','B','C','D']);
  state.phase = 'play';
  state.takerId = 'A'; state.partnerId = 'B'; state.calledTarokk = 19;
  state.players[0]!.hand = [t(22), t(21), t(20), t(19)];
  state.players[1]!.hand = [t(18), t(17)];
  state.players[2]!.hand = [t(16), t(15)];
  state.players[3]!.hand = [t(14), t(13)];
  state.trick = { leader:'A', cards:[] };
  state.nextPlayerIndex = 0;
  const beliefs = buildAIBeliefSnapshot(state, 'A');
  const summary = buildHandHypotheses(state, 'A', beliefs);
  assert.ok(summary.hypotheses.length > 0);
  for (const world of summary.hypotheses) {
    assert.ok(!Object.values(world.ownership).includes('unknown'));
    for (const playerId of ['B','C','D']) {
      const count = Object.values(world.ownership).filter(owner => owner === playerId).length;
      assert.ok(count <= state.players.find(p => p.id === playerId)!.hand.length);
    }
  }
});

test('v2.00 stratified sampler is deterministic and covers lower-probability beam mass', () => {
  const worlds = Array.from({length: 8}, (_, i) => ({ weight: i === 0 ? 0.55 : 0.45 / 7, ownership: { 22: `P${i}` } }));
  const a = selectBeliefWorlds(worlds, 6, 12345);
  const b = selectBeliefWorlds(worlds, 6, 12345);
  assert.deepEqual(a.map(x => x.sourceIndex), b.map(x => x.sourceIndex));
  assert.equal(a.length, 6);
  assert.ok(a.some(x => x.sourceIndex >= 2), 'a samplernek a faroki valószínűségi tartományt is érintenie kell');
  assert.ok(Math.abs(a.reduce((s,x)=>s+x.weight,0) - 1) < 1e-9);
});

test('v2.00 candidate rollouts use the same sampled belief world set', () => {
  const state = createInitialState(['A','B','C','D']);
  state.phase = 'play';
  state.takerId = 'A'; state.partnerId = 'B'; state.calledTarokk = 19;
  state.players = state.players.map(p => ({ ...p, hand:
    p.id === 'A' ? [t(22),t(21),t(20),t(19),t(18)] :
    p.id === 'B' ? [t(17),t(16),t(15),t(14),t(13)] :
    p.id === 'C' ? [t(12),t(11),t(10),t(9),t(8)] :
    [t(7),t(6),t(5),t(4),t(3)]
  }));
  state.trick = { leader:'A', cards:[] };
  state.nextPlayerIndex = 0;
  const hypotheses = buildHandHypotheses(state, 'A', buildAIBeliefSnapshot(state,'A'));
  const a = evaluateCardContinuation(state, 'A', hypotheses, t(22), 2, 12);
  const b = evaluateCardContinuation(state, 'A', hypotheses, t(21), 2, 12);
  assert.equal(a.samples, b.samples);
  assert.ok(a.samples > 0);
  const repeat = evaluateCardContinuation(state, 'A', hypotheses, t(22), 2, 12);
  assert.equal(a.expectedValue, repeat.expectedValue);
  assert.equal(a.sideWinRate, repeat.sideWinRate);
});
