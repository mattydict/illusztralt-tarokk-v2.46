import { PlayerId } from './game.js';

/**
 * A "forduló" itt tudatosan nem egyetlen partit jelent.
 * Egy forduló addig tart, amíg minden játékos egyszer osztó volt.
 * 4 játékosnál ez 4, 5 játékosnál 5 parti.
 */
export interface MatchState {
  playerIds: PlayerId[];
  playerCount: 4 | 5;
  roundNumber: number;
  dealNumberInRound: number;
  dealerIndex: number;
  completedDeals: number;
  completedRounds: number;
  totalDeals: number;
  targetRounds: number;
}

export function createMatch(
  playerIds: PlayerId[],
  targetRounds = 1,
  startingDealerIndex = 0,
): MatchState {
  if (playerIds.length !== 4 && playerIds.length !== 5) {
    throw new Error('Illusztrált Tarokkhoz 4 vagy 5 játékos szükséges.');
  }
  if (!Number.isInteger(targetRounds) || targetRounds < 1) {
    throw new Error('A fordulók száma legalább 1 kell legyen.');
  }
  if (!Number.isInteger(startingDealerIndex) || startingDealerIndex < 0 || startingDealerIndex >= playerIds.length) {
    throw new Error('Érvénytelen kezdő osztó.');
  }

  return {
    playerIds: [...playerIds],
    playerCount: playerIds.length as 4 | 5,
    roundNumber: 1,
    dealNumberInRound: 1,
    dealerIndex: startingDealerIndex,
    completedDeals: 0,
    completedRounds: 0,
    totalDeals: targetRounds * playerIds.length,
    targetRounds,
  };
}

export function activePlayerIds(state: MatchState): PlayerId[] {
  // Keep the players in clockwise deal order, starting left of the dealer.
  // With 4 players the dealer still plays; with 5 players the dealer sits out.
  const ordered = state.playerIds.map((_, offset) => {
    const index = (state.dealerIndex + 1 + offset) % state.playerIds.length;
    return state.playerIds[index]!;
  });
  return state.playerCount === 5
    ? ordered.filter(id => id !== state.playerIds[state.dealerIndex])
    : ordered;
}

export function isMatchComplete(state: MatchState): boolean {
  return state.completedDeals >= state.totalDeals;
}

/**
 * A parti befejezése után léptetjük az osztót.
 * A visszaadott állapot már a következő parti előkészített állapota.
 */
export function completeDeal(state: MatchState): MatchState {
  if (isMatchComplete(state)) throw new Error('A mérkőzés már befejeződött.');

  const completedDeals = state.completedDeals + 1;
  const roundFinished = state.dealNumberInRound >= state.playerCount;
  const completedRounds = state.completedRounds + (roundFinished ? 1 : 0);

  if (completedDeals >= state.totalDeals) {
    return {
      ...state,
      completedDeals,
      completedRounds,
      dealNumberInRound: state.playerCount,
      roundNumber: state.roundNumber,
    };
  }

  const nextDealerIndex = (state.dealerIndex + 1) % state.playerCount;

  return {
    ...state,
    completedDeals,
    completedRounds,
    dealerIndex: nextDealerIndex,
    roundNumber: roundFinished ? state.roundNumber + 1 : state.roundNumber,
    dealNumberInRound: roundFinished ? 1 : state.dealNumberInRound + 1,
  };
}
