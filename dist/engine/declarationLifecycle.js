import { createLockedCards, nextLockedCard } from './locks.js';
import { initialContraState } from './contra.js';
import { validateDeclarationCall } from './declarationRules.js';
import { evaluateDeclaration } from './figureEvaluator.js';
const LOCKED_FIGURES = new Set([
    'centrum', 'kismadar', 'nagymadar',
    'pagatUltimo', 'sasUltimo', 'kingUltimo',
    'pagatUhu', 'sasUhu', 'kingUhu'
]);
function figureFor(type) {
    if (type === 'centrum')
        return 'centrum';
    if (type === 'kismadar')
        return 'kismadar';
    if (type === 'nagymadar')
        return 'nagymadar';
    if (type.endsWith('Ultimo'))
        return 'ultimo';
    if (type.endsWith('Uhu'))
        return 'uhu';
    return undefined;
}
function targetFor(type, explicit) {
    if (explicit)
        return explicit;
    if (type === 'centrum')
        return 'T20';
    if (type === 'kismadar')
        return 'T21';
    if (type === 'nagymadar')
        return 'T22';
    if (type === 'pagatUltimo' || type === 'pagatUhu')
        return 'T1';
    if (type === 'sasUltimo' || type === 'sasUhu')
        return 'T2';
    return undefined;
}
export function declareFigure(progress, type, ownerId, trickNumber, explicitTargetCardId, pairId) {
    if (type === 'tarokk8' || type === 'tarokk9') {
        throw new Error('A 8/9 tarokk bemondás külön tarokkszám-akció; a 9 tarokkos játékos 8 tarokkot nem mondhat.');
    }
    const validation = validateDeclarationCall(type, {
        previousDeclarations: progress.declarations.map(d => d.type),
        declarationsOnCurrentTrick: progress.declarations
            .filter(d => d.declaredAtTrick === trickNumber && d.status !== 'failed' && (!pairId || d.pairId === pairId))
            .map(d => d.type),
        ...(pairId ? { pairId } : {}),
        previousPairIds: progress.declarations
            .filter(d => d.pairId)
            .map(d => ({ type: d.type, pairId: d.pairId }))
    });
    if (!validation.ok)
        throw new Error(validation.reason ?? 'Szabálytalan bemondás.');
    const id = `${ownerId}:${type}:${trickNumber}:${progress.declarations.length + 1}`;
    const figure = figureFor(type);
    const targetCardId = targetFor(type, explicitTargetCardId);
    let lock;
    if (figure) {
        const built = createLockedCards([{
                figure,
                ownerId,
                ...(targetCardId ? { cardId: targetCardId } : {})
            }]);
        lock = built[0];
    }
    const declaration = {
        id,
        type,
        ownerId,
        declaredAtTrick: trickNumber,
        status: 'declared',
        ...(targetCardId ? { targetCardId } : {}),
        ...(lock ? { lock: { ...lock, order: progress.locks.length + 1 } } : {}),
        contra: initialContraState(type, pairId && pairId.startsWith('defence:') ? 'defence' : 'taker'),
        ...(pairId ? { pairId } : {})
    };
    return {
        declarations: [...progress.declarations, declaration],
        locks: lock ? [...progress.locks, { ...lock, order: progress.locks.length + 1 }] : progress.locks,
        events: [...progress.events, { declarationId: id, status: 'declared' }],
        silentFigures: [...progress.silentFigures]
    };
}
/**
 * Called after a card has been played. This deliberately does not guess when
 * a figure succeeds: only rules with an objectively observable trigger are
 * resolved here. A figure is failed when the locked target card is played by
 * the wrong side or when the fourth card of the relevant trick has been laid,
 * where the rules make that the failure point.
 */
export function advanceDeclarationLifecycle(progress, trickNumber, trickComplete, playedCard, playerId) {
    let declarations = progress.declarations.map(d => ({ ...d, ...(d.lock ? { lock: { ...d.lock } } : {}) }));
    let locks = progress.locks.map(l => ({ ...l }));
    const events = [];
    for (const declaration of declarations) {
        if (declaration.status === 'failed' || declaration.status === 'fulfilled')
            continue;
        if (declaration.status === 'declared')
            declaration.status = 'active';
        if (declaration.targetCardId === playedCard.id) {
            const deadline = declarationDeadline(declaration.type);
            if (deadline !== undefined && trickNumber < deadline) {
                // The card may exceptionally be forced by the ordinary follow/
                // tarokk-throw obligation. The declaration is NOT officially failed
                // until the fourth card closes the trick (ITVB 7.4).
                declaration.earlyTargetFailurePending = true;
            }
            else if (declaration.type.endsWith('Ultimo') || declaration.type.endsWith('Uhu')) {
                // Playing the target on its deadline is not itself enough to decide
                // success: the completed trick still has to be evaluated.
                declaration.outcomeTrick = trickNumber;
            }
        }
        // If the locked card was played by someone other than its owner before
        // the figure can be completed, the figure cannot be claimed as the owner's
        // successful lock. Keep the actual success test in the figure evaluator.
        // The identity of the successful side is resolved by evaluateDeclarations.
        // The owner may have a partner, so playerId !== ownerId is not sufficient
        // to declare failure here.
        // A completed trick is the earliest safe point for external rules to
        // classify a declaration. We intentionally leave it active here unless a
        // concrete observable failure occurred.
        if (trickComplete && declaration.status === 'active') {
            if (declaration.earlyTargetFailurePending) {
                declaration.status = 'failed';
                declaration.outcomeTrick = trickNumber;
                declaration.earlyTargetFailurePending = false;
                if (declaration.lock)
                    declaration.lock.resolved = true;
                const lock = locks.find(l => declaration.lock && l.cardId === declaration.lock.cardId && l.ownerId === declaration.lock.ownerId);
                if (lock)
                    lock.resolved = true;
                events.push({ declarationId: declaration.id, status: 'failed', reason: 'A lekötött célkártya a határütés előtt kényszerből kijátszásra került; a bemondás az ütés lezárásakor bukott.' });
            }
            else {
                declaration.status = 'active';
            }
        }
    }
    return { declarations, locks, events: [...progress.events, ...events], silentFigures: [...progress.silentFigures] };
}
function declarationDeadline(type) {
    if (type === 'centrum')
        return 5;
    if (type === 'kismadar')
        return 6;
    if (type === 'nagymadar')
        return 7;
    if (type === 'pagatUhu' || type === 'sasUhu' || type === 'kingUhu')
        return 8;
    if (type === 'pagatUltimo' || type === 'sasUltimo' || type === 'kingUltimo')
        return 9;
    return undefined;
}
export function resolveDeclaration(progress, declarationId, success, trickNumber, reason) {
    const declarations = progress.declarations.map(d => {
        if (d.id !== declarationId || d.status === 'failed' || d.status === 'fulfilled')
            return d;
        return {
            ...d,
            status: (success ? 'fulfilled' : 'failed'),
            outcomeTrick: trickNumber,
            ...(d.lock ? { lock: { ...d.lock, resolved: true } } : {})
        };
    });
    const target = declarations.find(d => d.id === declarationId);
    const locks = progress.locks.map(l => target?.lock && l.cardId === target.lock.cardId && l.ownerId === target.lock.ownerId
        ? { ...l, resolved: true }
        : l);
    return {
        declarations,
        locks,
        events: [...progress.events, { declarationId, status: success ? 'fulfilled' : 'failed', ...(reason ? { reason } : {}) }],
        silentFigures: [...progress.silentFigures]
    };
}
export function evaluateDeclarations(progress, tricks, sideOf, currentTrickNumber = tricks.length, skartPointsBySide) {
    const declarations = progress.declarations.map(d => ({ ...d, ...(d.lock ? { lock: { ...d.lock } } : {}) }));
    const locks = progress.locks.map(l => ({ ...l }));
    const events = [];
    for (const d of declarations) {
        if (d.status === 'failed' || d.status === 'fulfilled')
            continue;
        const status = evaluateDeclaration(d, { tricks, sideOf, ...(skartPointsBySide ? { skartPointsBySide } : {}) });
        if (!status || status === d.status)
            continue;
        d.status = status;
        d.outcomeTrick = currentTrickNumber;
        if (d.lock)
            d.lock.resolved = true;
        const lock = locks.find(l => d.lock && l.cardId === d.lock.cardId && l.ownerId === d.lock.ownerId);
        if (lock)
            lock.resolved = true;
        events.push({ declarationId: d.id, status });
    }
    // ITVB 7.7: when a locked-card figure is declared, another figure actually
    // completed by the same pair on the very same trick is a silent figure.
    // We mark this after ordinary evaluation, because only the completed trick
    // reveals whether the locked target was won on that trick.
    for (const locked of declarations) {
        if (!locked.lock || locked.status !== 'fulfilled')
            continue;
        const targetTrickIndex = tricks.findIndex(t => t.winner && sideOf(t.winner) === sideOf(locked.ownerId) &&
            t.cards.some(e => e.card.id === locked.lock.cardId && e.player === t.winner));
        if (targetTrickIndex < 0)
            continue;
        const targetTrickNumber = targetTrickIndex + 1;
        for (const other of declarations) {
            if (other.id === locked.id || other.status !== 'fulfilled')
                continue;
            if (other.pairId && locked.pairId && other.pairId !== locked.pairId)
                continue;
            if (!other.pairId && sideOf(other.ownerId) !== sideOf(locked.ownerId))
                continue;
            if (other.outcomeTrick === targetTrickNumber)
                other.silent = true;
        }
    }
    const silentFigures = [...progress.silentFigures];
    // ITVB 6.12: Tulétroá and Négykirály are csendes figures as well.
    // They may be completed by either side, even without an explicit declaration.
    // Do not create a silent duplicate when the figure was explicitly declared.
    // The figure becomes objectively known only once the relevant cards have all
    // been won by the same side.
    const hasDeclaredFigure = (type) => declarations.some(d => d.type === type);
    if (!hasDeclaredFigure('tuletroa') && !silentFigures.some(s => s.type === 'tuletroa')) {
        const targets = ['T20', 'T21', 'T22'];
        const completed = targets.every(cardId => tricks.some(t => t.cards.some(e => e.card.id === cardId) &&
            sideOf(t.winner) !== 'unknown' && sideOf(t.winner) === sideOf(t.cards.find(e => e.card.id === cardId)?.player)));
        if (completed) {
            const targetTricks = targets.map(cardId => tricks.find(t => t.cards.some(e => e.card.id === cardId) &&
                sideOf(t.winner) !== 'unknown' && sideOf(t.winner) === sideOf(t.cards.find(e => e.card.id === cardId)?.player)));
            const owners = targetTricks.map(t => t && sideOf(t.winner));
            if (owners.every(s => s !== 'unknown') && owners.every(s => s === owners[0])) {
                const ownerTrick = targetTricks[targetTricks.length - 1];
                silentFigures.push({
                    type: 'tuletroa',
                    ownerId: ownerTrick.winner,
                    trickNumber: tricks.indexOf(ownerTrick) + 1,
                    status: 'fulfilled',
                    sourceDeclarationId: 'silent:tuletroa',
                });
            }
        }
    }
    if (!hasDeclaredFigure('fourKings') && !silentFigures.some(s => s.type === 'fourKings')) {
        const targets = ['hearts-K', 'diamonds-K', 'spades-K', 'clubs-K'];
        const targetTricks = targets.map(cardId => tricks.find(t => t.cards.some(e => e.card.id === cardId) &&
            sideOf(t.winner) !== 'unknown' && sideOf(t.winner) === sideOf(t.cards.find(e => e.card.id === cardId)?.player)));
        if (targetTricks.every(Boolean)) {
            const sides = targetTricks.map(t => sideOf(t.winner));
            if (sides.every(s => s !== 'unknown') && sides.every(s => s === sides[0])) {
                const ownerTrick = targetTricks[targetTricks.length - 1];
                silentFigures.push({
                    type: 'fourKings',
                    ownerId: ownerTrick.winner,
                    trickNumber: (tricks.indexOf(ownerTrick) + 1),
                    status: 'fulfilled',
                    sourceDeclarationId: 'silent:fourKings',
                });
            }
        }
    }
    // Silent XXI-fogás: the XXI-fogás is a csendben teljesíthető figure.
    // It is completed whenever the Skíz (T22) captures the opponent's XXI
    // (T21) in a trick. A declared XXI-fogás is handled by the normal
    // declaration evaluator; it must not generate a second, duplicate silent
    // figure.
    const hasFulfilledDeclaredXxi = declarations.some(d => d.type === 'xxiFogas' && d.status === 'fulfilled');
    if (!hasFulfilledDeclaredXxi) {
        const silentXxiAlreadyRecorded = progress.silentFigures.some(s => s.type === 'xxiFogas');
        if (!silentXxiAlreadyRecorded) {
            const xxiTrickIndex = tricks.findIndex(t => {
                const xxi = t.cards.find(e => e.card.id === 'T21');
                const skiz = t.cards.find(e => e.card.id === 'T22');
                if (!xxi || !skiz)
                    return false;
                // Silent XXI-fogás also requires the captured XXI to belong to the
                // opposing side. Partner XXI + own Skíz is not a XXI-fogás.
                return sideOf(xxi.player) !== sideOf(skiz.player) && t.winner === skiz.player;
            });
            if (xxiTrickIndex >= 0) {
                const skizPlayer = tricks[xxiTrickIndex].cards.find(e => e.card.id === 'T22').player;
                silentFigures.push({
                    type: 'xxiFogas',
                    ownerId: skizPlayer,
                    trickNumber: xxiTrickIndex + 1,
                    status: 'fulfilled',
                    sourceDeclarationId: 'silent:xxiFogas',
                });
            }
        }
    }
    // Silent Pagát/Sas Ultimó is earned only when the target card is won by its
    // holder in the ninth (last) trick. Playing Pagát/Sas earlier does not create
    // a failed silent figure.
    if (tricks.length === 9) {
        const finalTrick = tricks[8];
        if (finalTrick) {
            for (const [targetId, silentType] of [['T1', 'pagatUltimo'], ['T2', 'sasUltimo']]) {
                const played = finalTrick.cards.find(e => e.card.id === targetId);
                if (!played)
                    continue;
                if (finalTrick.winner !== played.player)
                    continue;
                // A silent Ultimó is an independent figure, but it is still a
                // one-outcome objective for the deal. Do not create another silent
                // record if the authoritative lifecycle already contains an active or
                // fulfilled/failed outcome for this target.
                if (declarations.some(d => d.type === silentType && d.status !== 'failed'))
                    continue;
                if (silentFigures.some(s => s.type === silentType))
                    continue;
                const sourceUhu = declarations.find(d => d.type === (silentType === 'pagatUltimo' ? 'pagatUhu' : 'sasUhu') &&
                    d.targetCardId === targetId);
                silentFigures.push({
                    type: silentType,
                    ownerId: played.player,
                    trickNumber: 9,
                    status: 'fulfilled',
                    sourceDeclarationId: sourceUhu?.id ?? `silent:${silentType}`,
                });
            }
            // Preserve the historical explicit-Uhu failure record when the Uhu's
            // locked card was deliberately saved to trick 9 but was then caught.
            for (const uhu of declarations) {
                if (!uhu.type.endsWith('Uhu') || !uhu.targetCardId)
                    continue;
                if (uhu.type === 'kingUhu')
                    continue;
                const silentType = uhu.type === 'pagatUhu' ? 'pagatUltimo' : 'sasUltimo';
                if (silentFigures.some(s => s.type === silentType && s.sourceDeclarationId === uhu.id))
                    continue;
                const played = finalTrick.cards.find(e => e.card.id === uhu.targetCardId);
                if (!played || played.player !== uhu.ownerId || finalTrick.winner === uhu.ownerId)
                    continue;
                silentFigures.push({
                    type: silentType,
                    ownerId: uhu.ownerId,
                    trickNumber: 9,
                    status: 'failed',
                    sourceDeclarationId: uhu.id,
                });
            }
        }
    }
    return { declarations, locks, events: [...progress.events, ...events], silentFigures };
}
export function initialDeclarationProgress() {
    return { declarations: [], locks: [], events: [], silentFigures: [] };
}
export function nextRequiredLockedCard(progress) {
    return nextLockedCard(progress.locks);
}
export function declarationHasLock(type) {
    return LOCKED_FIGURES.has(type);
}
