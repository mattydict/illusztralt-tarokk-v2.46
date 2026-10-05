/**
 * Competition-rule restrictions that can be decided from the declaration
 * history alone. Card/hand-dependent eligibility remains in declarations.ts.
 *
 * ITVB 7.2: after volát, tulétroá, four kings and double game may not be
 * declared. ITVB 7.3: an announced ultimo may not be raised to uhu.
 * ITVB 7.13: members of one pair may make only one figure declaration on the
 * same trick. ITVB 7.14: a pair may not repeat a figure already declared.
 */
export function validateDeclarationCall(type, context) {
    const previous = new Set(context.previousDeclarations);
    // Trull is the normal logical communication context for these figures,
    // but it is not a formal prerequisite: a very strong taker can deliberately
    // omit Trull and start with XIX + Centrum to communicate to the partner.
    if (context.pairId && context.declarationsOnCurrentTrick.length > 0) {
        return { ok: false, reason: 'Egy pár ugyanarra az ütésre csak egy bemondást tehet.' };
    }
    if (context.pairId && context.previousPairIds?.some(x => x.pairId === context.pairId && x.type === type)) {
        return { ok: false, reason: 'A pár ezt a figurát már bemondta.' };
    }
    const volat = context.volatAlreadyDeclared || previous.has('volat');
    if (volat && ['tuletroa', 'fourKings', 'doubleGame'].includes(type)) {
        return { ok: false, reason: 'Volát után ez a bemondás már nem tehető meg.' };
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
