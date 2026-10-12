/**
 * Competition-rule restrictions that can be decided from the declaration
 * history alone. Card/hand-dependent eligibility remains in declarations.ts.
 *
 * Volát prevents Trull from being declared afterwards. Négy király and
 * Duplajáték remain possible in the same open speaking turn, but are blocked
 * for that pair once a Pass has fixed its Volát; the opposing pair is unaffected.
 * ITVB 7.3: an announced ultimo may not be raised to uhu. A pair may not
 * repeat a figure already declared.
 */
export function validateDeclarationCall(type, context) {
    const previous = new Set(context.previousDeclarations);
    // Trull is the normal logical communication context for these figures,
    // but it is not a formal prerequisite: a very strong taker can deliberately
    // omit Trull and start with XIX + Centrum to communicate to the partner.
    // One speaking turn may contain multiple different declarations. A repeat
    // of the same figure by the same pair remains prohibited below.
    if (context.pairId && context.previousPairIds?.some(x => x.pairId === context.pairId && x.type === type)) {
        return { ok: false, reason: 'A pár ezt a figurát már bemondta.' };
    }
    const volat = context.volatAlreadyDeclared || previous.has('volat');
    if (volat && type === 'tuletroa') {
        return { ok: false, reason: 'Volát után Trull már nem mondható be.' };
    }
    if (context.pairVolatAlreadyFixed === true && ['fourKings', 'doubleGame'].includes(type)) {
        return { ok: false, reason: 'A pár Volátja Passzal már rögzült; Négy király és Duplajáték már nem mondható be.' };
    }
    if (type === 'pagatUhu' && previous.has('pagatUltimo')) {
        return { ok: false, reason: 'A bemondott Pagát ultimó nem emelhető Uhu-ra.' };
    }
    if (type === 'sasUhu' && previous.has('sasUltimo')) {
        return { ok: false, reason: 'A bemondott Sas ultimó nem emelhető Uhu-ra.' };
    }
    if (type === 'kingUhu' && previous.has('kingUltimo')) {
        return { ok: false, reason: 'A bemondott Király ultimó nem emelhető Uhu-ra.' };
    }
    return { ok: true };
}
