import { chooseAICard, AICardDecision } from './aiPlay.js';
import { legalCardsForPlay, GameState } from './game.js';
import { buildExpertScenarioCatalog, buildAdvisoryExpertScenarioCatalog, ExpertScenario } from './aiExpertScenarios.js';
import { calibrateExpertBenchmark, assertAICalibrationQuality, type AICalibrationProfile, type AICalibrationResult } from './aiCalibration.js';

export interface ExpertBenchmarkOptions {
  scenarios?: ExpertScenario[];
  calibrationProfile?: AICalibrationProfile;
}

export interface ExpertBenchmarkRow {
  id: string;
  category: string;
  title: string;
  playerId: string;
  chosenCardId: string;
  score: number;
  legalCardIds: string[];
  goldCards: string[];
  acceptableCards: string[];
  forbiddenCards: string[];
  legalPass: boolean;
  strategicPass: boolean;
  goldPass: boolean;
  forbiddenHit: boolean;
  reasons: string[];
  rationale: string;
}

export interface ExpertBenchmarkResult {
  total: number;
  legalPasses: number;
  strategicPasses: number;
  goldPasses: number;
  forbiddenHits: number;
  legalPassRate: number;
  strategicPassRate: number;
  goldPassRate: number;
  byCategory: Record<string, { total: number; goldPasses: number; strategicPasses: number; legalPasses: number }>;
  results: ExpertBenchmarkRow[];
}

export function benchmarkAIExpertScenarios(options: ExpertBenchmarkOptions = {}): ExpertBenchmarkResult {
  const scenarios = options.scenarios ?? buildExpertScenarioCatalog();
  const results: ExpertBenchmarkRow[] = [];

  for (const scenario of scenarios) {
    const legal = legalCardsForPlay(scenario.state, scenario.playerId);
    if (!legal.length) throw new Error(`A szcenáriónak nincs legális lapja: ${scenario.id}`);
    const decision: AICardDecision = chooseAICard(scenario.state, scenario.playerId);
    const chosen = decision.card.id;
    const legalPass = legal.some((card) => card.id === chosen);
    const acceptableCards = scenario.acceptableCards ?? scenario.goldCards;
    const goldCards = scenario.goldCards ?? acceptableCards;
    const strategicPass = acceptableCards.includes(chosen) && !scenario.forbiddenCards.includes(chosen);
    const goldPass = goldCards.includes(chosen);
    const forbiddenHit = scenario.forbiddenCards.includes(chosen);
    results.push({
      id: scenario.id,
      category: scenario.category,
      title: scenario.title,
      playerId: scenario.playerId,
      chosenCardId: chosen,
      score: decision.score,
      legalCardIds: legal.map((card) => card.id),
      goldCards,
      acceptableCards,
      forbiddenCards: scenario.forbiddenCards,
      legalPass,
      strategicPass,
      goldPass,
      forbiddenHit,
      reasons: decision.reasons,
      rationale: scenario.rationale,
    });
  }

  return summarizeExpertBenchmark(results);
}


export function benchmarkAIAdvisoryScenarios(scenarios: ExpertScenario[] = buildAdvisoryExpertScenarioCatalog()): ExpertBenchmarkResult {
  return benchmarkAIExpertScenarios({ scenarios });
}

export function benchmarkAIExpertCalibration(options: ExpertBenchmarkOptions = {}): AICalibrationResult {
  const benchmark = benchmarkAIExpertScenarios(options);
  const result = calibrateExpertBenchmark(benchmark, options.calibrationProfile);
  return assertAICalibrationQuality(result);
}

export function summarizeExpertBenchmark(results: ExpertBenchmarkRow[]): ExpertBenchmarkResult {
  const total = results.length;
  const count = (field: keyof Pick<ExpertBenchmarkRow, 'legalPass' | 'strategicPass' | 'goldPass' | 'forbiddenHit'>) =>
    results.filter((result) => result[field]).length;
  const byCategory: ExpertBenchmarkResult['byCategory'] = {};
  for (const result of results) {
    const bucket = byCategory[result.category] ?? { total: 0, goldPasses: 0, strategicPasses: 0, legalPasses: 0 };
    bucket.total += 1;
    if (result.goldPass) bucket.goldPasses += 1;
    if (result.strategicPass) bucket.strategicPasses += 1;
    if (result.legalPass) bucket.legalPasses += 1;
    byCategory[result.category] = bucket;
  }
  return {
    total,
    legalPasses: count('legalPass'),
    strategicPasses: count('strategicPass'),
    goldPasses: count('goldPass'),
    forbiddenHits: count('forbiddenHit'),
    legalPassRate: total ? count('legalPass') / total : 0,
    strategicPassRate: total ? count('strategicPass') / total : 0,
    goldPassRate: total ? count('goldPass') / total : 0,
    byCategory,
    results,
  };
}

export function assertExpertBenchmarkQuality(
  result: ExpertBenchmarkResult,
  thresholds: { minimumStrategicPassRate?: number; minimumLegalPassRate?: number } = {},
): ExpertBenchmarkResult {
  const minimumStrategicPassRate = thresholds.minimumStrategicPassRate ?? 0.9;
  const minimumLegalPassRate = thresholds.minimumLegalPassRate ?? 1;
  if (result.legalPassRate < minimumLegalPassRate) {
    throw new Error(`Expert benchmark legality quality gate failed: ${(result.legalPassRate * 100).toFixed(1)}% < ${(minimumLegalPassRate * 100).toFixed(1)}%.`);
  }
  if (result.strategicPassRate < minimumStrategicPassRate) {
    throw new Error(`Expert benchmark strategic quality gate failed: ${(result.strategicPassRate * 100).toFixed(1)}% < ${(minimumStrategicPassRate * 100).toFixed(1)}%.`);
  }
  if (result.forbiddenHits > 0) {
    throw new Error(`Expert benchmark found ${result.forbiddenHits} forbidden strategic choices.`);
  }
  return result;
}
