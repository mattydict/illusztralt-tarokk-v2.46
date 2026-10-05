const order = ['kontra', 'rekontra', 'szubkontra', 'mordkontra'];
export function initialContraState(target = 'game', ownerSide = 'taker') {
    return { level: 'none', target, ownerSide, records: [] };
}
export function nextContraLevel(level) {
    if (level === 'mordkontra')
        return undefined;
    return order[level === 'none' ? 0 : order.indexOf(level) + 1];
}
export function canRaiseContra(state, side, target = state.target) {
    if (target !== state.target || state.level === 'mordkontra')
        return false;
    const last = state.records[state.records.length - 1];
    // The first kontra must come from the side opposing the owner of the target.
    if (!last)
        return side !== state.ownerSide;
    // Thereafter the sides alternate strictly.
    return last.side !== side;
}
export function raiseContra(state, byPlayer, side, target = state.target) {
    if (!canRaiseContra(state, side, target)) {
        throw new Error('Ebben a helyzetben nem szabályos a következő kontra-emelés.');
    }
    const level = nextContraLevel(state.level);
    if (!level)
        throw new Error('A kontra legfeljebb mordkontráig emelhető.');
    return {
        ...state,
        level,
        records: [...state.records, { level, byPlayer, side, target }]
    };
}
export function contraMultiplier(level) {
    return { none: 1, kontra: 2, rekontra: 4, szubkontra: 8, mordkontra: 16 }[level];
}
