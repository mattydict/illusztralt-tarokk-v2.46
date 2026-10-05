import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { inferPartnerOpeningLeadSignal, scoreResponseToPartnerOpeningLead } from '../src/engine/leadConventions.js';

const deck = createDeck();
const card = (id: string) => deck.find(c => c.id === id)!;

function base() {
  const state = createInitialState(['A','B','C','D']);
  state.phase = 'play';
  state.takerId = 'A';
  state.partnerId = 'B';
  state.players.find(p => p.id === 'A')!.hand = [card('T21'), card('T10'), card('hearts-J')];
  state.players.find(p => p.id === 'B')!.hand = [card('T20')];
  state.trick = { leader: 'B', cards: [] } as any;
  state.completedTricks = [];
  return state;
}

test('v2.14 high trump opening is interpreted as Skíz-drive signal', () => {
  const state = base();
  state.trick = { leader: 'B', cards: [{ player: 'B', card: card('T20') }] } as any;
  const signal = inferPartnerOpeningLeadSignal(state, 'A');
  assert.equal(signal?.kind, 'skiz-drive');
  assert.ok((signal?.confidence ?? 0) >= 0.8);
});

test('v2.14 small trump opening is interpreted as XXI request', () => {
  const state = base();
  state.players.find(p => p.id === 'B')!.hand = [card('T10')];
  state.trick = { leader: 'B', cards: [{ player: 'B', card: card('T10') }] } as any;
  const signal = inferPartnerOpeningLeadSignal(state, 'A');
  assert.equal(signal?.kind, 'xxi-small');
  const response = scoreResponseToPartnerOpeningLead(state, 'A', card('T21'));
  assert.ok(response.score > 0);
});

test('v2.14 medium trump opening is distinguished from small-trump XXI request', () => {
  const state = base();
  state.players.find(p => p.id === 'B')!.hand = [card('T15')];
  state.trick = { leader: 'B', cards: [{ player: 'B', card: card('T15') }] } as any;
  const signal = inferPartnerOpeningLeadSignal(state, 'A');
  assert.equal(signal?.kind, 'xxi-medium');
});

test('v2.14 signal is only inferred from the actual taker-partner opening lead', () => {
  const state = base();
  state.trick = { leader: 'C', cards: [{ player: 'C', card: card('T20') }] } as any;
  assert.equal(inferPartnerOpeningLeadSignal(state, 'A'), undefined);
});
