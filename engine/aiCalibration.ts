import type { ExpertBenchmarkResult, ExpertBenchmarkRow } from './aiExpertBenchmark.js';

export interface CalibrationCategoryScore {
  category: string;
  total: number;
  legalPasses: number;
  strategicPasses: number;
  goldPasses: number;
  weightedScore: number;
  rate: number;
}

export interface AICalibrationProfile {
  categoryWeights: Record<string, number>;
  minimumOverallScore: number;
  minimumStrategicRate: number;
  minimumLegalRate: number;
  maximumForbiddenHits: number;
}

export interface AICalibrationResult extends ExpertBenchmarkResult {
  profile: AICalibrationProfile;
  weightedExpertScore: number;
  weakCategories: CalibrationCategoryScore[];
  categoryScores: CalibrationCategoryScore[];
  reasonCoverageRate: number;
  scoreMarginAverage: number;
}

export const DEFAULT_CALIBRATION_PROFILE: AICalibrationProfile = {
  categoryWeights: {
    'bird-defence': 1.2,
    'contra-request': 1.1,
    'taker-opening': 1.1,
    'xxi-catch': 1.2,
    'partner-signal': 1.25,
    'partner-continuation': 1.15,
    'figure-communication': 1.35,
    'figure-preservation': 1.35,
    'defence-opening': 1.05,
    'card-memory': 1.1,
    'silent-figures': 1.35,
    'bird-counterplay': 1.3,
  },
  minimumOverallScore: 0.9,
  minimumStrategicRate: 0.9,
  minimumLegalRate: 1,
  maximumForbiddenHits: 0,
};

export function calibrateExpertBenchmark(
  benchmark: ExpertBenchmarkResult,
  profile: AICalibrationProfile = DEFAULT_CALIBRATION_PROFILE,
): AICalibrationResult {
  const categoryScores = Object.entries(benchmark.byCategory).map(([category, bucket]) => {
    const weight = profile.categoryWeights[category] ?? 1;
    const rate = bucket.total ? bucket.goldPasses / bucket.total : 1;
    return {
      category,
      total: bucket.total,
      legalPasses: bucket.legalPasses,
      strategicPasses: bucket.strategicPasses,
      goldPasses: bucket.goldPasses,
      weightedScore: rate * weight,
      rate,
    };
  });
  const weightSum = categoryScores.reduce((sum, row) => sum + (profile.categoryWeights[row.category] ?? 1), 0);
  const weightedExpertScore = weightSum
    ? categoryScores.reduce((sum, row) => sum + row.weightedScore, 0) / weightSum
    : 1;
  const weakCategories = categoryScores
    .filter(row => row.rate < profile.minimumOverallScore)
    .sort((a, b) => a.rate - b.rate);
  const reasonCoverageRate = benchmark.total
    ? benchmark.results.filter(row => row.reasons.length > 0 && row.rationale.length > 0).length / benchmark.total
    : 1;
  const scoreMarginAverage = benchmark.total
    ? benchmark.results.reduce((sum, row) => sum + estimateDecisionMargin(row), 0) / benchmark.total
    : 0;

  return {
    ...benchmark,
    profile,
    weightedExpertScore,
    weakCategories,
    categoryScores,
    reasonCoverageRate,
    scoreMarginAverage,
  };
}

export function assertAICalibrationQuality(result: AICalibrationResult): AICalibrationResult {
  const { profile } = result;
  if (result.legalPassRate < profile.minimumLegalRate) {
    throw new Error(`AI kalibráció: jogszerűségi kapu hibás (${(result.legalPassRate * 100).toFixed(1)}%).`);
  }
  if (result.strategicPassRate < profile.minimumStrategicRate) {
    throw new Error(`AI kalibráció: stratégiai kapu hibás (${(result.strategicPassRate * 100).toFixed(1)}%).`);
  }
  if (result.forbiddenHits > profile.maximumForbiddenHits) {
    throw new Error(`AI kalibráció: ${result.forbiddenHits} tiltott döntés.`);
  }
  if (result.weightedExpertScore < profile.minimumOverallScore) {
    throw new Error(`AI kalibráció: súlyozott expert score ${(result.weightedExpertScore * 100).toFixed(1)}% < ${(profile.minimumOverallScore * 100).toFixed(1)}%.`);
  }
  if (result.weakCategories.length > 0) {
    throw new Error(`AI kalibráció: gyenge kategóriák: ${result.weakCategories.map(x => x.category).join(', ')}.`);
  }
  return result;
}

export function summarizeCalibration(result: AICalibrationResult): string[] {
  const lines = [
    `Súlyozott expert score: ${(result.weightedExpertScore * 100).toFixed(1)}%`,
    `Stratégiai elfogadhatóság: ${(result.strategicPassRate * 100).toFixed(1)}%`,
    `Jogszerűség: ${(result.legalPassRate * 100).toFixed(1)}%`,
    `Indoklás-lefedettség: ${(result.reasonCoverageRate * 100).toFixed(1)}%`,
  ];
  if (result.weakCategories.length) lines.push(`Gyenge kategóriák: ${result.weakCategories.map(x => x.category).join(', ')}`);
  return lines;
}

function estimateDecisionMargin(row: ExpertBenchmarkRow): number {
  const ordered = row.reasons.length ? 1 : 0.5;
  const acceptable = new Set(row.acceptableCards);
  const gold = new Set(row.goldCards);
  if (gold.has(row.chosenCardId)) return ordered;
  if (acceptable.has(row.chosenCardId)) return 0.75;
  return 0;
}
