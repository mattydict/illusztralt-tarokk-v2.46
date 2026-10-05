import { assessDualCommunication } from './aiDualCommunication.js';
/**
 * v2.26: judge whether a communication choice survives into the next 2–3
 * tricks. We do not pretend to know the future cards: the existing public-
 * information rollout supplies the continuation and this layer only asks
 * whether the current message remains strategically coherent under it.
 */
export function assessCommunicationLine(state, observerId, candidate, partnerBeliefs, multi) {
    const dual = assessDualCommunication(state, observerId, candidate, partnerBeliefs);
    if (!multi)
        return {
            score: dual.score * 0.25,
            stability: 0,
            partnerSignalPersistence: Math.max(0, dual.partnerClarity) * 0.25,
            opponentAmbiguity: Math.max(0, dual.deceptionValue) * 0.25,
            reasons: [],
        };
    const confidence = Math.max(0, Math.min(1, multi.extendedHorizon.confidence));
    const continuationQuality = Math.max(-1, Math.min(1, multi.score / 8));
    const mini = multi.miniLine.score;
    const stress = multi.counterfactual;
    // A message is persistent when the line remains viable after the immediate
    // trick. Counterfactual fragility reduces confidence rather than inventing
    // an opponent response.
    const stability = Math.max(0, Math.min(1, 0.42 * confidence +
        0.33 * Math.max(0, continuationQuality) +
        0.25 * Math.max(0, 1 - stress.fragility)));
    const partnerSignalPersistence = Math.max(0, Math.min(1, (Math.max(0, dual.partnerClarity) / 7) * (0.55 + 0.45 * stability) +
        Math.max(0, mini) / 7 * 0.35));
    const opponentAmbiguity = Math.max(0, Math.min(1, (Math.max(0, dual.deceptionValue) / 2.0) * (0.55 + 0.45 * stability) -
        Math.max(0, dual.opponentReadRisk - 1) * 0.12));
    let score = dual.score * (0.45 + 0.55 * stability);
    score += partnerSignalPersistence * 2.0;
    score += opponentAmbiguity * 1.35;
    if (stress.fragility > 0.65)
        score -= 1.1;
    if (multi.score < -2)
        score -= 1.0;
    score = Math.max(-5, Math.min(5, score));
    const reasons = [];
    if (partnerSignalPersistence >= 0.55)
        reasons.push('A partnernek adott üzenet nem csak most, hanem a következő 2–3 ütéses vonalban is koherens marad.');
    if (opponentAmbiguity >= 0.45)
        reasons.push('Az ellenfél számára több természetes értelmezés marad nyitva, miközben a partneri jelzés megmarad.');
    if (stress.fragility >= 0.65)
        reasons.push('A kommunikációs előny sérülékeny: erős ellenjáték mellett a folytatás könnyen széteshet.');
    if (multi.miniLine.kind !== 'neutral')
        reasons.push(`A vonal azonosított típusa: ${multi.miniLine.kind}.`);
    if (!reasons.length)
        reasons.push('A kommunikációs üzenet rövid távon értelmezhető, de nincs erős bizonyíték a többütéses fennmaradására.');
    return {
        score,
        stability,
        partnerSignalPersistence,
        opponentAmbiguity,
        reasons: [...new Set(reasons)].slice(0, 3),
    };
}
