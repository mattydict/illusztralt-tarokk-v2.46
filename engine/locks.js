/**
 * The 2019 ITVB rules make locked cards an explicit play constraint:
 * Centrum -> XX, Kismadár -> XXI, Nagymadár -> Skíz, and Ultimo/Uhu ->
 * the declared card. Locked cards must be played in lock order.
 * Timing/resolution of each figure is kept separate from this generic order rule.
 */
export function nextLockedCard(locks) {
    return [...locks]
        .filter(l => !l.resolved)
        .sort((a, b) => a.order - b.order)[0];
}
export function canPlayLockedCard(card, locks, ownerId) {
    const scopedLocks = ownerId === undefined ? locks : locks.filter(l => l.ownerId === ownerId);
    const lock = scopedLocks.find(l => l.cardId === card.id && !l.resolved);
    if (!lock)
        return true;
    const next = nextLockedCard(scopedLocks);
    return !!next && next.cardId === card.id;
}
export function validateLockedPlay(card, locks, ownerId) {
    if (!canPlayLockedCard(card, locks, ownerId)) {
        const scopedLocks = ownerId === undefined ? locks : locks.filter(l => l.ownerId === ownerId);
        const next = nextLockedCard(scopedLocks);
        throw new Error(`Lekötött lap: előbb a lekötési sorrend szerinti lapot kell kijátszani (${next?.cardId ?? 'ismeretlen'}).`);
    }
}
/**
 * Builds the lock queue from declared figures. The card mapping follows the
 * ITVB rule: Centrum -> XX, Kismadár -> XXI, Nagymadár -> Skíz,
 * Ultimo/Uhu -> the declared card.
 */
export function createLockedCards(declarations) {
    const locks = [];
    for (const declaration of declarations) {
        const cardId = declaration.cardId ?? {
            centrum: 'T20',
            kismadar: 'T21',
            nagymadar: 'T22',
            ultimo: undefined,
            uhu: undefined
        }[declaration.figure];
        if (!cardId)
            throw new Error(`${declaration.figure} bemondásához meg kell adni a lekötött lapot.`);
        if (locks.some(lock => lock.cardId === cardId && !lock.resolved)) {
            throw new Error(`A ${cardId} lap már egy aktív lekötés része.`);
        }
        locks.push({ cardId, figure: declaration.figure, order: locks.length + 1, ownerId: declaration.ownerId, resolved: false });
    }
    return locks;
}
