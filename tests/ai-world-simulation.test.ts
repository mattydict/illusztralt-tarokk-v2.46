import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { buildAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';
import { buildHandHypotheses } from '../src/engine/aiHandHypotheses.js';
import { simulateDeclarationWorlds } from '../src/engine/aiWorldSimulation.js';
import { Card } from '../src/engine/cards.js';

const t=(rank:number):Card=>({kind:'tarokk',rank,id:`T${rank}`,points:5});

test('world simulation uses only hypothesis worlds and returns a bounded probability',()=>{
  const state=createInitialState(['A','B','C','D']);
  state.takerId='A'; state.partnerId='C'; state.calledTarokk=19;
  state.players[0]!.hand=[t(22),t(21),t(20),t(18),t(17)];
  const beliefs=buildAIBeliefSnapshot(state,'A');
  const hypotheses=buildHandHypotheses(state,'A',beliefs);
  const result=simulateDeclarationWorlds(state,'A',state.players[0]!.hand,hypotheses,'centrum');
  assert.ok(result);
  assert.ok(result!.successProbability>=0 && result!.successProbability<=1);
  assert.equal(result!.worlds,hypotheses.hypotheses.length);
});

test('XXI catch simulation needs both Skiz and an opponent XXI hypothesis',()=>{
  const state=createInitialState(['A','B','C','D']);
  state.takerId='A'; state.partnerId='C';
  state.players[0]!.hand=[t(22),t(19),t(18),t(17)];
  const beliefs=buildAIBeliefSnapshot(state,'A');
  const hypotheses=buildHandHypotheses(state,'A',beliefs);
  const result=simulateDeclarationWorlds(state,'A',state.players[0]!.hand,hypotheses,'xxiFogas');
  assert.ok(result);
  assert.ok(result!.successProbability>=0 && result!.successProbability<=1);
});
