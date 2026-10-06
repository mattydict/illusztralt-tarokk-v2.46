import { availableDeclarations, declarationRequiresTarokkCount } from './declarations.js';
export function createDeclarationWindow(order, firstRound = true) {
    if (order.length !== 4)
        throw new Error('A bemondási körhöz 4 játékos szükséges.');
    return { order: [...order], currentIndex: 0, consecutivePasses: 0, finished: false, records: [], roundNumber: 1, firstRound: true, announcedTarokkCounts: {} };
}
export function currentDeclarer(window) {
    return window.finished ? undefined : window.order[window.currentIndex];
}
export function legalDeclarationActions(window, playerId, hand, context) {
    if (window.finished || currentDeclarer(window) !== playerId)
        return [];
    if (window.pendingTarokkCountPlayerId && window.pendingTarokkCountPlayerId !== playerId)
        return [];
    const announced = window.announcedTarokkCounts[playerId];
    const options = availableDeclarations(hand, { ...context, firstRound: window.roundNumber === 1, ...(announced !== undefined ? { announcedTarokkCount: announced } : {}) });
    const countActions = [];
    const tarokks = hand.filter(c => c.kind === 'tarokk').length;
    if (window.pendingTarokkCountPlayerId === playerId) {
        if (tarokks >= 9 && announced !== 9)
            countActions.push({ type: 'tarokkCount', playerId, count: 9 });
        else if (tarokks === 8 && announced === undefined)
            countActions.push({ type: 'tarokkCount', playerId, count: 8 });
        return countActions;
    }
    if (tarokks >= 9 && announced !== 9)
        countActions.push({ type: 'tarokkCount', playerId, count: 9 });
    else if (tarokks === 8 && announced === undefined)
        countActions.push({ type: 'tarokkCount', playerId, count: 8 });
    return [
        { type: 'pass', playerId },
        ...countActions,
        // Tarokk-count announcements have their own action type. Do not expose
        // tarokk8/tarokk9 as generic declaration buttons as well: that would create
        // a duplicate UI action and could bypass the exact-count rule.
        ...options
            .filter(o => o.type !== 'tarokk8' && o.type !== 'tarokk9')
            .map(o => ({ type: 'declare', playerId, declaration: o.type }))
    ];
}
export function applyDeclarationAction(window, action, hand) {
    if (window.finished)
        throw new Error('A bemondási kör már lezárult.');
    if (currentDeclarer(window) !== action.playerId)
        throw new Error('Most nem ennek a játékosnak kell megszólalnia.');
    const records = [...window.records, action];
    if (action.type === 'tarokkCount') {
        if (hand) {
            const actualTarokks = hand.filter(c => c.kind === 'tarokk').length;
            if ((actualTarokks === 8 && action.count !== 8) || (actualTarokks >= 9 && action.count !== 9) || actualTarokks < 8) {
                throw new Error('A bemondott tarokkszám nem egyezik a kéz tényleges tarokkszámával.');
            }
        }
        const previous = window.announcedTarokkCounts[action.playerId];
        if (previous === 9)
            throw new Error('A játékos már 9 tarokkot jelentett.');
        if (previous === 8 && action.count !== 9)
            throw new Error('A 8 tarokkos jelzés csak 9 tarokkra pontosítható.');
        const announcedTarokkCounts = { ...window.announcedTarokkCounts, [action.playerId]: action.count };
        const { pendingTarokkCountPlayerId: _pending, ...withoutPending } = window;
        // A player may continue making declarations until they pass. This is
        // important for the taker: after the mandatory partner call, the taker
        // may immediately make further declarations in the same turn.
        return { ...withoutPending, records, announcedTarokkCounts, consecutivePasses: 0 };
    }
    if (action.type === 'pass') {
        if (window.pendingTarokkCountPlayerId === action.playerId) {
            throw new Error('A kötelező tarokkszám-bemondást előbb meg kell tenni.');
        }
        const passes = window.consecutivePasses + 1;
        if (passes >= 3)
            return { ...window, records, consecutivePasses: passes, finished: true };
        const nextIndex = (window.currentIndex + 1) % window.order.length;
        const wrapped = nextIndex === 0;
        return {
            ...window,
            records,
            consecutivePasses: passes,
            currentIndex: nextIndex,
            ...(wrapped ? { roundNumber: (window.roundNumber ?? 1) + 1, firstRound: false } : {}),
        };
    }
    if (action.type === 'declare' && hand && declarationRequiresTarokkCount(action.declaration)) {
        const count = hand.filter(c => c.kind === 'tarokk').length;
        if (count >= 8 && window.announcedTarokkCounts[action.playerId] === undefined) {
            return { ...window, records, consecutivePasses: 0, pendingTarokkCountPlayerId: action.playerId };
        }
    }
    // A declaration does not end the speaker's turn. Passing does.
    return { ...window, records, consecutivePasses: 0 };
}
