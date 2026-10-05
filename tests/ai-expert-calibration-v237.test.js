import test from 'node:test';
import assert from 'node:assert/strict';
import { benchmarkAIExpertScenarios, assertExpertBenchmarkQuality } from '../src/engine/aiExpertBenchmark.js';
import { buildExpertScenarioCatalog } from '../src/engine/aiExpertScenarios.js';
import { legalCardsForPlay } from '../src/engine/game.js';

test('v2.37 expert scenario catalog has broad category coverage', () => {
  const scenarios = buildExpertScenarioCatalog();
  assert.ok(scenarios.length >= 12);
  const categories = new Set(scenarios.map((scenario) => scenario.category));
  for (const category of ['bird-defence','contra-request','taker-opening','partner-signal','figure-communication','figure-preservation','card-memory']) {
    assert.ok(categories.has(category), `missing category ${category}`);
  }
});

test('v2.37 separates legal-play quality from strategic quality', () => {
  const result = benchmarkAIExpertScenarios();
  assert.equal(result.total, 13);
  assert.equal(result.legalPasses, result.total);
  assert.equal(result.forbiddenHits, 0);
  assert.equal(result.strategicPasses, result.total);
  assert.equal(result.goldPasses, result.total);
  assertExpertBenchmarkQuality(result, { minimumStrategicPassRate: 0.9 });
});

test('v2.37 every benchmark scenario has at least one legal expected/acceptable line', () => {
  for (const scenario of buildExpertScenarioCatalog()) {
    const legal = new Set(legalCardsForPlay(scenario.state, scenario.playerId).map((card) => card.id));
    const acceptable = scenario.acceptableCards ?? scenario.goldCards ?? [];
    assert.ok(acceptable.some((cardId) => legal.has(cardId)), `${scenario.id}: no acceptable card is legal`);
  }
});

test('v2.37 benchmark exposes reasons and chosen card for calibration review', () => {
  const result = benchmarkAIExpertScenarios();
  for (const row of result.results) {
    assert.ok(row.chosenCardId);
    assert.ok(Array.isArray(row.reasons));
    assert.ok(row.rationale.length > 0);
  }
});
