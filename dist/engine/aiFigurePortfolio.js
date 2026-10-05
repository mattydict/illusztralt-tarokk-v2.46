import { isHonour, isTarokk } from './cards.js';
import { pairOf } from './partnership.js';
import { determineWinner } from './play.js';
import { assessSilentFigureLandscape, assessSilentFigurePlay } from './aiSilentFigures.js';
import { assessFigureFrontierPlay } from './aiFigureFrontier.js';
/**
 * Bounded portfolio layer for card-play decisions.
 *
 * It combines explicit active declarations with silent figure opportunities,
 * but leaves legality and exact settlement semantics to the authoritative
 * rule/settlement engines. Pagat/Sas Ultimo remain independent of Uhu.
 */
export function assessFigurePortfolioPlay(state, observerId, candidate, hypotheses, silentLandscape) {
    const landscape = silentLandscape ?? assessSilentFigureLandscape(state, observerId, hypotheses);
    const playerSide = pairOf(observerId, state.takerId ?? '', state.partnerId);
    const partnerId = partnerIdForPlayer(state, observerId);
    const opponentSide = playerSide === 'taker' ? 'defence' : playerSide === 'defence' ? 'taker' : 'unknown';
    const activeDeclarations = state.declarations.declarations.filter(isActiveDeclaration);
    let declaredOwn = 0;
    let declaredPartner = 0;
    let declaredOpponent = 0;
    for (const declaration of activeDeclarations) {
        const side = pairOf(declaration.ownerId, state.takerId ?? '', state.partnerId);
        const relation = side === playerSide
            ? (declaration.ownerId === observerId ? 'self' : 'partner')
            : side === opponentSide ? 'opponent' : 'unknown';
        if (relation === 'unknown')
            continue;
        const effect = declaredFigureCandidateEffect(state, observerId, partnerId, declaration, candidate, playerSide);
        if (relation === 'self')
            declaredOwn += effect;
        else if (relation === 'partner')
            declaredPartner += effect;
        else
            declaredOpponent += effect;
    }
    const frontier = assessFigureFrontierPlay(state, observerId, candidate, landscape);
    const silent = assessSilentFigurePlay(state, observerId, candidate, hypotheses, landscape);
    const silentOwn = silent.ownSupport;
    const silentPartner = silent.partnerSupport;
    const opponentDisruption = silent.opponentDisruption;
    const positiveComponents = [declaredOwn, declaredPartner, silentOwn, silentPartner, opponentDisruption]
        .filter(x => x > 3);
    const synergy = Math.min(10, Math.max(0, positiveComponents.length - 1) * 1.8 +
        ((candidate.id === 'T1' || candidate.id === 'T2') ? Math.min(2.5, positiveComponents.length * 0.5) : 0));
    const ownNegative = Math.max(0, -declaredOwn - silentOwn);
    const partnerNegative = Math.max(0, -declaredPartner - silentPartner);
    const conflict = Math.min(14, ownNegative * 0.9 + partnerNegative * 0.55 + Math.max(0, declaredOpponent) * 0.35);
    let score = frontier.score * 0.62
        + declaredOwn * 1.05
        + declaredPartner * 0.78
        + silentOwn * 0.72
        + silentPartner * 0.58
        + opponentDisruption * 0.62
        + synergy
        - conflict;
    const ownDeadlines = activeDeclarations
        .filter(d => pairOf(d.ownerId, state.takerId ?? '', state.partnerId) === playerSide)
        .map(deadlineForDeclaration)
        .filter((x) => x !== undefined)
        .sort((a, b) => a - b);
    const trickNo = state.completedTricks.length + 1;
    if (ownDeadlines.length) {
        const urgency = Math.max(0, Math.min(1, 1 - (ownDeadlines[0] - trickNo) / 4));
        score += Math.max(0, declaredOwn) * urgency * 0.55;
        score -= Math.max(0, -declaredOwn) * urgency * 0.35;
    }
    const reasons = [];
    if (declaredOwn > 5 && silentOwn > 5)
        reasons.push('A deklarált és csendes saját figurák ugyanabba a stratégiai irányba mutatnak.');
    if (declaredPartner > 4 && silentPartner > 4)
        reasons.push('A partner deklarált és csendes figuráinak együttes támogatása indokolja ezt a vonalat.');
    if (opponentDisruption > 6 && declaredOpponent <= 1)
        reasons.push('Az ellenfél több lehetséges csendes figurája egyszerre sérülhet ezzel a kijátszással.');
    if ((candidate.id === 'T1' || candidate.id === 'T2') && activeIndependentUltimoAlongsideUhu(state, candidate.id)) {
        reasons.push('Az Uhu és a csendes Ultimó független célként fut; a céllap megőrzése ezért külön értéket kap.');
    }
    if (frontier.reasons.length)
        reasons.push(...frontier.reasons.slice(0, 2).map(r => `Célfrontier: ${r}`));
    if (frontier.synergy >= 3)
        reasons.push('A célfrontier szerint a kijátszás több figura célablakát egyszerre javítja.');
    if (conflict > 7)
        reasons.push('A kijátszás több figura között konfliktust okoz; a sürgősebb saját/partner cél élvez elsőbbséget.');
    if (partnerId && declaredPartner > 4 && opponentDisruption < 2) {
        score += 1.0;
    }
    return {
        score: Math.max(-35, Math.min(35, score)),
        declaredOwn,
        declaredPartner,
        silentOwn,
        silentPartner,
        opponentDisruption,
        synergy,
        conflict,
        reasons: [...new Set(reasons)].slice(0, 4),
    };
}
function isActiveDeclaration(d) {
    return d.status !== 'failed' && d.status !== 'fulfilled';
}
function deadlineForDeclaration(d) {
    if (d.type === 'centrum')
        return 5;
    if (d.type === 'kismadar')
        return 6;
    if (d.type === 'nagymadar')
        return 7;
    if (d.type === 'pagatUhu' || d.type === 'sasUhu' || d.type === 'kingUhu')
        return 8;
    if (d.type === 'pagatUltimo' || d.type === 'sasUltimo' || d.type === 'kingUltimo' || d.type === 'xxiFogas')
        return 9;
    return undefined;
}
function declaredFigureCandidateEffect(state, observerId, partnerId, declaration, candidate, playerSide) {
    const deadline = deadlineForDeclaration(declaration);
    if (deadline === undefined)
        return 0;
    const trickNo = state.completedTricks.length + 1;
    const target = targetCardForDeclaration(declaration);
    const trick = state.trick;
    if (!trick || !trick.cards.length) {
        if (target && candidate.id === target && trickNo < deadline)
            return -14;
        if (declaration.type === 'volat') {
            return (isTarokk(candidate) && candidate.rank <= 16) || (!isHonour(candidate) && !isTarokk(candidate)) ? 1.2 : -0.8;
        }
        if (declaration.type === 'doubleGame')
            return candidate.points <= 2 ? 0.8 : -0.2;
        return !isHonour(candidate) && (!isTarokk(candidate) || candidate.rank <= 17) ? 1.0 : 0;
    }
    const cards = trick.cards.map(x => ({ playerId: x.player, card: x.card }));
    const lead = cards[0].card;
    cards.push({ playerId: observerId, card: candidate });
    const winner = determineWinner(cards, lead);
    const winnerSide = pairOf(winner, state.takerId ?? '', state.partnerId);
    const closes = cards.length >= state.players.filter(p => p.active).length;
    let effect = 0;
    if (closes && winnerSide === playerSide)
        effect += 3.2;
    if (closes && winnerSide !== playerSide)
        effect -= 3.8;
    if (winner === partnerId)
        effect += 1.6;
    if (target && candidate.id === target) {
        if (trickNo < deadline)
            effect -= 12;
        else if (trickNo === deadline && winner === observerId)
            effect += 12;
    }
    if (declaration.type === 'volat' && closes && winnerSide !== playerSide)
        effect -= 10;
    if (declaration.type === 'doubleGame' && closes && candidate.points >= 4 && winnerSide !== playerSide)
        effect -= 2.5;
    return Math.max(-18, Math.min(18, effect));
}
function targetCardForDeclaration(d) {
    if (d.targetCardId)
        return d.targetCardId;
    if (d.type === 'pagatUltimo' || d.type === 'pagatUhu')
        return 'T1';
    if (d.type === 'sasUltimo' || d.type === 'sasUhu')
        return 'T2';
    return undefined;
}
function partnerIdForPlayer(state, playerId) {
    const side = pairOf(playerId, state.takerId ?? '', state.partnerId);
    if (side === 'taker')
        return playerId === state.takerId ? state.partnerId : state.takerId;
    if (side === 'defence')
        return state.players.find(p => p.active && p.id !== playerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
    return undefined;
}
function activeIndependentUltimoAlongsideUhu(state, candidateId) {
    const ultimo = candidateId === 'T1' ? 'pagatUltimo' : candidateId === 'T2' ? 'sasUltimo' : undefined;
    const uhu = candidateId === 'T1' ? 'pagatUhu' : candidateId === 'T2' ? 'sasUhu' : undefined;
    if (!ultimo || !uhu)
        return false;
    const active = state.declarations.declarations.filter(isActiveDeclaration);
    return active.some(d => d.type === uhu) && !active.some(d => d.type === ultimo);
}
