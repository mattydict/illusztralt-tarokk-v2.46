import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

if (!isMainThread) {
  const { seeds, aiDecisionOptions } = workerData;
  const { simulateAICompleteDeal } = await import('../src/engine/aiRoundSimulation.js');
  const results = [];
  const failures = [];
  function seededRandom(seed0) {
    let x = seed0 >>> 0;
    return () => {
      x = (1664525 * x + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }
  for (const seed of seeds) {
    try {
      const result = simulateAICompleteDeal(['A', 'B', 'C', 'D'], 0, seededRandom(seed), aiDecisionOptions);
      if (result.playMoves.length !== 36 || result.finalGame.completedTricks.length !== 9 || result.finalGame.phase !== 'scoring') {
        throw new Error('A leosztás nem jutott el a teljes elszámolásig.');
      }
      results.push(result);
    } catch (error) {
      failures.push({ seed, message: error instanceof Error ? error.message : String(error) });
    }
  }
  parentPort.postMessage({ results, failures });
  parentPort.close();
} else {
  const count = Number.parseInt(process.argv[2] ?? '100', 10);
  const seedBase = Number.parseInt(process.argv[3] ?? '20261005', 10);
  const workerCount = Math.max(1, Math.min(Number.parseInt(process.argv[4] ?? String(Math.max(1, Math.min(8, os.cpus().length))), 10), count));
  const devMode = process.argv.includes('--dev');
  const fastMode = process.argv.includes('--fast');
  const minimumCount = fastMode ? 8 : devMode ? 8 : 100;
  const aiDecisionOptions = fastMode ? { rolloutSamples: 10, terminalRolloutSamples: 6, birdSamples: 8, multiTrickSamples: 6, multiTrickDepth: 12 } : undefined;
  if (!Number.isInteger(count) || count < minimumCount || count > 1000) throw new Error(`A párhuzamos soak ${minimumCount}–1000 leosztást vár${devMode ? ' fejlesztői módban' : ''}.`);
  const seeds = Array.from({ length: count }, (_, i) => seedBase + i * 7919);
  const chunks = Array.from({ length: workerCount }, () => []);
  seeds.forEach((seed, i) => chunks[i % workerCount].push(seed));
  const workerFile = fileURLToPath(import.meta.url);
  const allResults = [];
  const allFailures = [];
  await Promise.all(chunks.filter(chunk => chunk.length).map(chunk => new Promise((resolve, reject) => {
    const worker = new Worker(workerFile, { workerData: { seeds: chunk, aiDecisionOptions } });
    worker.on('message', message => {
      allResults.push(...message.results);
      allFailures.push(...message.failures);
    });
    worker.on('error', reject);
    worker.on('exit', code => code === 0 ? resolve() : reject(new Error(`Worker exit: ${code}`)));
  })));
  const { aggregateAISoakMetrics } = await import('../src/engine/aiQualityBenchmark.js');
  const metrics = aggregateAISoakMetrics(allResults, count, allFailures.length);
  const output = { count, seedBase, workerCount, devMode, fastMode, aiDecisionOptions, completedDeals: allResults.length, failedDeals: allFailures.length, failures: allFailures, metrics };
  console.log(JSON.stringify(output, null, 2));
}
