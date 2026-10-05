import { Card, isTarokk, SuitRank } from './cards.js';
import { applyAuctionAction, AuctionAction, AuctionState } from './auction.js';
import { resolveAuctionOutcome } from './auctionOutcome.js';
import { chooseAIAuctionAction } from './aiAuction.js';
import { chooseAISkart } from './aiSkart.js';
import { chooseAIPartnerCall } from './aiPartnerCall.js';
import { chooseAIDeclaration, communicationBeliefs } from './aiDeclarations.js';
import { chooseAIContra } from './aiContra.js';
import { buildAIBeliefSnapshot } from './aiBeliefEngine.js';
import { buildHandHypotheses } from './aiHandHypotheses.js';
import { legalDeclarationActions, applyDeclarationAction, createDeclarationWindow, currentDeclarer, DeclarationWindowState } from './declarationWindow.js';
import { createRound, dealRound, distributeRoundTalon, skartRoundPlayer, announceSkartCount, roundToGameState, RoundState } from './round.js';
import { GameState, startDeclarations, startPlay, declareFigureInGame, playCard, legalCardsForPlay, recordPartnerCall, raiseGameContraInGame, raiseDeclarationContraInGame } from './game.js';
import { resolveCalledPartner } from './partnership.js';
import { chooseAICard, type AICardDecisionOptions } from './aiPlay.js';

export interface AISimulationPlayDiagnostic {
  trickNumber: number;
  playerId: string;
  cardId: string;
  cardPoints: number;
  legalCount: number;
  immediateWinningOptionCount: number;
  lowestImmediateWinningCardId?: string;
  chosenIsLowestImmediateWinner: boolean;
  trickCompleted: boolean;
  trickWon: boolean;
  trickPointValue: number;
}

export interface AIDeclarationDiagnostic {
  playerId: string;
  requestedAction: string;
  appliedAction: string;
  score: number;
  reasons: string[];
  fallback: boolean;
  fallbackReason?: 'mandatory-count' | 'duplicate-on-trick' | 'unavailable-policy-action' | 'missing-king-target';
}

export interface AIContraDiagnostic {
  playerId: string;
  target: string;
}

export interface AIRoundSimulationResult {
  initialRound: RoundState;
  finalRound: RoundState;
  finalGame: GameState;
  redeals: number;
  auctionActions: Array<{ playerId: string; action: AuctionAction }>;
  skartActions: Array<{ playerId: string; cards: string[] }>;
  partnerCall?: { playerId: string; rank: 18 | 19 | 20 };
  declarationActions: Array<{ playerId: string; action: string }>;
  playMoves: Array<{ trickNumber: number; playerId: string; cardId: string }>;
  playDiagnostics: AISimulationPlayDiagnostic[];
  declarationDiagnostics: AIDeclarationDiagnostic[];
  contraDiagnostics: AIContraDiagnostic[];
}

/**
 * Runs one complete AI-only deal from the auction through settlement.
 * Strategic AI modules see only their observer-relative inputs; the simulator
 * itself may establish the hidden partner after a legal rank call because that
 * identity is a game-engine result, not an AI decision input.
 */
export function simulateAICompleteDeal(playerIds: string[], firstBidder = 0, random: () => number = Math.random, aiDecisionOptions?: AICardDecisionOptions): AIRoundSimulationResult {
  if (playerIds.length !== 4) throw new Error('A teljes AI-leosztás szimuláció 4 aktív játékost vár.');
  const MAX_REDEALS = 12;
  let redeals = 0;
  let round: RoundState;
  let initialRound: RoundState;
  let auctionActions: AIRoundSimulationResult['auctionActions'];

  // A complete auction with no highest bidder has no downstream game path.
  // The simulator therefore starts a fresh deal. This is kept explicit and
  // measured rather than silently filtering the seed out of the benchmark.
  while (true) {
    round = dealRound(createRound(playerIds, firstBidder), random);
    initialRound = round;
    auctionActions = [];

    while (!round.auction.finished) {
      const seat = round.auction.seats[round.auction.currentSeat];
      if (!seat) throw new Error('Az aukció következő játékosa nem található.');
      const action = chooseAIAuctionAction(round.auction, seat.playerId, handsMap(round)[seat.playerId] ?? [], handsMap(round)).action;
      round = { ...round, auction: applyAuctionAction(round.auction, action, handsMap(round)) };
      auctionActions.push({ playerId: seat.playerId, action });
    }

    if (round.auction.highest) break;
    redeals += 1;
    if (redeals > MAX_REDEALS) {
      throw new Error(`Az AI ${MAX_REDEALS} újraosztás után sem jutott el játszható aukcióig.`);
    }
  }

  const outcome = resolveAuctionOutcome(round.auction, handsMap(round), round.talon);
  round = {
    ...round,
    phase: 'talon-distribution',
    contract: outcome.contract,
    takerId: outcome.takerId,
    ...(outcome.calledTarokk !== undefined ? { invitedTarokk: outcome.calledTarokk } : {}),
    auctionOutcome: outcome,
    currentPlayerId: outcome.takerId,
  };
  round = distributeRoundTalon(round, round.talon);

  const skartActions: AIRoundSimulationResult['skartActions'] = [];
  let skartGuard = 32;
  while (round.phase === 'skart' && skartGuard-- > 0) {
    const id = round.currentPlayerId;
    if (!id) throw new Error('Nincs aktuális fektető.');
    const player = round.players.find(p => p.playerId === id);
    if (!player) throw new Error('A fektető játékos nem található.');
    if (player.skart.length < player.receivedTalon.length) {
      const decision = chooseAISkart(player.hand, player.receivedTalon.length, {
        isTaker: id === round.takerId,
        ...(round.invitedTarokk !== undefined ? { invitedTarokk: round.invitedTarokk } : {}),
        ...(round.contract ? { contract: round.contract } : {}),
        ...(player.preSkartSuitCounts ? { preSkartSuitCounts: player.preSkartSuitCounts } : {}),
      });
      round = skartRoundPlayer(round, id, decision.cards);
      skartActions.push({ playerId: id, cards: decision.cards.map(card => card.id) });
    } else {
      round = announceSkartCount(round, id);
    }
  }
  if (round.phase !== 'partner-call') throw new Error('Fektetés után a parti nem jutott partnerhívási szakaszba.');
  if (!round.takerId) throw new Error('Nincs felvevő a partnerhíváshoz.');

  const taker = round.players.find(p => p.playerId === round.takerId);
  if (!taker) throw new Error('A felvevő nem található.');
  const partnerDecision = chooseAIPartnerCall(taker.hand, {
    ...(round.auctionOutcome?.calledTarokk !== undefined ? { requiredTarokk: round.auctionOutcome.calledTarokk as 18 | 19 | 20, invitedTarokk: round.auctionOutcome.calledTarokk as 18 | 19 | 20 } : {}),
    ...(round.contract ? { contract: round.contract } : {}),
  });
  const partnerId = resolveCalledPartner(round.takerId, partnerDecision.rank, round.players.map(p => ({ id: p.playerId, hand: p.hand })));
  if (!partnerId) throw new Error(`A ${partnerDecision.rank}. tarokk nem ad egyértelmű partnert.`);
  round = { ...round, phase: 'declarations', currentPlayerId: round.takerId, calledTarokk: partnerDecision.rank, eventLog: [...round.eventLog, `${round.takerId} meghívta a ${partnerDecision.rank}. tarokkot.`] };

  let game = roundToGameState(round, partnerId, 0);
  game = recordPartnerCall(game, partnerDecision.rank, partnerId);
  const takerIndex = game.players.findIndex(p => p.id === game.takerId);
  game = startDeclarations(game, takerIndex);
  let declarationWindow = createDeclarationWindow([game.takerId!, ...game.players.map(p => p.id).filter(id => id !== game.takerId)], true);
  const declarationActions: AIRoundSimulationResult['declarationActions'] = [];
  const declarationDiagnostics: AIDeclarationDiagnostic[] = [];
  const contraDiagnostics: AIContraDiagnostic[] = [];
  let declarationGuard = 160;

  while (!declarationWindow.finished && declarationGuard-- > 0) {
    const id = currentDeclarer(declarationWindow);
    if (!id) throw new Error('Nincs aktuális bemondó.');
    const gp = game.players.find(p => p.id === id);
    if (!gp) throw new Error('A bemondó játékos nem található.');
    const ctx = declarationContext(game, round, declarationWindow, id, gp.hand);
    const actions = legalDeclarationActions(declarationWindow, id, gp.hand, ctx);
    if (!actions.length) throw new Error(`A ${id} játékosnak nincs jogszerű bemondási akciója.`);

    const snapshot = buildAIBeliefSnapshot(game, id);
    const hypotheses = buildHandHypotheses(game, id, snapshot);
    const decision = chooseAIDeclaration(
      gp.hand,
      ctx,
      communicationBeliefs({ previous: game.declarations.declarations.map(d => d.type), ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk as 18 | 19 | 20 } : {}) }),
      snapshot,
      hypotheses,
      game,
    );

    const currentTrickNumber = game.completedTricks.length + 1;
    const side = id === game.takerId || id === game.partnerId ? 'taker' : 'defence';
    const already = game.declarations.declarations.some(d => d.declaredAtTrick === currentTrickNumber && ((d.ownerId === game.takerId || d.ownerId === game.partnerId ? 'taker' : 'defence') === side));
    const forcedCount = declarationWindow.pendingTarokkCountPlayerId === id ? actions.find(a => a.type === 'tarokkCount') : undefined;
    let action = forcedCount ?? mapDeclarationDecision(actions, decision.action.type);
    let fallbackReason: AIDeclarationDiagnostic['fallbackReason'];
    if (forcedCount) fallbackReason = 'mandatory-count';
    if (already && !forcedCount) {
      action = actions.find(a => a.type === 'pass') ?? action;
      fallbackReason = 'duplicate-on-trick';
    }
    const requestedAction = decision.action.type;
    if (!forcedCount && !already && requestedAction !== 'pass' && !isPolicyDeclarationActionAvailable(actions, requestedAction)) {
      fallbackReason = 'unavailable-policy-action';
    }

    if (action.type === 'declare') {
      const targetCardId = action.declaration === 'kingUltimo' || action.declaration === 'kingUhu'
        ? gp.hand.find(c => c.kind === 'suit' && c.rank === 'K')?.id
        : undefined;
      if ((action.declaration === 'kingUltimo' || action.declaration === 'kingUhu') && !targetCardId) {
        action = actions.find(a => a.type === 'pass') ?? action;
        fallbackReason = 'missing-king-target';
      } else {
        game = declareFigureInGame(game, action.declaration, id, currentTrickNumber, targetCardId);
      }
    }
    declarationWindow = applyDeclarationAction(declarationWindow, action, gp.hand);
    const appliedAction = action.type === 'declare' ? action.declaration : action.type === 'tarokkCount' ? `tarokkCount:${action.count}` : action.type;
    declarationActions.push({ playerId: id, action: appliedAction });
    declarationDiagnostics.push({ playerId: id, requestedAction, appliedAction, score: decision.score, reasons: decision.reasons.slice(0, 6), fallback: requestedAction !== appliedAction, ...(fallbackReason ? { fallbackReason } : {}) });
    const contraResult = runSimulationContra(game);
    game = contraResult.state;
    contraDiagnostics.push(...contraResult.actions);
  }
  if (!declarationWindow.finished) throw new Error('A bemondási szakasz nem fejeződött be a guardon belül.');

  const startingIndex = game.players.findIndex(p => p.id === round.startingPlayerId);
  game = startPlay({ ...game, startingPlayerId: round.startingPlayerId }, startingIndex);
  const playMoves: AIRoundSimulationResult['playMoves'] = [];
  const playDiagnostics: AISimulationPlayDiagnostic[] = [];
  let playGuard = 40;
  while (game.phase === 'play' && playGuard-- > 0) {
    const player = game.players[game.nextPlayerIndex];
    if (!player) throw new Error('Nincs következő játékos a lejátszásban.');
    const legal = legalCardsForPlay(game, player.id);
    if (!legal.length) throw new Error(`${player.id} játékosnak nincs jogszerű lapja.`);
    const decision = chooseAICard(game, player.id, undefined, aiDecisionOptions);
    const trickNumber = game.completedTricks.length + 1;
    const currentWinningCard = currentTrickWinnerCard(game);
    const immediateWinningCards = legal.filter(card => wouldWinAgainstCurrentTrick(card, currentWinningCard, game.leadSuit));
    const lowestImmediateWinning = immediateWinningCards.length
      ? [...immediateWinningCards].sort((a, b) => cardControlStrength(a) - cardControlStrength(b))[0]
      : undefined;
    const previousCompleted = game.completedTricks.length;
    const selectedCard = decision.card;
    playMoves.push({ trickNumber, playerId: player.id, cardId: selectedCard.id });
    game = playCard(game, player.id, selectedCard.id);
    const trickCompleted = game.completedTricks.length > previousCompleted;
    const completedTrick = trickCompleted ? game.completedTricks[game.completedTricks.length - 1] : undefined;
    const trickWon = !!completedTrick && completedTrick.winner === player.id;
    const trickPointValue = completedTrick ? completedTrick.cards.reduce((sum, entry) => sum + entry.card.points, 0) : 0;
    playDiagnostics.push({
      trickNumber, playerId: player.id, cardId: selectedCard.id, cardPoints: selectedCard.points,
      legalCount: legal.length, immediateWinningOptionCount: immediateWinningCards.length,
      ...(lowestImmediateWinning ? { lowestImmediateWinningCardId: lowestImmediateWinning.id } : {}),
      chosenIsLowestImmediateWinner: !!lowestImmediateWinning && lowestImmediateWinning.id === selectedCard.id,
      trickCompleted, trickWon, trickPointValue,
    });
  }
  if (game.phase !== 'scoring') throw new Error('A lejátszás nem érte el az elszámolást.');
  round = { ...round, phase: 'scoring', ...(game.players[game.nextPlayerIndex]?.id ? { currentPlayerId: game.players[game.nextPlayerIndex]!.id } : {}) };
  const takerId = round.takerId!;

  return { initialRound, finalRound: round, finalGame: game, redeals, auctionActions, skartActions, partnerCall: { playerId: takerId, rank: partnerDecision.rank }, declarationActions, playMoves, playDiagnostics, declarationDiagnostics, contraDiagnostics };
}

function handsMap(round: RoundState): Record<string, Card[]> {
  return Object.fromEntries(round.players.map(p => [p.playerId, p.hand]));
}

function isPolicyDeclarationActionAvailable(actions: ReturnType<typeof legalDeclarationActions>, actionType: string): boolean {
  if (actionType === 'tarokk8') return actions.some(a => a.type === 'tarokkCount' && a.count === 8);
  if (actionType === 'tarokk9') return actions.some(a => a.type === 'tarokkCount' && a.count === 9);
  if (actionType === 'pass') return true;
  return actions.some(a => a.type === 'declare' && a.declaration === actionType);
}

function mapDeclarationDecision(actions: ReturnType<typeof legalDeclarationActions>, actionType: string) {
  if (actionType === 'tarokk8') return actions.find(a => a.type === 'tarokkCount' && a.count === 8) ?? actions.find(a => a.type === 'pass') ?? actions[0]!;
  if (actionType === 'tarokk9') return actions.find(a => a.type === 'tarokkCount' && a.count === 9) ?? actions.find(a => a.type === 'pass') ?? actions[0]!;
  if (actionType === 'pass') return actions.find(a => a.type === 'pass') ?? actions[0]!;
  return actions.find(a => a.type === 'declare' && a.declaration === actionType) ?? actions.find(a => a.type === 'pass') ?? actions[0]!;
}

function declarationContext(game: GameState, round: RoundState, declarationWindow: DeclarationWindowState, id: string, hand: Card[]) {
  return {
    isTaker: id === game.takerId,
    invited: round.auctionOutcome?.calledTarokk !== undefined,
    ...(round.auctionOutcome?.calledTarokk !== undefined ? { invitedTarokk: round.auctionOutcome.calledTarokk as 18 | 19 | 20 } : {}),
    ...(round.contract ? { contract: round.contract } : {}),
    previousDeclarations: game.declarations.declarations.map(d => d.type),
    firstRound: declarationWindow.firstRound,
    partnersKnown: true,
    ...(id === game.partnerId ? { isPartner: true } : {}),
    ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk as 18 | 19 | 20 } : {}),
    ...(game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullDeclared: true } : {}),
    ...(id === game.takerId && round.calledTarokk === 19 && !game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullOmittedByTaker: true } : {}),
    speakerSeat: game.players.findIndex(p => p.id === id),
    ...(game.partnerId ? { partnerSeat: game.players.findIndex(p => p.id === game.partnerId) } : {}),
    ...(game.startingPlayerId ? { starterSeat: game.players.findIndex(p => p.id === game.startingPlayerId) } : {}),
    xxiThreatScore: game.declarations.declarations.some(d => d.type === 'fourKings') ? 6 : 0,
    skizCapturePressure: hand.some(c => c.kind === 'tarokk' && c.rank === 22) ? 5 : 0,
    partnerSupport: communicationBeliefs({ previous: game.declarations.declarations.map(d => d.type), ...(round.calledTarokk !== undefined ? { calledTarokk: round.calledTarokk as 18 | 19 | 20 } : {}) }).encouragements.figure?.score ?? 0,
  };
}

function runSimulationContra(state: GameState): { state: GameState; actions: AIContraDiagnostic[] } {
  let current = state;
  const actions: AIContraDiagnostic[] = [];
  for (let guard = 0; guard < 8; guard += 1) {
    const candidates = current.players
      .filter(p => p.active)
      .map(player => ({ player, decision: chooseAIContra(current, player.id) }))
      .filter(x => x.decision !== undefined);
    if (!candidates.length) return { state: current, actions };
    candidates.sort((a, b) => (b.decision?.score ?? -Infinity) - (a.decision?.score ?? -Infinity));
    const best = candidates[0];
    const decision = best?.decision;
    if (!best || !decision) return { state: current, actions };
    if (decision.target === 'game') current = raiseGameContraInGame(current, best.player.id);
    else current = raiseDeclarationContraInGame(current, decision.target, best.player.id);
    actions.push({ playerId: best.player.id, target: decision.target });
  }
  return { state: current, actions };
}


function currentTrickWinnerCard(state: GameState): Card | undefined {
  const cards = state.trick?.cards ?? [];
  if (!cards.length) return undefined;
  let winner = cards[0]!.card;
  for (const entry of cards.slice(1)) {
    if (beatsForQuality(entry.card, winner, state.leadSuit)) winner = entry.card;
  }
  return winner;
}

function wouldWinAgainstCurrentTrick(candidate: Card, currentWinner: Card | undefined, leadSuit: GameState['leadSuit']): boolean {
  return !currentWinner || beatsForQuality(candidate, currentWinner, leadSuit);
}

function beatsForQuality(candidate: Card, current: Card, leadSuit: GameState['leadSuit']): boolean {
  if (isTarokk(candidate) && !isTarokk(current)) return true;
  if (!isTarokk(candidate) && isTarokk(current)) return false;
  if (isTarokk(candidate) && isTarokk(current)) return candidate.rank > current.rank;
  if (candidate.kind === 'suit' && current.kind === 'suit') {
    const candidateLed = candidate.suit === leadSuit;
    const currentLed = current.suit === leadSuit;
    if (candidateLed && !currentLed) return true;
    if (!candidateLed && currentLed) return false;
    if (!candidateLed && !currentLed) return false;
    return suitStrength(candidate.rank) > suitStrength(current.rank);
  }
  return false;
}

function suitStrength(rank: SuitRank): number {
  return ({ K: 5, Q: 4, C: 3, J: 2, '10': 1, A: 1 } as Record<SuitRank, number>)[rank];
}

function cardControlStrength(card: Card): number {
  return isTarokk(card) ? 100 + card.rank : suitStrength(card.rank);
}
