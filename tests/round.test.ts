import test, { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRound } from '../src/engine/round.js';
import { distributeTalon } from '../src/engine/talon.js';
import { Card } from '../src/engine/cards.js';

const cards: Card[] = Array.from({length:6}, (_,i)=>({kind:'tarokk', rank:i+1, id:`T${i+1}`, points:1} as Card));

test('talon distribution is 3/1/1/1 for a three contract', () => {
  const d=distributeTalon(cards,['A','B','C','D'],0,'three');
  assert.equal(d.byPlayer['A']?.length,3);
  assert.equal(d.byPlayer['B']?.length,1);
  assert.equal(d.byPlayer['C']?.length,1);
  assert.equal(d.byPlayer['D']?.length,1);
});

test('round starts in auction phase', () => {
  const s=createRound(['A','B','C','D']);
  assert.equal(s.phase,'auction');
});


describe('round to game adapter', () => {
  it('converts a completed skart state into the common game state', async () => {
    const { createRound, roundToGameState } = await import('../src/engine/round.js');
    const state = createRound(['A','B','C','D']);
    const withHands = {
      ...state,
      phase: 'declarations' as const,
      takerId: 'A',
      currentPlayerId: 'A',
      players: state.players.map(p => ({
        ...p,
        hand: [],
        receivedTalon: [],
        skart: [],
      })),
    };
    const game = roundToGameState(withHands, 'B');
    assert.equal(game.takerId, 'A');
    assert.equal(game.partnerId, 'B');
    assert.equal(game.phase, 'declarations');
    assert.equal(game.players.length, 4);
  });
});


test('round keeps the auction starter as the first-trick leader identity', () => {
  const round = createRound(['A','B','C','D'], 2);
  assert.equal(round.startingPlayerId, 'C');
  assert.equal(round.auction.currentSeat, 2);
});
