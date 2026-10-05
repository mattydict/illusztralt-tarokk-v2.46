import { Card, createDeck, isTarokk, Suit } from './cards.js';
import { pointsByPlayer, totalTrickPoints, winnerByPair } from './scoring.js';
import { LockedCard, validateLockedPlay } from './locks.js';
import { applyDeclaredFigureLocks } from './play.js';
import { DeclarationProgress, ActiveDeclaration, advanceDeclarationLifecycle, evaluateDeclarations, initialDeclarationProgress, declareFigure as declareFigureLifecycle } from './declarationLifecycle.js';
import { DeclarationType } from './declarations.js';
import { pairOf } from './partnership.js';
import { Contract } from './settlement.js';
import { ContraLevel, ContraState, initialContraState, raiseContra, canRaiseContra } from './contra.js';
import { calculateSettlement, figureSettlementsFromProgress, SettlementResult } from './settlement.js';
import { skartPointsBySide } from './skartAccounting.js';

export type PlayerId = string;
export type Phase = 'deal' | 'bidding' | 'talon' | 'declarations' | 'play' | 'scoring' | 'complete';

export interface Trick { leader: PlayerId; cards: Array<{ player: PlayerId; card: Card }>; winner?: PlayerId; }
export interface PlayerState { id: PlayerId; hand: Card[]; score: number; active: boolean; }
export interface GameState {
  playerCount: 4 | 5; players: PlayerState[]; dealerIndex: number; phase: Phase;
  talon: Card[];
  /** Cards fektetett by each player; non-taker skarts belong to the defence for point accounting. */
  skartsByPlayer?: Record<PlayerId, Card[]>;
  /** Suit lengths captured immediately before skarting, after talon distribution. */
  preSkartSuitCountsByPlayer?: Record<PlayerId, Record<Suit, number>>;
  trick: Trick | null; completedTricks: Trick[]; leadSuit: Suit | null; nextPlayerIndex: number;
  lockedCards: LockedCard[];
  declarations: DeclarationProgress;
  /** Player who opened the auction and leads the first trick. */
  startingPlayerId?: PlayerId;
  takerId?: PlayerId;
  partnerId?: PlayerId;
  /** Tarokk explicitly named by the taker as the partner call. */
  calledTarokk?: 18 | 19 | 20;
  /** The auction contract, when this GameState came from the full round flow. */
  contract?: Contract;
  /** Game-level contra; declaration-specific contras live on each declaration. */
  gameContra?: ContraLevel;
  /** Full game-level contra history; gameContra is retained as a compatibility shortcut. */
  gameContraState?: ContraState;
  settlement?: SettlementResult;
  finalPoints?: { byPlayer: Record<string, number>; takerPair: number; defencePair: number; total: number; result: 'taker'|'defence'|'invalid' };
}
export type DealResult = { state: GameState };

function nextIndex(index: number, count: number): number { return (index + 1) % count; }
function nextActiveIndex(state: GameState, index: number): number {
  for (let step = 1; step <= state.playerCount; step++) {
    const candidate = (index + step) % state.playerCount;
    if (state.players[candidate]?.active) return candidate;
  }
  throw new Error('Nincs aktív következő játékos.');
}
export function shuffle<T>(items: T[], random: () => number = Math.random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [result[i], result[j]] = [result[j]!, result[i]!]; }
  return result;
}
export function createInitialState(playerIds: PlayerId[], dealerIndex = 0): GameState {
  if (playerIds.length !== 4 && playerIds.length !== 5) throw new Error('Illusztrált Tarokkhoz 4 vagy 5 játékos szükséges.');
  const startingIndex = nextIndex(dealerIndex, playerIds.length);
  return { playerCount: playerIds.length as 4 | 5, players: playerIds.map((id, i) => ({ id, hand: [], score: 0, active: playerIds.length === 4 || i !== dealerIndex })), dealerIndex, startingPlayerId: playerIds[startingIndex]!, phase: 'deal', talon: [], trick: null, completedTricks: [], leadSuit: null, nextPlayerIndex: startingIndex, lockedCards: [], declarations: initialDeclarationProgress() };
}

/** Tournament/reference dealing: first 6 cards are talon, then 5 and 4 to each active player, clockwise. */
export function dealNineCards(state: GameState, random: () => number = Math.random): DealResult {
  const deck = shuffle(createDeck(), random);
  const players = state.players.map(p => ({ ...p, hand: [] as Card[] }));
  const talon = deck.slice(0, 6);
  let cursor = 6;
  const activeIndices = Array.from({ length: state.playerCount }, (_, n) => (state.dealerIndex + 1 + n) % state.playerCount).filter(i => players[i]!.active);
  for (const count of [5, 4]) {
    for (const idx of activeIndices) {
      for (let n = 0; n < count; n++) players[idx]!.hand.push(deck[cursor++]!);
    }
  }
  return { state: { ...state, players, talon, phase: 'bidding', trick: null, completedTricks: [], leadSuit: null, nextPlayerIndex: activeIndices[0]!, lockedCards: [], declarations: initialDeclarationProgress() } };
}

export function getPlayer(state: GameState, id: PlayerId): PlayerState { const player = state.players.find(p => p.id === id); if (!player) throw new Error(`Ismeretlen játékos: ${id}`); return player; }
export function legalCardsForPlay(state: GameState, playerId: PlayerId): Card[] {
  if (state.phase !== 'play') return [];
  const player = getPlayer(state, playerId); const trick = state.trick;
  if (!trick || state.players[state.nextPlayerIndex]?.id !== playerId) return [];
  let legal: Card[];
  if (trick.cards.length === 0) {
    legal = [...player.hand];
  } else {
    const leadCard = trick.cards[0]!.card;
    if (isTarokk(leadCard)) {
      const tarokks = player.hand.filter(isTarokk);
      legal = tarokks.length ? tarokks : [...player.hand];
    } else {
      const suited = player.hand.filter(c => c.kind === 'suit' && c.suit === state.leadSuit);
      if (suited.length) legal = suited;
      else {
        const tarokks = player.hand.filter(isTarokk);
        legal = tarokks.length ? tarokks : [...player.hand];
      }
    }
  }
  const trickNumber = state.completedTricks.length + 1;
  return applyDeclaredFigureLocks(legal, player.hand, state.declarations, trickNumber, playerId);
}
export function canRaiseGameContraInGame(state: GameState, byPlayer: PlayerId): boolean {
  if (state.phase !== 'declarations' || !state.takerId) return false;
  const side = pairOf(byPlayer, state.takerId, state.partnerId);
  if (side !== 'taker' && side !== 'defence') return false;
  const current = state.gameContraState ?? initialContraState('game', 'taker');
  return canRaiseContra(current, side, 'game');
}

export function raiseGameContraInGame(state: GameState, byPlayer: PlayerId): GameState {
  if (state.phase !== 'declarations') throw new Error('A játékot csak a bemondási szakaszban lehet kontrázni vagy tovább emelni.');
  if (!state.takerId) throw new Error('A játék kontrázásához előbb meg kell határozni a felvevőt.');
  const current = state.gameContraState ?? initialContraState('game', 'taker');
  const side = pairOf(byPlayer, state.takerId, state.partnerId);
  if (side !== 'taker' && side !== 'defence') throw new Error('A kontra csak a játék két oldalának egyikétől jöhet.');
  const next = raiseContra(current, byPlayer, side);
  return { ...state, gameContraState: next, gameContra: next.level };
}

export function canRaiseDeclarationContraInGame(state: GameState, declarationId: string, byPlayer: PlayerId): boolean {
  if (state.phase !== 'declarations' || !state.takerId) return false;
  const declaration = state.declarations.declarations.find(d => d.id === declarationId);
  if (!declaration || declaration.status === 'failed' || declaration.status === 'fulfilled') return false;
  const side = pairOf(byPlayer, state.takerId, state.partnerId);
  if (side !== 'taker' && side !== 'defence') return false;
  return canRaiseContra(declaration.contra, side, declaration.type);
}

export function raiseDeclarationContraInGame(state: GameState, declarationId: string, byPlayer: PlayerId): GameState {
  if (state.phase !== 'declarations') throw new Error('A bemondást csak a bemondási szakaszban lehet kontrázni vagy tovább emelni.');
  const declaration = state.declarations.declarations.find(d => d.id === declarationId);
  if (!declaration) throw new Error('A kontrázandó bemondás nem található.');
  if (declaration.status === 'failed' || declaration.status === 'fulfilled') throw new Error('Már lezárult bemondást nem lehet kontrázni.');
  const side = pairOf(byPlayer, state.takerId ?? '', state.partnerId);
  if (side !== 'taker' && side !== 'defence') throw new Error('A kontra csak a játék két oldalának egyikétől jöhet.');
  const nextContra = raiseContra(declaration.contra, byPlayer, side);
  const declarations = state.declarations.declarations.map(d => d.id === declarationId ? { ...d, contra: nextContra } : d);
  return { ...state, declarations: { ...state.declarations, declarations } };
}

export function setPartnership(state: GameState, takerId: PlayerId, partnerId: PlayerId): GameState {
  if (!state.players.some(p => p.id === takerId) || !state.players.some(p => p.id === partnerId)) throw new Error('A pár egyik tagja nem létezik.');
  return { ...state, takerId, partnerId };
}

/**
 * Records the mandatory partner call separately from the partnership itself.
 * The partnership may already be known internally, but a legal game must still
 * have an explicit called-tarokk event before any other declaration can occur.
 */
export function recordPartnerCall(
  state: GameState,
  calledTarokk: 18 | 19 | 20,
  partnerId: PlayerId,
): GameState {
  if (!state.takerId) throw new Error('A felvevő még nincs megadva.');
  if (state.takerId === partnerId && calledTarokk !== 20) {
    throw new Error('A felvevő csak XX-assal hívhatja önmagát.');
  }
  if (!state.players.some(p => p.id === partnerId)) throw new Error('A meghívott partner nem létezik.');
  return { ...state, partnerId, calledTarokk };
}

export function declareFigureInGame(state: GameState, type: DeclarationType, ownerId: PlayerId, trickNumber: number, targetCardId?: string): GameState {
  if (state.phase !== 'declarations' && state.phase !== 'play') throw new Error('Ebben a játékszakaszban nem lehet bemondást tenni.');
  if (!state.takerId) throw new Error('A felvevő még nincs megadva.');
  if (state.calledTarokk === undefined) throw new Error('A partnerhívást előbb kötelező bemondani.');
  const partnerId = state.partnerId;
  const side = pairOf(ownerId, state.takerId, partnerId);
  const pairId = side === 'taker' ? `taker:${state.takerId}` : side === 'defence' ? `defence:${state.players.find(p => p.id !== state.takerId && p.id !== partnerId)?.id ?? 'defence'}` : undefined;
  const declarations = declareFigureLifecycle(state.declarations, type, ownerId, trickNumber, targetCardId, pairId);
  return { ...state, declarations, lockedCards: declarations.locks };
}

export function startDeclarations(state: GameState, leaderIndex: number): GameState {
  if (!state.takerId) throw new Error('A bemondási szakaszhoz előbb meg kell határozni a felvevőt.');
  if (state.calledTarokk === undefined) throw new Error('A bemondási szakasz előtt a felvevőnek kötelezően meg kell hívnia a partnerét.');
  if (state.players[leaderIndex]?.id !== state.takerId) throw new Error('A bemondási szakaszt mindig a felvevő kezdi.');
  return { ...state, phase: 'declarations', trick: null, leadSuit: null, nextPlayerIndex: leaderIndex, lockedCards: state.declarations.locks };
}

export function startPlay(state: GameState, leaderIndex?: number): GameState {
  const expectedIndex = state.startingPlayerId ? state.players.findIndex(p => p.id === state.startingPlayerId) : leaderIndex ?? 0;
  const actualIndex = leaderIndex ?? expectedIndex;
  if (expectedIndex >= 0 && actualIndex !== expectedIndex) throw new Error('Az első ütést az induló játékos kezdi.');
  return { ...state, phase: 'play', trick: { leader: state.players[actualIndex]!.id, cards: [] }, leadSuit: null, nextPlayerIndex: actualIndex, lockedCards: state.declarations.locks };
}
export function playCard(state: GameState, playerId: PlayerId, cardId: string): GameState {
  const legal = legalCardsForPlay(state, playerId);
  const card = legal.find(c => c.id === cardId);
  if (!card) throw new Error('Ez a lap ebben a helyzetben nem játszható ki.');
  const trick = state.trick;
  if (!trick) throw new Error('Nincs aktív ütés.');
  validateLockedPlay(card, state.lockedCards, playerId);

  const players = state.players.map(p => p.id === playerId ? { ...p, hand: p.hand.filter(c => c.id !== cardId) } : p);
  const cards = [...trick.cards, { player: playerId, card }];
  const leadSuit = state.leadSuit ?? (card.kind === 'suit' ? card.suit : null);
  const activeCount = state.players.filter(p => p.active).length;

  if (cards.length < activeCount) {
    const lifecycle = advanceDeclarationLifecycle(state.declarations, state.completedTricks.length + 1, false, card, playerId);
    return { ...state, players, declarations: lifecycle, lockedCards: lifecycle.locks, trick: { ...trick, cards }, leadSuit, nextPlayerIndex: nextActiveIndex(state, state.nextPlayerIndex) };
  }

  const winner = determineTrickWinner(cards, leadSuit);
  const completed = [...state.completedTricks, { ...trick, cards, winner }];
  const figureTricks = completed.map(t => ({ cards: t.cards.map(x => ({ player: x.player, card: x.card })), winner: t.winner! }));
  const sideOf = (id: PlayerId) => pairOf(id, state.takerId ?? '', state.partnerId);
  let declarations = advanceDeclarationLifecycle(state.declarations, completed.length, true, card, playerId);
  const skartPointsForDeclarations = skartPointsBySide(state.skartsByPlayer, state.takerId!);
  declarations = evaluateDeclarations(declarations, figureTricks, sideOf, completed.length, skartPointsForDeclarations);
  const remaining = players.some(p => p.active && p.hand.length > 0);

  if (remaining) {
    return { ...state, players, declarations, lockedCards: declarations.locks, completedTricks: completed, trick: { leader: winner, cards: [] }, leadSuit: null, nextPlayerIndex: state.players.findIndex(p => p.id === winner), phase: 'play' };
  }

  const scoreTricks = completed.filter((t): t is Trick & { winner: PlayerId } => t.winner !== undefined);
  const byPlayer = pointsByPlayer(scoreTricks);
  const total = totalTrickPoints(scoreTricks);
  if (!state.takerId) throw new Error('A végső pontozáshoz nincs megadva a felvevő.');
  if (!state.partnerId) throw new Error('A végső pontozáshoz nincs megadva a felvevő párja.');
  const skartPoints = skartPointsBySide(state.skartsByPlayer, state.takerId!);
  const takerSkartPoints = skartPoints.taker;
  const defenceSkartPoints = skartPoints.defence;
  const takerTrickPoints = (byPlayer[state.takerId] ?? 0) + (state.partnerId === state.takerId ? 0 : (byPlayer[state.partnerId] ?? 0));
  const takerPair = takerTrickPoints + takerSkartPoints;
  const defencePair = (total - takerTrickPoints) + defenceSkartPoints;
  const result = winnerByPair({ takerPair, defencePair });
  const settlement = state.contract
    ? calculateSettlement({
        contract: state.contract,
        takerPairWon: result === 'taker',
        takerTrickPoints,
        takerSkartPoints,
        defenceSkartPoints,
        takerPairVolat: scoreTricks.length === 9 && scoreTricks.every(t => sideOf(t.winner) === 'taker'),
        defencePairVolat: scoreTricks.length === 9 && scoreTricks.every(t => sideOf(t.winner) === 'defence'),
        gameContra: state.gameContraState?.level ?? state.gameContra ?? 'none',
        figures: figureSettlementsFromProgress(declarations, state.takerId, state.partnerId),
      })
    : undefined;
  return {
    ...state,
    players,
    declarations,
    lockedCards: declarations.locks,
    completedTricks: completed,
    trick: null,
    leadSuit: null,
    nextPlayerIndex: state.players.findIndex(p => p.id === winner),
    phase: 'scoring',
    ...(settlement ? { settlement } : {}),
    finalPoints: { byPlayer, takerPair, defencePair, total: takerPair + defencePair, result }
  };
}
function determineTrickWinner(cards: Array<{ player: PlayerId; card: Card }>, leadSuit: Suit | null): PlayerId { let winner = cards[0]!; for (const current of cards.slice(1)) if (beats(current.card, winner.card, leadSuit)) winner = current; return winner.player; }
function beats(candidate: Card, current: Card, leadSuit: Suit | null): boolean {
  if (isTarokk(candidate) && !isTarokk(current)) return true; if (!isTarokk(candidate) && isTarokk(current)) return false; if (isTarokk(candidate) && isTarokk(current)) return candidate.rank > current.rank;
  if (candidate.kind === 'suit' && current.kind === 'suit') { const candidateLed = candidate.suit === leadSuit; const currentLed = current.suit === leadSuit; if (candidateLed && !currentLed) return true; if (!candidateLed && currentLed) return false; if (!candidateLed && !currentLed) return false; const value = (r: Card & {kind:'suit'}) => ({K:5,Q:4,C:3,J:2,'10':1,A:1}[r.rank]); return value(candidate) > value(current); }
  return false;
}
