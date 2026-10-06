import { Card, createDeck, isTarokk, Suit } from './cards.js';
import { GameState } from './game.js';

export interface PublicCardMemory {
  observerId: string;
  publicCardIds: Set<string>;
  publicCards: Card[];
  ownCardIds: Set<string>;
  unseenCards: Card[];
  unseenTarokkCards: Card[];
  unseenTarokkAbove: (rank: number) => Card[];
  unseenSuitAbove: (suit: Suit, rank: string) => Card[];
  allHigherTarokksAccounted: (rank: number) => boolean;
  allHigherSuitCardsAccounted: (suit: Suit, rank: string) => boolean;
}

/**
 * Observer-relative public card counting.
 *
 * Only the observer's own hand and cards that are public in the GameState are
 * used. Other players' hands are intentionally ignored, even though the
 * client-side state object may contain them during simulation.
 */
export function buildPublicCardMemory(state: GameState, observerId: string): PublicCardMemory {
  const own = state.players.find(player => player.id === observerId)?.hand ?? [];
  const ownCardIds = new Set(own.map(card => card.id));
  const publicCards = collectPublicCards(state);
  const publicCardIds = new Set(publicCards.map(card => card.id));
  const known = new Set<string>([...ownCardIds, ...publicCardIds]);
  const unseenCards = createDeck().filter(card => !known.has(card.id));
  const unseenTarokkCards = unseenCards.filter(isTarokk);

  const unseenTarokkAbove = (rank: number) => unseenTarokkCards.filter(card => card.rank > rank);
  const unseenSuitAbove = (suit: Suit, rank: string) => unseenCards.filter(card =>
    card.kind === 'suit' && card.suit === suit && compareSuitRank(card.rank, rank) > 0
  );
  const allHigherTarokksAccounted = (rank: number) => unseenTarokkAbove(rank).length === 0;
  const allHigherSuitCardsAccounted = (suit: Suit, rank: string) => unseenSuitAbove(suit, rank).length === 0;

  return {
    observerId,
    publicCardIds,
    publicCards,
    ownCardIds,
    unseenCards,
    unseenTarokkCards,
    unseenTarokkAbove,
    unseenSuitAbove,
    allHigherTarokksAccounted,
    allHigherSuitCardsAccounted,
  };
}

/**
 * Strategic score for information that is exact, not probabilistic:
 * publicly seen/own cards can eliminate whole classes of future responses.
 */
export function assessPublicCardControl(
  state: GameState,
  playerId: string,
  card: Card,
  candidateWins = false,
): { score: number; reasons: string[]; unseenHigherTarokks: number; unseenHigherSuitCards: number } {
  const memory = buildPublicCardMemory(state, playerId);
  const reasons: string[] = [];
  let score = 0;
  let unseenHigherTarokks = isTarokk(card) ? memory.unseenTarokkAbove(card.rank).length : 0;
  let unseenHigherSuitCards = 0;

  const trick = state.trick;
  const lateGame = state.completedTricks.length >= 6;

  if (isTarokk(card)) {
    if (trick?.cards.length && isTarokk(trick.cards[0]!.card) && candidateWins) {
      if (memory.allHigherTarokksAccounted(card.rank)) {
        score += 6.5;
        reasons.push(`Nyilvános kártyaszámolás: ${card.id} most már biztos tarokk-kontroll, minden magasabb tarokk ismert.`);
      } else if (unseenHigherTarokks === 1 && card.rank >= 18) {
        score += 1.5;
        reasons.push(`Nyilvános kártyaszámolás: csak egy magasabb ismeretlen tarokk maradt ${card.id} fölött.`);
      } else if (card.rank >= 19 && unseenHigherTarokks >= 2) {
        score -= 2.5;
        reasons.push(`Nyilvános kártyaszámolás: ${unseenHigherTarokks} magasabb ismeretlen tarokk még felülütheti.`);
      }
    }

    if (!trick?.cards.length && memory.allHigherTarokksAccounted(card.rank) && card.rank >= 17) {
      score += 3.5;
      reasons.push(`Nyilvános kártyaszámolás: ${card.id} vezetése mellett nincs ismeretlen magasabb tarokk.`);
    }

    if (lateGame && candidateWins && memory.unseenTarokkCards.length <= 3) {
      score += 1.5;
      reasons.push('Végjáték: kevés ismeretlen tarokk maradt, ezért a biztos kontroll többet ér.');
    }
  } else if (card.kind === 'suit') {
    unseenHigherSuitCards = memory.unseenSuitAbove(card.suit, card.rank).length;
    if (trick?.cards.length && trick.cards[0]!.card.kind === 'suit' && state.leadSuit === card.suit && candidateWins) {
      if (memory.allHigherSuitCardsAccounted(card.suit, card.rank)) {
        score += 2.5;
        reasons.push(`Nyilvános kártyaszámolás: ${card.id} a színben ismert módon kontrollálja a magasabb lapokat.`);
      }
    }
  }

  return { score, reasons, unseenHigherTarokks, unseenHigherSuitCards };
}

function collectPublicCards(state: GameState): Card[] {
  const result: Card[] = [];
  for (const trick of state.completedTricks) {
    for (const item of trick.cards) result.push(item.card);
  }
  if (state.trick) {
    for (const item of state.trick.cards) result.push(item.card);
  }
  for (const cards of Object.values(state.skartsByPlayer ?? {})) result.push(...cards);
  return result;
}

const SUIT_RANK_VALUE: Record<string, number> = {
  '10': 1,
  'J': 2,
  'C': 3,
  'Q': 4,
  'K': 5,
};

function compareSuitRank(a: string, b: string): number {
  return (SUIT_RANK_VALUE[a] ?? 0) - (SUIT_RANK_VALUE[b] ?? 0);
}
