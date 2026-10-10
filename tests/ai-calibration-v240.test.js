import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAIExpertCalibration, benchmarkAIExpertScenarios } from '../src/engine/aiExpertBenchmark.js';
import { calibrateExpertBenchmark } from '../src/engine/aiCalibration.js';
import { chooseAIDeclaration } from '../src/engine/aiDeclarations.js';
import { createDeck } from '../src/engine/cards.js';
import { availableDeclarations } from '../src/engine/declarations.js';
import fs from 'node:fs';
import path from 'node:path';

test('v2.41 weighted expert calibration is green', () => {
  const result = benchmarkAIExpertCalibration();
  assert.equal(result.legalPassRate, 1);
  assert.equal(result.strategicPassRate, 1);
  assert.equal(result.forbiddenHits, 0);
  assert.equal(result.weightedExpertScore, 1);
  assert.equal(result.reasonCoverageRate, 1);
  assert.equal(result.weakCategories.length, 0);
});

test('v2.41 calibration remains shape-compatible with the expert benchmark', () => {
  const base = benchmarkAIExpertScenarios();
  const calibrated = calibrateExpertBenchmark(base);
  assert.equal(calibrated.total, base.total);
  assert.equal(calibrated.goldPasses, base.goldPasses);
  assert.ok(calibrated.categoryScores.length >= 8);
});

test('v2.41 AI does not choose Centrum from a weak hand even though the formal option stays available', () => {
  const deck = createDeck();
  const ids = ['T18','T17','T14','T10','hearts-J','diamonds-J','spades-J','clubs-J','hearts-10'];
  const hand = ids.map(id => deck.find(card => card.id === id)).filter(Boolean);
  const context = {
    isTaker: false,
    firstRound: true,
    previousDeclarations: [],
    partnersKnown: true,
    contract: 'solo',
  };
  assert.ok(availableDeclarations(hand, context).some(option => option.type === 'centrum'));
  const decision = chooseAIDeclaration(hand, context);
  assert.notEqual(decision.action.type, 'centrum');
});

test('v2.41 AI never declares XXI-fogás without the Skíz', () => {
  const deck = createDeck();
  const ids = ['T21','T20','T19','T18','T17','hearts-K','diamonds-K','spades-J','clubs-J'];
  const hand = ids.map(id => deck.find(card => card.id === id)).filter(Boolean);
  const context = { isTaker: false, firstRound: true, previousDeclarations: [], partnersKnown: true, contract: 'solo' };
  const decision = chooseAIDeclaration(hand, context);
  assert.notEqual(decision.action.type, 'xxiFogas');
});

test('v2.41 UI contains the calibrated single-player affordances', () => {
  const ui = fs.readFileSync(path.resolve('src/ui/main.ts'), 'utf8');
  assert.match(ui, /Lejátszás előrehaladása/);
  assert.match(ui, /window\.addEventListener\('keydown'/);
  assert.match(ui, /event\.key\.toLowerCase\(\) === 'p'/);
  assert.match(ui, /event\.key\.toLowerCase\(\) === 'n'/);
  const html = fs.readFileSync(path.resolve('src/ui/index.html'), 'utf8');
  assert.match(html, /Illusztrált Tarokk · v3\.0\.3/);
});
