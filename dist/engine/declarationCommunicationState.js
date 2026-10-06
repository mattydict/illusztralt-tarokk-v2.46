import { communicationSignalFor } from './signals.js';
function confidenceOf(signal) {
    if (!signal)
        return 0;
    if (signal.confidence === 'rule')
        return 1;
    if (signal.confidence === 'convention')
        return 0.82;
    return 0.62;
}
function lastMeaningfulSignal(signals) {
    return [...signals].reverse().find(s => s.meaning !== 'encouragement');
}
/**
 * v2.31: canonical public declaration-chain state.
 *
 * This function intentionally consumes only public declaration events and
 * explicit table/bidding context. It never inspects a partner/opponent hand.
 * The returned state is descriptive: it does not itself assert card ownership.
 */
export function deriveDeclarationCommunicationState(context) {
    const events = context.events?.length
        ? [...context.events]
        : (context.previous ?? []).map(declaration => ({ declaration }));
    const declarations = events.map(e => e.declaration);
    const hasTrull = declarations.includes('tuletroa');
    const hasFourKings = declarations.includes('fourKings');
    const hasCentrum = declarations.includes('centrum');
    const hasKismadar = declarations.includes('kismadar');
    const hasNagymadar = declarations.includes('nagymadar');
    const signals = [];
    const chronological = [];
    for (const event of events) {
        const speakerDeclarations = events
            .filter(e => e.speakerId === event.speakerId && event.speakerId !== undefined)
            .map(e => e.declaration);
        const signal = communicationSignalFor({
            ...context,
            previous: chronological,
            events,
            speakerId: event.speakerId,
            speakerDeclarations: speakerDeclarations.length ? speakerDeclarations : chronological,
        }, event.declaration);
        if (signal)
            signals.push(signal);
        chronological.push(event.declaration);
    }
    const activeSignal = lastMeaningfulSignal(signals);
    const lastSignal = signals[signals.length - 1];
    const invitation = signals.some(s => s.meaning === 'targetFigureInvitation');
    const encouragement = !activeSignal && signals.some(s => s.meaning === 'encouragement');
    let phase = 'idle';
    if (invitation)
        phase = 'invitation';
    else if (hasNagymadar)
        phase = 'nagymadar';
    else if (hasKismadar)
        phase = 'kismadar';
    else if (hasCentrum)
        phase = 'centrum';
    else if (hasFourKings)
        phase = 'fourKings';
    else if (hasTrull)
        phase = 'trull';
    else if (encouragement)
        phase = 'encouragement';
    // The high-tarokk ladder is only considered broken when the public chain
    // reaches an explicit contradiction/terminal state. Ordinary unrelated
    // declarations do not erase historical information; they merely make it
    // older. The tactical layer may apply age/priority decay separately.
    const chainBroken = hasNagymadar && !activeSignal && !invitation;
    const reasons = [
        ...(activeSignal ? [activeSignal.reason] : []),
        ...(lastSignal?.meaning === 'encouragement' ? [lastSignal.reason] : []),
    ];
    return {
        phase,
        events,
        ...(activeSignal?.signalledTarokk !== undefined ? { signalledTarokk: activeSignal.signalledTarokk } : {}),
        ...(activeSignal?.targetFigure ? { targetFigure: activeSignal.targetFigure } : {}),
        activeSignal,
        confidence: confidenceOf(activeSignal),
        hasTrull,
        hasFourKings,
        hasCentrum,
        hasKismadar,
        hasNagymadar,
        chainBroken,
        encouragement,
        invitation,
        reasons: [...new Set(reasons)].slice(0, 4),
    };
}
