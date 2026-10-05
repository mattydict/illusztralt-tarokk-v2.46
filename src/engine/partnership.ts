import { Card } from './cards.js';

export interface HandOwner { id: string; hand: Card[]; }

/**
 * Resolves the called-tarokk partner from the post-skart hands.
 * The taker cannot call a card that is in their own hand; XX is the
 * self-call exception handled by the table rules, so this helper returns
 * undefined when the called card is not held by exactly one other player.
 */
export function resolveCalledPartner(
  takerId: string,
  calledTarokk: 18 | 19 | 20,
  players: HandOwner[]
): string | undefined {
  // XX is the only legal self-call: if the taker holds XX, the taker is
  // the partner for partnership/signalling purposes. This is rare but valid.
  if (calledTarokk === 20) {
    const self = players.find(p => p.id === takerId);
    if (self?.hand.some(c => c.kind === 'tarokk' && c.rank === 20)) return takerId;
  }
  const holders = players.filter(p => p.id !== takerId && p.hand.some(c => c.kind === 'tarokk' && c.rank === calledTarokk));
  return holders.length === 1 ? holders[0]!.id : undefined;
}

export function pairOf(
  playerId: string,
  takerId: string,
  partnerId?: string
): 'taker' | 'defence' | 'unknown' {
  if (playerId === takerId || playerId === partnerId) return 'taker';
  if (partnerId) return 'defence';
  return 'unknown';
}
