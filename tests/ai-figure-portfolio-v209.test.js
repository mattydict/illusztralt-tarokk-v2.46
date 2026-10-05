import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { assessFigurePortfolioPlay } from '../src/engine/aiFigurePortfolio.js';
import { assessSilentFigureLandscape } from '../src/engine/aiSilentFigures.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);

const hypothesisSummary = ownership => ({
  hypotheses: [{ weight: 1, ownership }],
  partnerId: 'C',
  partnerTarokkProfile: [],
  targetProfiles: {
    centrumCore: 0,
    kismadarCore: 0,
    nagymadarCore: 0,
    xxiThreat: 0,
    pagatThreat: 0,
    sasThreat: 0,
  },
});

function baseState(overrides = {}) {
  return {
    playerCount: 4,
    players: [
      { id: 'A', hand: [card('T1'), card('T20')], score: 0, active: true },
      { id: 'B', hand: [card('T15')], score: 0, active: true },
      { id: 'C', hand: [card('T21')], score: 0, active: true },
      { id: 'D', hand: [card('T22')], score: 0, active: true },
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

test('v2.09 Pagat silent Ultimo remains live under Pagat Uhu without explicit Ultimo', () => {
  const state = baseState({
    declarations: {
      declarations: [{
        id: 'u1', type: 'pagatUhu', ownerId: 'A', targetCardId: 'T1', status: 'active', declaredAtTrick: 1,
        contra: { level: 'none', history: [] },
      }],
      locks: [], events: [], silentFigures: [],
    },
  });
  const hs = hypothesisSummary({ 1: 'A', 20: 'A', 21: 'C', 22: 'D' });
  const landscape = assessSilentFigureLandscape(state, 'A', hs);
  const silentUltimo = landscape.threats.find(t => t.type === 'pagatUltimo' && t.relation === 'self');
  assert.ok(silentUltimo, 'silent Pagat Ultimo should still be considered');
  assert.ok(silentUltimo.probability > 0, 'silent Pagat Ultimo probability must remain positive');
});

test('v2.09 portfolio combines declared Uhu and independent silent Ultimo goals', () => {
  const state = baseState({
    declarations: {
      declarations: [{
        id: 'u1', type: 'pagatUhu', ownerId: 'A', targetCardId: 'T1', status: 'active', declaredAtTrick: 1,
        contra: { level: 'none', history: [] },
      }],
      locks: [], events: [], silentFigures: [],
    },
  });
  const hs = hypothesisSummary({ 1: 'A', 20: 'A', 21: 'C', 22: 'D' });
  const landscape = assessSilentFigureLandscape(state, 'A', hs);
  const p = assessFigurePortfolioPlay(state, 'A', card('T1'), hs, landscape);
  assert.ok(Number.isFinite(p.score));
  assert.ok(p.reasons.some(r => r.includes('Uhu') && r.includes('csendes Ultimó')));
  assert.ok(p.silentOwn <= 0, 'playing Pagat too early should not be rewarded as silent Ultimo progress');
});

test('v2.09 portfolio exposes combined declared/partner/opponent figure signals', () => {
  const state = baseState({
    trick: {
      leader: 'A',
      cards: [
        { player: 'A', card: card('T19') },
        { player: 'B', card: card('T20') },
        { player: 'C', card: card('T15') },
      ],
    },
    nextPlayerIndex: 3,
    players: [
      { id: 'A', hand: [card('T19')], score: 0, active: true },
      { id: 'B', hand: [card('T20')], score: 0, active: true },
      { id: 'C', hand: [card('T15')], score: 0, active: true },
      { id: 'D', hand: [card('T21')], score: 0, active: true },
    ],
  });
  const hs = hypothesisSummary({ 1: 'B', 2: 'B', 20: 'B', 21: 'C', 22: 'D' });
  const p = assessFigurePortfolioPlay(state, 'D', card('T21'), hs);
  assert.ok(Number.isFinite(p.score));
  assert.ok(Number.isFinite(p.opponentDisruption));
  assert.ok(Number.isFinite((p.declaredPartner + p.silentPartner)));
});
