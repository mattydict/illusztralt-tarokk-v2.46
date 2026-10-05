import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessSilentFigureLandscape, assessSilentFigurePlay } from '../src/engine/aiSilentFigures.js';
import { settlementLines } from '../src/engine/settlement.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);

function baseState(overrides = {}) {
  return {
    playerCount: 4,
    players: [
      { id: 'A', hand: [card('T20'), card('T21'), card('T22')], score: 0, active: true },
      { id: 'B', hand: [card('T15')], score: 0, active: true },
      { id: 'C', hand: [card('T1'), card('hearts-10')], score: 0, active: true },
      { id: 'D', hand: [card('T16'), card('clubs-J')], score: 0, active: true },
    ],
    dealerIndex: 0,
    phase: 'play',
    talon: [],
    trick: null,
    completedTricks: [],
    leadSuit: null,
    nextPlayerIndex: 0,
    lockedCards: [],
    declarations: { declarations: [], locks: [], events: [], silentFigures: [] },
    takerId: 'A',
    partnerId: 'C',
    ...overrides,
  };
}

function hypotheses(ownerFor) {
  return {
    hypotheses: [{ weight: 1, ownership: ownerFor }],
    partnerId: 'C',
    partnerTarokkProfile: [],
    targetProfiles: { centrumCore: 0, kismadarCore: 0, nagymadarCore: 0, xxiThreat: 0, pagatThreat: 0, sasThreat: 0 },
  };
}

test('v2.07 own silent Tuletroa is recognised as a live target', () => {
  const state = baseState({
    players: [
      { id: 'A', hand: [card('T22')], score: 0, active: true },
      { id: 'B', hand: [card('T15')], score: 0, active: true },
      { id: 'C', hand: [card('T1')], score: 0, active: true },
      { id: 'D', hand: [card('T16')], score: 0, active: true },
    ],
    completedTricks: [
      { leader: 'A', cards: [{ player: 'A', card: card('T20') }], winner: 'A' },
      { leader: 'A', cards: [{ player: 'A', card: card('T21') }], winner: 'A' },
    ],
  });
  const landscape = assessSilentFigureLandscape(state, 'A', hypotheses({ 20: 'A', 21: 'A' }));
  const own = landscape.threats.find(t => t.type === 'tuletroa' && t.relation === 'self');
  assert.ok(own);
  assert.ok(own.probability > 0.9);
});

test('v2.07 partner silent Tuletroa support gets positive value', () => {
  const state = baseState({
    trick: {
      leader: 'A',
      cards: [
        { player: 'A', card: card('hearts-10') },
        { player: 'B', card: card('T20') },
        { player: 'C', card: card('hearts-Q') },
      ],
    },
    nextPlayerIndex: 3,
    players: [
      { id: 'A', hand: [card('T15')], score: 0, active: true },
      { id: 'B', hand: [card('T20')], score: 0, active: true },
      { id: 'C', hand: [card('hearts-Q')], score: 0, active: true },
      { id: 'D', hand: [card('hearts-J')], score: 0, active: true },
    ],
  });
  const hs = hypotheses({ 20: 'B', 21: 'B', 22: 'B' });
  const landscape = assessSilentFigureLandscape(state, 'D', hs);
  const decision = assessSilentFigurePlay(state, 'D', card('hearts-J'), hs, landscape);
  assert.ok(decision.partnerSupport > 0 || decision.score > 0);
});

test('v2.07 opponent silent Volat is treated as a disruption target', () => {
  const state = baseState({
    trick: {
      leader: 'A',
      cards: [
        { player: 'A', card: card('T10') },
        { player: 'C', card: card('T11') },
        { player: 'B', card: card('T12') },
      ],
    },
    nextPlayerIndex: 3,
    players: [
      { id: 'A', hand: [card('T10')], score: 0, active: true },
      { id: 'B', hand: [card('T12')], score: 0, active: true },
      { id: 'C', hand: [card('T11')], score: 0, active: true },
      { id: 'D', hand: [card('T20')], score: 0, active: true },
    ],
    completedTricks: [
      { leader: 'A', cards: [{ player: 'A', card: card('T11') }], winner: 'A' },
      { leader: 'A', cards: [{ player: 'A', card: card('T12') }], winner: 'A' },
    ],
  });
  const hs = hypotheses({ 20: 'D', 21: 'A', 22: 'B', 1: 'C' });
  const landscape = assessSilentFigureLandscape(state, 'D', hs);
  const decision = assessSilentFigurePlay(state, 'D', card('T20'), hs, landscape);
  assert.ok(decision.opponentDisruption > 0);
  assert.ok(decision.score > 0);
});

test('v2.07 partner silent Tuletroa and opponent XXI-fogas can coexist', () => {
  const state = baseState({
    trick: {
      leader: 'A',
      cards: [
        { player: 'A', card: card('T21') },
        { player: 'C', card: card('T22') },
        { player: 'B', card: card('hearts-10') },
      ],
    },
    nextPlayerIndex: 3,
    players: [
      { id: 'A', hand: [card('T21')], score: 0, active: true },
      { id: 'B', hand: [card('hearts-10')], score: 0, active: true },
      { id: 'C', hand: [card('T22')], score: 0, active: true },
      { id: 'D', hand: [card('T19')], score: 0, active: true },
    ],
  });
  const hs = hypotheses({ 20: 'B', 21: 'B', 22: 'B' });
  const landscape = assessSilentFigureLandscape(state, 'D', hs);
  const decision = assessSilentFigurePlay(state, 'D', card('T19'), hs, landscape);
  assert.ok(landscape.threats.some(t => t.relation === 'opponent' && t.type === 'xxiFogas'));
  assert.ok(landscape.threats.some(t => t.relation === 'partner' && t.type === 'doubleGame'));
  assert.ok(Number.isFinite(decision.score));
});

test('v2.07 silent Volat suppresses silent Tuletroa/FourKings/DoubleGame payout', () => {
  const result = settlementLines({
    contract: 'one', takerPairWon: true, takerTrickPoints: 75, takerPairVolat: true, gameContra: 'none',
    figures: [
      { type: 'tuletroa', points: 1, ownerPairWon: true, silent: true },
      { type: 'fourKings', points: 1, ownerPairWon: true, silent: true },
      { type: 'doubleGame', points: 4, ownerPairWon: true, silent: true },
    ],
  });
  assert.deepEqual(result, [{ kind: 'figure', type: 'volat', points: 9, positiveForTakerPair: true }]);
});
