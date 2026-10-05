import test from 'node:test';
import assert from 'node:assert/strict';
import { assessJointObjectivePlay } from '../src/engine/aiJointObjectives.js';

test('v2.18 genuine partner bundle is worth more than an isolated positive objective', () => {
  const isolated = assessJointObjectivePlay({
    declaredOwn: 0, declaredPartner: 7, silentOwn: 0, silentPartner: 0, opponentDisruption: 0,
  });
  const bundled = assessJointObjectivePlay({
    declaredOwn: 0, declaredPartner: 7, silentOwn: 0, silentPartner: 8, opponentDisruption: 0,
  });
  assert.ok(bundled.score > isolated.score);
  assert.ok(bundled.reasons.some(r => /partner.*deklarált.*csendes/i.test(r)));
});

test('v2.18 own + partner + opponent overlap gets a three-way bonus', () => {
  const twoWay = assessJointObjectivePlay({
    declaredOwn: 8, declaredPartner: 0, silentOwn: 0, silentPartner: 0, opponentDisruption: 8,
  });
  const threeWay = assessJointObjectivePlay({
    declaredOwn: 8, declaredPartner: 8, silentOwn: 0, silentPartner: 8, opponentDisruption: 8,
  });
  assert.ok(threeWay.score > twoWay.score);
  assert.ok(threeWay.reasons.some(r => /Háromirányú/i.test(r)));
});

test('v2.18 weak unrelated positives do not receive the same bundle bonus as strong overlap', () => {
  const weak = assessJointObjectivePlay({
    declaredOwn: 3.2, declaredPartner: 3.3, silentOwn: 0, silentPartner: 0, opponentDisruption: 0,
  });
  const strong = assessJointObjectivePlay({
    declaredOwn: 10, declaredPartner: 10, silentOwn: 0, silentPartner: 10, opponentDisruption: 0,
  });
  assert.ok(strong.score > weak.score + 2);
});
