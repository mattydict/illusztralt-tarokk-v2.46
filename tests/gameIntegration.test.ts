import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState, declareFigureInGame, setPartnership, recordPartnerCall, startPlay, startDeclarations } from '../src/engine/game.js';

test('GameState carries declaration progress and synchronizes locks', () => {
  let state = createInitialState(['A','B','C','D']);
  state = { ...state, phase: 'declarations' };
  state = setPartnership(state, 'A', 'B');
  state = recordPartnerCall(state, 19, 'B');
  state = declareFigureInGame(state, 'centrum', 'A', 1);
  assert.equal(state.declarations.declarations.length, 1);
  assert.equal(state.declarations.locks[0]?.cardId, 'T20');
  assert.equal(state.lockedCards[0]?.cardId, 'T20');
});

test('startPlay keeps declaration locks active', () => {
  let state = createInitialState(['A','B','C','D']);
  state = { ...state, phase: 'declarations' };
  state = setPartnership(state, 'A', 'B');
  state = recordPartnerCall(state, 19, 'B');
  state = declareFigureInGame(state, 'centrum', 'A', 1);
  const startingIndex = state.players.findIndex(p => p.id === state.startingPlayerId);
  state = startPlay(state, startingIndex);
  assert.equal(state.phase, 'play');
  assert.equal(state.lockedCards[0]?.cardId, 'T20');
});


test('other declaration is rejected before mandatory partner call', () => {
  let state = createInitialState(['A','B','C','D']);
  state = { ...state, phase: 'declarations' };
  state = setPartnership(state, 'A', 'B');
  assert.throws(() => declareFigureInGame(state, 'centrum', 'A', 1), /partnerhívást/i);
});

test('XX self-call is a valid recorded partner call', () => {
  let state = createInitialState(['A','B','C','D']);
  const players = state.players.map(p => p.id === 'A' ? { ...p, hand: [{ kind: 'tarokk' as const, rank: 20, id: 'T20', points: 1 }] } : p);
  state = { ...state, phase: 'declarations', players };
  state = setPartnership(state, 'A', 'A');
  state = recordPartnerCall(state, 20, 'A');
  assert.equal(state.calledTarokk, 20);
  assert.equal(state.partnerId, 'A');
});


test('declaration phase must start with the taker after the partner call', () => {
  let state = createInitialState(['A','B','C','D']);
  state = { ...state, phase: 'talon' };
  state = setPartnership(state, 'C', 'A');
  state = recordPartnerCall(state, 19, 'A');
  const takerIndex = state.players.findIndex(p => p.id === 'C');
  state = startDeclarations(state, takerIndex);
  assert.equal(state.nextPlayerIndex, takerIndex);
});

