import { strict as assert } from 'node:assert';
import fs from 'node:fs/promises';

async function readSourceOrBuilt(baseName: string): Promise<string> {
  const roots = ['../src/engine/', '../../src/engine/'];
  for (const root of roots) {
    for (const ext of ['.ts', '.js'] as const) {
      try {
        return await fs.readFile(new URL(`${root}${baseName}${ext}`, import.meta.url), 'utf8');
      } catch {
        // TypeScript source tests resolve from tests/; emitted JavaScript tests
        // resolve from dist/tests/. Both should validate the same invariants.
      }
    }
  }
  throw new Error(`Nem található a tesztforrás: ${baseName}`);
}

const rollout = await readSourceOrBuilt('aiRollout');
const play = await readSourceOrBuilt('aiPlay');

assert.match(rollout, /calculateSettlement/);
assert.match(rollout, /figureSettlementsFromProgress/);
assert.match(rollout, /expectedSettlementForObserverSide/);
assert.match(rollout, /totalSimulatedTricks >= 9/);
assert.match(rollout, /filter\(isTarokk\)|tarokks/);
assert.match(play, /remainingTricks = Math\.max\(1, 9 - state\.completedTricks\.length\)/);
assert.match(play, /terminal\.expectedSettlementForObserverSide/);
assert.match(play, /settlementScore/);

console.log('v1.94 settlement-aware AI source checks: 8/8');
