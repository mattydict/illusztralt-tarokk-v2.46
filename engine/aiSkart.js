import { isTarokk } from './cards.js';
import { legalSkartCards } from './skart.js';
import { evaluateDealPlan } from './aiDealPlan.js';
import { evaluateDealPortfolio } from './aiDealPortfolio.js';
/**
 * Choose an AI skart without using hidden information.
 *
 * The objective is deliberately different from raw card ordering:
 * - preserve tarokks, especially the higher control cards;
 * - prefer putting point-rich but strategically disposable suit cards into
 *   the player's own skart, because skart points count for that side;
 * - when two suit cards are otherwise similar, use the post-skart suit
 *   geometry to create a useful short suit for later play/lead conventions;
 * - never override the authoritative forbidden-card list.
 */
export function chooseAISkart(hand, count, context) {
    if (!Number.isInteger(count) || count < 0)
        throw new Error('A fektetési lapok száma érvénytelen.');
    if (count > hand.length)
        throw new Error('Túl sok lapot kellene fektetni.');
    if (count === 0)
        return { cards: [], candidates: [], reasons: ['Nincs fektetendő lap.'] };
    const legal = legalSkartCards(hand, context.invitedTarokk);
    if (legal.length < count) {
        throw new Error(`Az AI nem tud ${count} szabályos lapot fektetni; csak ${legal.length} áll rendelkezésre.`);
    }
    const candidates = legal
        .map(card => scoreSkartCandidate(card, hand, context))
        .sort((a, b) => b.score - a.score || stableCardOrder(b.card) - stableCardOrder(a.card));
    const cards = chooseBestSkartSet(hand, candidates, count, context);
    const reasons = cards.map(card => {
        const item = candidates.find(x => x.card.id === card.id);
        return `${card.id}: ${item.reasons.join(' ')}`;
    });
    return { cards, candidates, reasons };
}
function chooseBestSkartSet(hand, candidates, count, context) {
    const shortlist = candidates.slice(0, Math.min(candidates.length, Math.max(8, count + 5)));
    const basePlan = context.contract ? evaluateDealPlan({ hand, contract: context.contract, isTaker: context.isTaker, partnerSupport: 0.5 }) : undefined;
    let best = shortlist.slice(0, count).map(x => x.card);
    let bestScore = Number.NEGATIVE_INFINITY;
    for (const combo of combinations(shortlist.map(x => x.card), count)) {
        const candidateScore = combo.reduce((sum, card) => sum + (candidates.find(c => c.card.id === card.id)?.score ?? 0), 0);
        let score = candidateScore;
        if (basePlan) {
            const remaining = hand.filter(card => !combo.some(chosen => chosen.id === card.id));
            const postPlan = evaluateDealPlan({ hand: remaining, contract: context.contract, isTaker: context.isTaker, partnerSupport: 0.5 });
            score += (postPlan.planScore - basePlan.planScore) * 0.55;
            const portfolio = evaluateDealPortfolio({
                phase: 'skart',
                successProbability: postPlan.successProbability,
                upside: Math.max(0, postPlan.totalExpectedValue),
                downside: Math.max(0, -postPlan.totalExpectedValue),
                optionalityValue: postPlan.figureExpectedValue * 0.35,
                tacticalValue: (postPlan.planScore - basePlan.planScore) * 0.10,
            });
            score += Math.max(-1.5, Math.min(1.5, portfolio.score * 0.10));
        }
        if (score > bestScore || (Math.abs(score - bestScore) < 0.0001 && stableSetOrder(combo) > stableSetOrder(best))) {
            bestScore = score;
            best = combo;
        }
    }
    return best;
}
function combinations(items, k) {
    if (k === 0)
        return [[]];
    const out = [];
    const walk = (start, acc) => {
        if (acc.length === k) {
            out.push([...acc]);
            return;
        }
        for (let i = start; i < items.length; i++) {
            acc.push(items[i]);
            walk(i + 1, acc);
            acc.pop();
        }
    };
    walk(0, []);
    return out;
}
function stableSetOrder(cards) {
    return cards.reduce((sum, card, index) => sum + stableCardOrder(card) * Math.pow(1000, index), 0);
}
function scoreSkartCandidate(card, hand, context) {
    let score = 0;
    const reasons = [];
    // Point value is useful in the skart itself, but never enough to justify
    // throwing away an important tarokk control card.
    score += card.points * 2.8;
    if (card.points >= 4)
        reasons.push('magas pontértékű lap');
    else if (card.points >= 2)
        reasons.push('közepes pontértékű lap');
    if (isTarokk(card)) {
        score -= 10 + card.rank * 0.18;
        reasons.push('tarokk: a kéz kontrollja miatt alapvetően megtartandó');
        // Small tarokks are the natural candidates when a very tarokkos hand is
        // forced to shed tarokks. The invited card itself is already excluded by
        // legalSkartCards, so this branch handles only the remaining options.
        if (card.rank <= 10) {
            score += 2.5;
            reasons.push('alacsony tarokk, ezért kevésbé drága elengedni');
        }
        else if (card.rank <= 17) {
            score += 0.8;
            reasons.push('közepes tarokk, csak szükség esetén fektetendő');
        }
        // Keep the XIX/XVIII neighbourhood especially stable on the taker side:
        // these cards carry more communication and control value in Illustrated
        // Tarokk than an ordinary low tarokk.
        if (context.isTaker && (card.rank === 18 || card.rank === 19)) {
            score -= 1.5;
            reasons.push('XIX/XVIII kommunikációs és kontrollértékének megőrzése');
        }
        return { card, score, reasons };
    }
    const suitCount = context.preSkartSuitCounts?.[card.suit] ?? countSuit(hand, card.suit);
    const after = Math.max(0, suitCount - 1);
    // Removing the last card of a suit creates a void; two cards becoming one
    // is also useful, but should not outweigh card quality on its own.
    if (after === 0) {
        score += 2.8;
        reasons.push('színtömböt nullára csökkent, teljes rövidség/vásság keletkezik');
    }
    else if (after === 1) {
        score += 1.2;
        reasons.push('színt egy lapra rövidít');
    }
    else if (after === 2 && suitCount >= 4) {
        score += 0.45;
        reasons.push('jelentősen rövidíti a hosszú színt');
    }
    // Keep low cards in already-short suits where they have relatively low
    // lead-winning value. Conversely, a Queen/Cavalier/J can be a useful point
    // source for the skart if it does not destroy a critical suit structure.
    if (card.rank === '10' || card.rank === 'J') {
        score += 0.7;
        reasons.push('alacsony ütéserő a színben');
    }
    if (card.rank === 'Q' || card.rank === 'C') {
        score += 0.35;
        reasons.push('jó pontérték az üthetőséghez képest');
    }
    // The taker should not voluntarily kill all communication-friendly suits
    // merely for a marginal point gain. A two-card suit after skart is usually a
    // healthier compromise than creating a void when the removed card is a Q/C.
    if (context.isTaker && after === 0 && (card.rank === 'Q' || card.rank === 'C')) {
        score -= 0.7;
        reasons.push('felvevőnél a pontlap eldobása túl nagy színtömb-vesztést okozhat');
    }
    return { card, score, reasons };
}
function countSuit(hand, suit) {
    return hand.filter(c => c.kind === 'suit' && c.suit === suit).length;
}
function stableCardOrder(card) {
    if (card.kind === 'tarokk')
        return 100 + card.rank;
    const rank = { K: 6, Q: 5, C: 4, J: 3, '10': 2, A: 1 }[card.rank] ?? 0;
    const suit = { hearts: 4, diamonds: 3, spades: 2, clubs: 1 }[card.suit];
    return rank * 10 + suit;
}
