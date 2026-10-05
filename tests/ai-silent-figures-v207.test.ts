import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessSilentFigureLandscape, assessSilentFigurePlay } from '../src/engine/aiSilentFigures.js';
import { settlementLines } from '../src/engine/settlement.js';
import type { GameState } from '../src/engine/game.js';
import type { HandHypothesisSummary } from '../src/engine/aiHandHypotheses.js';

const deck = createDeck();
const card = (id: string) => deck.find(c => c.id === id)!;

function baseState(overrides: Partial<GameState> = {}): GameState {
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

function hypotheses(ownerFor: Record<number, string>): HandHypothesisSummary {
  return {
    hypotheses: [{
      weight: 1,
      ownership: ownerFor,
    }],
    partnerId: 'C',
    partnerTarokkProfile: [],
    targetProfiles: { centrumCore: 0, kismadarCore: 0, nagymadarCore: 0, xxiThreat: 0, pagatThreat: 0, sasThreat: 0 },
  };
}

test('v2.07 saját csendes Tulétroá-t ismeri fel teljes célként', () => {
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
  if (!own) throw new Error('A csendes Tulétroá-threat nem jött létre.');
  assert.ok(own.probability > 0.9);
});

test('v2.07 a partner csendes figura támogatása pozitív értéket kap', () => {
  const state = baseState({
    trick: {
      leader: 'A',
      cards: [
        { player: 'A', card: card('hearts-10') },
        { player: 'C', card: card('T1') },
      ],
    },
    nextPlayerIndex: 3,
    players: [
      { id: 'A', hand: [card('T20'), card('T21')], score: 0, active: true },
      { id: 'B', hand: [card('T15')], score: 0, active: true },
      { id: 'C', hand: [card('T1')], score: 0, active: true },
      { id: 'D', hand: [card('hearts-J')], score: 0, active: true },
    ],
    declarations: {
      declarations: [{ id: 'u1', type: 'pagatUhu', ownerId: 'C', status: 'active', declaredAtTrick: 1, targetCardId: 'T1', contra: { level: 'none', history: [] } as any }],
      locks: [], events: [], silentFigures: [],
    } as any,
  });
  const hs = hypotheses({ 20: 'A', 21: 'A', 22: 'D', 1: 'C' });
  const landscape = assessSilentFigureLandscape(state, 'D', hs);
  const decision = assessSilentFigurePlay(state, 'D', card('hearts-J'), hs, landscape);
  assert.ok(decision.partnerSupport > 0 || decision.score > 0);
});

test('v2.07 az ellenfél csendes Volátját megpróbálja megtörni', () => {
  const state = baseState({
    trick: {
      leader: 'A',
      cards: [{ player: 'A', card: card('T10') }],
    },
    nextPlayerIndex: 3,
    players: [
      { id: 'A', hand: [card('T10')], score: 0, active: true },
      { id: 'B', hand: [card('T15')], score: 0, active: true },
      { id: 'C', hand: [card('T1')], score: 0, active: true },
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

test('v2.07 a partnernél lévő csendes Tulétroá és az ellenfél XXI-fogása egyszerre bekerül', () => {
  const state = baseState({
    trick: {
      leader: 'A',
      cards: [
        { player: 'A', card: card('T21') },
        { player: 'C', card: card('T22') },
        { player: 'B', card: card('T15') },
      ],
    },
    nextPlayerIndex: 3,
    players: [
      { id: 'A', hand: [card('T20')], score: 0, active: true },
      { id: 'B', hand: [card('T15')], score: 0, active: true },
      { id: 'C', hand: [card('T1')], score: 0, active: true },
      { id: 'D', hand: [card('T19')], score: 0, active: true },
    ],
  });
  const hs = hypotheses({ 20: 'A', 21: 'A', 22: 'C', 1: 'C' });
  const landscape = assessSilentFigureLandscape(state, 'D', hs);
  const decision = assessSilentFigurePlay(state, 'D', card('T19'), hs, landscape);
  assert.ok(landscape.threats.some(t => t.relation === 'opponent' && t.type === 'xxiFogas'));
  assert.ok(landscape.threats.some(t => t.relation === 'partner' && t.type === 'tuletroa'));
  assert.ok(Number.isFinite(decision.score));
});

test('v2.07 csendes Volátnál nem fizethető ki a csendes Tulétroá/Négykirály/Csendes Duplajáték', () => {
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
