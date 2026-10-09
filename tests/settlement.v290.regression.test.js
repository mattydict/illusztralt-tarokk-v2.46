import assert from 'node:assert/strict';
import { settlementLines } from '../src/engine/settlement.js';

// Silent defence-side Tulétroá must survive together with a silent defence-side double.
{
  const lines = settlementLines({
    contract: 'one',
    figures: [{ type: 'tuletroa', points: 1, ownerId: 'C', ownerIsTakerPair: false, ownerPairWon: true, silent: true }],
    takerPairWon: false,
    takerTrickPoints: 20,
    takerSkartPoints: 0,
    gameContra: 'none',
  });
  assert.ok(lines.some(x => x.type === 'doubleGame'));
  assert.ok(lines.some(x => x.type === 'tuletroa' && x.positiveForTakerPair === false));
}

// A silent four-kings result must not disappear merely because a silent double also exists.
{
  const lines = settlementLines({
    contract: 'one',
    figures: [{ type: 'fourKings', points: 1, ownerId: 'C', ownerIsTakerPair: false, ownerPairWon: true, silent: true }],
    takerPairWon: false,
    takerTrickPoints: 20,
    takerSkartPoints: 0,
    gameContra: 'none',
  });
  assert.ok(lines.some(x => x.type === 'doubleGame'));
  assert.ok(lines.some(x => x.type === 'fourKings' && x.positiveForTakerPair === false));
}
