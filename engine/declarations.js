import { isTarokk } from './cards.js';
import { resolveBirdCommunicationTarget } from './figureCommunication.js';
export function tarokkCount(hand) { return hand.filter(isTarokk).length; }
export function hasTarokk(hand, rank) { return hand.some(c => c.kind === 'tarokk' && c.rank === rank); }
export function hasBigHonour(hand) { return hasTarokk(hand, 21) || hasTarokk(hand, 22); }
export function kingCount(hand) { return hand.filter(c => c.kind === 'suit' && c.rank === 'K').length; }
/**
 * Returns declarations that can legally be offered in the current declaration window.
 * It deliberately does not claim that a declaration will succeed; success is evaluated
 * from the completed tricks.
 */
export function availableDeclarations(hand, context) {
    const previous = new Set(context.previousDeclarations);
  const pairDeclared = new Set(context.pairDeclaredTypes ?? []);
    const result = [];
    const t = tarokkCount(hand);
    // IMPORTANT: in Illustrated Tarokk, a declaration is not a promise that the
    // figure is actually makeable. The player may deliberately (or accidentally)
    // announce a figure that the hand cannot fulfil; the completed tricks decide
    // success/failure. Therefore card ownership is NOT used to hide figure
    // declarations from the human UI or from the engine's declaration options.
    //
    // The exceptions are informational tarokk-count announcements: these are
    // factual statements and therefore must still reflect the actual hand.
    if (context.announcedTarokkCount === undefined) {
        if (t === 8)
            result.push({ type: 'tarokk8', required: false });
        else if (t >= 9)
            result.push({ type: 'tarokk9', required: false });
    }
    if (!previous.has('volat')) {
        result.push({ type: 'tuletroa', required: false }, { type: 'fourKings', required: false }, { type: 'doubleGame', required: false });
    }
    result.push({ type: 'volat', required: false }, { type: 'pagatUltimo', required: false }, { type: 'sasUltimo', required: false }, { type: 'kingUltimo', required: false, reason: 'A Király ultimóhoz a jelzett királyt külön kell megadni, ha a felület kéri.' }, { type: 'pagatUhu', required: false }, { type: 'sasUhu', required: false }, { type: 'kingUhu', required: false, reason: 'A Király uhuhoz a jelzett királyt külön kell megadni, ha a felület kéri.' });
    // Undefined means the caller has not supplied an explicit Trull context.
    // Keep legacy declaration availability in that unknown state; explicit false
    // remains a hard close for the normal bird ladder.
    const hasTrullContext = context.trullDeclared === true || previous.has('tuletroa') || context.trullDeclared === undefined;
    const rareTakerCentrum = context.isTaker === true && context.trullOmittedByTaker === true;
    const lyukasAllowed = context.seatContext !== 'lyukasCentrum' || context.lastSeatHasXVIIAndUnboundHigherTarokk === true;
    // XIX partner-call + Centrum is the exceptional XX/XIX communication line.
    // In this exact XIX-called configuration the speaker must hold the complete
    // Skíz–XXI–XX–XVIII core; a generic XX + one big honour is not sufficient.
    const strictXixCentrumCore = context.calledTarokk === 19
        ? (hasTarokk(hand, 22) && hasTarokk(hand, 21) && hasTarokk(hand, 20) && hasTarokk(hand, 18))
        : true;
    if ((hasTrullContext || rareTakerCentrum) && lyukasAllowed && strictXixCentrumCore)
        result.push({ type: 'centrum', required: false });
    if (hasTrullContext && !rareTakerCentrum && lyukasAllowed) {
        result.push({ type: 'kismadar', required: false }, { type: 'nagymadar', required: false });
    }
    result.push({ type: 'xxiFogas', required: false });
    // The declaration-history restrictions (e.g. Volát után tiltott emelések,
    // same-trick pair restrictions, Ultimo -> Uhu) remain in declarationRules.
    // They are genuine announcement-order rules, not tests of whether a figure
    // is theoretically makeable from the hidden cards.
    return dedupeDeclarations(result).filter(item => !pairDeclared.has(item.type));
}
function dedupeDeclarations(items) {
    const seen = new Set();
    return items.filter(item => seen.has(item.type) ? false : (seen.add(item.type), true));
}
/**
 * Returns the count that becomes mandatory AFTER a Pagát/Sas ultimo or uhu
 * has been declared, if the declaring player holds at least eight tarokks.
 * This is intentionally not a prerequisite for making the declaration.
 */
export function mandatoryTarokkCountAfterFigure(type, hand, alreadyAnnounced) {
    if (!['pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu'].includes(type))
        return undefined;
    if (alreadyAnnounced !== undefined)
        return undefined;
    const count = tarokkCount(hand);
    return count >= 9 ? 9 : count >= 8 ? 8 : undefined;
}
export function declarationRequiresTarokkCount(type) {
    return ['pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu'].includes(type);
}
/**
 * Illusztrált Tarokk communication convention: after tulétroá, a four-kings
 * declaration is commonly used to signal the highest still-unidentified
 * tarokk. After a trull, that signal is XIX.
 */
export function fourKingsSignalAfterTrull(context = {}) {
    // Keep this legacy helper aligned with the central communication model.
    // ITVB 4.3 defines the post-Trull Four Kings as the highest still-unknown
    // relevant tarokk. The bidding context therefore matters: an ordinary XIX
    // call has XX already identified, while an XIX invite does not. A plain
    // Trull without a specific call starts from XIX.
    const known = new Set();
    if (context.invitedTarokk !== undefined)
        known.add(context.invitedTarokk);
    if (context.calledTarokk !== undefined) {
        known.add(context.calledTarokk);
        if (context.calledTarokk === 19 && context.invitedTarokk === undefined) {
            known.add(20);
            // XIX + Trull already makes XVIII the Centrum step; therefore the next
            // Four Kings signal is XVII.
            known.add(18);
        }
    }
    for (let rank = 20; rank >= 2; rank -= 1) {
        if (!known.has(rank))
            return rank;
    }
    return 17;
}
/**
 * Shared Centrum -> Kismadár -> Nagymadár communication resolver.
 * Returns undefined when Dupla is only encouragement (before Centrum or after
 * Nagymadár). The same resolver is used by the signal engine, so declaration
 * helpers cannot drift from partner-inference semantics.
 */
export function doubleGameSignalAfterCentrum(context = {}) {
    const resolved = resolveBirdCommunicationTarget({
        centrumDeclared: true,
        kismadarDeclared: context.kismadarDeclared === true,
        nagymadarDeclared: context.nagymadarDeclared === true,
        ...(context.speakerIsLastSeat === undefined ? {} : { speakerIsLastSeat: context.speakerIsLastSeat }),
        ...(context.speakerHasHigherUnboundTarokk === undefined ? {} : { speakerHasHigherUnboundTarokk: context.speakerHasHigherUnboundTarokk }),
    });
    return resolved.encouragement ? undefined : resolved.signalledTarokk;
}
