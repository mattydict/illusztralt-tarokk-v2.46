import { GameState } from './game.js';
import { chooseAICard } from './aiPlay.js';
import { playCard } from './game.js';

export interface AISimulationMove {
  trickNumber: number;
  playerId: string;
  cardId: string;
  score: number;
}

export interface AIFullDealSimulationResult {
  initialState: GameState;
  finalState: GameState;
  moves: AISimulationMove[];
}

/**
 * Runs one complete already-initialised play phase with the real AI policy at
 * every seat. This is deliberately a thin integration harness: legality,
 * declaration lifecycle and settlement remain authoritative in game.ts.
 */
export function simulateAIFullDeal(state: GameState, maxMoves = 36): AIFullDealSimulationResult {
  if (state.phase !== 'play') throw new Error('A teljes AI-szimulációhoz play fázisú állapot szükséges.');
  if (!state.takerId || !state.partnerId) throw new Error('A teljes AI-szimulációhoz felvevő és partner szükséges.');

  const initialState = state;
  const moves: AISimulationMove[] = [];
  let current = state;

  for (let moveIndex = 0; moveIndex < maxMoves; moveIndex++) {
    if (current.phase === 'scoring') return { initialState, finalState: current, moves };
    if (current.phase !== 'play') throw new Error(`A szimuláció váratlan fázisba került: ${current.phase}.`);

    const player = current.players[current.nextPlayerIndex];
    if (!player?.active) throw new Error('A szimuláció következő játékosa nem aktív.');

    const decision = chooseAICard(current, player.id);
    moves.push({
      trickNumber: current.completedTricks.length + 1,
      playerId: player.id,
      cardId: decision.card.id,
      score: decision.score,
    });
    current = playCard(current, player.id, decision.card.id);
  }

  if (current.phase !== 'scoring') {
    throw new Error(`A teljes leosztás nem fejeződött be ${maxMoves} AI-lépésen belül.`);
  }
  return { initialState, finalState: current, moves };
}
