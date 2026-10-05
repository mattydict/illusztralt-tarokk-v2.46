import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { inferPartnerLeadSignalHistory, scoreResponseToPartnerOpeningLead } from '../src/engine/leadConventions.js';

const deck = createDeck();
const card = (id: string) => deck.find(c => c.id === id)!;

function base() {
  const state = createInitialState(['A','B','C','D']);
  state.phase = 'play';
  state.takerId = 'A';
  state.partnerId = 'B';
  state.players.find(p => p.id === 'A')!.hand = [card('T21'), card('T15'), card('T8')];
  state.players.find(p => p.id === 'B')!.hand = [card('T20')];
  state.completedTricks = [];
  return state;
}

test('v2.14 history retains the latest partner tarokk signal after opening trick', () => {
  const state = base();
  state.completedTricks = [
    { leader: 'B', cards: [{ playerId: 'B', card: card('T20') }], lead: card('T20'), winnerId: 'A' } as any,
    { leader: 'C', cards: [{ playerId: 'C', card: card('hearts-A') }], lead: card('hearts-A'), winnerId: 'C' } as any,
    { leader: 'B', cards: [{ playerId: 'B', card: card('T15') }], lead: card('T15'), winnerId: 'A' } as any,
  ] as any;
  const signal = inferPartnerLeadSignalHistory(state, 'A');
  assert.equal(signal?.kind, 'xxi-medium');
  assert.equal(signal?.reinforced, false);
  assert.ok((signal?.confidence ?? 0) > 0.5);
});

test('v2.14 repeated partner signal is reinforced', () => {
  const state = base();
  state.completedTricks = [
    { leader: 'B', cards: [{ playerId: 'B', card: card('T12') }], lead: card('T12'), winnerId: 'A' } as any,
    { leader: 'C', cards: [{ playerId: 'C', card: card('hearts-A') }], lead: card('hearts-A'), winnerId: 'C' } as any,
    { leader: 'B', cards: [{ playerId: 'B', card: card('T15') }], lead: card('T15'), winnerId: 'A' } as any,
  ] as any;
  const signal = inferPartnerLeadSignalHistory(state, 'A');
  assert.equal(signal?.kind, 'xxi-medium');
  assert.equal(signal?.reinforced, true);
});

test('v2.14 contradictory later partner signal lowers confidence', () => {
  const state = base();
  state.completedTricks = [
    { leader: 'B', cards: [{ playerId: 'B', card: card('T20') }], lead: card('T20'), winnerId: 'A' } as any,
    { leader: 'C', cards: [{ playerId: 'C', card: card('hearts-A') }], lead: card('hearts-A'), winnerId: 'C' } as any,
    { leader: 'B', cards: [{ playerId: 'B', card: card('T15') }], lead: card('T15'), winnerId: 'A' } as any,
  ] as any;
  const signal = inferPartnerLeadSignalHistory(state, 'A');
  assert.equal(signal?.kind, 'xxi-medium');
  assert.ok((signal?.confidence ?? 1) < 0.8);
});

test('v2.14 historical signal affects later response without treating it as certainty', () => {
  const state = base();
  state.completedTricks = [
    { leader: 'B', cards: [{ playerId: 'B', card: card('T15') }], lead: card('T15'), winnerId: 'A' } as any,
    { leader: 'C', cards: [{ playerId: 'C', card: card('hearts-A') }], lead: card('hearts-A'), winnerId: 'C' } as any,
  ] as any;
  const advice = scoreResponseToPartnerOpeningLead(state, 'A', card('T21'));
  assert.ok(advice.score > 0);
  assert.ok(advice.score < 5);
});
