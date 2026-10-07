import { createDeck, isTarokk } from './cards.js';
import { createPartnerBeliefState } from './beliefs.js';
/**
 * Public-information belief model. It never reads another player's current
 * hand when estimating hidden ownership. Only the observer's hand, exposed
 * cards, declarations and seating are used.
 */
/**
 * Adapt the probability-oriented public belief snapshot to the score-oriented
 * belief interface used by the play evaluator. Probabilities remain soft
 * evidence; they are deliberately mapped to bounded scores instead of being
 * treated as hidden-card certainty.
 */
export function partnerBeliefsFromAIBeliefSnapshot(snapshot) {
    const state = createPartnerBeliefState();
    for (const item of snapshot.likelyPartnerTarokks) {
        const target = state.likelyTarokks.find(x => x.rank === item.rank);
        if (!target)
            continue;
        const score = item.probability >= 0.80 ? 7 : item.probability >= 0.55 ? 5 : item.probability >= 0.35 ? 3 : item.probability >= 0.20 ? 1.5 : 0.5;
        target.score = score;
        target.evidence = item.reasons.map((statement, index) => ({
            id: `snapshot-${snapshot.observerId}-${item.rank}-${index}`,
            kind: item.probability >= 0.999 ? 'formal' : 'inference',
            statement,
            weight: score / Math.max(1, item.reasons.length),
            source: 'AI public-information snapshot',
        }));
    }
    if (snapshot.partnerTarokkCountAtLeast) {
        state.tarokkCountAtLeast = snapshot.partnerTarokkCountAtLeast.count;
        state.tarokkCountScore = snapshot.partnerTarokkCountAtLeast.probability >= 0.90 ? 8
            : snapshot.partnerTarokkCountAtLeast.probability >= 0.70 ? 5
                : snapshot.partnerTarokkCountAtLeast.probability >= 0.45 ? 3 : 1;
        state.evidence.push({
            id: `snapshot-count-${snapshot.observerId}`,
            kind: snapshot.partnerTarokkCountAtLeast.probability >= 0.90 ? 'formal' : 'inference',
            statement: snapshot.partnerTarokkCountAtLeast.reasons.join(' '),
            weight: state.tarokkCountScore,
            source: 'AI public-information snapshot',
        });
    }
    for (const [figure, pressure] of Object.entries(snapshot.figurePressure)) {
        if (typeof pressure !== 'number')
            continue;
        state.possibleFigures[figure] = Math.max(0, Math.min(10, pressure * 10));
    }
    state.targetFigureInvitations.kismadar = state.possibleFigures.kismadar ?? 0;
    state.targetFigureInvitations.centrum = state.possibleFigures.centrum ?? 0;
    state.targetFigureInvitations.nagymadar = state.possibleFigures.nagymadar ?? 0;
    state.encouragementScore = Math.max(0, (state.possibleFigures.doubleGame ?? 0) + (snapshot.publicDeclarations.includes('fourKings') ? 1 : 0));
    if (snapshot.publicDeclarations.includes('fourKings')) {
        state.evidence.push({
            id: `snapshot-four-kings-${snapshot.observerId}`,
            kind: 'convention',
            statement: 'A publikus Négykirály-bemondás kommunikációs erősítést ad a partneri tervhez.',
            weight: 1,
            source: 'AI public-information snapshot',
        });
    }
    return state;
}
export function buildAIBeliefSnapshot(state, observerId) {
    const observer = state.players.find(p => p.id === observerId);
    if (!observer)
        throw new Error('Az AI játékosa nem található.');
    const observerSeat = state.players.findIndex(p => p.id === observerId);
    const effectivePartnerId = state.partnerId === '__UNKNOWN_PARTNER__' ? undefined : state.partnerId;
    const partnerId = observerId === state.takerId ? effectivePartnerId :
        observerId === effectivePartnerId ? state.takerId : undefined;
    const partnerSeat = partnerId ? state.players.findIndex(p => p.id === partnerId) : undefined;
    const starterSeat = state.startingPlayerId ? state.players.findIndex(p => p.id === state.startingPlayerId) : undefined;
    // Visible/known tarokks are observer-relative. The AI may always know its
    // own hand and own discarded cards. Other players' skarts remain hidden,
    // except for the taker's tarokks during the public reveal window requested
    // by the game UI: from the end of skarting until the first trick closes.
    const visible = new Set(observer.hand.filter(isTarokk).map(c => c.rank));
    for (const trick of state.completedTricks)
        for (const play of trick.cards)
            if (isTarokk(play.card))
                visible.add(play.card.rank);
    for (const trickCard of state.trick?.cards ?? [])
        if (isTarokk(trickCard.card))
            visible.add(trickCard.card.rank);
    const ownSkart = state.skartsByPlayer?.[observerId] ?? [];
    for (const card of ownSkart)
        if (isTarokk(card))
            visible.add(card.rank);
    const publicTakerSkartVisible = Boolean(state.takerId) && state.completedTricks.length === 0;
    if (publicTakerSkartVisible && state.takerId) {
        const takerSkart = state.skartsByPlayer?.[state.takerId] ?? [];
        for (const card of takerSkart)
            if (isTarokk(card))
                visible.add(card.rank);
    }
    const declarations = state.declarations.declarations.map(d => d.type);
    const ownership = {};
    for (const player of state.players)
        ownership[player.id] = {};
    const hiddenPlayers = state.players.filter(p => p.id !== observerId && p.active);
    const ranks = createDeck().filter(isTarokk).map(c => c.rank);
    for (const rank of ranks) {
        if (visible.has(rank))
            continue;
        const base = 1 / Math.max(1, hiddenPlayers.length);
        for (const player of hiddenPlayers) {
            let probability = base;
            const evidence = [];
            if (player.id === partnerId) {
                const signal = partnerSignalWeight(state, rank, declarations);
                probability += signal;
                if (signal > 0)
                    evidence.push('partneri bemondási jelzés');
            }
            if (player.id === state.startingPlayerId && rank >= 18) {
                probability += 0.04;
                evidence.push('az induló játékos szerepe');
            }
            // Seat is intentionally a small prior, never a deterministic rule.
            if (partnerSeat !== undefined && player.id === partnerId) {
                const distance = (partnerSeat - observerSeat + state.playerCount) % state.playerCount;
                if (distance === 1 || distance === state.playerCount - 1)
                    probability += 0.03;
            }
            ownership[player.id][rank] = { playerId: player.id, rank, probability: Math.min(0.95, probability), evidence };
        }
    }
    // Rule-level communication chain: the XX caller is known, the partner
    // answers with Trull, and the XX caller responds with four kings. In this
    // exact chain the four-kings speaker's XIX is not merely a soft prior.
    const exactXixSignal = partnerId !== undefined && state.calledTarokk === 20 && (() => {
        const trull = state.declarations.declarations.find(d => d.type === 'tuletroa');
        const fourKings = state.declarations.declarations.find(d => d.type === 'fourKings');
        return !!trull && !!fourKings && fourKings.ownerId === partnerId && fourKings.declaredAtTrick >= trull.declaredAtTrick;
    })();
    if (exactXixSignal && partnerId) {
        const belief = ownership[partnerId]?.[19];
        if (belief) {
            ownership[partnerId][19] = { ...belief, probability: 1, evidence: [...belief.evidence, 'XX + Trull + válaszoló négykirály: szabályszintű XIX-jelzés'] };
        }
    }
    const likelyPartnerTarokks = partnerId
        ? ranks.map(rank => ownership[partnerId]?.[rank]).filter((x) => !!x)
            .map(x => ({ rank: x.rank, probability: x.probability, reasons: x.evidence }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, 8)
        : [];
    const figurePressure = {};
    for (const type of ['centrum', 'kismadar', 'nagymadar', 'pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu', 'kingUltimo', 'kingUhu', 'doubleGame', 'volat', 'xxiFogas']) {
        figurePressure[type] = figureProbability(type, observer, likelyPartnerTarokks, declarations);
    }
    const snapshot = { observerId, observerSeat, ownership, likelyPartnerTarokks, figurePressure, publicDeclarations: declarations, visibleTarokks: [...visible].sort((a, b) => a - b) };
    if (exactXixSignal) {
        snapshot.partnerTarokkCountAtLeast = {
            count: 5,
            probability: 0.98,
            reasons: ['XX + Trull + válaszoló négykirály: legalább öt tarokkos erősség erős szabályszintű kommunikációja'],
        };
    }
    if (state.startingPlayerId !== undefined)
        snapshot.starterId = state.startingPlayerId;
    if (starterSeat !== undefined)
        snapshot.starterSeat = starterSeat;
    if (partnerId !== undefined)
        snapshot.partnerId = partnerId;
    if (partnerSeat !== undefined)
        snapshot.partnerSeat = partnerSeat;
    return snapshot;
}
function partnerSignalWeight(state, rank, declarations) {
    let weight = 0;
    if (declarations.includes('tuletroa') && declarations.includes('fourKings') && rank === 19)
        weight += 0.24;
    if (declarations.includes('centrum') && declarations.includes('doubleGame') && rank === 17)
        weight += 0.18;
    if (declarations.includes('centrum') && rank === 18)
        weight += 0.10;
    if (state.calledTarokk === rank && rank >= 18 && rank <= 20)
        weight += 0.22;
    if (declarations.includes('kismadar') && rank === 21)
        weight += 0.20;
    if (declarations.includes('nagymadar') && rank === 22)
        weight += 0.20;
    return weight;
}
function figureProbability(type, observer, partner, declarations) {
    const p = (rank) => partner.find(x => x.rank === rank)?.probability ?? 0;
    switch (type) {
        case 'centrum': return clamp(0.15 + (p(20) + p(21) + p(22)) * 0.35);
        case 'kismadar': return clamp(0.12 + p(21) * 0.55);
        case 'nagymadar': return clamp(0.10 + p(22) * 0.60);
        case 'pagatUltimo':
        case 'pagatUhu': return clamp(0.12 + (declarations.includes('fourKings') ? 0.08 : 0));
        case 'sasUltimo':
        case 'sasUhu': return clamp(0.10 + (declarations.includes('fourKings') ? 0.06 : 0));
        case 'kingUltimo':
        case 'kingUhu': return clamp(0.10 + (declarations.includes('fourKings') ? 0.05 : 0));
        case 'doubleGame': return clamp(0.15 + (declarations.includes('centrum') ? 0.22 : 0));
        case 'volat': return clamp(0.04 + observer.hand.filter(isTarokk).length * 0.035);
        case 'xxiFogas': return clamp(0.02 + (observer.hand.some(c => isTarokk(c) && c.rank === 22) ? 0.18 : 0));
        default: return 0;
    }
}
function clamp(n) { return Math.max(0, Math.min(0.95, n)); }
