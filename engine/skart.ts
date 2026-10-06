import { Card, isTarokk } from './cards.js';

/** Cards which may never be put into a skart/fektetés. */
export function isForbiddenSkart(card: Card, invitedTarokk?: number): boolean {
  if (card.kind === 'suit' && card.rank === 'K') return true; // any king
  if (!isTarokk(card)) return false;
  if (card.rank === 1 || card.rank === 21 || card.rank === 22) return true; // honours
  if (card.rank === 20) return true; // XX
  if (invitedTarokk !== undefined && card.rank === invitedTarokk) return true;
  return false;
}

export function legalSkartCards(hand: Card[], invitedTarokk?: number): Card[] {
  return hand.filter(c => !isForbiddenSkart(c, invitedTarokk));
}

export function validateSkart(cards: Card[], count: number, invitedTarokk?: number): void {
  if (cards.length !== count) throw new Error(`Pontosan ${count} lapot kell fektetni.`);
  if (new Set(cards.map(c => c.id)).size !== cards.length) throw new Error('Egy lap csak egyszer fektethető.');
  const forbidden = cards.find(c => isForbiddenSkart(c, invitedTarokk));
  if (forbidden) throw new Error(`Ez a lap nem fektethető: ${forbidden.id}.`);
}

export function countSkartTarokks(cards: Card[]): number {
  return cards.filter(isTarokk).length;
}

export interface SkartDeclaration {
  playerId: string;
  tarokkCount: number;
  revealedToTable: boolean;
}

export function createSkartDeclaration(playerId: string, skart: Card[], isTaker: boolean): SkartDeclaration {
  return { playerId, tarokkCount: countSkartTarokks(skart), revealedToTable: isTaker };
}
