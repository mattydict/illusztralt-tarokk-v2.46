import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { scorePartnerSignalAcknowledgement } from '../src/engine/leadConventions.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);
function base() {
  const state = createInitialState(['A','B','C','D']);
  state.phase = 'play'; state.takerId = 'A'; state.partnerId = 'B';
  state.players.find(p => p.id === 'A').hand = [card('T21'), card('T20'), card('T10')];
  state.trick = { leader:'B', cards:[] }; state.completedTricks=[];
  return state;
}

test('v2.16 high-trump partner signal can be acknowledged without spending Skíz', () => {
  const s=base(); s.trick={leader:'B',cards:[{player:'B',card:card('T20')}]};
  const advice=scorePartnerSignalAcknowledgement(s,'A',card('T21'));
  assert.ok(advice.score>0);
  assert.match(advice.reasons[0], /visszaigazol/);
});

test('v2.16 Skíz played against high-trump drive is treated as an explicit costly response', () => {
  const s=base(); s.trick={leader:'B',cards:[{player:'B',card:card('T20')}]};
  const advice=scorePartnerSignalAcknowledgement(s,'A',card('T22'));
  assert.ok(advice.score<0);
});

test('v2.16 small-trump signal is acknowledged by XXI', () => {
  const s=base(); s.trick={leader:'B',cards:[{player:'B',card:card('T10')}]};
  const advice=scorePartnerSignalAcknowledgement(s,'A',card('T21'));
  assert.ok(advice.score>=4);
});

test('v2.16 acknowledgement is not inferred when partner did not lead the current trick', () => {
  const s=base(); s.trick={leader:'C',cards:[{player:'C',card:card('T20')}]};
  assert.equal(scorePartnerSignalAcknowledgement(s,'A',card('T21')).score,0);
});
