export type Suit = 'hearts' | 'diamonds' | 'spades' | 'clubs';
export type SuitRank = 'K' | 'Q' | 'C' | 'J' | '10' | 'A';
export type Card =
  | { kind: 'tarokk'; rank: number; id: string; points: number }
  | { kind: 'suit'; suit: Suit; rank: SuitRank; id: string; points: number };

export function createDeck(): Card[] {
  const cards: Card[] = [];
  for (let rank = 1; rank <= 22; rank++) {
    cards.push({ kind: 'tarokk', rank, id: `T${rank}`, points: rank === 1 || rank === 21 || rank === 22 ? 5 : 1 });
  }
  const suits: Suit[] = ['hearts', 'diamonds', 'spades', 'clubs'];
  const ranks: SuitRank[] = ['K', 'Q', 'C', 'J', '10'];
  for (const suit of suits) {
    for (const rank of ranks) {
      cards.push({ kind: 'suit', suit, rank, id: `${suit}-${rank}`, points: rank === 'K' ? 5 : rank === 'Q' ? 4 : rank === 'C' ? 3 : rank === 'J' ? 2 : 1 });
    }
  }
  return cards;
}

export function isTarokk(card: Card): card is Extract<Card, { kind: 'tarokk' }> { return card.kind === 'tarokk'; }
export function isHonour(card: Card): boolean { return isTarokk(card) && (card.rank === 1 || card.rank === 21 || card.rank === 22); }
