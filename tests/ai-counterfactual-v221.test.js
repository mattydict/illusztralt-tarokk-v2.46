import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCounterfactualStress } from '../src/engine/aiLinePlanner.js';

const r = (value, side, partner, settlement) => ({
  cardId: 'T10', samples: 20, horizon: 2, expectedValue: value,
  sideWinRate: side, partnerWinRate: partner, targetSuccessRate: .5,
  confidence: .85, expectedSettlementForTakerPair: settlement,
  expectedSettlementForObserverSide: settlement, reasons: []
});

test('v2.21 rewards a robust line over an optimistic partner-dependent line', () => {
  const robust = assessCounterfactualStress(r(2.4,.62,.50,1), r(2.7,.64,.52,1.2));
  const fragile = assessCounterfactualStress(r(2.4,.48,.38,1), r(4.5,.72,.78,9));
  assert.ok(robust.score > fragile.score);
  assert.ok(fragile.fragility > robust.fragility);
});

test('v2.21 detects partner-control fragility', () => {
  const x = assessCounterfactualStress(r(1,.30,.30,0), r(3,.35,.70,0));
  assert.ok(x.fragility > .2);
  assert.ok(x.reasons.some(r => r.includes('partneri folytatás')));
});

test('v2.21 detects control fragility', () => {
  const x = assessCounterfactualStress(r(1,.35,.35,0), r(3,.75,.35,0));
  assert.ok(x.reasons.some(r => r.includes('kontroll')));
});

test('v2.21 leaves a stable line mostly intact', () => {
  const x = assessCounterfactualStress(r(1.8,.55,.48,1), r(2.0,.56,.49,1.1));
  assert.ok(x.fragility < .25);
  assert.ok(x.reasons.some(r => r.includes('robusztus')));
});
