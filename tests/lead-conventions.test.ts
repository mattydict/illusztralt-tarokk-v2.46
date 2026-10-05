import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { createPartnerBeliefState } from '../src/engine/beliefs.js';
import { createDeck } from '../src/engine/cards.js';
import { scoreOpeningLeadConvention, tarokkReplyRequest } from '../src/engine/leadConventions.js';

test('X/XI boundary: X asks for a headless short suit, XI asks for further high trump', () => {
  assert.equal(tarokkReplyRequest(createDeck().find(c => c.id === 'T10')!), 'suit');
  assert.equal(tarokkReplyRequest(createDeck().find(c => c.id === 'T11')!), 'highTarokk');
});

test('taker partner normally prefers a trump lead', () => {
  const state = createInitialState(['A','B','C','D']);
  const beliefs = createPartnerBeliefState();
  beliefs.likelyTarokks.find(x => x.rank === 22)!.score = 3;
  const t20 = createDeck().find(c => c.id === 'T20')!;
  const advice = scoreOpeningLeadConvention({ ...state, phase: 'play', takerId: 'A', partnerId: 'B' }, 'B', t20, beliefs);
  assert.ok(advice.score > 0);
});
