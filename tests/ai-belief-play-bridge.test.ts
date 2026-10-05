import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { buildAIBeliefSnapshot, partnerBeliefsFromAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';
import { chooseAICard } from '../src/engine/aiPlay.js';
import { createInitialState } from '../src/engine/game.js';

const deck = createDeck();
const card = (id: string) => deck.find(c => c.id === id)!;

test('v1.88 bridges public AI beliefs into play-level partner tarokk scores', () => {
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play',
    takerId: 'A',
    partnerId: 'B',
    calledTarokk: 19,
    startingPlayerId: 'B',
    players: state.players.map(p => p.id === 'B'
      ? { ...p, hand: [card('T18'), card('T12'), card('hearts-10')] }
      : p.id === 'A'
        ? { ...p, hand: [card('T21')] }
        : p),
    declarations: {
      declarations: [
        { id: 'd1', type: 'nagymadar', ownerId: 'A', declaredAtTrick: 1, status: 'declared', contra: { level: 'none', records: [] } } as any,
      ],
      locks: [], events: [], silentFigures: [],
    },
    trick: { leader: 'B', cards: [] },
    leadSuit: null,
    nextPlayerIndex: 1,
  };

  const snapshot = buildAIBeliefSnapshot(state, 'B');
  const beliefs = partnerBeliefsFromAIBeliefSnapshot(snapshot);
  assert.ok((beliefs.likelyTarokks.find(x => x.rank === 22)?.score ?? 0) > 0);

  const decision = chooseAICard(state, 'B', beliefs);
  assert.equal(decision.card.kind, 'tarokk');
  assert.equal(decision.card.id, 'T18');
});

test('v1.88 visible tarokks are not turned back into partner ownership certainty', () => {
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    takerId: 'A', partnerId: 'B', phase: 'play',
    players: state.players.map(p => p.id === 'B' ? { ...p, hand: [card('T18'), card('hearts-10')] } : p),
    completedTricks: [{
      leader: 'A',
      cards: [{ player: 'A', card: card('T22') }],
      winner: 'A',
    }],
  };
  const snapshot = buildAIBeliefSnapshot(state, 'B');
  const beliefs = partnerBeliefsFromAIBeliefSnapshot(snapshot);
  assert.equal(beliefs.likelyTarokks.find(x => x.rank === 22)?.score ?? 0, 0);
});


test('v1.88 partner-lead convention uses the bridged belief: suspected Skíz -> high trump', () => {
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B', startingPlayerId: 'B',
    declarations: {
      declarations: [{ id:'n1', type:'nagymadar', ownerId:'A', declaredAtTrick:1, status:'declared', contra:{ level:'none', records:[] } } as any],
      locks: [], events: [], silentFigures: [],
    },
    players: state.players.map(p => p.id === 'B'
      ? { ...p, hand: [card('T18'), card('T12'), card('hearts-10')] }
      : p),
    trick: { leader:'B', cards:[] },
    nextPlayerIndex: 1,
  };
  const beliefs = partnerBeliefsFromAIBeliefSnapshot(buildAIBeliefSnapshot(state, 'B'));
  const decision = chooseAICard(state, 'B', beliefs);
  assert.equal(decision.card.id, 'T18');
});

test('v1.88 partner-lead convention uses seat: suspected XXI ahead -> small trump', () => {
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B', startingPlayerId: 'B',
    players: [
      state.players[0]!,
      state.players[2]!,
      state.players[3]!,
      { ...state.players[1]!, id:'B', hand:[card('T10'), card('T12'), card('hearts-10')] },
    ],
    declarations: {
      declarations: [{ id:'k1', type:'kismadar', ownerId:'B', declaredAtTrick:1, status:'declared', contra:{ level:'none', records:[] } } as any],
      locks: [], events: [], silentFigures: [],
    },
    trick: { leader:'B', cards:[] },
    nextPlayerIndex: 3,
  };
  const beliefs = partnerBeliefsFromAIBeliefSnapshot(buildAIBeliefSnapshot(state, 'B'));
  const decision = chooseAICard(state, 'B', beliefs);
  assert.equal(decision.card.id, 'T10');
});
