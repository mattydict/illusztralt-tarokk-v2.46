import { isHonour, isTarokk } from './cards.js';
import { evaluatePlayDecision } from './aiDecisionEvaluator.js';
import { legalCardsForPlay } from './game.js';
import { determineWinner } from './play.js';
import { pairOf } from './partnership.js';
import { createPartnerBeliefState, updatePartnerBelief } from './beliefs.js';
import { assessFigureCandidateValue, assessFigureGeometry, assessFigurePlayRisk } from './figureGeometry.js';
import { preferredLeadAfterPartnerTarokkSignal, preferredLeadAfterTakerSuitReturnSignal, preferredOpeningLeadCard, scoreOpeningLeadConvention, scorePartnerTarokkReply, scoreResponseToPartnerOpeningLead, scorePartnerSignalAcknowledgement, scorePartnerFigureCommunicationLead } from './leadConventions.js';
import { buildAIBeliefSnapshot } from './aiBeliefEngine.js';
import { buildHandHypotheses } from './aiHandHypotheses.js';
import { evaluateCardContinuation } from './aiRollout.js';
import { evaluateBirdFigureCandidate, activeOwnBirdDeclaration } from './aiFigurePlanner.js';
import { evaluateBirdDefenseCandidate, activeOppositionBird } from './aiBirdDefense.js';
import { arbitrateStrategicObjectives } from './aiStrategicPlanner.js';
import { evaluateDealPortfolio } from './aiDealPortfolio.js';
import { evaluateTrickEconomy } from './aiTrickEconomy.js';
import { assessSilentFigureLandscape, assessSilentFigurePlay } from './aiSilentFigures.js';
import { assessFigurePortfolioPlay } from './aiFigurePortfolio.js';
/**
 * Conservative, explainable play policy.
 *
 * It deliberately uses only information available to the player: own hand,
 * public tricks/declarations and the known partnership. It never inspects an
 * opponent's hidden hand.
 */
function selectStrategicRolloutCard(simulatedState, playerId, legalCards) {
    const beliefs = deriveBeliefsFromPublicDeclarations(simulatedState);
    const scored = legalCards.map(card => scoreCard(simulatedState, playerId, card, beliefs));
    scored.sort((a, b) => {
        if (b.score !== a.score)
            return b.score - a.score;
        if (a.card.points !== b.card.points)
            return a.card.points - b.card.points;
        return a.card.id.localeCompare(b.card.id);
    });
    return scored[0]?.card;
}

export function chooseAICard(state, playerId, beliefs) {
    const legal = legalCardsForPlay(state, playerId);
    if (!legal.length)
        throw new Error('Az AI-nak nincs szabályosan kijátszható lapja.');
    const partnerBeliefs = beliefs ?? deriveBeliefsFromPublicDeclarations(state);
    let rolloutByCard = new Map();
    let birdPlanByCard = new Map();
    let hardFigureByCard = new Map();
    let birdDefenseByCard = new Map();
    let silentFigureByCard = new Map();
    let figurePortfolioByCard = new Map();
    try {
        const snapshot = buildAIBeliefSnapshot(state, playerId);
        const hypotheses = buildHandHypotheses(state, playerId, snapshot);
        if (hypotheses.hypotheses.length) {
            const bird = activeOwnBirdDeclaration(state, playerId);
            const defensiveBird = activeOppositionBird(state, playerId);
            const silentLandscape = assessSilentFigureLandscape(state, playerId, hypotheses);
            for (const card of legal) {
                const rollout = evaluateCardContinuation(state, playerId, hypotheses, card, 2, 48, undefined, selectStrategicRolloutCard);
                // A second, terminal rollout values the same candidate in actual deal
                // settlement points when the simulated line reaches all nine tricks.
                const remainingTricks = Math.max(1, 9 - state.completedTricks.length);
                const terminal = evaluateCardContinuation(state, playerId, hypotheses, card, remainingTricks, 24, undefined, selectStrategicRolloutCard);
                rolloutByCard.set(card.id, {
                    score: rollout.expectedValue,
                    reasons: rollout.reasons,
                    partnerWinRate: rollout.partnerWinRate,
                    settlement: terminal.expectedSettlementForObserverSide,
                    terminalConfidence: terminal.confidence,
                });
                // A declared bird is a deadline problem, not merely a two-trick
                // problem. Run a second, goal-directed rollout to the designated trick
                // so the AI can sacrifice a short-term gain when that materially
                // improves the pair's target-trick probability.
                if (bird) {
                    const plan = evaluateBirdFigureCandidate(state, playerId, hypotheses, card, 32);
                    if (plan) {
                        birdPlanByCard.set(card.id, {
                            score: plan.score,
                            reasons: plan.reasons,
                            targetSuccessRate: plan.targetSuccessRate,
                            confidence: plan.confidence,
                        });
                    }
                }
                const hardFigure = activeHardFigureFor(state);
                if (hardFigure && !bird && hardFigure.targetCardId && hardFigure.deadline) {
                    const goalRollout = evaluateCardContinuation(state, playerId, hypotheses, card, Math.max(1, hardFigure.deadline - state.completedTricks.length), 24, { name: hardFigure.type, cardId: hardFigure.targetCardId, deadline: hardFigure.deadline }, selectStrategicRolloutCard);
                    hardFigureByCard.set(card.id, {
                        score: (goalRollout.targetSuccessRate - 0.5) * 60 + goalRollout.expectedValue * 1.5,
                        reasons: goalRollout.reasons,
                        targetSuccessRate: goalRollout.targetSuccessRate,
                        confidence: goalRollout.confidence,
                    });
                }
                if (defensiveBird) {
                    const defense = evaluateBirdDefenseCandidate(state, playerId, card, hypotheses);
                    if (defense) {
                        birdDefenseByCard.set(card.id, {
                            score: defense.score,
                            reasons: defense.reasons,
                            breakProbability: defense.breakProbability,
                            confidence: defense.confidence,
                        });
                    }
                }
                const silent = assessSilentFigurePlay(state, playerId, card, hypotheses, silentLandscape);
                silentFigureByCard.set(card.id, {
                    score: silent.score,
                    reasons: silent.reasons,
                    ownSupport: silent.ownSupport,
                    partnerSupport: silent.partnerSupport,
                    opponentDisruption: silent.opponentDisruption,
                });
                // v2.09: combine active declarations and silent objectives in one
                // bounded portfolio assessment. Specialist layers remain in control;
                // this layer resolves conflicts and captures positive multi-figure
                // synergies without granting hidden information.
                const portfolio = assessFigurePortfolioPlay(state, playerId, card, hypotheses, silentLandscape);
                figurePortfolioByCard.set(card.id, {
                    score: portfolio.score,
                    reasons: portfolio.reasons,
                });
            }
        }
    }
    catch {
        // The tactical engine remains the authoritative fallback when a rollout
        // cannot construct a consistent public-information world.
    }
    const ownBirdContext = activeOwnBirdDeclaration(state, playerId);
    const oppositionBirdContext = activeOppositionBird(state, playerId);
    const scored = legal.map(card => {
        const tactical = scoreCard(state, playerId, card, partnerBeliefs);
        const rollout = rolloutByCard.get(card.id);
        if (rollout) {
            const continuationScore = Math.max(-8, Math.min(8, rollout.score));
            tactical.score += continuationScore * 1.25;
            tactical.continuationScore = continuationScore;
            if (continuationScore >= 1.0)
                tactical.reasons.push(...rollout.reasons.slice(0, 1));
            else if (continuationScore <= -1.0)
                tactical.reasons.push(...rollout.reasons.slice(0, 1));
            if (typeof rollout.settlement === 'number' && Number.isFinite(rollout.settlement) && rollout.terminalConfidence > 0.45) {
                const settlementScore = Math.max(-20, Math.min(20, rollout.settlement)) * 0.42;
                const portfolio = evaluateDealPortfolio({
                    phase: 'play',
                    successProbability: Math.max(0, Math.min(1, 0.5 + rollout.settlement / 40)),
                    upside: Math.max(0, rollout.settlement),
                    downside: Math.max(0, -rollout.settlement),
                    confidence: rollout.terminalConfidence,
                    tacticalValue: rollout.score,
                });
                tactical.score += settlementScore + Math.max(-1.5, Math.min(1.5, portfolio.score * 0.10));
                tactical.settlementScore = settlementScore;
                if (Math.abs(settlementScore) >= 4) {
                    const sign = rollout.settlement > 0 ? 'nyereség' : 'veszteség';
                    tactical.reasons.push(`Partiérték: a teljes leosztás várható ${sign}hatása ${rollout.settlement.toFixed(1)} pont a saját párnak.`);
                }
            }
        }
        const hardFigure = hardFigureByCard.get(card.id);
        if (hardFigure) {
            const confidenceWeight = 0.55 + 0.45 * Math.max(0, Math.min(1, hardFigure.confidence));
            const hardScore = Math.max(-50, Math.min(50, hardFigure.score)) * confidenceWeight;
            tactical.score += hardScore;
            const reason = hardFigure.reasons.find(r => r.length > 0);
            if (Math.abs(hardScore) >= 6 && reason)
                tactical.reasons.push(`Figura-tervező: ${reason}`);
        }
        const birdPlan = birdPlanByCard.get(card.id);
        if (birdPlan) {
            // Keep the bird planner strong enough to matter, but below the hard
            // legality/lock rules handled by scoreCard(). Confidence gates only the
            // amount of influence; it never removes a legal card.
            const confidenceWeight = 0.55 + 0.45 * Math.max(0, Math.min(1, birdPlan.confidence));
            const planScore = Math.max(-70, Math.min(70, birdPlan.score)) * confidenceWeight;
            tactical.score += planScore;
            const bestReason = birdPlan.reasons.find(r => r.length > 0);
            if (Math.abs(planScore) >= 8 && bestReason)
                tactical.reasons.push(`Célütés-tervező: ${bestReason}`);
        }
        const silentFigure = silentFigureByCard.get(card.id);
        if (silentFigure) {
            const silentScore = Math.max(-45, Math.min(45, silentFigure.score));
            tactical.score += silentScore * 0.95;
            const bestReason = silentFigure.reasons.find(r => r.length > 0);
            if (Math.abs(silentScore) >= 5 && bestReason) {
                tactical.reasons.push(`Csendes figurák: ${bestReason}`);
            }
        }
        const figurePortfolio = figurePortfolioByCard.get(card.id);
        if (figurePortfolio) {
            const portfolioScore = Math.max(-35, Math.min(35, figurePortfolio.score));
            tactical.score += portfolioScore * 0.45;
            const bestReason = figurePortfolio.reasons.find(r => r.length > 0);
            if (Math.abs(portfolioScore) >= 4 && bestReason) {
                tactical.reasons.push(`Figura-portfólió: ${bestReason}`);
            }
        }
        const birdDefense = birdDefenseByCard.get(card.id);
        if (birdDefense) {
            const confidenceWeight = 0.55 + 0.45 * Math.max(0, Math.min(1, birdDefense.confidence));
            const defenseScore = Math.max(-55, Math.min(55, birdDefense.score)) * confidenceWeight;
            tactical.score += defenseScore;
            const bestReason = birdDefense.reasons.find(r => r.length > 0);
            if (Math.abs(defenseScore) >= 7 && bestReason)
                tactical.reasons.push(`Madár-védelem: ${bestReason}`);
            if (birdDefense.breakProbability >= 0.65 && Math.abs(defenseScore) >= 6) {
                tactical.reasons.push(`Madár-védelem: megtörési esély ${Math.round(birdDefense.breakProbability * 100)}%.`);
            }
        }
        // v1.93: multi-objective arbitration. Earlier versions added the own-bird
        // and opponent-bird specialists independently. When both were active, that
        // could double-count the same trick. Resolve the conflict once, using the
        // deadline, confidence, partner-control probability and the existing rollout.
        if (birdPlan || birdDefense) {
            const arbitration = arbitrateStrategicObjectives({
                trickNumber: state.completedTricks.length + 1,
                playerSide: pairOf(playerId, state.takerId ?? '', state.partnerId),
                partnerWinRate: rolloutByCard.get(card.id)?.partnerWinRate ?? 0.5,
                continuationScore: rollout?.score ?? 0,
                communicationValue: communicationValueForArbitration(state, playerId, card, partnerIdForPlayer(state, playerId), partnerBeliefs),
                ...(birdPlan ? {
                    ownBird: {
                        deadline: ownBirdContext?.deadline ?? state.completedTricks.length + 1,
                        successProbability: birdPlan.targetSuccessRate,
                        breakProbability: 0,
                        confidence: birdPlan.confidence,
                        label: ownBirdContext?.figure ?? 'saját bemondás',
                    },
                } : {}),
                ...(birdDefense ? {
                    opponentBird: {
                        deadline: oppositionBirdContext?.deadline ?? state.completedTricks.length + 1,
                        successProbability: 0,
                        breakProbability: birdDefense.breakProbability,
                        confidence: birdDefense.confidence,
                        label: oppositionBirdContext?.figure ?? 'ellenfél bemondása',
                    },
                } : {}),
                candidateWins: doesCandidateWinCurrentTrick(state, playerId, card),
                candidateWinsForPartner: doesCandidateWinForPartner(state, playerId, card),
            });
            tactical.score += arbitration.score;
            if (arbitration.reasons.length)
                tactical.reasons.push(`Stratégiai döntőbíró: ${arbitration.reasons[0]}`);
        }
        return tactical;
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0];
}
function partnerIdForPlayer(state, playerId) {
    const side = pairOf(playerId, state.takerId ?? '', state.partnerId);
    if (side === 'unknown')
        return undefined;
    if (side === 'taker')
        return playerId === state.takerId ? state.partnerId : state.takerId;
    return state.players.find(p => p.active && p.id !== playerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
}
function doesCandidateWinCurrentTrick(state, playerId, card) {
    const trick = state.trick;
    if (!trick?.cards.length)
        return false;
    const cards = trick.cards.map(toTrickCard);
    const lead = cards[0]?.card;
    if (!lead)
        return false;
    cards.push({ playerId, card });
    return determineWinner(cards, lead) === playerId;
}
function doesCandidateWinForPartner(state, playerId, card) {
    const partnerId = partnerIdForPlayer(state, playerId);
    if (!partnerId)
        return false;
    const trick = state.trick;
    if (!trick?.cards.length)
        return false;
    const cards = trick.cards.map(toTrickCard);
    const lead = cards[0]?.card;
    if (!lead)
        return false;
    cards.push({ playerId, card });
    return determineWinner(cards, lead) === partnerId;
}
function communicationValueForArbitration(state, playerId, card, partnerId, beliefs) {
    if (!partnerId)
        return 0;
    if (!state.trick?.cards.length)
        return 0;
    const candidateWinner = doesCandidateWinForPartner(state, playerId, card) ? partnerId : doesCandidateWinCurrentTrick(state, playerId, card) ? playerId : state.trick.cards[0]?.player ?? playerId;
    const playerSide = pairOf(playerId, state.takerId ?? '', state.partnerId);
    return communicationPlayValue(state, playerId, card, partnerId, playerSide, candidateWinner, state.completedTricks.length + 1, beliefs);
}
function scoreCard(state, playerId, card, beliefs) {
    const reasons = [];
    const trick = state.trick;
    const playerSide = pairOf(playerId, state.takerId ?? '', state.partnerId);
    const partnerId = playerSide === 'taker'
        ? state.takerId === playerId ? state.partnerId : state.takerId
        : state.players.find(p => p.active && p.id !== playerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
    let score = 0;
    const cardPoints = card.points;
    const nextTrickNumber = state.completedTricks.length + 1;
    const highTarokkCost = isTarokk(card) ? Math.max(0, card.rank - 8) * 0.7 : 0;
    const geometryFigure = state.declarations.declarations.find(d => d.ownerId === playerId && d.status !== 'failed' && d.status !== 'fulfilled' &&
        (d.type === 'centrum' || d.type === 'kismadar' || d.type === 'nagymadar'));
    if (geometryFigure) {
        const geometry = assessFigureGeometry(state, playerId, geometryFigure.type);
        const geometryRisk = assessFigurePlayRisk(state, playerId, geometryFigure.type, card.id);
        const figureCandidate = assessFigureCandidateValue(state, playerId, geometryFigure.type, card.id);
        score += figureCandidate.value * 7;
        if (figureCandidate.value > 0.5)
            reasons.push(figureCandidate.reason);
        else if (figureCandidate.value < -0.5 && geometryRisk.risk === 'none')
            reasons.push(figureCandidate.reason);
        if (geometryRisk.risk === 'prefix') {
            score -= 75;
            reasons.push(`A ${geometryRisk.figure} előkészítő ütése ezzel a kijátszással elveszne.`);
        }
        else if (geometryRisk.risk === 'target') {
            score -= 90;
            reasons.push(`A ${geometryRisk.figure} célkártyája túl korán kerülne kijátszásra.`);
        }
        if (geometry.status === 'failed-prefix' || geometry.status === 'failed-target') {
            reasons.push(`A bemondott ${geometry.figure} már szerkezetileg bukott: ${geometry.reason}`);
            score -= 20;
        }
        else if (geometry.targetInOwnHand && nextTrickNumber < geometry.deadline && card.id === geometry.targetCardId) {
            score -= 60;
            reasons.push(`A ${geometry.figure} célkártyáját (${geometry.targetCardId}) meg kell őrizni a ${geometry.deadline}. ütésig.`);
        }
    }
    // The lock system already guarantees that a required figure card can only
    // be played at the correct time. Give it a modest strategic bonus so the AI
    // does not try to avoid its own declared obligation in its ranking.
    const activeLock = state.lockedCards.find(l => !l.resolved && l.cardId === card.id);
    if (activeLock) {
        const deadline = activeFigureDeadline(activeLock.figure);
        if (deadline !== undefined && nextTrickNumber < deadline) {
            // A Centrum/Kismadár/Nagymadár target is valuable precisely because it
            // must win its designated trick. Playing it too early normally destroys
            // the figure, so the AI strongly preserves it until the deadline.
            score -= 180;
            reasons.push(`A ${activeLock.figure} cél-lapját a ${deadline}. ütésre kell megőrizni.`);
        }
        else {
            score += 1000;
            reasons.push(`Lekötött ${activeLock.figure} lap: ${card.id} most már teljesítendő cél.`);
        }
    }
    if (trick.cards.length === 0) {
        // Leading: avoid donating points, while retaining high tarokks/honours.
        // Specialist Illustrated-Tarokk opening conventions resolve to a concrete
        // preferred card. Give that card a strong but still overridable preference
        // so the rollout/tactical layer can escape the convention when the line is
        // objectively impossible or clearly disastrous.
        const preferredLead = preferredOpeningLeadCard(state, playerId, beliefs);
        const figureCommunicationLead = scorePartnerFigureCommunicationLead(state, playerId, card);
        if (figureCommunicationLead.score !== 0) {
            score += figureCommunicationLead.score;
            reasons.push(...figureCommunicationLead.reasons);
        }
        if (preferredLead?.id === card.id) {
            score += 36;
            const tarokkSignal = preferredLeadAfterPartnerTarokkSignal(state, playerId);
            const suitReturnSignal = preferredLeadAfterTakerSuitReturnSignal(state, playerId);
            if (tarokkSignal?.id === card.id) {
                score += 14;
                reasons.push('A partner előző ütésre tett tarokkja ezt a következő vezetést kéri.');
            }
            else if (suitReturnSignal?.id === card.id) {
                score += 12;
                reasons.push('A felvevő által visszahívott szín tarokkvezetést kér a partnertől.');
            }
            else {
                reasons.push(`Indulási konvenció: ${card.id} a kiemelt vezetési jel.`);
            }
        }
        score -= cardPoints * 1.8;
        score -= highTarokkCost;
        if (isHonour(card))
            score -= 7;
        if (isTarokk(card) && card.rank <= 10)
            score += 2;
        // A low suit lead is generally safer than wasting a trump when there is
        // no immediate figure obligation.
        if (isTarokk(card))
            score -= 2;
        else
            score += 1;
        // Figure-aware lead policy. Before a bird's deadline, preserving the
        // partnership's control matters more than collecting a cheap trick. At
        // the deadline, the target tarokk becomes the dominant objective.
        const bird = activeBirdFor(state);
        if (bird) {
            if (nextTrickNumber < bird.deadline && isTarokk(card) && card.rank >= bird.targetRank) {
                score -= 8;
                reasons.push(`A ${bird.name} miatt magas cél-tarokkot nem célszerű idő előtt elhasználni.`);
            }
            if (nextTrickNumber === bird.deadline && card.kind === 'tarokk' && card.rank === bird.targetRank) {
                score += 120;
                reasons.push(`A ${bird.name} célütése most esedékes.`);
            }
        }
        const leadConvention = scoreOpeningLeadConvention(state, playerId, card, beliefs);
        score += leadConvention.score;
        reasons.push(...leadConvention.reasons);
        return { card, score, reasons };
    }
    const lead = trick.cards[0].card;
    const currentWinner = determineWinner(trick.cards.map(toTrickCard), lead);
    const currentWinnerSide = pairOf(currentWinner, state.takerId ?? '', state.partnerId);
    const candidateWinner = determineWinner([...trick.cards.map(toTrickCard), { playerId, card }], lead);
    const candidateWins = candidateWinner === playerId;
    const trickEconomy = evaluateTrickEconomy(state, playerId, card, candidateWinner);
    score += trickEconomy.score;
    if (Math.abs(trickEconomy.score) >= 2 && trickEconomy.reasons.length) {
        reasons.push(`Pontgazdálkodás: ${trickEconomy.reasons[0]}`);
    }
    const partnerWinning = currentWinnerSide === playerSide && currentWinner !== playerId;
    const tarokkReply = scorePartnerTarokkReply(state, playerId, card);
    score += tarokkReply.score;
    reasons.push(...tarokkReply.reasons);
    if (partnerWinning) {
        // Do not overtake partner unless there is a concrete reason to do so.
        score += candidateWins ? -8 : 5;
        if (!candidateWins)
            reasons.push('A partner nyeri az ütést; nem érdemes fölé ütni.');
        if (candidateWins)
            reasons.push('Partner ütése fölé kerülne.');
        score -= cardPoints * 1.4;
        score -= highTarokkCost;
    }
    else {
        if (candidateWins) {
            // Win with the cheapest effective card. Taking valuable tricks is good,
            // but using a high tarokk/honour unnecessarily is expensive.
            score += 14;
            score -= cardPoints * 0.55;
            score -= highTarokkCost;
            if (isHonour(card))
                score -= 3;
            reasons.push('Az ütés jelenleg ellenfélnél van; ezzel a lappal átvehető.');
        }
        else {
            // If we cannot win, throw away the least valuable legal card.
            score += 4;
            score -= cardPoints * 1.7;
            score -= highTarokkCost * 0.5;
            if (isHonour(card))
                score -= 8;
            reasons.push('Az ütés nem nyerhető meg ezzel a lappal; értéktelenebb lapot érdemes eldobni.');
        }
    }
    // Preserve small/medium tarokks for later control; avoid throwing a high
    // tarokk merely to win a low-value trick.
    if (isTarokk(card) && candidateWins) {
        const winningTarokk = card.rank;
        if (winningTarokk >= 18) {
            score -= 5;
            reasons.push('Magas tarokk megőrzése a későbbi kontroll miatt.');
        }
    }
    // Figure-specific pressure also applies inside an already-running trick.
    // Declared XXI-fogás changes the play objective. TAROKK-ŐR describes a
    // characteristic defensive pattern: the Skíz preserves one strong trump,
    // while its partner keeps a medium stopper and the pair tries to force the
    // XXI into a controlled trump trick. This is a strategic preference only;
    // legality still comes entirely from legalCardsForPlay().
    const xxiCatchDeclared = state.declarations.declarations.some(d => d.type === 'xxiFogas' && d.status !== 'failed' && d.status !== 'fulfilled');
    const xxiCatchFailed = state.declarations.declarations.some(d => d.type === 'xxiFogas' && d.status === 'failed');
    // A declared XXI-fogás is deliberately rare; the play engine therefore
    // distinguishes it from a silent/opportunistic catch. Once a declaration
    // exists, preserve the catching structure. Without a declaration, a Skíz
    // may still keep a useful catcher, but should not distort every trick as if
    // a catch had been announced.
    // Silent XXI-catch is deliberately conservative. The specialist material
    // treats a declared XXI-fogás as rare because the downside is large; the
    // common strategic objective is instead to keep the catch available without
    // committing the expensive declaration. Therefore the AI only creates a
    // mild preference for preserving the Skíz, and only when there is a public
    // reason to suspect an opposing XXI. It never assumes the hidden XXI exists.
    if (!xxiCatchDeclared && !xxiCatchFailed && isTarokk(card)) {
        const ownHand = state.players.find(p => p.id === playerId)?.hand ?? [];
        const hasSkiz = ownHand.some(c => c.kind === 'tarokk' && c.rank === 22);
        const suspectedXXI = Math.max(beliefs.positionHints.some(h => h.toLowerCase().includes('xxi')) ? 0.55 : 0, beliefs.evidence.some(e => e.statement.toLowerCase().includes('xxi')) ? 0.35 : 0);
        const hasUsefulSkiz = hasSkiz && playerSide === 'defence';
        const silentCatchOpportunity = hasUsefulSkiz && suspectedXXI > 0;
        if (silentCatchOpportunity) {
            if (card.rank === 22) {
                // Do not spend the Skíz merely because it can win a cheap early trick.
                // A silent catch is an option to preserve, not a declaration to fulfil.
                if (nextTrickNumber <= 6)
                    score -= candidateWins ? 18 : 3;
                reasons.push('Csendes XXI-fogási terv: a Skízt nem szabad olcsó korai ütésre elhasználni.');
            }
            else if (card.rank >= 18 && card.rank < 22 && candidateWins) {
                // Medium/high tarokk can be a useful pressure card, but should not be
                // spent unnecessarily when the Skíz is the real catcher.
                score -= 2;
                reasons.push('Csendes fogási helyzetben a közepes/magas tarokkot is érdemes megőrizni, ha a Skíz még él.');
            }
        }
    }
    if (xxiCatchDeclared && isTarokk(card)) {
        const isHighControl = card.rank >= 19;
        const isSmallTrump = card.rank <= 16;
        if (isHighControl && !candidateWins) {
            // Preserve a high catcher when it cannot immediately perform a useful
            // job; this is particularly important for the Skíz side.
            score -= 5;
            reasons.push('Bemondott XXI-fogás mellett a magas fogó tarokk megőrzése értékes.');
        }
        if (isSmallTrump && !candidateWins) {
            score += 3;
            reasons.push('Bemondott XXI-fogás mellett kis tarokk dobása segítheti a fogási szerkezetet.');
        }
        if (candidateWins && card.rank >= 21) {
            score += 5;
            reasons.push('A XXI-fogási tervben a nagyobb tarokk kontrollja elsőbbséget kap.');
        }
    }
    const bird = activeBirdFor(state);
    if (bird && nextTrickNumber === bird.deadline && candidateWins && isTarokk(card) && card.rank === bird.targetRank) {
        score += 120;
        reasons.push(`A ${bird.name} teljesítéséhez most a cél-tarokkal kell nyerni.`);
    }
    if (bird && nextTrickNumber < bird.deadline && isTarokk(card) && card.rank >= bird.targetRank) {
        score -= 12;
        reasons.push(`A ${bird.name} cél-tarokk megőrzése fontos a ${bird.deadline}. ütésig.`);
    }
    // Bird figures are pair obligations, not obligations of the announcer alone.
    // If the target card is not in our own hand, a valid declared figure implies
    // that the partner owns it. Therefore, before the deadline we should often
    // prefer a line that keeps the trick with the partner, while at the deadline
    // we must make the target trick winnable by either member of the pair.
    if (bird && partnerId && playerSide !== 'unknown') {
        const targetId = targetCardIdForBird(bird);
        const targetInOwnHand = state.players.find(p => p.id === playerId)?.hand.some(c => c.id === targetId) ?? false;
        const targetInPartnerHandByDeclaration = !targetInOwnHand && isBirdDeclarationActive(state, bird.name);
        if (targetInPartnerHandByDeclaration && candidateWinner === partnerId) {
            score += nextTrickNumber < bird.deadline ? 24 : 55;
            reasons.push(`A ${bird.name} célkártyája várhatóan a partnernél van; a páros ütését segíteni kell.`);
        }
        if (targetInPartnerHandByDeclaration && partnerWinning && currentWinner === partnerId) {
            score += 18;
            reasons.push(`A partner viszi a ${bird.name} előkészítő ütését; nem célszerű ráütni.`);
        }
    }
    // Partner-communication beliefs influence play only probabilistically.
    // A convention never becomes hidden-card knowledge: it merely changes the
    // preference between otherwise legal lines. Publicly observed cards are
    // treated as hard negative evidence.
    const belief18 = beliefs.likelyTarokks.find(x => x.rank === 18)?.score ?? 0;
    const belief19 = beliefs.likelyTarokks.find(x => x.rank === 19)?.score ?? 0;
    const belief17 = beliefs.likelyTarokks.find(x => x.rank === 17)?.score ?? 0;
    const targetBeliefStrength = Math.min(12, belief18 + belief19 + belief17);
    const birdForPair = activeBirdFor(state);
    if (birdForPair && partnerId && targetBeliefStrength > 0) {
        if (nextTrickNumber < birdForPair.deadline && candidateWinner === partnerId) {
            score += Math.min(10, targetBeliefStrength * 0.45);
            reasons.push('A partneri bemondási jelzések alapján valószínűbb a partner magas tarokk-kontrollja; az ütés átadása előnyös lehet.');
        }
        if (nextTrickNumber < birdForPair.deadline && candidateWins && isTarokk(card) && card.rank >= 17) {
            score -= Math.min(6, targetBeliefStrength * 0.25);
            reasons.push('A partneri magas-tarokk jelzések miatt nem célszerű indokolatlanul elhasználni a saját magas tarokkot.');
        }
    }
    // A card carrying many points is a worthwhile target when we can win the
    // trick cheaply. This is deliberately modest: declaration/figure locks
    // remain stronger than generic point collection.
    if (candidateWins && cardPoints >= 4)
        score += 2;
    // If the player is on defence, winning an opponent's high-point trick has
    // extra value; on the taker side, preserving the lead is slightly more
    // important than collecting a single point-heavy trick.
    if (candidateWins) {
        if (playerSide === 'defence')
            score += 1.5;
        else
            score += 0.5;
    }
    // Shared decision evaluator: convert the tactical score into a common
    // continuation-aware assessment. The evaluator does not override the
    // specialist rules above; it adds future-control and partnership value.
    const activeFigure = state.declarations.declarations.find(d => d.status !== 'failed' && d.status !== 'fulfilled' &&
        ['centrum', 'kismadar', 'nagymadar', 'pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu', 'volat', 'xxiFogas'].includes(d.type));
    const targetCard = activeFigure?.targetCardId;
    let figurePreservation = 0;
    if (targetCard && card.id !== targetCard)
        figurePreservation += 1.5;
    if (targetCard === card.id)
        figurePreservation -= 1.5;
    if (activeFigure?.type === 'volat' && candidateWins)
        figurePreservation += playerSide === 'taker' ? 2 : -2;
    const partnerSupport = partnerWinning ? 2 : 0;
    const opponentPressure = candidateWins && currentWinnerSide !== playerSide ? 2 : 0;
    const futureControl = isTarokk(card)
        ? (card.rank >= 19 ? -1.5 : 0.8)
        : (candidateWins ? 0.4 : 0);
    // Communication is not a hard ownership fact. It changes the value of a
    // line when the public declaration chain gives us a plausible picture of
    // what the partner is trying to preserve or receive. In particular, a
    // Kismadár invitation makes a partner-owned XXI more valuable to protect
    // until the sixth trick; a XIX signal makes a small tarokk lead more useful
    // when it lets the partner exercise the communicated high-tarokk control.
    const partnerOpeningResponse = scoreResponseToPartnerOpeningLead(state, playerId, card);
    const partnerSignalAcknowledgement = scorePartnerSignalAcknowledgement(state, playerId, card);
    score += partnerSignalAcknowledgement.score;
    if (partnerSignalAcknowledgement.reasons.length && Math.abs(partnerSignalAcknowledgement.score) >= 1.5) {
        reasons.push(`Partneri visszajelzés: ${partnerSignalAcknowledgement.reasons[0]}`);
    }
    score += partnerOpeningResponse.score;
    if (partnerOpeningResponse.reasons.length && Math.abs(partnerOpeningResponse.score) >= 1.5) {
        reasons.push(`Partneri indulójelzés: ${partnerOpeningResponse.reasons[0]}`);
    }
    const communicationValue = communicationPlayValue(state, playerId, card, partnerId, playerSide, candidateWinner, nextTrickNumber, beliefs);
    const tactical = evaluatePlayDecision({
        immediateTrickValue: score * 0.35,
        figurePreservation,
        partnerSupport,
        opponentPressure,
        futureControl,
        communicationValue,
        riskPenalty: candidateWins && isHonour(card) ? 0.25 : 0,
    });
    if (communicationValue > 0.4) {
        reasons.push('A bemondási kommunikáció alapján ez a kijátszás jobban támogatja a partner feltételezett tervét.');
    }
    else if (communicationValue < -0.4) {
        reasons.push('A bemondási kommunikáció alapján ez a kijátszás ronthatja a partner feltételezett tervét.');
    }
    score += tactical.score;
    return { card, score, reasons };
}
function communicationPlayValue(state, playerId, card, partnerId, playerSide, candidateWinner, trickNumber, beliefs) {
    if (!partnerId || playerSide === 'unknown')
        return 0;
    let value = 0;
    const partnerWins = candidateWinner === partnerId;
    const partnerOwnsLikelyXIX = (beliefs.likelyTarokks.find(x => x.rank === 19)?.score ?? 0) >= 3;
    const partnerOwnsLikelyXXI = (beliefs.likelyTarokks.find(x => x.rank === 21)?.score ?? 0) >= 3;
    const partnerOwnsLikelyXX = (beliefs.likelyTarokks.find(x => x.rank === 20)?.score ?? 0) >= 3;
    const kismadarInvitation = beliefs.targetFigureInvitations.kismadar ?? 0;
    const centrumInvitation = beliefs.targetFigureInvitations.centrum ?? 0;
    const encouragement = beliefs.encouragementScore ?? 0;
    // A communicated high tarokk in the partner's hand is useful only if the
    // play actually gives that partner a chance to use it. This is deliberately
    // small: the belief can be wrong, and the tactical/figure layers remain
    // stronger than communication.
    if (partnerWins && card.kind === 'tarokk') {
        if (partnerOwnsLikelyXIX && card.rank <= 16)
            value += 0.8;
        if (partnerOwnsLikelyXX && card.rank <= 17)
            value += 0.55;
        if (partnerOwnsLikelyXXI && card.rank <= 18)
            value += 0.35;
    }
    // If the partner was invited toward Kismadár, protecting a plausible XXI
    // until the sixth trick is more important than generic trick collection.
    if (kismadarInvitation > 0 && partnerOwnsLikelyXXI) {
        if (trickNumber < 6 && partnerWins)
            value += 0.8;
        if (trickNumber < 6 && card.kind === 'tarokk' && card.rank >= 21 && !partnerWins)
            value -= 0.65;
        if (trickNumber === 6 && partnerWins && card.kind === 'tarokk' && card.rank <= 18)
            value += 0.45;
    }
    // Centrum-related communication similarly rewards handing control to the
    // partner before the designated fifth trick, without assuming that the
    // target card is definitely there.
    if (centrumInvitation > 0 && partnerOwnsLikelyXX) {
        if (trickNumber < 5 && partnerWins)
            value += 0.45;
        if (trickNumber < 5 && card.kind === 'tarokk' && card.rank >= 20 && !partnerWins)
            value -= 0.45;
    }
    // A general four-kings encouragement should make the AI somewhat more
    // willing to preserve partner control, but should never force a figure line.
    if (encouragement > 0 && partnerWins && card.kind !== 'tarokk')
        value += 0.15;
    // Defence has an additional reason to respect a partner's communicated
    // high-tarokk structure: taking an otherwise cheap trick with a high trump
    // can destroy the very control the declaration was meant to communicate.
    if (playerSide === 'defence' && card.kind === 'tarokk' && card.rank >= 19 && !partnerWins) {
        if (partnerOwnsLikelyXIX || partnerOwnsLikelyXX || partnerOwnsLikelyXXI)
            value -= 0.5;
    }
    return Math.max(-2, Math.min(2, value));
}
function deriveBeliefsFromPublicDeclarations(state) {
    let beliefs = createPartnerBeliefState();
    const previous = state.declarations.declarations.map(d => d.type);
    if (previous.length) {
        beliefs = updatePartnerBelief(beliefs, {
            previous,
            isTaker: true,
            speakerDeclarations: previous,
            knownTarokkRanks: [],
            order: previous,
        });
    }
    for (const trick of state.completedTricks) {
        for (const played of trick.cards) {
            if (played.card.kind === 'tarokk') {
                const item = beliefs.likelyTarokks.find(x => x.rank === played.card.rank);
                if (item) {
                    item.score = Math.min(0, item.score - 100);
                    item.evidence.push({
                        id: `observed-${played.card.id}-${trick.cards.length}`,
                        kind: 'negative',
                        statement: `A ${played.card.id} már kijátszásra került; nem lehet a partner kezében.`,
                        weight: -100,
                        source: 'public play',
                    });
                }
            }
        }
    }
    return beliefs;
}
function toTrickCard(x) {
    return { playerId: x.player, card: x.card };
}
function activeHardFigureFor(state) {
    const active = state.declarations.declarations.find(d => d.status !== 'failed' && d.status !== 'fulfilled' &&
        ['pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu', 'kingUltimo', 'kingUhu'].includes(d.type));
    if (!active)
        return undefined;
    const deadline = active.type.endsWith('Uhu') ? 8 : 9;
    const targetCardId = active.targetCardId ?? (active.type.startsWith('pagat') ? 'T1' : active.type.startsWith('sas') ? 'T2' : undefined);
    return { type: active.type, ...(targetCardId ? { targetCardId } : {}), deadline };
}
function activeFigureDeadline(figure) {
    if (figure === 'centrum')
        return 5;
    if (figure === 'kismadar')
        return 6;
    if (figure === 'nagymadar')
        return 7;
    return undefined;
}
function activeBirdFor(state) {
    const active = state.declarations.declarations.find(d => d.status !== 'failed' && d.status !== 'fulfilled' &&
        (d.type === 'centrum' || d.type === 'kismadar' || d.type === 'nagymadar'));
    if (!active)
        return undefined;
    if (active.type === 'centrum')
        return { name: 'Centrum', deadline: 5, targetRank: 20 };
    if (active.type === 'kismadar')
        return { name: 'Kismadár', deadline: 6, targetRank: 21 };
    return { name: 'Nagymadár', deadline: 7, targetRank: 22 };
}
function targetCardIdForBird(bird) {
    return `T${bird.targetRank}`;
}
function isBirdDeclarationActive(state, name) {
    const type = name === 'Centrum' ? 'centrum' : name === 'Kismadár' ? 'kismadar' : 'nagymadar';
    return state.declarations.declarations.some(d => d.type === type && d.status !== 'failed' && d.status !== 'fulfilled');
}
