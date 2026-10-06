import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createInitialState } from '../src/engine/game.js';
import { buildPublicCardMemory, assessPublicCardControl } from '../src/engine/aiPublicCardMemory.js';

const deck = createDeck();
const card = (id) => {
  const found = deck.find(c => c.id === id);
  if (!found) throw new Error(`missing card ${id}`);
  return found;
};

test('v2.36 public card memory counts only observer hand plus public cards', () => {
  let state = createInitialState(['A', 'B', 'C', 'D']);
  state = {
    ...state,
    phase: 'play',
    takerId: 'A',
    partnerId: 'B',
    players: state.players.map(p => p.id === 'A'
      ? { ...p, hand: [card('T18')] }
      : p.id === 'C'
        ? { ...p, hand: [card('T22')] } // hidden from observer; must NOT count as public
        : p),
    completedTricks: [
      { leader: 'B', cards: [
        { player: 'B', card: card('T19') },
        { player: 'C', card: card('T20') },
      ], winner: 'C' },
      { leader: 'C', cards: [
        { player: 'C', card: card('T21') },
      ], winner: 'C' },
    ],
    trick: { leader: 'B', cards: [{ player: 'B', card: card('T10') }] },
    leadSuit: null,
    nextPlayerIndex: 0,
  };
  const memory = buildPublicCardMemory(state, 'A');
  assert.equal(memory.publicCardIds.has('T19'), true);
  assert.equal(memory.publicCardIds.has('T20'), true);
  assert.equal(memory.publicCardIds.has('T21'), true);
  assert.equal(memory.publicCardIds.has('T22'), false);
  assert.equal(memory.unseenTarokkAbove(18).some(c => c.id === 'T22'), true);
  assert.equal(memory.allHigherTarokksAccounted(18), false);
});

test('v2.36 detects exact tarokk control when all higher tarokks are accounted for', () => {
  let state = createInitialState(['A', 'B', 'C', 'D']);
  state = {
    ...state,
    phase: 'play',
    takerId: 'A',
    partnerId: 'B',
    players: state.players.map(p => p.id === 'A'
      ? { ...p, hand: [card('T18')] }
      : p),
    completedTricks: [
      { leader: 'B', cards: [{ player: 'B', card: card('T19') }], winner: 'B' },
      { leader: 'C', cards: [{ player: 'C', card: card('T20') }], winner: 'C' },
      { leader: 'D', cards: [{ player: 'D', card: card('T21') }], winner: 'D' },
      { leader: 'B', cards: [{ player: 'B', card: card('T22') }], winner: 'B' },
    ],
    trick: { leader: 'C', cards: [{ player: 'C', card: card('T10') }] },
    leadSuit: null,
    nextPlayerIndex: 0,
  };
  const control = assessPublicCardControl(state, 'A', card('T18'), true);
  assert.equal(control.unseenHigherTarokks, 0);
  assert.equal(control.score >= 6.5, true);
  assert.match(control.reasons.join(' '), /biztos tarokk-kontroll/);
});

test('v2.36 integrates public control into the live AI decision explanation', async () => {
  const { chooseAICard } = await import('../src/engine/aiPlay.js');
  let state = createInitialState(['A', 'B', 'C', 'D']);
  state = {
    ...state,
    phase: 'play',
    takerId: 'A',
    partnerId: 'B',
    players: state.players.map(p => p.id === 'A'
      ? { ...p, hand: [card('T17'), card('T18')] }
      : p),
    completedTricks: [
      { leader: 'B', cards: [{ player: 'B', card: card('T19') }], winner: 'B' },
      { leader: 'C', cards: [{ player: 'C', card: card('T20') }], winner: 'C' },
      { leader: 'D', cards: [{ player: 'D', card: card('T21') }], winner: 'D' },
      { leader: 'B', cards: [{ player: 'B', card: card('T22') }], winner: 'B' },
    ],
    trick: { leader: 'C', cards: [{ player: 'C', card: card('T10') }] },
    leadSuit: null,
    nextPlayerIndex: 0,
  };
  const decision = chooseAICard(state, 'A');
  assert.ok(decision.card.id === 'T17' || decision.card.id === 'T18');
  assert.match(decision.reasons.join(' '), /Nyilvános kártyaszámolás/);
});

test('v2.36 complete-deal benchmark records a no-taker auction as a measured redeal', async () => {
  const { simulateAICompleteDeal } = await import('../src/engine/aiRoundSimulation.js');
  const seededRandom = (seed0) => {
    let x = seed0 >>> 0;
    return () => { x = (1664525 * x + 1013904223) >>> 0; return x / 4294967296; };
  };
  const result = simulateAICompleteDeal(['A', 'B', 'C', 'D'], 0, seededRandom(244019));
  assert.equal(result.finalGame.phase, 'scoring');
  assert.equal(result.playMoves.length, 36);
  assert.equal(result.redeals, 0);
});
