import { hasBigHonour, hasTarokk, tarokkCount } from './declarations.js';
function standardRequiredTarokks(figure) {
    switch (figure) {
        case 'centrum': return [20, 19, 18];
        case 'kismadar': return [20, 19, 18, 17];
        case 'nagymadar': return [20, 19, 18, 17, 16];
    }
}
/**
 * Structural assessment for Centrum/Kismadár/Nagymadár.
 *
 * Important distinction:
 * - the communication convention normally assumes a descending high-tarokk
 *   structure (Centrum: XX-XIX-XVIII; Kismadár: +XVII; Nagymadár: +XVI);
 * - actual fulfilment is determined only by the trick evaluator; and
 * - specialist examples prove that a figure can still succeed with holes in
 *   this structure when the seating, leads and distribution compensate for
 *   the missing cards.
 *
 * Therefore this function never makes declaration legality depend on card
 * ownership. It only tells the AI/belief layer how well the known position
 * matches the conventional structure.
 */
export function checkPairFigurePrerequisite(figure, context) {
    const pair = [...context.speakerHand, ...(context.partnerHand ?? [])];
    const targetTarokk = figure === 'centrum' ? 20 : figure === 'kismadar' ? 21 : 22;
    const pairHasTarget = hasTarokk(pair, targetTarokk);
    const pairHasBothBigHonours = hasBigHonour(pair) && hasTarokk(pair, 21) && hasTarokk(pair, 22);
    const pairHasXXAndXIX = hasTarokk(pair, 20) && hasTarokk(pair, 19);
    const standard = standardRequiredTarokks(figure);
    const missing = standard.filter(rank => !hasTarokk(pair, rank));
    const holeyGeometry = context.seatContext === 'lyukasCentrum' ||
        context.seatContext === 'special' ||
        context.lastSeatHasXVIIAndUnboundHigherTarokk === true;
    if (!context.partnerHand) {
        return {
            ok: false,
            reason: 'A pár másik kezének ismerete nélkül csak részleges szerkezeti értékelés adható.',
            confidence: 'inference',
            targetTarokk, pairHasTarget, pairHasBothBigHonours, pairHasXXAndXIX,
            standardRequiredTarokks: standard, missingStandardTarokks: missing, holeyGeometry,
        };
    }
    if (!pairHasBothBigHonours) {
        return {
            ok: false,
            reason: 'A klasszikus páros figura-szerkezethez a két nagyhonőr azonos oldalon való megléte szükséges.',
            confidence: 'rule',
            targetTarokk, pairHasTarget, pairHasBothBigHonours, pairHasXXAndXIX,
            standardRequiredTarokks: standard, missingStandardTarokks: missing, holeyGeometry,
        };
    }
    if (!pairHasTarget) {
        return {
            ok: false,
            reason: `A célkártya (${targetTarokk === 20 ? 'XX' : targetTarokk === 21 ? 'XXI' : 'Skíz'}) nem ismert a bemondó párjánál.`,
            confidence: 'rule',
            targetTarokk, pairHasTarget, pairHasBothBigHonours, pairHasXXAndXIX,
            standardRequiredTarokks: standard, missingStandardTarokks: missing, holeyGeometry,
        };
    }
    if (missing.length === 0) {
        const count = tarokkCount(pair);
        return {
            ok: true,
            reason: count >= 5
                ? 'A klasszikus magas-tarokk szerkezet és a célkártya is megvan; az ülés és a lejátszás dönti el a tényleges sikert.'
                : 'A klasszikus magas-tarokk szerkezet megvan, de a rövid tarokkszám miatt a figura kevésbé biztonságos.',
            confidence: count >= 5 ? 'convention' : 'inference',
            targetTarokk, pairHasTarget, pairHasBothBigHonours, pairHasXXAndXIX,
            standardRequiredTarokks: standard, missingStandardTarokks: missing, holeyGeometry,
        };
    }
    // A missing XIX/XVII (and similar holes) does not make the figure illegal.
    // Pagat's specialist example explicitly documents a successful Kismadár
    // without XIX and XVII. Such positions must be evaluated by play geometry,
    // not rejected here.
    if (holeyGeometry) {
        return {
            ok: true,
            reason: `Lyukas/specialis szerkezet: a standard ${standard.map(String).join('-')} láncból hiányzik ${missing.join(', ')}; ez nem zárja ki a figurát, de a teljesíthetőség az ülés- és ütésgeometriától függ.`,
            confidence: 'inference',
            targetTarokk, pairHasTarget, pairHasBothBigHonours, pairHasXXAndXIX,
            standardRequiredTarokks: standard, missingStandardTarokks: missing, holeyGeometry,
        };
    }
    return {
        ok: false,
        reason: `A klasszikus ${standard.map(String).join('-')} szerkezetből hiányzik ${missing.join(', ')}; ez erősen csökkenti a figura valószínűségét, de önmagában nem tiltja a bemondást.`,
        confidence: 'convention',
        targetTarokk, pairHasTarget, pairHasBothBigHonours, pairHasXXAndXIX,
        standardRequiredTarokks: standard, missingStandardTarokks: missing, holeyGeometry,
    };
}
export function standardFigureTarokks(figure) {
    return standardRequiredTarokks(figure);
}
