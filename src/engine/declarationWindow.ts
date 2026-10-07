import { Card } from './cards.js';
import { DeclarationType, availableDeclarations, declarationRequiresTarokkCount } from './declarations.js';

export type DeclarationAction =
  | { type: 'pass'; playerId: string }
  | { type: 'declare'; playerId: string; declaration: DeclarationType; targetCardId?: string }
  | { type: 'tarokkCount'; playerId: string; count: 8 | 9 };

export interface DeclarationWindowState {
  order: string[];
  currentIndex: number;
  consecutivePasses: number;
  turnHadAction?: boolean;
  /** The taker's first actual declaration turn is excluded from the three-pass streak. */
  openingTakerTurnPending: boolean;
  finished: boolean;
  records: DeclarationAction[];
  firstRound: boolean;
  roundNumber: number;
  announcedTarokkCounts: Record<string, 8 | 9>;
  pendingTarokkCountPlayerId?: string;
}

export function declarationOrderFromTaker(playerIds: string[], takerId: string): string[] {
  if (playerIds.length !== 4) throw new Error('A bemondási sorrendhez 4 játékos szükséges.');
  const start = playerIds.indexOf(takerId);
  if (start < 0) throw new Error('A felvevő nincs a játékosok között.');
  return playerIds.map((_, i) => playerIds[(start + i) % playerIds.length]!);
}

export function createDeclarationWindow(order: string[], firstRound = true): DeclarationWindowState {
  if (order.length !== 4) throw new Error('A bemondási körhöz 4 játékos szükséges.');
  return { order: [...order], currentIndex: 0, consecutivePasses: 0, turnHadAction: false, finished: false, records: [], roundNumber: 1, firstRound, announcedTarokkCounts: {}, openingTakerTurnPending: true };
}

export function currentDeclarer(window: DeclarationWindowState): string | undefined {
  return window.finished ? undefined : window.order[window.currentIndex];
}

export function legalDeclarationActions(
  window: DeclarationWindowState,
  playerId: string,
  hand: Card[],
  context: Omit<Parameters<typeof availableDeclarations>[1], 'firstRound' | 'announcedTarokkCount'> & Partial<Pick<Parameters<typeof availableDeclarations>[1], 'firstRound' | 'announcedTarokkCount'>>
): DeclarationAction[] {
  if (window.finished || currentDeclarer(window) !== playerId) return [];
  if (window.pendingTarokkCountPlayerId && window.pendingTarokkCountPlayerId !== playerId) return [];
  const announced = window.announcedTarokkCounts[playerId];
  const options = availableDeclarations(hand, { ...context, firstRound: window.roundNumber === 1, ...(announced !== undefined ? { announcedTarokkCount: announced } : {}) });
  const countActions: DeclarationAction[] = [];
  const tarokks = hand.filter(c => c.kind === 'tarokk').length;
  if (window.pendingTarokkCountPlayerId === playerId) {
    if (tarokks >= 9 && announced !== 9) countActions.push({ type: 'tarokkCount', playerId, count: 9 });
    else if (tarokks === 8 && announced === undefined) countActions.push({ type: 'tarokkCount', playerId, count: 8 });
    return countActions;
  }
  if (tarokks >= 9 && announced !== 9) countActions.push({ type: 'tarokkCount', playerId, count: 9 });
  else if (tarokks === 8 && announced === undefined) countActions.push({ type: 'tarokkCount', playerId, count: 8 });
  return [
    { type: 'pass', playerId },
    ...countActions,
    // Tarokk-count announcements have their own action type. Do not expose
    // tarokk8/tarokk9 as generic declaration buttons as well: that would create
    // a duplicate UI action and could bypass the exact-count rule.
    ...options
      .filter(o => o.type !== 'tarokk8' && o.type !== 'tarokk9')
      .map(o => ({ type: 'declare' as const, playerId, declaration: o.type }))
  ];
}

export function applyDeclarationAction(window: DeclarationWindowState, action: DeclarationAction, hand?: Card[]): DeclarationWindowState {
  if (window.finished) throw new Error('A bemondási kör már lezárult.');
  if (currentDeclarer(window) !== action.playerId) throw new Error('Most nem ennek a játékosnak kell megszólalnia.');
  const records = [...window.records, action];
  if (action.type === 'tarokkCount') {
    if (hand) {
      const actualTarokks = hand.filter(c => c.kind === 'tarokk').length;
      if ((actualTarokks === 8 && action.count !== 8) || (actualTarokks >= 9 && action.count !== 9) || actualTarokks < 8) {
        throw new Error('A bemondott tarokkszám nem egyezik a kéz tényleges tarokkszámával.');
      }
    }
    const previous = window.announcedTarokkCounts[action.playerId];
    if (previous === 9) throw new Error('A játékos már 9 tarokkot jelentett.');
    if (previous === 8 && action.count !== 9) throw new Error('A 8 tarokkos jelzés csak 9 tarokkra pontosítható.');
    const announcedTarokkCounts = { ...window.announcedTarokkCounts, [action.playerId]: action.count };
    const { pendingTarokkCountPlayerId: _pending, ...withoutPending } = window;
    // A tarokk-count announcement is a factual disclosure inside the speaker's
    // current turn and does not itself end the turn.
    return { ...withoutPending, records, announcedTarokkCounts, consecutivePasses: 0, turnHadAction: true };
  }
  if (action.type === 'pass') {
    if (window.pendingTarokkCountPlayerId === action.playerId) {
      throw new Error('A kötelező tarokkszám-bemondást előbb meg kell tenni.');
    }
    const purePass = window.turnHadAction !== true;
    // The mandatory partner call is outside this window. The taker's first
    // actual declaration turn is also excluded from the three-pass streak,
    // whether it contains further declarations or only Passz.
    const openingTakerPass = window.openingTakerTurnPending === true
      && window.currentIndex === 0
      && window.roundNumber === 1;
    const passes = openingTakerPass ? 0 : (purePass ? window.consecutivePasses + 1 : 0);
    const openingTakerTurnPending = openingTakerPass ? false : window.openingTakerTurnPending;
    if (passes >= 3) return { ...window, records, consecutivePasses: passes, turnHadAction: false, openingTakerTurnPending, finished: true };
    const nextIndex = (window.currentIndex + 1) % window.order.length;
    const wrapped = nextIndex === 0;
    return {
      ...window,
      records,
      consecutivePasses: passes,
      turnHadAction: false,
      openingTakerTurnPending,
      currentIndex: nextIndex,
      ...(wrapped ? {roundNumber: (window.roundNumber ?? 1) + 1, firstRound: false} : {}),
    };
  }
  if (action.type === 'declare' && hand && declarationRequiresTarokkCount(action.declaration)) {
    const count = hand.filter(c => c.kind === 'tarokk').length;
    if (count >= 8 && window.announcedTarokkCounts[action.playerId] === undefined) {
      return { ...window, records, consecutivePasses: 0, turnHadAction: true, pendingTarokkCountPlayerId: action.playerId };
    }
  }
  // A declaration consumes this speaking turn; the next player is next to speak.
  return { ...window, records, consecutivePasses: 0, turnHadAction: true, currentIndex: window.currentIndex };
}

export function markDeclarationTurnAction(window: DeclarationWindowState, playerId: string): DeclarationWindowState {
  if (window.finished || currentDeclarer(window) !== playerId) throw new Error('Most nem ennek a játékosnak van bemondási joga.');
  return { ...window, consecutivePasses: 0, turnHadAction: true };
}
