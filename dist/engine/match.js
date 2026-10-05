export function createMatch(playerIds, targetRounds = 1, startingDealerIndex = 0) {
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
        playerCount: playerIds.length,
        roundNumber: 1,
        dealNumberInRound: 1,
        dealerIndex: startingDealerIndex,
        completedDeals: 0,
        completedRounds: 0,
        totalDeals: targetRounds * playerIds.length,
        targetRounds,
    };
}
export function activePlayerIds(state) {
    // Keep the players in clockwise deal order, starting left of the dealer.
    // With 4 players the dealer still plays; with 5 players the dealer sits out.
    const ordered = state.playerIds.map((_, offset) => {
        const index = (state.dealerIndex + 1 + offset) % state.playerIds.length;
        return state.playerIds[index];
    });
    return state.playerCount === 5
        ? ordered.filter(id => id !== state.playerIds[state.dealerIndex])
        : ordered;
}
export function isMatchComplete(state) {
    return state.completedDeals >= state.totalDeals;
}
/**
 * A parti befejezése után léptetjük az osztót.
 * A visszaadott állapot már a következő parti előkészített állapota.
 */
export function completeDeal(state) {
    if (isMatchComplete(state))
        throw new Error('A mérkőzés már befejeződött.');
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
