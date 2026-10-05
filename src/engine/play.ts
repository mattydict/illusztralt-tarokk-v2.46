import { Card, Suit, isTarokk } from './cards.js';
import { LockedCard } from './locks.js';
import { DeclarationProgress } from './declarationLifecycle.js';

export interface TrickCard { playerId: string; card: Card; }
export interface TrickState { leaderId: string; cards: TrickCard[]; lead: Card | null; winnerId?: string; }

export function legalPlayCards(hand: Card[], trick: TrickState): Card[] {
  if (trick.cards.length === 0) return [...hand];
  const lead = trick.lead!;
  if (isTarokk(lead)) return hand.filter(isTarokk);
  const suit = lead.suit;
  const suited = hand.filter(c => c.kind === 'suit' && c.suit === suit);
  if (suited.length) return suited;
  const tarokks = hand.filter(isTarokk);
  if (tarokks.length) return tarokks;
  return [...hand];
}

/**
 * Enforces the Tarokk "rájátszási kötelezettség" for declared figures.
 * The target card of a declared Centrum/Kismadár/Nagymadár/Uhu/Ultimó may
 * only be played on its designated trick. If the normal follow-suit/trump
 * rules leave that target as the only playable card, the obligation is
 * necessarily released and the card may be played earlier.
 */
export function applyDeclaredFigureLocks(
  legallyPlayable: Card[],
  hand: Card[],
  declarations: DeclarationProgress,
  trickNumber: number,
  ownerId?: string
): Card[] {
  const restrictedTargets = declarations.declarations
    .filter(d => d.status !== 'failed' && d.status !== 'fulfilled' && d.targetCardId && (ownerId === undefined || d.ownerId === ownerId))
    .map(d => ({ targetCardId: d.targetCardId!, deadline: declaredFigureDeadline(d.type) }))
    .filter((x): x is { targetCardId: string; deadline: number } => x.deadline !== undefined && trickNumber < x.deadline);

  if (!restrictedTargets.length) return legallyPlayable;
  const blocked = new Set(restrictedTargets.map(x => x.targetCardId));
  const nonTargets = legallyPlayable.filter(c => !blocked.has(c.id));
  return nonTargets.length ? nonTargets : legallyPlayable;
}

export function declaredFigureDeadline(type: string): number | undefined {
  if (type === 'centrum') return 5;
  if (type === 'kismadar') return 6;
  if (type === 'nagymadar') return 7;
  if (type === 'pagatUhu' || type === 'sasUhu' || type === 'kingUhu') return 8;
  if (type === 'pagatUltimo' || type === 'sasUltimo' || type === 'kingUltimo') return 9;
  return undefined;
}

export function determineWinner(cards: TrickCard[], lead: Card): string {
  if (!cards.length) throw new Error('Üres ütésnek nincs nyertese.');
  let winner = cards[0]!;
  for (const current of cards.slice(1)) {
    if (beats(current.card, winner.card, lead)) winner = current;
  }
  return winner.playerId;
}

export function beats(candidate: Card, current: Card, lead: Card): boolean {
  const leadTarokk = isTarokk(lead);
  if (leadTarokk) {
    if (!isTarokk(candidate) || !isTarokk(current)) return isTarokk(candidate);
    return candidate.rank > current.rank;
  }
  if (isTarokk(candidate) && !isTarokk(current)) return true;
  if (!isTarokk(candidate) && isTarokk(current)) return false;
  if (isTarokk(candidate) && isTarokk(current)) return candidate.rank > current.rank;
  const leadSuit = (lead as Extract<Card, {kind:'suit'}>).suit;
  const candidateLed = candidate.kind === 'suit' && candidate.suit === leadSuit;
  const currentLed = current.kind === 'suit' && current.suit === leadSuit;
  if (candidateLed && !currentLed) return true;
  if (!candidateLed) return false;
  if (!currentLed) return true;
  return suitRankValue(candidate) > suitRankValue(current);
}

function suitRankValue(card: Card): number {
  if (card.kind !== 'suit') return -1;
  return ({K:5,Q:4,C:3,J:2,'10':1,A:1} as Record<string,number>)[card.rank] ?? 0;
}
