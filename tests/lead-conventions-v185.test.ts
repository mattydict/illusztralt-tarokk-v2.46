import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createInitialState, setPartnership, recordPartnerCall } from '../src/engine/game.js';
import { initialDeclarationProgress, declareFigure } from '../src/engine/declarationLifecycle.js';
import { initialContraState, raiseContra } from '../src/engine/contra.js';
import { createPartnerBeliefState } from '../src/engine/beliefs.js';
import {
  chooseDefensiveBirdLeadCard,
  chooseRequestedDefensiveLeadCard,
  defenceOpeningRequestTargetFromPublicContra,
  openingLeadRequestFromContra,
  preferredLeadAfterPartnerTarokkSignal,
  preferredLeadAfterTakerSuitReturnSignal,
  preferredOpeningLeadCard,
  tarokkReplyRequest,
} from '../src/engine/leadConventions.js';
import { roundToGameState, createRound, dealRound, distributeRoundTalon } from '../src/engine/round.js';

test('v1.85 tarokk X/XI boundary remains exact', () => {
  const deck = createDeck();
  assert.equal(tarokkReplyRequest(deck.find(c => c.id === 'T10')!), 'suit');
  assert.equal(tarokkReplyRequest(deck.find(c => c.id === 'T11')!), 'highTarokk');
});

test('v1.85 stores suit lengths immediately before skart', () => {
  let round = createRound(['A','B','C','D'], 0);
  round = dealRound(round, () => 0.123456);
  const talon = round.talon;
  // Force a completed auction outcome rather than relying on auction details.
  round = {
    ...round,
    phase: 'talon-distribution',
    contract: 'three',
    takerId: 'A',
  };
  round = distributeRoundTalon(round, talon);
  for (const player of round.players) {
    assert.ok(player.preSkartSuitCounts);
    const total = Object.values(player.preSkartSuitCounts!).reduce((a,b) => a+b, 0);
    assert.equal(total, player.hand.filter(c => c.kind === 'suit').length);
  }
});

test('v1.85 bird defence opening prefers headless hearts, then diamonds, then black', () => {
  const deck = createDeck();
  const hand = [
    deck.find(c => c.id === 'hearts-10')!,
    deck.find(c => c.id === 'diamonds-10')!,
    deck.find(c => c.id === 'spades-10')!,
    deck.find(c => c.id === 'T9')!,
  ];
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play',
    takerId: 'A',
    partnerId: 'B',
    players: state.players.map(p => p.id === 'C' ? { ...p, hand } : p),
    declarations: {
      ...initialDeclarationProgress(),
      declarations: [{
        id: 'A:centrum:1:1', type: 'centrum', ownerId: 'A', declaredAtTrick: 1,
        status: 'active', targetCardId: 'T20', contra: initialContraState('centrum','taker'), pairId: 'taker:A',
      }],
    },
  };
  const card = chooseDefensiveBirdLeadCard(state, 'C');
  assert.equal(card?.id, 'hearts-10');
});

test('v1.85 bird defence falls back to shorter pre-skart king suit when no headless suit exists', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play',
    takerId: 'A',
    partnerId: 'B',
    players: state.players.map(p => p.id === 'C' ? {
      ...p,
      hand: [deck.find(c => c.id === 'spades-K')!, deck.find(c => c.id === 'hearts-K')!],
    } : p),
    preSkartSuitCountsByPlayer: {
      C: { hearts: 4, diamonds: 2, spades: 1, clubs: 5 },
    },
    declarations: {
      ...initialDeclarationProgress(),
      declarations: [{
        id: 'A:kismadar:1:1', type: 'kismadar', ownerId: 'A', declaredAtTrick: 1,
        status: 'active', targetCardId: 'T21', contra: initialContraState('kismadar','taker'), pairId: 'taker:A',
      }],
    },
  };
  assert.equal(chooseDefensiveBirdLeadCard(state, 'C')?.id, 'spades-K');
});

test('v1.85 opening kontra on lowest active target requests spade, then club', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = { ...state, phase: 'declarations', startingPlayerId: 'C', takerId: 'A', partnerId: 'B' };
  const c = state.players.find(p => p.id === 'C')!;
  const declarations = initialDeclarationProgress();
  let progress = declareFigure(declarations, 'fourKings', 'A', 1, undefined, 'taker:A');
  const targetId = progress.declarations[0]!.id;
  progress = {
    ...progress,
    declarations: progress.declarations.map(d => d.id === targetId ? { ...d, contra: raiseContra(d.contra, 'D', 'defence') } : d),
  };
  state = {
    ...state,
    declarations: progress,
    players: state.players.map(p => p.id === 'C' ? { ...p, hand: [deck.find(x => x.id === 'spades-10')!, deck.find(x => x.id === 'clubs-10')!] } : p),
  };
  assert.equal(defenceOpeningRequestTargetFromPublicContra(state), 'fourKings');
  const request = openingLeadRequestFromContra(state, 'C');
  assert.equal(request?.suit, 'spades');
  assert.equal(chooseRequestedDefensiveLeadCard(state, 'C')?.id, 'spades-10');
  void c;
});

test('v1.85 request chooses shorter pre-skart black king suit when both are only kings', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B', startingPlayerId: 'C',
    players: state.players.map(p => p.id === 'C' ? { ...p, hand: [deck.find(x => x.id === 'spades-K')!, deck.find(x => x.id === 'clubs-K')!] } : p),
    preSkartSuitCountsByPlayer: { C: { hearts: 1, diamonds: 1, spades: 4, clubs: 2 } },
  };
  assert.equal(chooseRequestedDefensiveLeadCard(state, 'C')?.id, 'clubs-K');
});

test('v1.85 weak Pagat taker prefers a king suit', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    players: state.players.map(p => p.id === 'A' ? {
      ...p,
      hand: [deck.find(x => x.id === 'T1')!, deck.find(x => x.id === 'T8')!, deck.find(x => x.id === 'T9')!, deck.find(x => x.id === 'hearts-K')!],
    } : p),
  };
  const preferred = preferredOpeningLeadCard(state, 'A', createPartnerBeliefState());
  assert.equal(preferred?.id, 'hearts-K');
});

test('v1.85 Skiz XXI-catch opening prefers headless suit for the catching starter', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    players: state.players.map(p => p.id === 'C' ? {
      ...p,
      hand: [deck.find(x => x.id === 'T22')!, deck.find(x => x.id === 'hearts-10')!, deck.find(x => x.id === 'spades-K')!],
    } : p),
    declarations: {
      ...initialDeclarationProgress(),
      declarations: [{
        id: 'C:xxiFogas:1:1', type: 'xxiFogas', ownerId: 'C', declaredAtTrick: 1,
        status: 'active', contra: initialContraState('xxiFogas','defence'), pairId: 'defence:C',
      }],
    },
  };
  const preferred = preferredOpeningLeadCard(state, 'C', createPartnerBeliefState());
  assert.equal(preferred?.id, 'hearts-10');
});


test('v1.85 partner tarokk request drives the next concrete suit lead', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    players: state.players.map(p => p.id === 'B'
      ? { ...p, hand: [deck.find(x => x.id === 'T10')!, deck.find(x => x.id === 'hearts-10')!, deck.find(x => x.id === 'clubs-10')!] }
      : p.id === 'A'
        ? { ...p, hand: [deck.find(x => x.id === 'T18')!] }
        : p),
    completedTricks: [{
      leader: 'A',
      cards: [
        { player: 'A', card: deck.find(x => x.id === 'T18')! },
        { player: 'B', card: deck.find(x => x.id === 'T10')! },
      ],
      winner: 'B',
    }],
    trick: null,
  };
  assert.equal(preferredLeadAfterPartnerTarokkSignal(state, 'B')?.id, 'hearts-10');
});

test('v1.85 taker returning partners suit creates a trump-request continuation signal', () => {
  const deck = createDeck();
  let state = createInitialState(['A','B','C','D']);
  state = {
    ...state,
    phase: 'play', takerId: 'A', partnerId: 'B',
    players: state.players.map(p => p.id === 'A'
      ? { ...p, hand: [deck.find(x => x.id === 'hearts-10')!, deck.find(x => x.id === 'T12')!] }
      : p),
    completedTricks: [{
      leader: 'B',
      cards: [
        { player: 'B', card: deck.find(x => x.id === 'hearts-Q')! },
        { player: 'A', card: deck.find(x => x.id === 'hearts-K')! },
      ],
      winner: 'A',
    }],
    trick: null,
  };
  assert.equal(preferredLeadAfterTakerSuitReturnSignal(state, 'A')?.id, 'hearts-10');
});
