import { DeclarationType } from './declarations.js';

export interface DeclarationRuleContext {
  previousDeclarations: DeclarationType[];
  declarationsOnCurrentTrick: DeclarationType[];
  /** True if this declaration is made after volát has already been declared. */
  volatAlreadyDeclared?: boolean;
  /** The pair has already become known; useful for pair-only restrictions. */
  partnerKnown?: boolean;
  /** Trull is normally the communication context, but not a formal prerequisite. */
  trullDeclared?: boolean;
  /** True only after Pass has fixed this pair's Volát declaration. */
  pairVolatAlreadyFixed?: boolean;
  /** Stable pair identifier; required to enforce pair-level duplicate rules. */
  pairId?: string;
  previousPairIds?: Array<{ type: DeclarationType; pairId: string }>;
}

export interface DeclarationValidation {
  ok: boolean;
  reason?: string;
}

/**
 * Competition-rule restrictions that can be decided from the declaration
 * history alone. Card/hand-dependent eligibility remains in declarations.ts.
 *
 * Trull remains unavailable after Volát. Four Kings and Double Game are
 * restricted only after the declaring pair has fixed its Volát with Pass.
 * ITVB 7.3: an announced ultimo may not be raised to uhu. A pair may not
 * repeat a figure already declared.
 */
export function validateDeclarationCall(
  type: DeclarationType,
  context: DeclarationRuleContext
): DeclarationValidation {
  const previous = new Set(context.previousDeclarations);

  // Trull is the normal logical communication context for these figures,
  // but it is not a formal prerequisite: a very strong taker can deliberately
  // omit Trull and start with XIX + Centrum to communicate to the partner.

  // Several different figures may be announced in the same speaking turn.
  // Repeating the same figure is still blocked by the pair history below.

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
