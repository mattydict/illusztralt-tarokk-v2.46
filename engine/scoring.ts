import { Card } from './cards.js';

export interface TrickLike {
  winner: string;
  cards: Array<{ player: string; card: Card }>;
}

export function trickPointValue(trick: TrickLike): number {
  return trick.cards.reduce((sum, entry) => sum + entry.card.points, 0);
}

export function pointsByPlayer(tricks: TrickLike[]): Record<string, number> {
  const result: Record<string, number> = {};
  for (const trick of tricks) {
    result[trick.winner] = (result[trick.winner] ?? 0) + trickPointValue(trick);
  }
  return result;
}

export function totalTrickPoints(tricks: TrickLike[]): number {
  return tricks.reduce((sum, trick) => sum + trickPointValue(trick), 0);
}

export function winnerByPair(points: { takerPair: number; defencePair: number }): 'taker' | 'defence' | 'invalid' {
  if (points.takerPair >= 48) return 'taker';
  if (points.defencePair >= 47) return 'defence';
  return 'invalid';
}
