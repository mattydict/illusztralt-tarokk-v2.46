const SUIT_SYMBOL = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
const SUIT_FILE = { hearts: 'herz', diamonds: 'karo', clubs: 'kreuz', spades: 'pik' };
const FIGURE_FILE = { K: 'koenig', Q: 'dame', C: 'cavall', J: 'bube' };

/** Return the name shown to players. Red-suit low cards are Aces in the illustrated deck. */
export function cardDisplayName(card) {
  if (card?.kind === 'tarokk') return `${card.rank}. tarokk`;
  const suit = SUIT_SYMBOL[card?.suit] || '';
  const rawRank = String(card?.rank ?? '');
  const rank = (card?.suit === 'hearts' || card?.suit === 'diamonds') && rawRank === '10' ? 'A' : rawRank;
  return `${suit}${rank}`;
}

/** Map an existing engine card to one of the 42 optimized static card images. */
export function cardImageFile(card) {
  if (card?.kind === 'tarokk') {
    const rank = Number(card.rank);
    if (rank === 22) return 'tarock-skus.webp';
    if (Number.isInteger(rank) && rank >= 1 && rank <= 21) return `tarock-${rank}.webp`;
    return 'tarock-skus.webp';
  }
  const suit = SUIT_FILE[card?.suit];
  if (!suit) return 'tarock-skus.webp';
  const rank = String(card?.rank ?? '');
  let rankFile = FIGURE_FILE[rank];
  if (rank === '10' && (card.suit === 'hearts' || card.suit === 'diamonds')) rankFile = '1';
  else if (rank === 'A' && (card.suit === 'hearts' || card.suit === 'diamonds')) rankFile = '1';
  else if (rank === '10' && (card.suit === 'clubs' || card.suit === 'spades')) rankFile = '10';
  if (!rankFile) return 'tarock-skus.webp';
  return `tarock-${suit}-${rankFile}.webp`;
}

export function cardImageSrc(card) {
  return `./cards/${cardImageFile(card)}`;
}
