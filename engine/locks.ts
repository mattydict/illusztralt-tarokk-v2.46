import { Card } from './cards.js';

export type LockedFigure = 'centrum' | 'kismadar' | 'nagymadar' | 'ultimo' | 'uhu';

export interface LockedCard {
  cardId: string;
  figure: LockedFigure;
  order: number;
  ownerId: string;
  resolved: boolean;
}

/**
 * The 2019 ITVB rules make locked cards an explicit play constraint:
 * Centrum -> XX, Kismadár -> XXI, Nagymadár -> Skíz, and Ultimo/Uhu ->
 * the declared card. Locked cards must be played in lock order.
 * Timing/resolution of each figure is kept separate from this generic order rule.
 */
export function nextLockedCard(locks: LockedCard[]): LockedCard | undefined {
  return [...locks]
    .filter(l => !l.resolved)
    .sort((a, b) => a.order - b.order)[0];
}

export function canPlayLockedCard(card: Card, locks: LockedCard[], ownerId?: string): boolean {
  const scopedLocks = ownerId === undefined ? locks : locks.filter(l => l.ownerId === ownerId);
  const lock = scopedLocks.find(l => l.cardId === card.id && !l.resolved);
  if (!lock) return true;
  const next = nextLockedCard(scopedLocks);
  return !!next && next.cardId === card.id;
}

export function validateLockedPlay(card: Card, locks: LockedCard[], ownerId?: string): void {
  if (!canPlayLockedCard(card, locks, ownerId)) {
    const scopedLocks = ownerId === undefined ? locks : locks.filter(l => l.ownerId === ownerId);
    const next = nextLockedCard(scopedLocks);
    throw new Error(`Lekötött lap: előbb a lekötési sorrend szerinti lapot kell kijátszani (${next?.cardId ?? 'ismeretlen'}).`);
  }
}


export interface DeclarationLockInput {
  figure: LockedFigure;
  ownerId: string;
  /** Explicit card for king ultimo/uhu; otherwise inferred from figure. */
  cardId?: string;
}

/**
 * Builds the lock queue from declared figures. The card mapping follows the
 * ITVB rule: Centrum -> XX, Kismadár -> XXI, Nagymadár -> Skíz,
 * Ultimo/Uhu -> the declared card.
 */
export function createLockedCards(declarations: DeclarationLockInput[]): LockedCard[] {
  const locks: LockedCard[] = [];
  for (const declaration of declarations) {
    const cardId = declaration.cardId ?? ({
      centrum: 'T20',
      kismadar: 'T21',
      nagymadar: 'T22',
      ultimo: undefined,
      uhu: undefined
    } as const)[declaration.figure];
    if (!cardId) throw new Error(`${declaration.figure} bemondásához meg kell adni a lekötött lapot.`);
    if (locks.some(lock => lock.cardId === cardId && !lock.resolved)) {
      throw new Error(`A ${cardId} lap már egy aktív lekötés része.`);
    }
    locks.push({ cardId, figure: declaration.figure, order: locks.length + 1, ownerId: declaration.ownerId, resolved: false });
  }
  return locks;
}
