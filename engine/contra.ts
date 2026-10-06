import { DeclarationType } from './declarations.js';

export type ContraLevel = 'none' | 'kontra' | 'rekontra' | 'szubkontra' | 'mordkontra';
export type ContraSide = 'taker' | 'defence';
export type ContraTarget = 'game' | DeclarationType;

export interface ContraRecord {
  level: Exclude<ContraLevel, 'none'>;
  byPlayer: string;
  side: ContraSide;
  target: ContraTarget;
}

export interface ContraState {
  level: ContraLevel;
  target: ContraTarget;
  /** The side that originally owns the game/figure being doubled. */
  ownerSide: ContraSide;
  records: ContraRecord[];
}

const order: Exclude<ContraLevel, 'none'>[] = ['kontra', 'rekontra', 'szubkontra', 'mordkontra'];

export function initialContraState(
  target: ContraTarget = 'game',
  ownerSide: ContraSide = 'taker'
): ContraState {
  return { level: 'none', target, ownerSide, records: [] };
}

export function nextContraLevel(level: ContraLevel): Exclude<ContraLevel, 'none'> | undefined {
  if (level === 'mordkontra') return undefined;
  return order[level === 'none' ? 0 : order.indexOf(level) + 1];
}

export function canRaiseContra(
  state: ContraState,
  side: ContraSide,
  target: ContraTarget = state.target,
): boolean {
  if (target !== state.target || state.level === 'mordkontra') return false;
  const last = state.records[state.records.length - 1];
  // The first kontra must come from the side opposing the owner of the target.
  if (!last) return side !== state.ownerSide;
  // Thereafter the sides alternate strictly.
  return last.side !== side;
}

export function raiseContra(
  state: ContraState,
  byPlayer: string,
  side: ContraSide,
  target: ContraTarget = state.target,
): ContraState {
  if (!canRaiseContra(state, side, target)) {
    throw new Error('Ebben a helyzetben nem szabályos a következő kontra-emelés.');
  }
  const level = nextContraLevel(state.level);
  if (!level) throw new Error('A kontra legfeljebb mordkontráig emelhető.');
  return {
    ...state,
    level,
    records: [...state.records, { level, byPlayer, side, target }]
  };
}

export function contraMultiplier(level: ContraLevel): number {
  return ({ none: 1, kontra: 2, rekontra: 4, szubkontra: 8, mordkontra: 16 } as const)[level];
}
