import { simulateAICompleteDeal, AIRoundSimulationResult } from './aiRoundSimulation.js';
import { pairOf } from './partnership.js';

export interface AIFigureQualityMetric {
  attempts: number;
  fulfilled: number;
  failed: number;
  unresolved: number;
  successRate: number;
}

export interface AISoakMetrics {
  totalDeals: number;
  completedDeals: number;
  failedDeals: number;
  totalPlayMoves: number;
  totalTricks: number;
  overcontrolOpportunities: number;
  overcontrolEvents: number;
  overcontrolRate: number;
  lowValueOvercontrolPoints: number;
  partnerTransferCount: number;
  partnerTransferRate: number;
  declarationAttempts: number;
  declarationDecisionCount: number;
  declarationFallbacks: number;
  declarationPolicyMismatches: number;
  policyMismatchRate: number;
  failedDeclarations: number;
  unresolvedDeclarations: number;
  declarationSuccessRate: number;
  silentFigureSuccesses: number;
  silentFigureFailures: number;
  contraRaises: number;
  redeals: number;
  averageSettlementForTaker: number;
  takerWinRate: number;
  figures: Record<string, AIFigureQualityMetric>;
}

export interface AIQualityBenchmarkResult {
  seeds: number[];
  completedDeals: number;
  failedDeals: number;
  averageAuctionActions: number;
  totalRedeals: number;
  averageRedealsPerCompletedDeal: number;
  averageDeclarationActions: number;
  averagePlayMoves: number;
  averageSettlementForTaker: number;
  takerWinRate: number;
  failures: Array<{ seed: number; message: string }>;
  results: AIRoundSimulationResult[];
  metrics: AISoakMetrics;
}

/**
 * Deterministic quality gate for the complete AI decision chain. It is meant
 * for regression/stress testing, not as a claim about playing strength.
 */
export function benchmarkAICompleteDeals(
  count = 12,
  seedBase = 20261005,
): AIQualityBenchmarkResult {
  if (!Number.isInteger(count) || count < 1) throw new Error('A benchmark-leosztások száma legalább 1 kell legyen.');
  const seeds = Array.from({ length: count }, (_, i) => seedBase + i * 7919);
  const results: AIRoundSimulationResult[] = [];
  const failures: AIQualityBenchmarkResult['failures'] = [];

  for (const seed of seeds) {
    try {
      const result = simulateAICompleteDeal(['A', 'B', 'C', 'D'], 0, seededRandom(seed));
      if (result.playMoves.length !== 36 || result.finalGame.completedTricks.length !== 9 || result.finalGame.phase !== 'scoring') {
        throw new Error('A leosztás nem jutott el a teljes elszámolásig.');
      }
      results.push(result);
    } catch (error) {
      failures.push({ seed, message: error instanceof Error ? error.message : String(error) });
    }
  }

  const completedDeals = results.length;
  const average = (selector: (r: AIRoundSimulationResult) => number) => completedDeals
    ? results.reduce((sum, result) => sum + selector(result), 0) / completedDeals
    : 0;
  const wins = results.filter(result => result.finalGame.finalPoints?.result === 'taker').length;
  const settlements = results.map(result => result.finalGame.settlement?.netForTakerPair).filter((value): value is number => typeof value === 'number');

  const metrics = aggregateAISoakMetrics(results, seeds.length, failures.length);
  return {
    seeds,
    completedDeals,
    failedDeals: failures.length,
    averageAuctionActions: average(r => r.auctionActions.length),
    totalRedeals: results.reduce((sum, r) => sum + r.redeals, 0),
    averageRedealsPerCompletedDeal: average(r => r.redeals),
    averageDeclarationActions: average(r => r.declarationActions.length),
    averagePlayMoves: average(r => r.playMoves.length),
    averageSettlementForTaker: settlements.length ? settlements.reduce((a, b) => a + b, 0) / settlements.length : 0,
    takerWinRate: completedDeals ? wins / completedDeals : 0,
    failures,
    results,
    metrics,
  };
}

export function benchmarkAISoak(count = 100, seedBase = 20261005): AISoakMetrics & { result: AIQualityBenchmarkResult } {
  if (!Number.isInteger(count) || count < 100 || count > 1000) {
    throw new Error('A soak benchmark 100 és 1000 leosztás közötti mintát vár.');
  }
  const result = benchmarkAICompleteDeals(count, seedBase);
  return { ...result.metrics, result };
}

export function aggregateAISoakMetrics(results: AIRoundSimulationResult[], totalDeals = results.length, failedDeals = 0): AISoakMetrics {
  const figureBuckets = new Map<string, AIFigureQualityMetric>();
  let totalPlayMoves = 0;
  let totalTricks = 0;
  let overcontrolOpportunities = 0;
  let overcontrolEvents = 0;
  let lowValueOvercontrolPoints = 0;
  let partnerTransferCount = 0;
  let partnerTransferBase = 0;
  let declarationAttempts = 0;
  let declarationDecisionCount = 0;
  let declarationFallbacks = 0;
  let declarationPolicyMismatches = 0;
  let failedDeclarations = 0;
  let unresolvedDeclarations = 0;
  let silentFigureSuccesses = 0;
  let silentFigureFailures = 0;
  let contraRaises = 0;
  let redeals = 0;
  let settlementSum = 0;
  let settlementCount = 0;
  let takerWins = 0;

  for (const result of results) {
    totalPlayMoves += result.playMoves.length;
    totalTricks += result.finalGame.completedTricks.length;
    redeals += result.redeals;
    contraRaises += result.contraDiagnostics.length;
    declarationAttempts += result.finalGame.declarations.declarations.length;
    declarationDecisionCount += result.declarationDiagnostics.length;
    declarationFallbacks += result.declarationDiagnostics.filter(d => d.fallback).length;
    declarationPolicyMismatches += result.declarationDiagnostics.filter(d => d.fallbackReason === 'unavailable-policy-action' || d.fallbackReason === 'missing-king-target').length;
    failedDeclarations += result.finalGame.declarations.declarations.filter(d => d.status === 'failed').length;
    unresolvedDeclarations += result.finalGame.declarations.declarations.filter(d => d.status === 'declared' || d.status === 'active').length;
    silentFigureSuccesses += result.finalGame.declarations.silentFigures.filter(f => f.status === 'fulfilled').length;
    silentFigureFailures += result.finalGame.declarations.silentFigures.filter(f => f.status === 'failed').length;
    if (result.finalGame.finalPoints?.result === 'taker') takerWins += 1;
    if (typeof result.finalGame.settlement?.netForTakerPair === 'number') {
      settlementSum += result.finalGame.settlement.netForTakerPair;
      settlementCount += 1;
    }

    for (const diagnostic of result.playDiagnostics) {
      if (diagnostic.trickCompleted && diagnostic.trickWon) {
        if (diagnostic.immediateWinningOptionCount > 1) {
          overcontrolOpportunities += 1;
          if (!diagnostic.chosenIsLowestImmediateWinner) {
            overcontrolEvents += 1;
            if (diagnostic.trickPointValue <= 5) lowValueOvercontrolPoints += diagnostic.cardPoints;
          }
        }
      }
    }

    for (const trick of result.finalGame.completedTricks) {
      if (!trick.winner) continue;
      const leaderSide = pairOf(trick.leader, result.finalGame.takerId ?? '', result.finalGame.partnerId);
      const winnerSide = pairOf(trick.winner, result.finalGame.takerId ?? '', result.finalGame.partnerId);
      if (leaderSide === winnerSide) {
        partnerTransferBase += 1;
        if (trick.leader !== trick.winner) partnerTransferCount += 1;
      }
    }

    for (const declaration of result.finalGame.declarations.declarations) {
      let bucket = figureBuckets.get(declaration.type);
      if (!bucket) {
        bucket = { attempts: 0, fulfilled: 0, failed: 0, unresolved: 0, successRate: 0 };
        figureBuckets.set(declaration.type, bucket);
      }
      bucket.attempts += 1;
      if (declaration.status === 'fulfilled') bucket.fulfilled += 1;
      else if (declaration.status === 'failed') bucket.failed += 1;
      else bucket.unresolved += 1;
    }
  }

  const figures = Object.fromEntries([...figureBuckets.entries()].map(([type, bucket]) => [
    type, { ...bucket, successRate: bucket.attempts ? bucket.fulfilled / bucket.attempts : 0 },
  ]));
  return {
    totalDeals, completedDeals: results.length, failedDeals, totalPlayMoves, totalTricks,
    overcontrolOpportunities, overcontrolEvents, overcontrolRate: overcontrolOpportunities ? overcontrolEvents / overcontrolOpportunities : 0,
    lowValueOvercontrolPoints, partnerTransferCount, partnerTransferRate: partnerTransferBase ? partnerTransferCount / partnerTransferBase : 0,
    declarationAttempts, declarationDecisionCount, declarationFallbacks, declarationPolicyMismatches, policyMismatchRate: declarationDecisionCount ? declarationPolicyMismatches / declarationDecisionCount : 0,
    failedDeclarations, unresolvedDeclarations, declarationSuccessRate: declarationAttempts ? (declarationAttempts - failedDeclarations - unresolvedDeclarations) / declarationAttempts : 0,
    silentFigureSuccesses, silentFigureFailures, contraRaises, redeals,
    averageSettlementForTaker: settlementCount ? settlementSum / settlementCount : 0,
    takerWinRate: results.length ? takerWins / results.length : 0,
    figures,
  };
}

function seededRandom(seed0: number): () => number {
  let x = seed0 >>> 0;
  return () => {
    x = (1664525 * x + 1013904223) >>> 0;
    return x / 4294967296;
  };
}
