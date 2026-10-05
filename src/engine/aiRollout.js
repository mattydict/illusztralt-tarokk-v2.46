import { createDeck, isTarokk } from './cards.js';
import { evaluatePlayDecision } from './aiDecisionEvaluator.js';
import { evaluateDeclaration } from './figureEvaluator.js';
import { calculateSettlement, figureSettlementsFromProgress } from './settlement.js';
import { skartPointsBySide } from './skartAccounting.js';
import { pairOf } from './partnership.js';
import { selectBeliefWorlds } from './aiWorldSampler.js';
/**
 * Information-safe micro-rollout. It samples only the observer's public
 * belief worlds and models the control race relevant to a figure. It is not a
 * full hidden-hand solver and never reads another player's actual hand.
 *
 * The purpose is to turn ownership hypotheses into a small forward simulation
 * of the critical target trick(s), before a later full-card rollout is added.
 */
export function rolloutDeclaration(state, observerId, handHypotheses, declaration, samples = 512) {
    const worlds = handHypotheses.hypotheses;
    if (!worlds.length)
        return { declaration, samples: 0, successProbability: 0, confidence: 0, failureReasons: ['Nincs elég ismert információ a rollout-hoz.'] };
    let successWeight = 0;
    let totalWeight = 0;
    let targetMissing = 0;
    let controlLost = 0;
    let partnerUnsupported = 0;
    for (let i = 0; i < samples; i++) {
        const world = worlds[i % worlds.length];
        const jitter = deterministicJitter(i, declaration);
        const score = rolloutWorld(state, observerId, handHypotheses.partnerId, world, declaration, jitter);
        const w = Math.max(0.000001, world.weight);
        totalWeight += w;
        successWeight += w * score;
        if (score < 0.35)
            controlLost += w;
        if (['centrum', 'kismadar', 'nagymadar'].includes(declaration) && !supportsPair(state, observerId, handHypotheses.partnerId, world, declaration))
            partnerUnsupported += w;
        if (['pagatUltimo', 'pagatUhu'].includes(declaration) && world.ownership[1] === 'unknown')
            targetMissing += w;
        if (['sasUltimo', 'sasUhu'].includes(declaration) && world.ownership[2] === 'unknown')
            targetMissing += w;
    }
    const successProbability = totalWeight ? clamp(successWeight / totalWeight) : 0;
    const confidence = clamp(0.35 + Math.min(0.45, worlds.length / 80) + Math.min(0.2, samples / 5000));
    const failureReasons = [];
    if (targetMissing > totalWeight * 0.2)
        failureReasons.push('A célfigura kulcslapjának helye sok lehetséges világban bizonytalan.');
    if (partnerUnsupported > totalWeight * 0.3)
        failureReasons.push('A partner feltételezett struktúrája sok világban nem ad elég kontrollt.');
    if (controlLost > totalWeight * 0.3)
        failureReasons.push('A kritikus ütésekben túl gyakran elveszik a kontroll.');
    if (!failureReasons.length)
        failureReasons.push('A legtöbb mintázott világban megmarad a szükséges kontroll.');
    return { declaration, samples, successProbability, confidence, failureReasons };
}
function rolloutWorld(state, observerId, partnerId, world, declaration, jitter) {
    const side = new Set([observerId, ...(partnerId ? [partnerId] : [])]);
    const owns = (rank) => side.has(world.ownership[rank]);
    const enemyOwns = (rank) => !!world.ownership[rank] && world.ownership[rank] !== 'unknown' && !side.has(world.ownership[rank]);
    const length = countSideTarokks(world, side) + 0.6 * ownTarokkCount(state, observerId);
    const currentTricks = state.completedTricks.length;
    switch (declaration) {
        case 'centrum': return figureRoll(owns(20), owns(21), owns(22), length, currentTricks, jitter, 0.48);
        case 'kismadar': return figureRoll(owns(21), owns(22), owns(20), length, currentTricks, jitter, 0.44);
        case 'nagymadar': return figureRoll(owns(22), owns(21), owns(20), length, currentTricks, jitter, 0.40);
        case 'xxiFogas': return catchRoll(owns(22) || ownTarokk(state, observerId, 22), enemyOwns(21), length, jitter);
        case 'volat': return volatRoll(owns(22), owns(21), owns(20), length, currentTricks, jitter);
        case 'pagatUltimo':
        case 'pagatUhu': return targetRoll(owns(1), length, declaration.endsWith('Uhu'), jitter);
        case 'sasUltimo':
        case 'sasUhu': return targetRoll(owns(2), length, declaration.endsWith('Uhu'), jitter);
        case 'kingUltimo':
        case 'kingUhu': return clamp(0.25 + length * 0.025 + jitter * 0.08);
        case 'doubleGame': return clamp(0.18 + length * 0.035 + ownHonourControl(state, observerId) * 0.25 + jitter * 0.06);
        case 'tuletroa': return clamp(0.35 + length * 0.025 + (owns(22) ? 0.15 : 0) + jitter * 0.04);
        case 'fourKings': return clamp(0.3 + length * 0.02 + jitter * 0.04);
        case 'tarokk8': return ownTarokkCount(state, observerId) >= 8 ? 1 : 0;
        case 'tarokk9': return ownTarokkCount(state, observerId) >= 9 ? 1 : 0;
        default: return 0.25;
    }
}
function supportsPair(state, observerId, partnerId, world, type) {
    const ranks = type === 'centrum' ? [20, 21] : type === 'kismadar' ? [21] : [22];
    const side = new Set([observerId, ...(partnerId ? [partnerId] : [])]);
    return ranks.every(r => side.has(world.ownership[r]) || ownTarokk(state, observerId, r));
}
function figureRoll(primary, secondary, tertiary, length, tricks, jitter, base) {
    let s = base + (primary ? 0.22 : -0.08) + (secondary ? 0.12 : 0) + (tertiary ? 0.05 : 0);
    s += Math.min(0.18, Math.max(0, length - 4) * 0.035);
    s -= Math.min(0.12, tricks * 0.01);
    return clamp(s + jitter * 0.08);
}
function catchRoll(hasSkiz, enemyXXI, length, jitter) {
    if (!hasSkiz)
        return 0.04;
    if (!enemyXXI)
        return clamp(0.12 + length * 0.015 + jitter * 0.04);
    return clamp(0.55 + Math.min(0.25, Math.max(0, length - 4) * 0.035) + jitter * 0.06);
}
function volatRoll(skiz, xxi, xx, length, tricks, jitter) {
    return clamp(0.01 + Math.min(0.5, Math.max(0, length - 5) * 0.06) + (skiz ? 0.14 : 0) + (xxi ? 0.08 : 0) + (xx ? 0.05 : 0) - tricks * 0.02 + jitter * 0.05);
}
function targetRoll(hasTarget, length, uhu, jitter) {
    return clamp((hasTarget ? 0.55 : 0.08) + Math.min(0.24, Math.max(0, length - 4) * 0.035) + (uhu ? 0.08 : 0) + jitter * 0.06);
}
function countSideTarokks(world, side) {
    return Object.values(world.ownership).filter(o => side.has(o)).length;
}
function ownTarokkCount(state, id) { return state.players.find(p => p.id === id)?.hand.filter(c => c.kind === 'tarokk').length ?? 0; }
function ownTarokk(state, id, rank) { return !!state.players.find(p => p.id === id)?.hand.some(c => c.kind === 'tarokk' && c.rank === rank); }
function ownHonourControl(state, id) { return state.players.find(p => p.id === id)?.hand.filter(c => c.kind === 'tarokk' && [1, 21, 22].includes(c.rank)).length ?? 0; }
function deterministicJitter(i, type) { const x = Math.sin((i + 1) * 12.9898 + type.length * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
function clamp(x) { return Math.max(0, Math.min(1, x)); }
/**
 * Shallow strategic rollout for a concrete legal play.
 *
 * The real player sees only public information. The rollout samples the
 * information-safe hidden-hand hypothesis beam and keeps the sampled worlds
 * entirely inside this function. Each candidate card is evaluated against the
 * same hidden worlds, which makes the comparison much less noisy than drawing
 * a fresh random deal for every candidate.
 */
export function evaluateCardContinuation(state, observerId, hypotheses, candidate, horizon = 2, sampleLimit = 48, targetOverride, strategySelector) {
    const observer = state.players.find(p => p.id === observerId);
    if (!observer || !observer.hand.some(c => c.id === candidate.id)) {
        throw new Error('A rollout-jelölt lapnak az AI kezében kell lennie.');
    }
    const legal = state.trick?.cards.length !== undefined
        ? legalForContinuation(state, observerId)
        : [];
    if (!legal.some(c => c.id === candidate.id)) {
        throw new Error('A rollout-jelölt lapnak szabályosan kijátszhatónak kell lennie.');
    }
    if (!hypotheses.hypotheses.length) {
        return { cardId: candidate.id, samples: 0, horizon, expectedValue: 0, sideWinRate: 0, partnerWinRate: 0, targetSuccessRate: 0, confidence: 0, expectedSettlementForTakerPair: 0, expectedSettlementForObserverSide: 0, reasons: ['Nincs lehetséges rejtett világ a folytatás szimulációjához.'] };
    }
    // Use the entire belief beam through deterministic stratified quantiles.
    // Every candidate sees the same sampled world set, while lower-probability
    // worlds are no longer silently discarded just because they rank below the
    // interactive rollout budget.
    const worldSeed = rolloutSeed(state, observerId);
    const sampledWorlds = selectBeliefWorlds(hypotheses.hypotheses, sampleLimit, worldSeed);
    const partnerId = hypotheses.partnerId;
    const target = targetOverride ?? activeRolloutTarget(state);
    let weightSum = 0;
    let valueSum = 0;
    let sideWins = 0;
    let partnerWins = 0;
    let targetSuccess = 0;
    let settlementForTakerPair = 0;
    let settlementForObserverSide = 0;
    let successfulWorlds = 0;
    let simulatedWorlds = 0;
    for (let i = 0; i < sampledWorlds.length; i++) {
        const sampled = sampledWorlds[i];
        const world = sampled.world;
        const assignment = completeHiddenWorld(state, observerId, world, 9187 + sampled.sourceIndex * 7919);
        if (!assignment)
            continue;
        const simulated = simulateCardContinuation(state, observerId, partnerId, assignment, candidate, target, horizon, strategySelector);
        const w = Math.max(0.000001, sampled.weight);
        weightSum += w;
        valueSum += w * simulated.value;
        sideWins += w * (simulated.sideWin ? 1 : 0);
        partnerWins += w * (simulated.partnerWin ? 1 : 0);
        targetSuccess += w * (simulated.targetSuccess ? 1 : 0);
        if (simulated.settlementNetForTakerPair !== undefined)
            settlementForTakerPair += w * simulated.settlementNetForTakerPair;
        if (simulated.settlementForObserverSide !== undefined)
            settlementForObserverSide += w * simulated.settlementForObserverSide;
        successfulWorlds += simulated.sideWin ? 1 : 0;
        simulatedWorlds++;
    }
    if (!weightSum) {
        return { cardId: candidate.id, samples: 0, horizon, expectedValue: 0, sideWinRate: 0, partnerWinRate: 0, targetSuccessRate: 0, confidence: 0, expectedSettlementForTakerPair: 0, expectedSettlementForObserverSide: 0, reasons: ['A rejtett világokból nem sikerült konzisztens osztást felépíteni.'] };
    }
    const expectedValue = valueSum / weightSum;
    const sideWinRate = sideWins / weightSum;
    const partnerWinRate = partnerWins / weightSum;
    const targetSuccessRate = target ? targetSuccess / weightSum : 0;
    const confidence = clamp(0.25 + Math.min(0.45, simulatedWorlds / 64) + Math.min(0.3, horizon / 6));
    const reasons = [];
    if (target && targetSuccessRate >= 0.65)
        reasons.push(`A folytatási szimuláció szerint ez a vonal erősen támogatja a(z) ${target.name} célütését.`);
    if (partnerWinRate >= 0.55 && partnerWinRate > sideWinRate * 0.65)
        reasons.push('A valószínű partneri képekben gyakran kontrollt ad a partnernek a következő ütéshez.');
    if (sideWinRate >= 0.65)
        reasons.push('A szimuláció szerint a saját pár gyakran megőrzi az ütés feletti kontrollt a következő két ütésben.');
    if (expectedValue <= -1.0)
        reasons.push('A szimulált folytatás átlagosan elveszíti a páros kontrollját vagy túl drága erőforrást használ.');
    if (!reasons.length)
        reasons.push('A szimulált folytatás nem mutat erős stratégiai eltérést a semleges vonalhoz képest.');
    return {
        cardId: candidate.id,
        samples: simulatedWorlds,
        horizon,
        expectedValue,
        sideWinRate,
        partnerWinRate,
        targetSuccessRate,
        confidence,
        expectedSettlementForTakerPair: settlementForTakerPair / weightSum,
        expectedSettlementForObserverSide: settlementForObserverSide / weightSum,
        reasons,
    };
}
function rolloutSeed(state, observerId) {
    let hash = 2166136261 >>> 0;
    const ids = state.players.map(p => p.id).concat([observerId, state.completedTricks.length.toString(), state.nextPlayerIndex.toString()]);
    for (const id of ids) {
        for (let i = 0; i < id.length; i += 1) {
            hash ^= id.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
    }
    return hash >>> 0;
}
function legalForContinuation(state, observerId) {
    if (state.phase !== 'play')
        return [];
    const player = state.players.find(p => p.id === observerId);
    const trick = state.trick;
    if (!player || !trick)
        return [];
    if (!trick.cards.length)
        return [...player.hand];
    const lead = trick.cards[0].card;
    if (isTarokk(lead)) {
        const tarokks = player.hand.filter(isTarokk);
        return tarokks.length ? tarokks : [...player.hand];
    }
    const suited = player.hand.filter(c => c.kind === 'suit' && lead.kind === 'suit' && c.suit === lead.suit);
    if (suited.length)
        return suited;
    const tarokks = player.hand.filter(isTarokk);
    return tarokks.length ? tarokks : [...player.hand];
}
function activeRolloutTarget(state) {
    const active = state.declarations.declarations.find(d => d.status !== 'failed' && d.status !== 'fulfilled' && d.targetCardId);
    if (!active?.targetCardId)
        return undefined;
    const deadline = deadlineForSimulation(active.type);
    if (deadline === undefined)
        return undefined;
    return { name: active.type, cardId: active.targetCardId, deadline };
}
function simulateCardContinuation(state, observerId, partnerId, hidden, candidate, target, horizon, strategySelector) {
    const activePlayers = state.players.filter(p => p.active);
    const ids = activePlayers.map(p => p.id);
    const hands = {};
    for (const p of activePlayers)
        hands[p.id] = p.id === observerId ? [...p.hand.filter(c => c.id !== candidate.id)] : [...(hidden[p.id] ?? [])];
    const side = (id) => id === observerId || id === partnerId;
    let trickCards = state.trick?.cards.map(x => ({ playerId: x.player, card: x.card })) ?? [];
    let lead = trickCards[0]?.card ?? null;
    let leader = state.trick?.leader ?? state.startingPlayerId ?? ids[0];
    let currentIndex = ids.indexOf(state.players[state.nextPlayerIndex]?.id ?? observerId);
    if (currentIndex < 0)
        currentIndex = ids.indexOf(observerId);
    trickCards.push({ playerId: observerId, card: candidate });
    if (!lead)
        lead = candidate;
    let value = 0;
    let horizonTricks = 0;
    let sideWin = false;
    let partnerWin = false;
    let targetSuccess = false;
    const simulatedTricks = [];
    const finishTrick = () => {
        const winner = determineWinner(trickCards, lead);
        const points = trickCards.reduce((s, x) => s + x.card.points, 0);
        const wonBySide = side(winner);
        value += wonBySide ? points * 0.72 + 1.9 : -points * 0.48 - 1.0;
        sideWin = wonBySide;
        partnerWin = winner === partnerId;
        if (target && horizonTricks + state.completedTricks.length + 1 === target.deadline) {
            targetSuccess = wonBySide && trickCards.some(x => x.card.id === target.cardId && x.playerId === winner);
            value += targetSuccess ? 9.5 : -9.5;
        }
        simulatedTricks.push({ cards: trickCards.map(x => ({ player: x.playerId, card: x.card })), winner });
        return winner;
    };
    // The candidate may be the last card of the current trick. Otherwise let the
    // remaining players complete this same trick before looking ahead.
    const alreadyBeforeCandidate = trickCards.length - 1;
    const remainingPlayers = clockwiseFrom(ids, observerId).filter(pid => trickCards.length < ids.length && !trickCards.some(x => x.playerId === pid));
    for (const pid of remainingPlayers) {
        if (trickCards.length >= ids.length)
            break;
        const legal = rolloutLegal(hands[pid] ?? [], trickCards, target?.cardId, state.completedTricks.length + horizonTricks + 1, target?.deadline);
        if (!legal.length)
            return { value: -12, sideWin: false, partnerWin: false, targetSuccess: false, settlementNetForTakerPair: undefined, settlementForObserverSide: undefined };
        const card = chooseSimulatedCard(state, hands, trickCards, lead, legal, pid, observerId, partnerId, state.completedTricks.length + horizonTricks + 1, target, strategySelector);
        hands[pid].splice(hands[pid].findIndex(c => c.id === card.id), 1);
        trickCards.push({ playerId: pid, card });
        if (!lead)
            lead = card;
    }
    if (trickCards.length < ids.length)
        return { value: -12, sideWin: false, partnerWin: false, targetSuccess: false, settlementNetForTakerPair: undefined, settlementForObserverSide: undefined };
    let winner = finishTrick();
    horizonTricks++;
    leader = winner;
    while (horizonTricks < horizon && hands[observerId].length > 0) {
        trickCards = [];
        lead = null;
        const order = clockwiseFrom(ids, leader);
        for (const pid of order) {
            const legal = rolloutLegal(hands[pid] ?? [], trickCards, target?.cardId, state.completedTricks.length + horizonTricks + 1, target?.deadline);
            if (!legal.length)
                return { value: value - 10, sideWin, partnerWin, targetSuccess, settlementNetForTakerPair: undefined, settlementForObserverSide: undefined };
            const card = chooseRolloutCard(legal, trickCards, lead, {
                declaration: target?.name ?? 'doubleGame',
                playerId: pid,
                observerId,
                hands,
                trickNumber: state.completedTricks.length + horizonTricks + 1,
                ...(partnerId !== undefined ? { partnerId } : {}),
                declaringSide: new Set([observerId, ...(partnerId ? [partnerId] : [])]),
                ...(target ? { targetDeadline: target.deadline, target: target.cardId, deadline: target.deadline } : {}),
            });
            hands[pid].splice(hands[pid].findIndex(c => c.id === card.id), 1);
            trickCards.push({ playerId: pid, card });
            if (!lead)
                lead = card;
        }
        if (trickCards.length < ids.length)
            break;
        winner = finishTrick();
        horizonTricks++;
        leader = winner;
    }
    // Retaining strong tarokks has real option value even when the next two
    // tricks do not cash them immediately. Only the sampled world is inspected.
    const ownControl = [...(hands[observerId] ?? []), ...(partnerId ? hands[partnerId] ?? [] : [])]
        .filter(c => c.kind === 'tarokk' && c.rank >= 17).length;
    value += ownControl * 0.18;
    // Deal-level valuation: once all nine tricks are simulated, reuse the exact
    // authoritative settlement rules so a candidate is priced in actual game points.
    let settlementNetForTakerPair;
    let settlementForObserverSide;
    const totalSimulatedTricks = state.completedTricks.length + simulatedTricks.length;
    const takerId = state.takerId;
    const contract = state.contract;
    if (totalSimulatedTricks >= 9 && contract && takerId) {
        const allTricks = state.completedTricks.map(t => ({
            cards: t.cards.map(x => ({ player: x.player, card: x.card })),
            winner: t.winner,
        })).concat(simulatedTricks);
        const sideOf = (id) => pairOf(id, takerId, state.partnerId);
        const skarts = skartPointsBySide(state.skartsByPlayer, takerId);
        const progress = {
            declarations: state.declarations.declarations.map(d => ({ ...d })),
            locks: state.declarations.locks.map(l => ({ ...l })),
            events: [...state.declarations.events],
            silentFigures: [...state.declarations.silentFigures],
        };
        for (const d of progress.declarations) {
            if (d.status === 'failed' || d.status === 'fulfilled')
                continue;
            const status = evaluateDeclaration(d, {
                tricks: allTricks,
                sideOf,
                skartPointsBySide: { taker: skarts.taker, defence: skarts.defence },
            });
            if (status)
                d.status = status;
        }
        const takerTrickPoints = allTricks
            .filter(t => sideOf(t.winner) === 'taker')
            .reduce((sum, t) => sum + t.cards.reduce((n, x) => n + x.card.points, 0), 0);
        const takerPairPoints = takerTrickPoints + skarts.taker;
        const takerPairVolat = allTricks.length === 9 && allTricks.every(t => sideOf(t.winner) === 'taker');
        const defencePairVolat = allTricks.length === 9 && allTricks.every(t => sideOf(t.winner) === 'defence');
        const settlement = calculateSettlement({
            contract,
            takerPairWon: takerPairPoints >= 48,
            takerTrickPoints,
            takerSkartPoints: skarts.taker,
            defenceSkartPoints: skarts.defence,
            takerPairVolat,
            defencePairVolat,
            gameContra: state.gameContraState?.level ?? state.gameContra ?? 'none',
            figures: figureSettlementsFromProgress(progress, takerId, state.partnerId),
        });
        settlementNetForTakerPair = settlement.netForTakerPair;
        const observerSide = pairOf(observerId, takerId, state.partnerId);
        settlementForObserverSide = observerSide === 'taker'
            ? settlement.netForTakerPair
            : observerSide === 'defence'
                ? -settlement.netForTakerPair
                : 0;
    }
    return { value, sideWin, partnerWin, targetSuccess, settlementNetForTakerPair, settlementForObserverSide };
}
function clockwiseFrom(ids, start) {
    const i = ids.indexOf(start);
    if (i < 0)
        return [...ids];
    return ids.slice(i).concat(ids.slice(0, i));
}
/** Information-safe forward simulation over complete plausible hidden hands. */
export function fullRolloutDeclaration(state, observerId, hypotheses, declaration, samples = 256, strategySelector) {
    if (!hypotheses.hypotheses.length)
        return { declaration, samples: 0, successProbability: 0, simulatedTricks: 0, confidence: 0, failureModes: ['Nincs lehetséges rejtett világ.'] };
    let success = 0, simulated = 0;
    const failures = new Map();
    const worlds = hypotheses.hypotheses;
    const actualSamples = Math.max(32, samples);
    for (let i = 0; i < actualSamples; i++) {
        const world = worlds[i % worlds.length];
        const assignment = completeHiddenWorld(state, observerId, world, i * 7919 + declaration.length * 104729);
        if (!assignment)
            continue;
        const explicitTarget = state.declarations.declarations.find(d => d.type === declaration &&
            d.status !== 'failed' &&
            d.status !== 'fulfilled')?.targetCardId;
        const result = simulateRemainingTricks(state, observerId, hypotheses.partnerId, assignment, declaration, explicitTarget, strategySelector);
        simulated += result.tricks;
        if (result.success)
            success += world.weight;
        else
            failures.set(result.failureMode, (failures.get(result.failureMode) ?? 0) + world.weight);
    }
    const denominator = worlds.reduce((s, w) => s + w.weight, 0) || 1;
    const probability = clamp(success / denominator);
    const failureModes = [...failures.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k);
    const confidence = clamp(0.25 + Math.min(0.5, worlds.length / 128) + Math.min(0.25, actualSamples / 2000));
    return { declaration, samples: actualSamples, successProbability: probability, simulatedTricks: simulated, confidence, failureModes };
}
function completeHiddenWorld(state, observerId, world, seed) {
    const active = state.players.filter(p => p.active);
    const hidden = active.filter(p => p.id !== observerId);
    const observer = state.players.find(p => p.id === observerId);
    if (!observer)
        return undefined;
    const publicIds = new Set([
        ...observer.hand.map(c => c.id),
        ...state.completedTricks.flatMap(t => t.cards.map(x => x.card.id)),
        ...(state.trick?.cards.map(x => x.card.id) ?? []),
    ]);
    const remaining = createDeck().filter(c => !publicIds.has(c.id));
    const hands = {};
    hidden.forEach(p => hands[p.id] = []);
    const reserved = new Set();
    const rankToCard = new Map();
    for (const c of remaining)
        if (isTarokk(c))
            rankToCard.set(c.rank, c);
    for (const [rankText, owner] of Object.entries(world.ownership)) {
        if (!owner || owner === 'unknown')
            continue;
        const card = rankToCard.get(Number(rankText));
        if (!card || !hands[owner])
            return undefined;
        hands[owner].push(card);
        reserved.add(card.id);
    }
    const capacity = new Map();
    for (const p of hidden) {
        const assigned = hands[p.id];
        if (!assigned)
            return undefined;
        capacity.set(p.id, p.hand.length - assigned.length);
    }
    if ([...capacity.values()].some(n => n < 0))
        return undefined;
    const pool = remaining.filter(c => !reserved.has(c.id));
    shuffleDeterministic(pool, seed);
    for (const p of hidden) {
        const cap = capacity.get(p.id);
        for (let n = 0; n < cap; n++) {
            const candidates = pool.filter(c => {
                if (!isTarokk(c))
                    return true;
                const owner = world.ownership[c.rank];
                return !owner || owner === 'unknown' || owner === p.id;
            });
            if (!candidates.length)
                return undefined;
            const card = candidates[seededIndex(seed + n * 37 + p.id.length * 11, candidates.length)];
            const targetHand = hands[p.id];
            if (!targetHand)
                return undefined;
            targetHand.push(card);
            pool.splice(pool.indexOf(card), 1);
        }
    }
    return hands;
}
function simulateRemainingTricks(state, observerId, partnerId, hidden, declaration, explicitTargetCardId, strategySelector) {
    const hands = {};
    for (const p of state.players.filter(p => p.active))
        hands[p.id] = p.id === observerId ? [...p.hand] : [...(hidden[p.id] ?? [])];
    let trickCards = state.trick?.cards.map(x => ({ playerId: x.player, card: x.card })) ?? [];
    let leader = state.trick?.leader ?? state.startingPlayerId ?? state.players.find(p => p.active).id;
    let lead = trickCards[0]?.card ?? null;
    let tricks = state.completedTricks.length;
    const own = (id) => id === observerId || id === partnerId;
    const target = explicitTargetCardId ?? targetForSimulation(declaration), deadline = deadlineForSimulation(declaration);
    let targetWon = false, ownAll = true;
    const wonCardIds = new Set();
    let ownTrickPoints = 0;
    while (tricks < 9) {
        const ids = state.players.filter(p => p.active).map(p => p.id);
        const start = ids.indexOf(leader);
        if (start < 0)
            break;
        const order = ids.slice(start).concat(ids.slice(0, start));
        const already = trickCards.length;
        for (const pid of order.slice(already)) {
            const legal = rolloutLegal(hands[pid] ?? [], trickCards, target, tricks + 1, deadline);
            if (!legal.length)
                return { success: false, tricks, failureMode: 'Szabályos rollout-lépés nem állítható elő.' };
            const card = chooseSimulatedCard(state, hands, trickCards, lead, legal, pid, observerId, partnerId, tricks + 1, target ? { name: declaration, cardId: target, deadline: deadline } : undefined, strategySelector);
            const index = hands[pid].findIndex(c => c.id === card.id);
            hands[pid].splice(index, 1);
            trickCards.push({ playerId: pid, card });
            if (!lead)
                lead = card;
        }
        const winner = determineWinner(trickCards, lead);
        tricks++;
        if (!own(winner))
            ownAll = false;
        const winnerOwns = own(winner);
        if (winnerOwns) {
            for (const won of trickCards)
                wonCardIds.add(won.card.id);
            ownTrickPoints += trickCards.reduce((sum, x) => sum + x.card.points, 0);
        }
        if (target && tricks === deadline)
            targetWon = winnerOwns && trickCards.some(x => x.playerId === winner && x.card.id === target);
        if (tricks >= 9)
            break;
        leader = winner;
        trickCards = [];
        lead = null;
    }
    let success = true, failureMode = '';
    if (declaration === 'volat') {
        success = ownAll && tricks === 9;
        failureMode = 'A saját pár nem vitte el mind a kilenc ütést.';
    }
    else if (['centrum', 'kismadar', 'nagymadar', 'pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu', 'kingUltimo', 'kingUhu'].includes(declaration)) {
        success = targetWon;
        failureMode = `A ${target ?? 'cél'} nem teljesült a határütésben.`;
    }
    else if (declaration === 'tuletroa') {
        success = ['T20', 'T21', 'T22'].every(id => wonCardIds.has(id));
        failureMode = 'A Tulétroához szükséges három nagy tarokkot nem vitte el a saját pár.';
    }
    else if (declaration === 'fourKings') {
        success = ['hearts-K', 'diamonds-K', 'spades-K', 'clubs-K'].every(id => wonCardIds.has(id));
        failureMode = 'A Négykirályhoz szükséges valamelyik király elmaradt.';
    }
    else {
        success = true;
        failureMode = '';
    }
    return { success, tricks, failureMode };
}
function rolloutLegal(hand, trick, target, trickNumber = 1, deadline) {
    if (!trick.length)
        return filterTarget(hand, target, trickNumber, deadline);
    const lead = trick[0].card;
    let legal;
    if (isTarokk(lead)) {
        const tarokks = hand.filter(isTarokk);
        legal = tarokks.length ? tarokks : [...hand];
    }
    else {
        const suited = hand.filter(c => c.kind === 'suit' && lead.kind === 'suit' && c.suit === lead.suit);
        legal = suited.length ? suited : hand.filter(isTarokk);
        if (!legal.length)
            legal = [...hand];
    }
    return filterTarget(legal, target, trickNumber, deadline);
}
function filterTarget(cards, target, trickNumber = 1, deadline) { if (!target || !deadline || trickNumber >= deadline)
    return cards; const non = cards.filter(c => c.id !== target); return non.length ? non : cards; }
function chooseSimulatedCard(baseState, hands, trickCards, lead, legal, playerId, observerId, partnerId, trickNumber, target, strategySelector) {
    if (strategySelector) {
        const simulatedState = buildSimulationState(baseState, hands, trickCards, playerId);
        try {
            const selected = strategySelector(simulatedState, playerId, legal, { observerId, ...(partnerId !== undefined ? { partnerId } : {}), target, trickNumber });
            if (selected && legal.some(c => c.id === selected.id))
                return selected;
        }
        catch {
            // Fall back to the bounded rollout policy if the full strategic evaluator
            // cannot score a synthetic state consistently.
        }
    }
    return chooseRolloutCard(legal, trickCards, lead, {
        declaration: target?.name ?? 'doubleGame',
        playerId,
        observerId,
        hands,
        trickNumber,
        ...(partnerId !== undefined ? { partnerId } : {}),
        declaringSide: new Set([observerId, ...(partnerId ? [partnerId] : [])]),
        ...(target ? { targetDeadline: target.deadline, target: target.cardId, deadline: target.deadline } : {}),
    });
}
function buildSimulationState(baseState, hands, trickCards, playerId) {
    const players = baseState.players.map(p => ({ ...p, hand: [...(hands[p.id] ?? p.hand ?? [])] }));
    const trickLeader = trickCards[0]?.playerId ?? baseState.trick?.leader ?? baseState.startingPlayerId ?? players[0]?.id;
    if (!trickLeader)
        throw new Error('A rollout-szimulációhoz nincs elérhető játékos.');
    return {
        ...baseState,
        players,
        trick: {
            ...(baseState.trick ?? {}),
            leader: trickLeader,
            cards: trickCards.map(x => ({ player: x.playerId, card: x.card })),
        },
        nextPlayerIndex: Math.max(0, players.findIndex(p => p.id === playerId)),
        completedTricks: [...baseState.completedTricks],
    };
}
function chooseRolloutCard(cards, trick, lead, ctx) {
    const scored = cards.map(card => {
        const candidateCards = trick.length ? [...trick, { playerId: '__candidate__', card }] : [{ playerId: '__candidate__', card }];
        const candidateWinner = determineWinner(candidateCards, lead ?? card);
        const wins = candidateWinner === '__candidate__';
        const currentWinner = trick.length ? determineWinner(trick, lead) : undefined;
        const partnerWinning = currentWinner !== undefined && ctx.partnerId !== undefined && currentWinner === ctx.partnerId;
        let figurePreservation = 0;
        if (ctx.target && card.id === ctx.target && ctx.deadline !== undefined && ctx.trickNumber < ctx.deadline) {
            figurePreservation -= 7;
        }
        if (ctx.target && card.id === ctx.target && ctx.deadline !== undefined && ctx.trickNumber === ctx.deadline && wins) {
            figurePreservation += 12;
        }
        if (ctx.target && card.id === ctx.target && ctx.deadline !== undefined && ctx.trickNumber === ctx.deadline && !wins) {
            figurePreservation -= 12;
        }
        const immediateTrickValue = !trick.length
            ? -card.points * 0.5
            : wins
                ? 8 - card.points * 0.35
                : -card.points * 0.8;
        const partnerSupport = partnerWinning && !wins ? 5 : 0;
        const opponentPressure = wins && !partnerWinning ? 2.5 : 0;
        const partnerCoordination = rolloutPartnerCoordinationValue(candidateWinner, card, ctx, trick.length + 1 >= 4);
        const figureFuture = rolloutFigureFutureValue(trick, candidateWinner, card, ctx, wins);
        const futureControl = card.kind === 'tarokk'
            ? (card.rank >= 19 ? -1.5 : 0.7)
            : (wins ? 0.4 : 0);
        const communicationValue = card.kind === 'tarokk' && card.rank >= 17 ? 0.15 : 0;
        const riskPenalty = wins && card.points >= 5 ? 0.3 : 0;
        const evaluation = evaluatePlayDecision({
            immediateTrickValue,
            figurePreservation,
            partnerSupport,
            opponentPressure,
            futureControl,
            communicationValue: communicationValue + partnerCoordination.communicationValue,
            riskPenalty: riskPenalty + figureFuture.riskPenalty + partnerCoordination.riskPenalty,
        });
        // Preserve the rollout's deliberately imperfect nature. A deterministic
        // tie-break still prefers cheap cards, but the common evaluator is now the
        // primary strategic ranking layer used by real play as well.
        const score = evaluation.score + figureFuture.value - card.points * 0.04 - cardStrength(card) * 0.0005;
        return { card, score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].card;
}
/**
 * Partner coordination inside a sampled hidden world. Unlike public-play
 * beliefs, this helper may inspect the sampled partner hand because it is
 * running inside the information-safe rollout. The sampled hand is not
 * exposed to the real-play decision layer.
 *
 * The key rule is target ownership: if the partner is the hypothetical owner
 * of the bird's target, preserving partner control before the deadline is
 * materially better than merely winning the trick ourselves. If the observer
 * owns the target, the preference reverses.
 */
export function rolloutPartnerCoordinationValue(candidateWinner, candidate, ctx, closesTrick) {
    if (!ctx.partnerId || !ctx.target || !ctx.targetDeadline)
        return { communicationValue: 0, riskPenalty: 0 };
    const beforeDeadline = ctx.trickNumber < ctx.targetDeadline;
    const partnerHand = ctx.hands[ctx.partnerId] ?? [];
    const ownHand = ctx.hands[ctx.playerId] ?? [];
    const partnerHasTarget = partnerHand.some(c => c.id === ctx.target);
    const ownHasTarget = ownHand.some(c => c.id === ctx.target);
    const partnerHigh = partnerHand.filter(c => c.kind === 'tarokk' && c.rank >= 17).length;
    const partnerBigHonours = partnerHand.filter(c => c.kind === 'tarokk' && [20, 21, 22].includes(c.rank)).length;
    const partnerWins = candidateWinner === ctx.partnerId;
    let communicationValue = 0;
    let riskPenalty = 0;
    if (beforeDeadline && closesTrick) {
        if (partnerHasTarget && partnerWins)
            communicationValue += 1.6;
        if (partnerHasTarget && !partnerWins)
            communicationValue -= 1.4;
        // A partner with several high tarokks is a plausible future control
        // holder. Letting that partner take an early trick can be better than
        // spending our own control, but keep the bonus deliberately modest.
        if (partnerWins && partnerHigh >= 2)
            communicationValue += 0.45;
        if (partnerWins && partnerBigHonours >= 1)
            communicationValue += 0.25;
        // Winning the trick is not automatically useful: the winner becomes the
        // next leader. Prefer a partner win when that partner has a meaningful
        // lead portfolio for the remaining figure, and reduce the hand-off value
        // when the partner's likely leads would consume the target or leave very
        // little control. This is deliberately a heuristic, not a hidden-hand
        // certainty rule; it only inspects the sampled rollout world.
        if (partnerWins) {
            const lead = assessPartnerNextLead(partnerHand, ctx.target, ctx.targetDeadline, ctx.trickNumber);
            communicationValue += lead.value * 0.35;
            riskPenalty += lead.risk * 0.35;
            // A partner lead is only useful if it is not immediately exposed to a
            // cheap opponent takeover. The rollout may inspect the sampled hidden
            // hands here, but this remains strictly inside the hypothetical world.
            const response = assessOpponentResponseToPartnerLead(partnerHand, ctx.hands, ctx.playerId, ctx.partnerId, ctx.target, ctx.targetDeadline);
            communicationValue += response.value * 0.3;
            riskPenalty += response.risk * 0.45;
        }
    }
    // If the observer owns the target, handing an early trick to the partner
    // is still useful only when it does not consume the observer's target.
    if (beforeDeadline && partnerWins && ownHasTarget) {
        if (candidate.id !== ctx.target)
            communicationValue += 0.2;
        else
            riskPenalty += 0.8;
    }
    // On the target trick, ownership of the target matters more than generic
    // partner support. The normal figure evaluator supplies the larger success
    // reward; this layer only coordinates who should control the trick.
    if (ctx.trickNumber === ctx.targetDeadline && candidate.id === ctx.target) {
        if (partnerHasTarget && partnerWins)
            communicationValue += 1.2;
        if (ownHasTarget && candidateWinner === ctx.playerId)
            communicationValue += 1.0;
        if (partnerHasTarget && !partnerWins)
            riskPenalty += 1.0;
    }
    return {
        communicationValue: Math.max(-2, Math.min(2, communicationValue)),
        riskPenalty: Math.max(0, Math.min(2, riskPenalty)),
    };
}
/**
 * Estimates whether the partner's next lead is likely to hand control straight
 * back to the opponents. This is deliberately a sampled-world calculation:
 * the real-play layer never sees these opponent hands.
 *
 * A lead that can be cheaply overcalled by an opponent is less attractive
 * before a bird deadline, especially when that overcall would threaten the
 * declaring side's prefix. Conversely, a lead that forces opponents to spend
 * a high tarokk or an expensive control card is strategically useful.
 */
function assessOpponentResponseToPartnerLead(partnerHand, hands, observerId, partnerId, target, deadline) {
    const opponents = Object.entries(hands)
        .filter(([id]) => id !== observerId && id !== partnerId)
        .map(([, hand]) => hand);
    if (!opponents.length)
        return { value: 0, risk: 0 };
    const leads = partnerHand.filter(c => c.id !== target);
    if (!leads.length)
        return { value: -0.5, risk: 1.2 };
    let bestValue = -Infinity;
    let bestRisk = Infinity;
    for (const lead of leads) {
        // Only count replies that are actually legal under the follow-suit rule.
        // A tarokk is NOT an automatic answer to a suit lead when the opponent
        // still holds a card of the led suit.
        const cheapReplies = opponents.reduce((sum, hand) => sum + countLegalCheapWinningReplies(hand, lead), 0);
        const allReplies = opponents.reduce((sum, hand) => sum + countLegalWinningReplies(hand, lead), 0);
        const expensiveReplies = opponents.reduce((sum, hand) => sum + countLegalExpensiveWinningReplies(hand, lead), 0);
        const remainingCriticalTricks = Math.max(0, deadline - 1);
        const targetSafe = partnerHand.some(c => c.id === target);
        let value = 0;
        let risk = 0;
        if (cheapReplies === 0)
            value += 1.1;
        else if (cheapReplies === 1)
            value += 0.15;
        else
            value -= Math.min(1.2, cheapReplies * 0.32);
        // A suit lead can be particularly useful when opponents are forced to
        // follow suit and therefore cannot spend a tarokk. Conversely, a tarokk
        // lead deliberately opens the tarokk control race.
        if (lead.kind === 'suit') {
            const opponentsWithSuit = opponents.filter(hand => hand.some(c => c.kind === 'suit' && c.suit === lead.suit)).length;
            value += Math.min(0.55, opponentsWithSuit * 0.12);
        }
        else if (lead.kind === 'tarokk') {
            value -= 0.12;
            if (expensiveReplies > 0)
                value += Math.min(0.45, expensiveReplies * 0.12);
        }
        // If opponents can only answer with expensive/high control cards, their
        // reply is less damaging and can even help exhaust their controls.
        value += Math.min(0.9, expensiveReplies * 0.22);
        if (allReplies > 0)
            risk += Math.min(1.2, allReplies * 0.28);
        // The closer we are to the figure deadline, the more dangerous a cheap
        // opponent takeover becomes.
        if (remainingCriticalTricks <= 2)
            risk += cheapReplies * 0.18;
        if (targetSafe)
            value += 0.12;
        // Leading a high tarokk is itself a control expenditure. Penalise it a
        // little unless the opponents are forced to answer expensively.
        if (lead.kind === 'tarokk' && lead.rank >= 20 && expensiveReplies === 0) {
            risk += 0.35;
            value -= 0.25;
        }
        if (value - risk * 0.7 > bestValue) {
            bestValue = value - risk * 0.7;
            bestRisk = risk;
        }
    }
    return {
        value: Math.max(-1.5, Math.min(1.5, bestValue)),
        risk: Math.max(0, Math.min(2, bestRisk)),
    };
}
export function legalRepliesForLeadForTest(hand, lead) {
    return legalRepliesForLead(hand, lead);
}
function legalRepliesForLead(hand, lead) {
    if (isTarokk(lead))
        return hand.filter(isTarokk);
    if (lead.kind === 'suit') {
        const suited = hand.filter(c => c.kind === 'suit' && c.suit === lead.suit);
        return suited.length ? suited : hand.filter(isTarokk);
    }
    return [...hand];
}
function countLegalWinningReplies(hand, lead) {
    return legalRepliesForLead(hand, lead).filter(c => canBeatLead(c, lead)).length;
}
function countLegalCheapWinningReplies(hand, lead) {
    return legalRepliesForLead(hand, lead).filter(c => canBeatLead(c, lead) && cardControlCost(c) <= 1.5).length;
}
function countLegalExpensiveWinningReplies(hand, lead) {
    return legalRepliesForLead(hand, lead).filter(c => canBeatLead(c, lead) && cardControlCost(c) >= 4).length;
}
function canBeatLead(card, lead) {
    if (isTarokk(card)) {
        if (!isTarokk(lead))
            return true;
        return card.rank > lead.rank;
    }
    if (isTarokk(lead))
        return false;
    if (card.kind !== 'suit' || lead.kind !== 'suit')
        return false;
    if (card.suit !== lead.suit)
        return false;
    const value = (rank) => ({ K: 5, Q: 4, C: 3, J: 2, '10': 1, A: 1 }[rank] ?? 0);
    return value(card.rank) > value(lead.rank);
}
function cardControlCost(card) {
    if (card.kind !== 'tarokk')
        return card.points >= 5 ? 1.5 : 0.5;
    if (card.rank >= 20)
        return 5;
    if (card.rank >= 17)
        return 3;
    return 1;
}
/**
 * Estimates the quality of the next lead created by a partner winning an
 * early prefix trick. A good hand-off keeps the bird target untouched and
 * leaves several useful control/lead choices. A bad hand-off is one where
 * the partner is forced into spending the target or has only expensive
 * high-tarokk control available.
 */
function assessPartnerNextLead(partnerHand, target, deadline, currentTrick) {
    const beforeDeadline = currentTrick < deadline;
    if (!beforeDeadline)
        return { value: 0, risk: 0 };
    const nonTarget = partnerHand.filter(c => c.id !== target);
    const lowTarokks = nonTarget.filter(c => c.kind === 'tarokk' && c.rank <= 16).length;
    const mediumTarokks = nonTarget.filter(c => c.kind === 'tarokk' && c.rank >= 17 && c.rank <= 19).length;
    const highControls = nonTarget.filter(c => c.kind === 'tarokk' && c.rank >= 20).length;
    const suitLeads = nonTarget.filter(c => c.kind === 'suit').length;
    const targetPresent = partnerHand.some(c => c.id === target);
    // More than one non-target lead means the partner can usually choose how
    // to continue without spending the designated target immediately.
    const choiceBreadth = Math.min(1.5, Math.max(0, nonTarget.length - 1) * 0.22);
    const safeLeadOptions = Math.min(1.5, lowTarokks * 0.28 + suitLeads * 0.16 + mediumTarokks * 0.12);
    const controlOptions = Math.min(0.9, highControls * 0.22 + mediumTarokks * 0.12);
    let value = choiceBreadth + safeLeadOptions * 0.8 + controlOptions * 0.45;
    let risk = 0;
    // Prefer a genuinely neutral continuation when several leads preserve the
    // figure equally well. A low-point suit card usually spends less control
    // and commits less information than a high tarokk lead. This is deliberately
    // a generic exposure heuristic, not a hard-coded signalling convention.
    const neutralLeads = nonTarget.filter(c => c.kind === 'suit' && c.points <= 2).length;
    const highTarokkLeads = nonTarget.filter(c => c.kind === 'tarokk' && c.rank >= 20).length;
    value += Math.min(0.55, neutralLeads * 0.14);
    if (highTarokkLeads > 0)
        risk += Math.min(0.65, highTarokkLeads * 0.18);
    if (targetPresent) {
        // Having the target is useful, but the next lead should preserve it until
        // the designated trick. A hand with no alternative lead is therefore a
        // warning rather than an automatic bonus.
        if (nonTarget.length === 0)
            risk += 1.8;
        else
            value += 0.25;
    }
    // A partner holding only very high tarokks has control, but spending that
    // control on the next lead may be unnecessarily costly before the bird's
    // deadline.
    if (nonTarget.length > 0 && lowTarokks === 0 && suitLeads === 0 && highControls > 0)
        risk += 0.55;
    return { value: Math.min(3, value), risk: Math.min(2, risk) };
}
/**
 * Figure-aware forward value used only inside hidden-world simulation.
 * It does not inspect any opponent hand: it only evaluates the visible
 * current trick, the sampled world's public ownership hypothesis, and the
 * simulated declaring side.
 *
 * The important distinction is between: keeping an already-open trick alive,
 * closing an early trick for our side, and deliberately handing control to the
 * partner. A bird figure needs the first N-1 tricks on its declaring side, but
 * it does not require the same player to win each trick.
 */
function rolloutFigureFutureValue(trick, candidateWinner, candidate, ctx, candidateWins) {
    if (!ctx.target || ctx.targetDeadline === undefined)
        return { value: 0, riskPenalty: 0 };
    const trickNumber = ctx.trickNumber;
    const closes = trick.length + 1 >= 4;
    const beforeDeadline = trickNumber < ctx.targetDeadline;
    const targetPlayed = candidate.id === ctx.target;
    const winnerOnSide = ctx.declaringSide.has(candidateWinner);
    let value = 0;
    let riskPenalty = 0;
    // Never spend the target card before the target trick unless there is no
    // alternative legal card. filterTarget() normally prevents this, but keep
    // the strategic penalty here as a second line of defence.
    if (targetPlayed && beforeDeadline) {
        value -= 14;
        riskPenalty += 1.4;
    }
    if (closes && beforeDeadline) {
        if (winnerOnSide) {
            // Preserving the prefix is the single most important short-horizon
            // objective of Centrum/Kismadár/Nagymadár.
            value += 9.5;
        }
        else {
            // Losing an early trick makes the figure objectively impossible.
            value -= 18;
            riskPenalty += 2.2;
        }
        // A partner win is still valuable, but slightly less valuable than an
        // own win because the next lead/control is less predictable.
        if (ctx.partnerId !== undefined && candidateWinner === ctx.partnerId)
            value -= 0.8;
    }
    if (closes && trickNumber === ctx.targetDeadline) {
        if (targetPlayed && winnerOnSide && candidateWins)
            value += 18;
        else if (targetPlayed && !winnerOnSide) {
            value -= 18;
            riskPenalty += 2.0;
        }
        else if (winnerOnSide) {
            // Winning the target trick without the target card is not success, but
            // it preserves the possibility only if the target was not forced.
            value -= 4;
        }
    }
    // When leading before the target trick, avoid burning the target even though
    // there is no current trick to close. This is a smaller penalty because the
    // legal target filter already protects it.
    if (!trick.length && targetPlayed && beforeDeadline) {
        value -= 10;
        riskPenalty += 0.8;
    }
    return { value, riskPenalty };
}
function determineWinner(cards, lead) { let w = cards[0]; for (const c of cards.slice(1))
    if (beatsRollout(c.card, w.card, lead))
        w = c; return w.playerId; }
function beatsRollout(a, b, lead) { if (isTarokk(a) && !isTarokk(b))
    return true; if (!isTarokk(a) && isTarokk(b))
    return false; if (isTarokk(a) && isTarokk(b))
    return a.rank > b.rank; if (a.kind !== 'suit' || b.kind !== 'suit' || lead.kind !== 'suit')
    return false; const al = a.suit === lead.suit, bl = b.suit === lead.suit; if (al && !bl)
    return true; if (!al)
    return false; const v = (r) => ({ K: 5, Q: 4, C: 3, J: 2, '10': 1, A: 1 }[r] ?? 0); return v(a.rank) > v(b.rank); }
function cardStrength(c) { return c.kind === 'tarokk' ? 100 + c.rank : ({ K: 5, Q: 4, C: 3, J: 2, '10': 1, A: 1 }[c.rank] ?? 0); }
function targetForSimulation(t) { return t === 'centrum' ? 'T20' : t === 'kismadar' ? 'T21' : t === 'nagymadar' ? 'T22' : t === 'pagatUltimo' || t === 'pagatUhu' ? 'T1' : t === 'sasUltimo' || t === 'sasUhu' ? 'T2' : undefined; }
function deadlineForSimulation(t) { return t === 'centrum' ? 5 : t === 'kismadar' ? 6 : t === 'nagymadar' ? 7 : ['pagatUltimo', 'sasUltimo', 'kingUltimo'].includes(t) ? 9 : ['pagatUhu', 'sasUhu', 'kingUhu'].includes(t) ? 8 : undefined; }
function shuffleDeterministic(items, seed) { for (let i = items.length - 1; i > 0; i--) {
    const j = seededIndex(seed + i * 31, i + 1);
    [items[i], items[j]] = [items[j], items[i]];
} }
function seededIndex(seed, length) { const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453; return Math.floor((x - Math.floor(x)) * length); }
