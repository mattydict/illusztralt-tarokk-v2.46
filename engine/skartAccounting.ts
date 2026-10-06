import { Card } from './cards.js';

/**
 * Point accounting for the four skarts at the end of a deal.
 *
 * The taker's own skart belongs to the taker pair. Every other skart belongs
 * to the defence pair, including the skart of the taker's eventual partner.
 */
export function skartPointValue(cards: Card[] | undefined): number {
  return (cards ?? []).reduce((sum, card) => sum + card.points, 0);
}

export function skartPointsBySide(
  skartsByPlayer: Record<string, Card[]> | undefined,
  takerId: string,
): { taker: number; defence: number } {
  const entries = Object.entries(skartsByPlayer ?? {});
  return {
    taker: skartPointValue(skartsByPlayer?.[takerId]),
    defence: entries
      .filter(([playerId]) => playerId !== takerId)
      .reduce((sum, [, cards]) => sum + skartPointValue(cards), 0),
  };
}
