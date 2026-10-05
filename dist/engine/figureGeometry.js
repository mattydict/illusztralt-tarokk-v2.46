import { pairOf } from './partnership.js';
const BIRD = {
    centrum: { deadline: 5, target: 'T20' },
    kismadar: { deadline: 6, target: 'T21' },
    nagymadar: { deadline: 7, target: 'T22' },
};
/**
 * Observable play-geometry for the bird figures.
 *
 * This is deliberately NOT a declaration legality check. It answers only:
 * "given the public tricks and this player's own hand, is the figure still
 * alive, and what is currently threatening it?"
 *
 * In particular, it never assumes the partner owns a hidden card.
 */
export function assessFigureGeometry(state, ownerId, figure) {
    const spec = BIRD[figure];
    const takerId = state.takerId;
    const side = takerId ? pairOf(ownerId, takerId, state.partnerId) : 'unknown';
    const ownHand = state.players.find(p => p.id === ownerId)?.hand ?? [];
    const targetInOwnHand = ownHand.some(c => c.id === spec.target);
    let prefixIntact = true;
    let prerequisiteTrickLost;
    let targetPlayedEarly = false;
    let targetPreserved = true;
    for (let i = 0; i < state.completedTricks.length; i += 1) {
        const trickNumber = i + 1;
        const trick = state.completedTricks[i];
        const wonBySide = side !== 'unknown' && takerId !== undefined && trick.winner !== undefined && pairOf(trick.winner, takerId, state.partnerId) === side;
        if (trickNumber < spec.deadline && !wonBySide && prerequisiteTrickLost === undefined) {
            prerequisiteTrickLost = trickNumber;
            prefixIntact = false;
        }
        if (trickNumber < spec.deadline && trick.cards.some(x => x.card.id === spec.target)) {
            targetPlayedEarly = true;
            targetPreserved = false;
        }
    }
    // A target already played in the currently open trick is also an early use.
    const currentTrickNumber = state.completedTricks.length + 1;
    if (state.trick && currentTrickNumber < spec.deadline && state.trick.cards.some(x => x.card.id === spec.target)) {
        targetPlayedEarly = true;
        targetPreserved = false;
    }
    if (targetPlayedEarly) {
        return {
            figure, deadline: spec.deadline, targetCardId: spec.target, side,
            prefixIntact, targetPreserved, targetInOwnHand,
            targetPlayedEarly, prerequisiteTrickLost,
            status: 'failed-target',
            reason: `${figure} bukott: a ${spec.target} a ${spec.deadline}. ütés előtt kijátszásra került.`,
        };
    }
    if (!prefixIntact) {
        return {
            figure, deadline: spec.deadline, targetCardId: spec.target, side,
            prefixIntact, targetPreserved, targetInOwnHand,
            targetPlayedEarly, prerequisiteTrickLost,
            status: 'failed-prefix',
            reason: `${figure} bukott: a ${prerequisiteTrickLost}. előkészítő ütést nem a bemondó oldal vitte.`,
        };
    }
    return {
        figure, deadline: spec.deadline, targetCardId: spec.target, side,
        prefixIntact, targetPreserved, targetInOwnHand,
        targetPlayedEarly, prerequisiteTrickLost,
        status: 'live',
        reason: targetInOwnHand
            ? `${figure} él; a célkártya a saját kézben van, és az előkészítő ütéseket még nem vesztették el.`
            : `${figure} él, de a célkártya nem ismert a saját kézben; a partner célkártyája továbbra is csak valószínűség.`,
    };
}
/**
 * Public-information-only strategic value of a candidate card while a bird
 * figure is active. This is intentionally narrower than a full rollout: it
 * evaluates only the currently visible trick and the declaring side. Hidden
 * hands are never consulted. Positive value means the candidate helps keep
 * the required prefix alive or improves the chance of handing control to the
 * declaring side; negative value means it would visibly throw away that
 * opportunity.
 */
export function assessFigureCandidateValue(state, ownerId, figure, candidateCardId) {
    const spec = BIRD[figure];
    const trick = state.trick;
    const trickNumber = state.completedTricks.length + 1;
    const side = state.takerId ? pairOf(ownerId, state.takerId, state.partnerId) : 'unknown';
    const ownHand = state.players.find(p => p.id === ownerId)?.hand ?? [];
    const targetInOwnHand = ownHand.some(c => c.id === spec.target);
    if (!trick) {
        const protectsTarget = candidateCardId !== spec.target || trickNumber >= spec.deadline;
        return {
            figure, candidateCardId, trickNumber, closesTrick: false,
            candidateWins: false, candidateSideWins: false, partnerCanWin: false,
            preservesPrefix: true, protectsTarget,
            value: protectsTarget ? 1 : -3,
            reason: protectsTarget
                ? `${figure}: vezetésnél a célkártya megőrzése támogatja a figura későbbi teljesítését.`
                : `${figure}: a célkártya túl korai vezetése láthatóan veszélyezteti a figurát.`,
        };
    }
    const candidate = ownHand.find(c => c.id === candidateCardId);
    const lead = trick.cards[0]?.card;
    if (!candidate || !lead) {
        return {
            figure, candidateCardId, trickNumber, closesTrick: false,
            candidateWins: false, candidateSideWins: false, partnerCanWin: false,
            preservesPrefix: true, protectsTarget: candidateCardId !== spec.target,
            value: 0, reason: 'A jelölt laphoz nincs elegendő nyilvános állapotinformáció.',
        };
    }
    const activeCount = state.players.filter(p => p.active).length;
    const closesTrick = trick.cards.length + 1 >= activeCount;
    const candidateWinner = localWinner([...trick.cards, { player: ownerId, card: candidate }], lead);
    const candidateWins = candidateWinner === ownerId;
    const candidateSide = state.takerId ? pairOf(candidateWinner, state.takerId, state.partnerId) : 'unknown';
    const candidateSideWins = side !== 'unknown' && candidateSide === side;
    const partnerId = state.partnerId === ownerId ? state.takerId : state.partnerId;
    const partnerCanWin = partnerId !== undefined && candidateWinner === partnerId;
    const preservesPrefix = !closesTrick || trickNumber >= spec.deadline || candidateSideWins;
    const protectsTarget = candidateCardId !== spec.target || trickNumber >= spec.deadline;
    let value = 0;
    if (trickNumber < spec.deadline && closesTrick) {
        if (candidateSideWins)
            value += 4.5;
        else
            value -= 6;
    }
    else if (trickNumber < spec.deadline && partnerCanWin) {
        value += 1.5;
    }
    if (candidateCardId === spec.target && trickNumber < spec.deadline)
        value -= 8;
    if (candidateCardId === spec.target && trickNumber === spec.deadline && candidateSideWins)
        value += 7;
    if (trickNumber === spec.deadline && candidateSideWins && candidateCardId === spec.target)
        value += 5;
    return {
        figure, candidateCardId, trickNumber, closesTrick, candidateWins,
        candidateSideWins, partnerCanWin, preservesPrefix, protectsTarget, value,
        reason: value > 0
            ? `${figure}: a látható ütésállapot alapján ez a kijátszás támogatja a bemondó oldal célütését.`
            : value < 0
                ? `${figure}: a látható ütésállapot alapján ez a kijátszás veszélyezteti a figura előkészítő láncát vagy célkártyáját.`
                : `${figure}: a látható ütésállapot alapján nincs egyértelmű figuraelőny.`,
    };
}
export function assessActiveBirdGeometry(state, ownerId) {
    const active = state.declarations.declarations.find(d => d.ownerId === ownerId &&
        d.status !== 'failed' && d.status !== 'fulfilled' &&
        (d.type === 'centrum' || d.type === 'kismadar' || d.type === 'nagymadar'));
    if (!active)
        return undefined;
    const figure = active.type;
    return assessFigureGeometry(state, ownerId, figure);
}
export function assessFigurePlayRisk(state, ownerId, figure, candidateCardId) {
    const spec = BIRD[figure];
    const trick = state.trick;
    const trickNumber = state.completedTricks.length + 1;
    if (!trick) {
        return { figure, trickNumber, closesTrick: false, wouldLosePrefix: false, wouldPlayTargetTooEarly: false, risk: 'none', reason: 'Nincs aktív ütés.' };
    }
    const activeCount = state.players.filter(p => p.active).length;
    const closesTrick = trick.cards.length + 1 >= activeCount;
    const wouldPlayTargetTooEarly = candidateCardId === spec.target && trickNumber < spec.deadline;
    if (wouldPlayTargetTooEarly) {
        return {
            figure, trickNumber, closesTrick,
            wouldLosePrefix: false,
            wouldPlayTargetTooEarly: true,
            risk: 'target',
            reason: `${figure}: a ${spec.target} a ${spec.deadline}. ütés előtt kerülne kijátszásra.`,
        };
    }
    if (!closesTrick || trickNumber >= spec.deadline) {
        return {
            figure, trickNumber, closesTrick,
            wouldLosePrefix: false,
            wouldPlayTargetTooEarly: false,
            risk: 'none',
            reason: `${figure}: ez a kijátszás még nem zárja le az előkészítő ütést, vagy már a célütésben vagyunk.`,
        };
    }
    const candidate = state.players.find(p => p.id === ownerId)?.hand.find(c => c.id === candidateCardId);
    const lead = trick.cards[0]?.card;
    if (!candidate || !lead) {
        return { figure, trickNumber, closesTrick, wouldLosePrefix: false, wouldPlayTargetTooEarly: false, risk: 'none', reason: 'A jelölt lap nem található a saját kézben.' };
    }
    const cards = [...trick.cards, { player: ownerId, card: candidate }];
    const winner = localWinner(cards, lead);
    const takerId = state.takerId;
    const side = takerId ? pairOf(ownerId, takerId, state.partnerId) : 'unknown';
    const winnerSide = takerId ? pairOf(winner, takerId, state.partnerId) : 'unknown';
    const wouldLosePrefix = side !== 'unknown' && winnerSide !== side;
    return {
        figure, trickNumber, closesTrick,
        wouldLosePrefix,
        wouldPlayTargetTooEarly: false,
        risk: wouldLosePrefix ? 'prefix' : 'none',
        reason: wouldLosePrefix
            ? `${figure}: a ${trickNumber}. előkészítő ütést az ellenoldal vinné el ezzel a kijátszással.`
            : `${figure}: a ${trickNumber}. előkészítő ütés a bemondó oldalon maradna.`,
    };
}
function localWinner(cards, lead) {
    let winner = cards[0];
    for (const current of cards.slice(1)) {
        if (localBeats(current.card, winner.card, lead))
            winner = current;
    }
    return winner.player;
}
function localBeats(candidate, current, lead) {
    const tarokk = (c) => c.kind === 'tarokk';
    if (tarokk(candidate) && !tarokk(current))
        return true;
    if (!tarokk(candidate) && tarokk(current))
        return false;
    if (tarokk(candidate) && tarokk(current))
        return candidate.rank > current.rank;
    if (candidate.kind !== 'suit' || current.kind !== 'suit' || lead.kind !== 'suit')
        return false;
    const candidateLed = candidate.suit === lead.suit;
    const currentLed = current.suit === lead.suit;
    if (candidateLed && !currentLed)
        return true;
    if (!candidateLed)
        return false;
    if (!currentLed)
        return true;
    const value = (r) => ({ K: 5, Q: 4, C: 3, J: 2, '10': 1, A: 1 }[r]);
    return value(candidate.rank) > value(current.rank);
}
