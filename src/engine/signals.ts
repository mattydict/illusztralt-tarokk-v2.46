import { DeclarationType } from './declarations.js';
import { resolveBirdCommunicationTarget } from './figureCommunication.js';

export type SignalTarokk = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 21 | 22;

export interface CommunicationSignal {
  declaration: DeclarationType;
  /** Set only when the declaration is being used as a specific high-tarokk signal. */
  signalledTarokk?: SignalTarokk;
  /** The next figure whose declaration this signal is preparing, when the signal is part of the Centrum -> Kismadár -> Nagymadár ladder. */
  targetFigure?: 'centrum' | 'kismadar' | 'nagymadar';
  /** Human/AI-readable semantic category of the communication. */
  meaning: 'cardSignal' | 'encouragement' | 'targetFigureInvitation';
  reason: string;
  confidence: 'rule' | 'convention' | 'inference';
}

export interface CommunicationDeclarationEvent {
  declaration: DeclarationType;
  /** Optional speaker identity/seat; used only when the caller knows it. */
  speakerId?: string;
  speakerSeat?: number;
  /** Optional side label once partnerships are known. */
  side?: 'taker' | 'partner' | 'defence';
}

export interface CommunicationContext {
  previous: DeclarationType[];
  /** Full chronological declaration events when available. Prefer this over reconstructed type-only history. */
  events?: CommunicationDeclarationEvent[];
  /** Called/invited tarokk, when the bidding context is known. */
  invitedTarokk?: 18 | 19 | 20;
  calledTarokk?: 18 | 19 | 20;
  contract?: 'three' | 'two' | 'one' | 'solo';
  /** True when the declaration is made by the taker. */
  isTaker?: boolean;
  /** Number of tarokks currently known to be in the speaker's hand. */
  tarokkCount?: number;
  /** Tarokks already identified by the declaration chain. Lower ranks matter too. */
  knownTarokkRanks?: SignalTarokk[];
  /** Number of cards still hidden from the speaker's partner perspective. */
  /** Kept for backwards compatibility; see the declaration above. */
  hiddenTarokkRanks?: SignalTarokk[];
  /** Seat/order information is deliberately optional; no positional claim is made without it. */
  speakerId?: string;
  speakerSeat?: number;
  partnerSeat?: number;
  order?: string[];
  /** Declarations by this speaker, in chronological order. */
  speakerDeclarations?: DeclarationType[];
  /** Explicit declaration-state facts supplied by the game engine. */
  /** True when the speaker is the last player in the declaration/order cycle. */
  speakerIsLastSeat?: boolean;
  /**
   * Explicit positional communication fact: in the special last-seat
   * situation, the speaker has a higher tarokk which is still unbound by the
   * communication chain. This can let Dupla skip one rung: the important
   * information is that the next Centrum/Kismadár/Nagymadár step remains
   * announceable, not that Dupla must always name the numerically next card.
   */
  speakerHasHigherUnboundTarokk?: boolean;
  /** True when the table geometry is the special 'olló' (scissor) layout. */
  ollosPosition?: boolean;
  /** Explicit lyukas-Centrum condition: the last seat has XVII and the relevant higher tarokk is unbound. */
  lastSeatHasXVIIAndUnboundHigherTarokk?: boolean;
  seatContext?: 'standard' | 'lyukasCentrum' | 'special';
  speakerHasXXI?: boolean;
  partnerHasDeclaredEightTarokk?: boolean;
  speakerIsStarter?: boolean;
  /** True when the current speaker has explicitly passed after the chain. */
  passedAfterChain?: boolean;
}

export type OmissionStrength = 'hard' | 'strong' | 'soft';

export interface CommunicationOpportunity {
  declaration: DeclarationType;
  /** Why this declaration is the next meaningful communication step. */
  reason: string;
  /** The opportunity is evaluated for this speaker, not merely for the table. */
  subject: 'speaker' | 'partner' | 'table';
  /** True only when the chain has reached a state where omission is informative. */
  omissionIsInformative: boolean;
}

/**
 * Returns the next communication step that is actually open to the speaker.
 * This is deliberately separate from declaration legality: a player may be
 * legally able to say many things, but only some declarations carry a
 * meaningful sequential signal in the current chain.
 */
export function communicationOpportunityFor(context: CommunicationContext): CommunicationOpportunity | undefined {
  const own = context.speakerDeclarations ?? context.previous;
  const hasTrull = own.includes('tuletroa') || context.events?.some(e => e.declaration === 'tuletroa') === true;
  const hasFourKings = own.includes('fourKings');
  const hasCentrum = own.includes('centrum');
  const hasKismadar = own.includes('kismadar');
  const hasNagymadar = own.includes('nagymadar');

  if (hasCentrum && !hasKismadar) {
    return {
      declaration: 'kismadar',
      reason: 'A Centrum után a Kismadár a következő egymásra épülő figura.',
      subject: 'speaker',
      omissionIsInformative: true,
    };
  }
  if (hasKismadar && !hasNagymadar) {
    return {
      declaration: 'nagymadar',
      reason: 'A Kismadár után a Nagymadár a következő egymásra épülő figura.',
      subject: 'speaker',
      omissionIsInformative: true,
    };
  }
  if (hasTrull && hasFourKings && !hasCentrum) {
    return {
      declaration: 'centrum',
      reason: 'A Trull + Négykirály után a Centrum a következő releváns figura-lépcső, ha annak feltételei fennállnak.',
      subject: 'speaker',
      omissionIsInformative: true,
    };
  }
  if (context.invitedTarokk !== undefined && context.calledTarokk === context.invitedTarokk && context.isTaker && !hasTrull) {
    return {
      declaration: 'tuletroa',
      reason: 'Elfogadott invit után a Trull a meghívott fél nagyhonőr-kommunikációjának elsődleges lépcsője.',
      subject: 'speaker',
      omissionIsInformative: true,
    };
  }
  return undefined;
}

export interface OmittedCommunication {
  declaration: DeclarationType;
  strength: OmissionStrength;
  subject?: 'speaker' | 'partner' | 'inviter' | 'table';
  unmetPrerequisites: string[];
  reason: string;
}

export interface PartnerInference {
  /** Calibrated probability when the literature gives a quantified signal. */
  probability?: number;
  /** True when the signal is treated as a rule-level communication in this model. */
  guaranteed?: boolean;
  kind:
    | 'tarokkCountAtLeast'
    | 'knownTarokkSet'
    | 'speakerOwnTarokkSet'
    | 'partnerPositionHint'
    | 'negativeInformation'
    | 'encouragement'
    | 'targetFigureInvitation';
  value: number | SignalTarokk[] | string;
  /** Optional explicit negative card constraints. The ranks are not treated as known holdings. */
  excludedTarokkRanks?: SignalTarokk[];
  /** Whose hand the negative information applies to. */
  subject?: 'speaker' | 'partner' | 'inviter' | 'table';
  /** When an omitted figure is informative, these are the alternative prerequisites
   * that remain unresolved.  The omission means at least one is not established;
   * it does NOT identify which one failed. */
  unmetPrerequisites?: string[];
  evidence: string[];
  confidence: 'rule' | 'convention' | 'inference';
}

/**
 * Context-sensitive Illusztrált Tarokk communication.
 *
 * A four-kings declaration is NOT a fixed "XIX" token. ITVB 4.3 describes the
 * Trull-following use as the highest still-unidentified relevant tarokk; the
 * actual meaning depends on the bidding/declaration context. Without Trull,
 * the implementation deliberately treats four-kings as a general encouragement
 * rather than inventing a specific card signal.
 */
export function communicationSignalFor(
  previousOrContext: DeclarationType[] | CommunicationContext,
  declaration: DeclarationType,
): CommunicationSignal | undefined {
  const context: CommunicationContext = Array.isArray(previousOrContext)
    ? { previous: previousOrContext }
    : previousOrContext;
  const previous = context.previous;
  // Trull is a table-level partner signal: it does not matter whether the
  // Trull was declared by the speaker or by their partner.  A subsequent
  // four-kings declaration therefore enters the Trull-following signalling
  // convention in either case.
  const ownPrevious = context.speakerDeclarations ?? previous;
  const hasTrullInContext = previous.includes('tuletroa') || ownPrevious.includes('tuletroa');

  if (declaration === 'fourKings' && hasTrullInContext) {
    const signal = fourKingsSignal(context);
    if (signal !== undefined) {
      return {
        declaration,
        signalledTarokk: signal,
        meaning: 'cardSignal',
        reason: fourKingsReason({ ...context, previous: ownPrevious }, signal),
        confidence: fourKingsConfidence({ ...context, previous: ownPrevious }),
      };
    }
  }

  if (declaration === 'centrum' && hasTrullInContext &&
      (previous.includes('fourKings') || ownPrevious.includes('fourKings'))) {
    const signal: SignalTarokk = context.lastSeatHasXVIIAndUnboundHigherTarokk === true ? 17 : 18;
    return {
      declaration,
      signalledTarokk: signal,
      meaning: 'cardSignal',
      reason: `A Centrum a Trull–négykirály kommunikációs lánc következő tarokkját, ${signal}-at jelzi.`,
      confidence: 'convention',
    };
  }

  if (declaration === 'doubleGame') {
    const hasTrull = previous.includes('tuletroa') || ownPrevious.includes('tuletroa');
    const hasFourKings = previous.includes('fourKings') || ownPrevious.includes('fourKings');

    // Dupla is a card signal ONLY after the full Trull -> Four Kings chain
    // has been established. Without Trull, or without Four Kings, it is
    // encouragement only. The older direct XX/invit Dupla branches were
    // incorrect for Illustrated Hungarian Tarokk and are intentionally not
    // used here.
    if (hasTrull && hasFourKings) {
      const hasCentrum = previous.includes('centrum') || ownPrevious.includes('centrum');
      const hasKismadar = previous.includes('kismadar') || ownPrevious.includes('kismadar');
      const hasNagymadar = previous.includes('nagymadar') || ownPrevious.includes('nagymadar');

      // After Nagymadár the high-tarokk signalling ladder is exhausted for
      // this chain. Dupla is again ordinary encouragement, typically toward
      // Volát, or alternatively Uhu/Ultimo.
      if (hasNagymadar) {
        return {
          declaration,
          meaning: 'encouragement',
          reason: 'Trull + Négykirály + Centrum + Kismadár + Nagymadár után a Dupla már nem újabb tarokkot jelez; általában Volátra, illetve esetleg Uhu/Ultimóra bíztat.',
          confidence: 'rule',
        };
      }

      if (hasCentrum) {
        // Centrum establishes XVII as the next unknown tarokk. Kismadár
        // advances the chain by identifying XXI, so the subsequent Dupla
        // identifies XVI. Without Kismadár, the Dupla identifies XVII.
        // In the appropriate last-seat geometry, an unbound higher tarokk
        // can allow the Dupla to skip one numerical rung. The communication
        // target is the next announceable figure in the Centrum -> Kismadár
        // -> Nagymadár ladder, not an abstract 'next unknown card'.
        const canSkipOneRung = context.speakerIsLastSeat === true &&
          context.speakerHasHigherUnboundTarokk === true;
        const signal = hasKismadar
          ? (canSkipOneRung ? 15 : 16)
          : (canSkipOneRung ? 16 : 17);
        return {
          declaration,
          signalledTarokk: signal as SignalTarokk,
          targetFigure: hasKismadar ? 'nagymadar' : 'kismadar',
          meaning: 'cardSignal',
          reason: hasKismadar
            ? (canSkipOneRung
              ? 'Trull + Négykirály + Centrum + Kismadár után, megfelelő körvégi ülésben és magasabb le nem kötött tarokk mellett a Dupla a XVI helyett a XV-öt jelzi, mert a következő bemondható figurális lépcső a lényeg.'
              : 'Trull + Négykirály + Centrum + Kismadár után a Dupla a következő kommunikációs lépcsőt, a XVI-ost jelzi.')
            : (canSkipOneRung
              ? 'Trull + Négykirály + Centrum után, megfelelő körvégi ülésben és magasabb le nem kötött tarokk mellett a Dupla a XVII helyett a XVI-ot jelzi, mert a következő bemondható figurális lépcső a lényeg.'
              : 'Trull + Négykirály + Centrum után a Dupla a következő kommunikációs lépcsőt, a XVII-est jelzi.'),
          confidence: 'rule',
        };
      }

      // Trull + Four Kings without Centrum: encouragement, not a card signal.
      return {
        declaration,
        meaning: 'encouragement',
        reason: 'Trull + Négykirály után, Centrum nélkül a Dupla nem konkrét tarokkot jelez; erősségi bíztatás további nagy bemondásra.',
        confidence: 'rule',
      };
    }

    // No Trull, or Trull without Four Kings: Dupla is encouragement only.
    return {
      declaration,
      meaning: 'encouragement',
      reason: !hasTrull
        ? 'Trull nélkül a Dupla nem tarokkjelzés, hanem erősségi bíztatás.'
        : 'Trull után, de Négykirály nélkül a Dupla nem tarokkjelzés, hanem erősségi bíztatás.',
      confidence: 'rule',
    };
  }

  // Without a preceding Trull, four-kings is not treated as a fixed-card
  // signal.  In ordinary table practice it is a general encouragement: the
  // speaker says, in effect, that they have a good hand and invites the
  // partner (or, more rarely, the taker speaking for themselves) to consider
  // an additional figure such as ultimo/uhu, double game, and only very
  // exceptionally XXI-fogás.  This must never be converted into ownership of
  // a particular tarokk.
  if (declaration === 'fourKings' && !hasTrullInContext) {
    return {
      declaration,
      meaning: 'encouragement',
      reason: 'Trull nélkül a négy király általános bíztatás: jó lapot jelez, és további bemondás (pl. ulti/uhu vagy duplajáték) mérlegelésére ösztönöz; nagyon ritkán XXI-fogásra is utalhat.',
      confidence: 'convention',
    };
  }

  // A target-figure invitation is not a claim that the speaker owns the
  // target card. It means the speaker's communication is opening a figure
  // whose target may be in either partner's or an opponent's hand.
  if (declaration === 'centrum' && ownPrevious.includes('doubleGame') && context.passedAfterChain) {
    return {
      declaration,
      meaning: 'targetFigureInvitation',
      reason: 'Centrum + duplajáték + passz után a bemondási lánc a partner Kismadár/Nagymadár irányú lehetőségeit is megnyithatja; a célkártya birtokosa külön kérdés.',
      confidence: 'inference',
    };
  }

  return undefined;
}

function fourKingsSignal(context: CommunicationContext): SignalTarokk | undefined {
  // ITVB 4.3: after Trull, four kings means the highest still-unidentified
  // non-honour tarokk. The bidding context matters: a plain XIX call means
  // XX is already known, while an XIX invite does not reveal where XX is.
  return fourKingsSignalBase(context);
}

function declarationHistory(context: CommunicationContext): DeclarationType[] {
  // A type-only list cannot distinguish two Four Kings declarations made by
  // different players, nor can it preserve repeated declarations reliably.
  // When event-level chronology exists, preserve it; speaker/side filtering is
  // handled by communication-chain helpers rather than by this raw history.
  if (context.events && context.events.length > 0) {
    return context.events.map(event => event.declaration);
  }
  const history = [...context.previous];
  if (context.speakerDeclarations) {
    // Only append declarations that are not already represented. This fallback
    // is intentionally conservative; callers that need exact chronology should
    // provide `events`.
    for (const declaration of context.speakerDeclarations) {
      if (!history.includes(declaration)) history.push(declaration);
    }
  }
  return history;
}

function eventBelongsToCommunicationSide(context: CommunicationContext, event: CommunicationDeclarationEvent): boolean {
  // If side information is available for both the current speaker and an
  // event, only the same side can advance a pair-level high-tarokk chain.
  // Unknown side information remains usable for backwards compatibility.
  if (event.side === undefined) return true;
  if (context.speakerId !== undefined && context.events) {
    const speakerEvent = context.events.find(e => e.speakerId === context.speakerId);
    if (speakerEvent?.side !== undefined) return speakerEvent.side === event.side;
  }
  return true;
}

function communicationChainHistory(context: CommunicationContext): DeclarationType[] {
  if (!context.events || context.events.length === 0) return declarationHistory(context);
  return context.events
    .filter(event => eventBelongsToCommunicationSide(context, event))
    .map(event => event.declaration);
}

function firstSignalAfterTrull(context: CommunicationContext, history: DeclarationType[]): SignalTarokk | undefined {
  const trullIndex = history.indexOf('tuletroa');
  const firstFourKingsIndex = history.indexOf('fourKings', Math.max(0, trullIndex + 1));
  if (trullIndex < 0 || firstFourKingsIndex < 0) return undefined;

  const known = new Set<number>(context.knownTarokkRanks ?? []);
  if (context.invitedTarokk !== undefined) known.add(context.invitedTarokk);
  if (context.calledTarokk !== undefined) known.add(context.calledTarokk);
  if (context.calledTarokk === 19 && context.invitedTarokk === undefined) {
    known.add(20);
    // ITVB 4.3 explicitly makes XIX + Trull + Four Kings -> XVII because
    // XVIII is the next Centrum communication step.
    known.add(18);
  }
  return highestUnknownNonHonour(known);
}

function knownRanksFromContext(context: CommunicationContext): Set<number> {
  const known = new Set<number>(context.knownTarokkRanks ?? []);
  const history = communicationChainHistory(context);

  if (context.invitedTarokk !== undefined) known.add(context.invitedTarokk);
  if (context.calledTarokk !== undefined) known.add(context.calledTarokk);
  if (context.calledTarokk === 19 && context.invitedTarokk === undefined) {
    known.add(20);
    if (history.includes('tuletroa')) known.add(18);
  }

  // Reconstruct the high-tarokk communication chain in chronological order.
  // This is deliberately stateful: a later Double only gets a card meaning
  // after the preceding figure has actually established the next rung.
  const trullIndex = history.indexOf('tuletroa');
  if (trullIndex >= 0) {
    const chain = history.slice(trullIndex + 1);
    const firstFourKingsIndex = chain.indexOf('fourKings');
    if (firstFourKingsIndex >= 0) {
      const firstSignal = firstSignalAfterTrull(context, history);
      if (firstSignal !== undefined) known.add(firstSignal);

      let lastSignal = firstSignal;
      let figuresEstablished = false;
      for (let i = firstFourKingsIndex + 1; i < chain.length; i += 1) {
        const declaration = chain[i];
        if (declaration === 'centrum') {
          // Centrum normally identifies XVIII.  The special lyukas-Centrum
          // route can identify XVII, but only when the engine explicitly
          // supplies the necessary geometry/last-seat condition.
          const lyukas = context.lastSeatHasXVIIAndUnboundHigherTarokk === true;
          const signal = lyukas ? 17 : 18;
          known.add(signal);
          figuresEstablished = true;
          lastSignal = signal;
        } else if (declaration === 'kismadar') {
          known.add(21);
          // In the established Centrum -> Kismadár communication chain,
          // Kismadár also closes the immediately preceding lower-rung slot:
          // the next Dupla therefore moves beyond XVII to XVI.  This is not
          // a claim that Kismadár itself names XVII; it records the chain's
          // already-consumed communication step.
          if (figuresEstablished) known.add(17);
          figuresEstablished = true;
          lastSignal = 21;
        } else if (declaration === 'nagymadar') {
          known.add(22);
          if (figuresEstablished && known.has(17)) known.add(16);
          figuresEstablished = true;
          lastSignal = 22;
        } else if (declaration === 'doubleGame' && figuresEstablished && !hasOwnDeclarationBefore(history, i, 'nagymadar')) {
          const next = highestUnknownNonHonour(known);
          known.add(next);
          lastSignal = next;
        } else if (declaration === 'fourKings' && lastSignal !== undefined) {
          // A later Four Kings continues the same descending chain rather than
          // resetting to the original highest-unknown calculation.
          const next = highestUnknownNonHonour(known);
          known.add(next);
          lastSignal = next;
        }
      }
    }
  }

  return known;
}

function hasOwnDeclarationBefore(history: DeclarationType[], index: number, declaration: DeclarationType): boolean {
  return history.slice(0, index).includes(declaration);
}

function initialFourKingsSignal(context: CommunicationContext): SignalTarokk {
  if (context.previous.includes('centrum') && !context.previous.includes('fourKings')) return 19;
  if (context.invitedTarokk === 19 || context.invitedTarokk === 18) return 20;
  if (context.invitedTarokk === 20) return 19;
  if (context.calledTarokk === 19) return 17;
  if (context.calledTarokk === 20) return 19;
  return 19;
}

function fourKingsSignalBase(context: CommunicationContext): SignalTarokk {
  const known = new Set<number>(context.knownTarokkRanks ?? []);
  if (context.invitedTarokk !== undefined) known.add(context.invitedTarokk);
  if (context.calledTarokk !== undefined) {
    known.add(context.calledTarokk);
    if (context.calledTarokk === 19 && context.invitedTarokk === undefined) {
      known.add(20);
      if (context.previous.includes('tuletroa') || context.speakerDeclarations?.includes('tuletroa')) known.add(18);
    }
  }

  // For the current Four Kings declaration, reconstruct only declarations that
  // occurred before it.  This prevents a later Centrum/Kismadár/Nagymadár from
  // incorrectly changing the meaning of an earlier Four Kings.
  const history = context.events ? communicationChainHistory(context) : declarationHistory(context);
  const currentFourKings = history.lastIndexOf('fourKings');
  const beforeCurrent = currentFourKings >= 0 ? history.slice(0, currentFourKings) : history;
  const trullIndex = beforeCurrent.indexOf('tuletroa');
  if (trullIndex >= 0) {
    if (!beforeCurrent.includes('fourKings')) return initialFourKingsSignal(context);
    const { speakerDeclarations: _speakerDeclarations, events: _events, ...withoutSpeakerDeclarations } = context;
    const prefix: CommunicationContext = {
      ...withoutSpeakerDeclarations,
      previous: beforeCurrent,
      ...(context.events ? { events: context.events.slice(0, currentFourKings) } : {}),
    };
    const knownBefore = knownRanksFromContext(prefix);
    return highestUnknownNonHonour(knownBefore);
  }

  return highestUnknownNonHonour(known);
}

function highestUnknownNonHonour(known: Set<number>): SignalTarokk {
  for (let rank = 20; rank >= 2; rank -= 1) {
    if (!known.has(rank)) return rank as SignalTarokk;
  }
  return 1;
}

function nextUnidentifiedAfterFigures(context: CommunicationContext): SignalTarokk {
  const known = knownRanksFromContext(context);
  return highestUnknownNonHonour(known);
}

function fourKingsConfidence(context: CommunicationContext): 'rule' | 'convention' | 'inference' {
  // In the XX + Trull + four-kings response chain, the specialist literature
  // treats the signal as a rule-level communication: the four-kings speaker
  // has XIX. This is stronger than the generic Trull/four-kings encouragement.
  // In an accepted XVIII-invite, however, Four Kings identifies XX: the invite
  // has already established XVIII, while the XX holder is still unknown.
  if (context.calledTarokk === 20 && (context.previous.includes('tuletroa') || context.speakerDeclarations?.includes('tuletroa'))) {
    return 'rule';
  }
  if (context.invitedTarokk === 18 || context.invitedTarokk === 19 || context.calledTarokk !== undefined) {
    return 'convention';
  }
  if (context.contract === 'three') return 'rule';
  return 'inference';
}

function fourKingsReason(context: CommunicationContext, signal: number): string {
  return `A Trull utáni négykirály a legmagasabb még ismeretlen, nem honőr tarokkot jelzi: ${signal}.`;
}

/**
 * Richer partner-facing inferences.  These are deliberately represented as
 * evidence + confidence instead of being collapsed into hard card ownership.
 * That lets the future AI reason with deductions without turning conventions
 * into false facts.
 */
function omissionEvidence(context: CommunicationContext): OmittedCommunication[] {
  const out: OmittedCommunication[] = [];
  const history = declarationHistory(context);
  const own = context.speakerDeclarations ?? context.previous;
  const hasTrull = history.includes('tuletroa') || own.includes('tuletroa');
  const hasFourKings = history.includes('fourKings') || own.includes('fourKings');

  // An accepted invite creates a special expectation for the taker's first
  // communication. The absence of Trull is informative, but literature shows
  // it is not a hard card-ownership statement: a weak taker may deliberately
  // suppress it. See Pagat example games 5 and 10.
  if (context.isTaker && context.invitedTarokk !== undefined &&
      context.calledTarokk === context.invitedTarokk && !hasTrull &&
      own.length > 0) {
    out.push({
      declaration: 'tuletroa',
      strength: 'strong',
      subject: 'speaker',
      unmetPrerequisites: [
        'a másik nagyhonőr a felvevő kezében van',
        'a felvevő Trull-kommunikációhoz elegendő erősségű',
        'a felvevő legalább kb. 5 tarokkos erőssége fennáll'
      ],
      reason: 'Elfogadott invit után a felvevő Trull-hiánya informatív, de a szakirodalom szerint gyenge kézzel a Trull tudatosan is elmaradhat.'
    });
  }

  // After Trull + Four Kings, Centrum is the normal next figure-opening step.
  // A pass or another non-Centrum action is therefore informative only after
  // the player has had an actual opportunity to continue the chain. We keep
  // the result disjunctive: it does not identify which Centrum prerequisite
  // failed.
  if (hasTrull && hasFourKings && !own.includes('centrum') &&
      communicationOpportunityFor(context)?.declaration === 'centrum' &&
      (context.passedAfterChain || own.includes('doubleGame') || own.includes('kismadar') || own.includes('nagymadar'))) {
    out.push({
      declaration: 'centrum',
      strength: 'strong',
      subject: 'speaker',
      unmetPrerequisites: [
        'a Centrumhoz szükséges magas-tarokk szerkezet',
        'a megfelelő ülés- és ütési geometria',
        'a szükséges tarokkhossz / erősség',
        'a Centrum biztonságos vállalhatósága'
      ],
      reason: 'Trull + Négykirály után a Centrum elmaradása csak akkor informatív, ha a játékosnak volt tényleges lehetősége a következő kommunikációs lépésre.'
    });
  }

  // Once Centrum exists, Kismadár is the next figure in the nested figure
  // hierarchy. Its omission therefore means at least one Kismadár condition
  // is not established; it does not identify a particular missing card.
  if (communicationOpportunityFor(context)?.declaration === 'kismadar' && context.passedAfterChain) {
    out.push({
      declaration: 'kismadar',
      strength: 'strong',
      subject: 'speaker',
      unmetPrerequisites: [
        'legalább 6 tarokk',
        'XXI a megfelelő oldalon',
        'a 6. ütés szükséges megnyerési szerkezete',
        'a Kismadár vállalhatósága'
      ],
      reason: 'A Centrum után a Kismadár elmaradása a következő figura feltételhalmazának hiányát jelzi, nem egyetlen lap hiányát.'
    });
  }

  if (communicationOpportunityFor(context)?.declaration === 'nagymadar' && context.passedAfterChain) {
    out.push({
      declaration: 'nagymadar',
      strength: 'strong',
      subject: 'speaker',
      unmetPrerequisites: [
        'legalább 7 tarokk',
        'XVI a megfelelő oldalon',
        'Skíz a megfelelő oldalon',
        'a 7. ütés szükséges megnyerési szerkezete',
        'a Nagymadár vállalhatósága'
      ],
      reason: 'A Kismadár után a Nagymadár elmaradása legalább egy további feltétel hiányát jelzi.'
    });
  }

  return out;
}

export function inferPartnerInformation(context: CommunicationContext): PartnerInference[] {
  const previous = context.previous;
  const omissionSignals = omissionEvidence(context);
  const ownPrevious = context.speakerDeclarations ?? previous;
  const out: PartnerInference[] = [];

  for (const omission of omissionSignals) {
    out.push({
      kind: 'negativeInformation',
      value: `${omission.declaration} bemondásának elmaradása: ${omission.reason}`,
      ...(omission.subject !== undefined ? { subject: omission.subject } : {}),
      unmetPrerequisites: omission.unmetPrerequisites,
      evidence: [omission.reason],
      confidence: omission.strength === 'hard' ? 'rule' : omission.strength === 'strong' ? 'convention' : 'inference',
    });
  }

  // Published rule/convention: a first-round invite/allowed taker signals a
  // big honour with tulétroá; the official material also recommends tulétroá
  // for a taker with at least five tarokks.  If a taker says XIX + Centrum
  // without tulétroá, the combination carries stronger positional information
  // than a bare "centrum" token.  We model the deduction, not card ownership.
  if (
    context.isTaker &&
    context.calledTarokk === 19 &&
    ownPrevious.includes('centrum') &&
    !ownPrevious.includes('tuletroa')
  ) {
    out.push({
      kind: 'tarokkCountAtLeast',
      value: 5,
      evidence: [
        'XIX-es felvétel után Centrumot mondott a felvevő.',
        'A Centrumhoz a gyakorlatban legalább öt tarokkos erősen ajánlott.',
        'A tulétroá elmaradása ebben a kombinációban információt hordoz.',
      ],
      confidence: 'inference',
    });
    out.push({
      kind: 'knownTarokkSet',
      value: [22, 21, 20, 18],
      evidence: [
        'A XIX-es felvevő Centrum + passz jellegű kommunikációja a Skíz–XXI–XX–XVIII erős tarokkstruktúrára utal.',
        'A jelzés nem kezeli ezeket automatikusan a felvevő kizárólagos birtokaként: a cél a partneri következtetés.',
      ],
      confidence: 'inference',
    });
    out.push({
      kind: 'negativeInformation',
      value: 'A tulétroá elmaradása ebben a konkrét kombinációban önálló információs jelzésként kezelendő.',
      evidence: [
        'Az ITVB első körös tulétroá-szabályai a nagyhonőr-jelzést kontextushoz kötik.',
        'Tanulságos partik szerint a bemondások sorrendje és elmaradása is partneri információt hordozhat.',
      ],
      confidence: 'inference',
    });
  }

  // Trull nélküli négykirály: általános bíztatás, nem lapjelzés.
  if (ownPrevious.includes('fourKings') && !previous.includes('tuletroa') && !ownPrevious.includes('tuletroa')) {
    out.push({
      kind: 'encouragement',
      value: 'jó lap / további figura mérlegelésére szóló bíztatás',
      evidence: [
        'A négykirály önmagában ebben a helyzetben nem az ITVB 4.3 szerinti, Trull utáni magas-tarokk jelzés.',
        'A gyakorlati konvenció szerint a partner vagy a felvevő ezzel erős lapot jelez és további bemondásra bíztat.',
        'Elsősorban ulti/uhu vagy duplajáték jöhet szóba; XXI-fogásra való bíztatás csak kivételes értelmezés.',
      ],
      confidence: 'convention',
    });
  }

  // Exact XX -> Trull -> four-kings response chain. The specialist literature
  // treats the XIX signal as rule-level communication and the 5+ tarokk signal
  // as an extremely strong practical consequence. We model the latter as 98%,
  // not as mathematical certainty, because the declaration communicates the
  // intended strength rather than physically revealing the hidden hand.
  if (
    context.calledTarokk === 20 &&
    (previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) &&
    ownPrevious.includes('fourKings')
  ) {
    out.push({
      kind: 'knownTarokkSet',
      value: [19],
      probability: 1,
      guaranteed: true,
      evidence: [
        'XX hívás + Trull után válaszoló négykirály: a XIX-es tarokk birtoklása szabályszintű információ.'
      ],
      confidence: 'rule',
    });
    out.push({
      kind: 'tarokkCountAtLeast',
      value: 5,
      probability: 0.98,
      evidence: [
        'Ugyanez a négykirályos válasz legalább öt tarokkos erősséget jelez; a modell ezt 98%-os kommunikációs valószínűségként kalibrálja. Ritka kivételként négy tarokkal is előfordulhat, ezért ez erősségi következtetés.'
      ],
      confidence: 'rule',
    });
  }

  // Accepted invite: the taker's failure to say Trull is itself informative.
  // Specialist sources describe Trull as the normal way for the taker to
  // communicate that they hold the other big honour after accepting an invite.
  // However, the omission is NOT a hard proof that the other big honour is
  // absent: a weak 3-4 tarokk hand may deliberately omit Trull, and the modern
  // competition rules frame the 5+ tarokk requirement as a strong recommendation.
  // Therefore the engine records a disjunctive negative inference:
  //   (a) other big honour is not with the taker, OR
  //   (b) the taker is too weak / deliberately suppresses Trull.
  // This also opens the XXI-fogás possibility; it does not manufacture
  // ownership of XXI or Skíz.
  if (
    context.isTaker === true &&
    context.invitedTarokk !== undefined &&
    context.calledTarokk === context.invitedTarokk &&
    !ownPrevious.includes('tuletroa') &&
    context.speakerDeclarations !== undefined &&
    context.speakerDeclarations.length > 0
  ) {
    out.push({
      kind: 'negativeInformation',
      value: 'Az invitált felvevő nem mondott Trullt: a másik nagyhonőr nála nem igazolt, vagy a lapja túl gyenge a Trull-bíztatáshoz.',
      subject: 'speaker',
      unmetPrerequisites: [
        'a másik nagyhonőr a felvevő kezében van',
        'a felvevő lapja elég erős a Trull kommunikációjához',
        'a felvevő legalább kb. 5 tarokkos erőssége fennáll (erős ajánlás, nem abszolút feltétel)'
      ],
      evidence: [
        'Invit esetén a felvevő a meghívott tarokkot hívja, és a Trull a másik nagyhonőr jelenlétének kommunikációs eszköze.',
        'A szakirodalom szerint ha az invitált felvevő nem mond Trullt, felmerül, hogy a másik nagyhonőr nincs nála.',
        'Ugyanakkor gyenge, 3–4 tarokkos felvevő mindkét nagyhonőr birtokában is mellőzheti a Trullt, ezért az elmaradás nem lapbirtoklási bizonyosság.',
        'A Trull hiánya ezért a XXI-fogás lehetőségét is megnyitja, de önmagában nem mondja meg, kinél van a XXI vagy a Skíz.'
      ],
      confidence: 'convention',
    });
  }

  // IMPORTANT omission shortcut from the specialist literature:
  // after an XIX invite, if the taker calls the invited XIX and directly
  // announces Centrum without saying Four Kings, the missing Four Kings is
  // informative rather than neutral.  The invite already established XIX,
  // so the direct Centrum communicates the lower Centrum card (normally XVIII).
  // The Tarokk Akadémia explicitly notes that Four Kings would be redundant in
  // this situation and that the direct Centrum itself signals XVIII.
  if (
    context.invitedTarokk === 19 &&
    context.calledTarokk === 19 &&
    context.isTaker === true &&
    ownPrevious.includes('centrum') &&
    !ownPrevious.includes('fourKings') &&
    !ownPrevious.includes('tuletroa')
  ) {
    out.push({
      kind: 'knownTarokkSet',
      value: [18],
      probability: 1,
      guaranteed: true,
      evidence: [
        'XIX-es invit után a felvevő közvetlenül Centrumot mondott Négykirály nélkül.',
        'A szakirodalom szerint ebben a helyzetben a Négykirály felesleges lenne: a Centrum közvetlenül az XVIII-ast jelzi.'
      ],
      confidence: 'rule',
    });
    out.push({
      kind: 'targetFigureInvitation',
      value: 'Centrum',
      evidence: [
        'A közvetlen Centrum az invitált XIX mellett az XVIII-as szerkezetet kommunikálja; a négykirály elmaradása itt pozitív rövidítés.'
      ],
      confidence: 'convention',
    });
  }

  // The same omission must NOT be inferred merely from an XVIII invite or from
  // a Centrum appearing somewhere in the table: the speaker must be the taker
  // who actually accepted the XIX invite, and the Four Kings must be absent
  // from that speaker's own declaration sequence.

  // Accepted XVIII-invite + Trull + Four Kings: the Four Kings identifies
  // XX because XVIII was already established by the invite.  Crucially, this
  // does NOT by itself prove that the inviter lacks XIX.  The negative XIX
  // information is generated only by the inviter's subsequent declaration
  // (or pass), because that response is what reveals whether the inviter can
  // continue the Centrum chain.
  if (
    context.invitedTarokk === 18 &&
    context.calledTarokk === 18 &&
    (previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) &&
    (previous.includes('fourKings') || ownPrevious.includes('fourKings'))
  ) {
    out.push({
      kind: 'knownTarokkSet',
      value: [20],
      probability: 1,
      guaranteed: true,
      evidence: [
        'XVIII-as invit esetén a Trull utáni négykirály a XX-ast jelzi, mert az invit már ismertté tette a XVIII-at.'
      ],
      confidence: 'rule',
    });
  }

  // The inviter's FOLLOW-UP action carries the missing information.  If the
  // inviter has XIX after an XVIII invite and the partner's Four Kings has
  // identified XX, the inviter can continue with Centrum because the known XX
  // is the required fifth-trick hitter.  Therefore a subsequent ordinary
  // pass/other non-Centrum declaration by the inviter is the informative
  // negative signal: XIX is not in the inviter's hand.  This is deliberately
  // evaluated only after the inviter has had the opportunity to speak; the
  // Four Kings itself does not create the negative inference.
  if (
    context.invitedTarokk === 18 &&
    (previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) &&
    previous.includes('fourKings') &&
    context.speakerId !== undefined &&
    context.speakerDeclarations !== undefined
  ) {
    const inviter = context.speakerId;
    const inviterEvents = context.events?.filter(event => event.speakerId === inviter) ?? [];
    const inviterHasCentrum = inviterEvents.some(event => event.declaration === 'centrum') || ownPrevious.includes('centrum');
    const inviterHasDouble = inviterEvents.some(event => event.declaration === 'doubleGame') || ownPrevious.includes('doubleGame');
    const inviterHasKismadar = inviterEvents.some(event => event.declaration === 'kismadar') || ownPrevious.includes('kismadar');
    const inviterHasNagymadar = inviterEvents.some(event => event.declaration === 'nagymadar') || ownPrevious.includes('nagymadar');
    const hasFollowUp = inviterEvents.length > 0 &&
      inviterEvents.some(event => ['centrum', 'doubleGame', 'kismadar', 'nagymadar'].includes(event.declaration));
    const inviterHadExplicitOpportunity = hasFollowUp || context.passedAfterChain === true;

    // The key inference is created by the INVITER'S omission of Centrum after
    // the partner has identified XX.  The XVIII invite itself does not exclude
    // XIX.  Once XX is publicly identified, however, an inviter holding XIX
    // has the communication path to Centrum; choosing another follow-up (or
    // explicitly passing) therefore supplies negative information about XIX.
    if (inviterHadExplicitOpportunity && !inviterHasCentrum && !inviterHasKismadar && !inviterHasNagymadar) {
      const followUp = inviterHasDouble
        ? 'Dupla'
        : context.passedAfterChain
          ? 'passz'
          : 'más bemondás';
      out.push({
        kind: 'negativeInformation',
        value: 'Az XVIII-as invitáló kezében nincs XIX.',
        excludedTarokkRanks: [19],
        subject: 'speaker',
        probability: 1,
        guaranteed: true,
        evidence: [
          'Az XVIII-as invit önmagában még nem bizonyítja a XIX hiányát.',
          'A partner Négykirálya ebben a helyzetben a XX-ast azonosította.',
          `Az invitáló ezután ${followUp} irányba ment Centrum nélkül; ha nála lenne a XIX, a már kommunikált XX-szal a Centrum lenne a következő információs lépcső.`,
          'A negatív információ tehát az elmaradt Centrum reakcióból keletkezik, nem magából az XVIII-invitből.'
        ],
        confidence: 'rule',
      });
    }

    // If the inviter did use Centrum, that is the positive XIX branch of the
    // same decision tree.  The omission above is therefore deliberately not
    // inferred until the inviter has actually had a known opportunity to react.

    // Specific follow-up figure meanings after the partner's XX signal.
    if (inviterHasDouble && !inviterHasKismadar && !inviterHasNagymadar) {
      out.push({
        kind: 'speakerOwnTarokkSet',
        value: [17],
        probability: 1,
        guaranteed: true,
        evidence: [
          'Az XVIII-as invitáló partnerének XX-jelzése után a Dupla a következő magas tarokkot, a XVII-et jelzi.'
        ],
        confidence: 'rule',
      });
    }

    if (inviterHasKismadar) {
      out.push({
        kind: 'speakerOwnTarokkSet',
        value: [19, 17, 21],
        probability: 1,
        guaranteed: true,
        evidence: [
          'Az XVIII-as invit után a Kismadár nem a XIX alternatívája: a már felépült Centrum-szcenárióra épül.',
          'Ebben a láncban a XIX is szükséges; a Kismadár ehhez képest a XVII-et és a XXI-et, valamint legalább hat tarokkos erőt kommunikál.'
        ],
        confidence: 'rule',
      });
      out.push({
        kind: 'tarokkCountAtLeast',
        value: 6,
        probability: 1,
        guaranteed: true,
        evidence: [
          'A Kismadár a Centrum fölötti következő figura: a kommunikáció legalább hat tarokkos szerkezetet feltételez.'
        ],
        confidence: 'rule',
      });
    }

    if (inviterHasNagymadar) {
      out.push({
        kind: 'speakerOwnTarokkSet',
        value: [19, 17, 16, 22],
        probability: 1,
        guaranteed: true,
        evidence: [
          'Az XVIII-as invit után a Nagymadár a már felépült Centrum-szcenárióra épül, ezért a XIX itt is része a kommunikált szerkezetnek.',
          'A Nagymadár ezen felül XVII + XVI + Skíz magas-tarokk szerkezetet és legalább hét tarokkot kommunikál.'
        ],
        confidence: 'rule',
      });
      out.push({
        kind: 'tarokkCountAtLeast',
        value: 7,
        probability: 1,
        guaranteed: true,
        evidence: [
          'A Nagymadár a Kismadár fölötti figura: a kommunikáció legalább hét tarokkos szerkezetet feltételez.'
        ],
        confidence: 'rule',
      });
    }

    // A declaration that could have been made but was not made is itself
    // information.  Importantly, omission does not identify which individual
    // prerequisite is missing: it says that at least one member of the
    // figure's prerequisite set is not established.  This avoids the earlier
    // mistake of turning a missing Kismadár into a definite "no XXI" claim.
    if (inviterHasCentrum && !inviterHasKismadar && (context.passedAfterChain === true || context.speakerDeclarations !== undefined)) {
      out.push({
        kind: 'negativeInformation',
        value: 'A Kismadár legalább egy feltétele nem áll fenn az invitálónál.',
        subject: 'speaker',
        unmetPrerequisites: [
          'legalább 6 tarokk',
          'XXI a megfelelő oldalon',
          'a 6. ütés szükséges megnyerési szerkezete',
          'a figura vállalhatósága a kommunikációs helyzetben'
        ],
        evidence: [
          'Az invitáló a Centrumot már bemondta, de a további Kismadár-lépcsőt nem mondta be.',
          'A be nem mondás azt közli, hogy a Kismadár feltételhalmazából legalább egy elem nem áll fenn vagy nem vállalható.',
          'Nem döntjük el, melyik feltétel hiányzik: a későbbi játék vagy további bemondás adhat csak további bizonyítékot.'
        ],
        confidence: 'rule',
      });
    }

    if (inviterHasKismadar && !inviterHasNagymadar && (context.passedAfterChain === true || context.speakerDeclarations !== undefined)) {
      out.push({
        kind: 'negativeInformation',
        value: 'A Nagymadár legalább egy feltétele nem áll fenn az invitálónál.',
        subject: 'speaker',
        unmetPrerequisites: [
          'legalább 7 tarokk',
          'XVI a megfelelő oldalon',
          'Skíz a megfelelő oldalon',
          'a 7. ütés szükséges megnyerési szerkezete',
          'a figura vállalhatósága a kommunikációs helyzetben'
        ],
        evidence: [
          'Az invitáló a Kismadarat már bemondta, de a további Nagymadár-lépcsőt nem mondta be.',
          'A be nem mondás azt jelzi, hogy a Nagymadár feltételhalmazából legalább egy elem nem áll fenn vagy nem vállalható.',
          'Nem döntjük el, melyik feltétel hiányzik.'
        ],
        confidence: 'rule',
      });
    }
  }

  // Generic nested-figure omission: when the speaker has actually declared
  // Centrum/Kismadár but not the next rung, preserve the disjunctive negative
  // information even when the context did not carry the older XVIII-invite
  // marker. The omission says that at least one prerequisite is unavailable
  // or not safely vállalható; it does not identify a single missing card.
  if (ownPrevious.includes('centrum') && !ownPrevious.includes('kismadar') &&
      context.passedAfterChain === true) {
    out.push({
      kind: 'negativeInformation',
      value: 'A Kismadár legalább egy feltétele nem áll fenn az invitálónál.',
      subject: 'speaker',
      unmetPrerequisites: [
        'legalább 6 tarokk',
        'XXI a megfelelő oldalon',
        'a 6. ütés szükséges megnyerési szerkezete',
        'a figura vállalhatósága'
      ],
      evidence: [
        'A Centrum után a következő Kismadár-lépcső elmaradt.',
        'A be nem mondás csak azt közli, hogy legalább egy Kismadár-feltétel nem áll fenn vagy nem vállalható.',
        'Nem azonosítjuk, melyik egyedi feltétel hiányzik.'
      ],
      confidence: 'rule',
    });
  }
  if (ownPrevious.includes('kismadar') && !ownPrevious.includes('nagymadar') &&
      context.passedAfterChain === true) {
    out.push({
      kind: 'negativeInformation',
      value: 'A Nagymadár legalább egy feltétele nem áll fenn az invitálónál.',
      subject: 'speaker',
      unmetPrerequisites: [
        'legalább 7 tarokk',
        'XVI a megfelelő oldalon',
        'Skíz a megfelelő oldalon',
        'a 7. ütés szükséges megnyerési szerkezete',
        'a figura vállalhatósága'
      ],
      evidence: [
        'A Kismadár után a következő Nagymadár-lépcső elmaradt.',
        'A be nem mondás legalább egy Nagymadár-feltétel hiányát vagy vállalhatatlanságát jelzi.',
        'Nem azonosítjuk, melyik egyedi feltétel hiányzik.'
      ],
      confidence: 'rule',
    });
  }

  // Trull + four kings also communicates substantial tarokk strength. In
  // ordinary practice the Centrum convention points to at least five tarokks;
  // very strong starters can exceptionally make the same communication with
  // four tarokks, so this is an inference, not a hard card-count fact.
  if ((previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) && ownPrevious.includes('fourKings')) {
    out.push({
      kind: 'tarokkCountAtLeast',
      value: 5,
      evidence: [
        'A Trull utáni négykirály magas-tarokk jelzésként működik; a Trullt mondhatta a beszélő vagy a partnere is.',
        'A kapcsolódó Centrum-erősséghez a gyakorlati konvenció szerint legalább öt tarokk az alaphelyzet; a rendkívüli kivétel négy tarokkal is előfordulhat.',
        'Ritka kivételként nagyon erős induló négy tarokkal is vállalhat ilyen kommunikációt; ezért az AI ezt valószínűségi következtetésként kezeli. A jelzés tehát nem kizárólag az öt tarokkból indulhat ki.',
      ],
      confidence: 'convention',
    });
  }

  // Trull followed by a missing Four Kings may itself be useful negative
  // communication at an explicit declaration checkpoint, but it remains soft.
  if ((previous.includes('tuletroa') || ownPrevious.includes('tuletroa'))
      && !previous.includes('fourKings') && !ownPrevious.includes('fourKings')) {
    out.push({
      kind: 'negativeInformation',
      value: 'A Trull után a négykirály elmaradása negatív kommunikációs jelzés.',
      probability: 0.5,
      guaranteed: false,
      evidence: [
        'A négykirály a Trull után tipikusan konkrét magas-tarokk kommunikációt hordoz.',
        'Az elmaradás ezért jelezhet változó kommunikációs szándékot, de nem azonosít konkrét hiányzó lapot.'
      ],
      confidence: 'inference',
    });
  }

  // Trull + Double without Four Kings: negative XIX information plus
  // general encouragement. This must never manufacture an XVIII card signal.
  if (
    (previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) &&
    ownPrevious.includes('doubleGame') &&
    !previous.includes('fourKings') &&
    !ownPrevious.includes('fourKings')
  ) {
    out.push({
      kind: 'negativeInformation',
      value: 'A bemondó nem XIX-et kommunikál.',
      probability: 1,
      guaranteed: true,
      evidence: [
        'Trull után a négykirály hordozza a legmagasabb ismeretlen tarokk konkrét jelzését.',
        'A Dupla négykirály nélkül ezért nem értelmezhető XVIII-jelzésként.',
        'A jelzés szándékosan a négykirályos kártyajelzésen kívül marad.'
      ],
      confidence: 'rule',
    });
    out.push({
      kind: 'encouragement',
      value: 'erős lap / további figura',
      evidence: [
        'Trull utáni Dupla négykirály nélkül erős lapot és további figura bemondására való bíztatást közöl.',
        'A lehetséges célok között hagyományos négykirály, ulti, uhu és volát is lehet.'
      ],
      confidence: 'convention',
    });
  }

  // Trull -> four kings -> Double without an intervening Centrum is a
  // stronger negative communication than the generic 'not XIX' statement:
  // in this chain the pair is saying that it cannot make the normal Centrum
  // and cannot use the lyukas-Centrum route either.  The exact reason (bad
  // seating, missing XVII in the closing seat, or both) is intentionally not
  // inferred unless the engine supplies those facts explicitly.
  if (
    previous.includes('tuletroa') &&
    ownPrevious.includes('fourKings') &&
    ownPrevious.includes('doubleGame') &&
    !ownPrevious.includes('centrum') &&
    !previous.includes('centrum')
  ) {
    out.push({
      kind: 'negativeInformation',
      value: 'A párnál nincs XVIII, és a lyukas Centrum sem játszható.',
      probability: 1,
      guaranteed: true,
      evidence: [
        'Trull + négykirály után a Dupla Centrum nélkül nem a következő tarokk jelzése.',
        'A kommunikáció ebben a láncban azt jelzi, hogy a Centrum normál és lyukas formája sem áll rendelkezésre.',
        'A pontos okot a rendszer nem találja ki: lehet üléshelyzet, a kör végén ülő XVII-jének hiánya, vagy mindkettő.'
      ],
      confidence: 'rule',
    });
    out.push({
      kind: 'encouragement',
      value: 'további nagy bemondás (uhu / ulti / volát / hagyományos négykirály)',
      evidence: [
        'A Dupla itt hagyományos erősségi bemondás és bíztatás.',
        'A kommunikáció nem rendel hozzá konkrét XVIII, XVII vagy XVI lapot.'
      ],
      confidence: 'convention',
    });
  }

  // General descending chain: after Trull -> four kings the next figure
  // announcement identifies the next still-unknown tarokk. Thus a Centrum
  // after a first XIX signal points to XVIII (or XVII in the special olló
  // geometry), and the subsequent Dupla points to XVII (or XVI if Kismadár
  // has already identified XXI). This is communication, not blind ownership.
  if (
    (previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) &&
    previous.includes('fourKings') &&
    (ownPrevious.includes('centrum') || previous.includes('centrum'))
  ) {
    const hasPriorFourKings = previous.slice(0, previous.lastIndexOf('fourKings')).includes('fourKings') || ownPrevious.slice(0, ownPrevious.lastIndexOf('fourKings')).includes('fourKings');
    const explicitLyukas = context.lastSeatHasXVIIAndUnboundHigherTarokk === true;
    const signal = hasPriorFourKings ? 17 : (explicitLyukas ? 17 : 18);
    out.push({
      kind: 'speakerOwnTarokkSet',
      value: [signal],
      probability: 1,
      guaranteed: true,
      evidence: [
        `Trull + négykirály után a Centrum a következő ismeretlen magas tarokkot jelzi: ${signal}.`
      ],
      confidence: 'rule',
    });
  }

  if (
    (previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) &&
    previous.includes('fourKings') &&
    ownPrevious.includes('centrum') &&
    ownPrevious.includes('doubleGame')
  ) {
    const resolved = resolveBirdCommunicationTarget({
      centrumDeclared: true,
      kismadarDeclared: ownPrevious.includes('kismadar'),
      nagymadarDeclared: ownPrevious.includes('nagymadar'),
      ...(context.speakerIsLastSeat === undefined ? {} : { speakerIsLastSeat: context.speakerIsLastSeat }),
      ...(context.speakerHasHigherUnboundTarokk === undefined ? {} : { speakerHasHigherUnboundTarokk: context.speakerHasHigherUnboundTarokk }),
    });
    if (resolved.encouragement || resolved.signalledTarokk === undefined) {
      out.push({
        kind: 'encouragement',
        value: 'további figura (elsősorban Volát, esetleg Uhu/Ultimó)',
        evidence: [
          'A Nagymadár után a Centrum–Kismadár–Nagymadár kommunikációs létra kimerült; a Dupla nem jelez újabb tarokkot.'
        ],
        confidence: 'convention',
      });
    } else {
      out.push({
        kind: 'speakerOwnTarokkSet',
        value: [resolved.signalledTarokk],
        probability: 1,
        guaranteed: true,
        evidence: [
          resolved.hole
            ? `A Dupla a ${resolved.targetFigure === 'kismadar' ? 'Kismadár' : 'Nagymadár'} következő bemondhatóságát készíti elő egy lépcsővel alacsonyabb, még szabad tarokkal: ${resolved.signalledTarokk}.`
            : `A Dupla a következő figura (${resolved.targetFigure === 'kismadar' ? 'Kismadár' : 'Nagymadár'}) jelzéséhez szükséges tarokkot közli: ${resolved.signalledTarokk}.`
        ],
        confidence: 'rule',
      });
    }
  }

  // XX + Trull + four-kings establishes XIX. When the Trull speaker then
  // announces Centrum, the specialist literature gives the remaining Centrum
  // communication explicitly: normally XVIII + 5+ tarokks; in the special
  // last-seat/olló geometry XVII can be sufficient because of the forced
  // interception sequence.
  if (
    context.calledTarokk === 20 &&
    (previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) &&
    previous.includes('fourKings') &&
    ownPrevious.includes('centrum')
  ) {
    // Do not treat a bare 'last seat' or a generic olló label as sufficient
    // proof of the lyukas-Centrum route. The actual game state must provide
    // the explicit XVII + unbound-higher-tarokk condition.
    const ollosXVII = context.lastSeatHasXVIIAndUnboundHigherTarokk === true;
    out.push({
      kind: 'speakerOwnTarokkSet',
      value: [ollosXVII ? 17 : 18],
      probability: 1,
      guaranteed: true,
      evidence: [
        ollosXVII
          ? 'XX + Trull + négykirály után a kör végén/ollóban mondott Centrum a XVII-es magas-tarokk szerkezetet jelzi.'
          : 'XX + Trull + négykirály után a Trullt mondó fél Centrumja a XVIII-as magas-tarokk szerkezetet jelzi.'
      ],
      confidence: 'rule',
    });
    out.push({
      kind: 'tarokkCountAtLeast',
      value: 5,
      probability: 0.98,
      evidence: [
        'A Centrum kommunikációja normál helyzetben legalább öt tarokkos erőt jelent; a különleges ülés a szükséges ütési szerkezetet módosíthatja.'
      ],
      confidence: 'rule',
    });
  }

  // Specific partner-communication chain: Trull -> four kings -> Centrum
  // -> double game -> pass.  In the practical convention described by the user,
  // this is a strong way for the speaker to tell the partner: XVIII + XVII are
  // with me, I have at least five tarokks, and XXI is NOT with me; therefore the
  // partner is being invited to consider Kismadár.  The absence of XXI is an
  // inference from the communicative purpose, not a formal ownership fact.
  if (
    previous.includes('tuletroa') &&
    ownPrevious.includes('fourKings') &&
    ownPrevious.includes('centrum') &&
    ownPrevious.includes('doubleGame') &&
    context.passedAfterChain === true
  ) {
    out.push({
      kind: 'tarokkCountAtLeast',
      value: 5,
      evidence: [
        'Trull + négy király után Centrum, majd duplajáték: a bemondó a saját XVIII–XVII szerkezetét és legalább öt tarokkos erejét kommunikálja.',
        'A sorozat a partner Kismadár-bemondását ösztönzi.'
      ],
      confidence: 'inference',
    });
    out.push({
      kind: 'speakerOwnTarokkSet',
      value: [18, 17],
      evidence: [
        'A Centrum + duplajáték ebben a teljes kommunikációs láncban XVIII + XVII jelenlétére utal a bemondónál.'
      ],
      confidence: 'inference',
    });
    out.push({
      kind: 'negativeInformation',
      value: 'A bemondó a XXI-et ebben a kommunikációs mintában nem jelzi magánál; a partner Kismadárját ösztönzi.',
      evidence: [
        'A Centrum + dupla + passz nem a saját XXI-fogás felé mutató alapértelmezett kommunikáció, hanem a partner Kismadár-bemondásának megnyitása.'
      ],
      confidence: 'inference',
    });
    out.push({
      kind: 'encouragement',
      value: 'Kismadár',
      evidence: [
        'A bemondó a XXI hiányát kommunikálva arra bíztatja partnerét, hogy ha nála van a XXI, mondjon Kismadarat.'
      ],
      confidence: 'inference',
    });
  }

  // Rare alternative: if the speaker actually has XXI, the same sequence is
  // no longer the normal Kismadár invitation.  Treat it as an exceptional
  // strong structure: XXI + XVIII + three smaller tarokks, with an optional
  // additional clue when the partner has already announced 8 tarokks.
  if (
    previous.includes('tuletroa') &&
    ownPrevious.includes('fourKings') &&
    ownPrevious.includes('centrum') &&
    ownPrevious.includes('doubleGame') &&
    context.passedAfterChain === true &&
    (context.speakerHasXXI === true || ownPrevious.includes('xxiFogas'))
  ) {
    out.push({
      kind: 'speakerOwnTarokkSet',
      value: [21, 18],
      evidence: [
        'Ritka alternatív értelmezés: a bemondónál a XXI is lehet; ekkor a Centrum + dupla szerkezetet XXI + XVIII + három kisebb tarokk erős struktúrájaként kell kezelni.'
      ],
      confidence: 'inference',
    });
    if (context.partnerHasDeclaredEightTarokk) {
      out.push({
        kind: 'negativeInformation',
        value: 'A partner 8 tarokkos bemondása mellett a ritka XXI + XVIII + három kisebb tarokk szerkezetnek lehet kommunikációs értelme.',
        evidence: [
          'A partner 8 tarokkos információja megerősítheti a ritka alternatív szerkezetet.'
        ],
        confidence: 'inference',
      });
    }
  }

  return out;
}

export function nextCommunicationSignal(context: CommunicationContext | DeclarationType[]): SignalTarokk | undefined {
  const normalized: CommunicationContext = Array.isArray(context) ? { previous: context } : context;
  const ownPrevious = normalized.speakerDeclarations ?? normalized.previous;
  if (normalized.previous.includes('tuletroa') &&
      normalized.invitedTarokk === 19 &&
      normalized.calledTarokk === undefined &&
      !normalized.previous.includes('fourKings')) {
    return 19;
  }
  if (ownPrevious.includes('centrum') && ownPrevious.includes('doubleGame')) {
    // After Nagymadár the ladder is exhausted; Dupla is encouragement again.
    if (ownPrevious.includes('nagymadar')) return undefined;
    return nextUnidentifiedAfterFigures(normalized);
  }
  if ((normalized.previous.includes('tuletroa') || ownPrevious.includes('tuletroa')) && ownPrevious.includes('fourKings')) {
    // Trull + four kings + Double without Centrum is encouragement only.
    if (ownPrevious.includes('doubleGame') && !ownPrevious.includes('centrum') && !normalized.previous.includes('centrum')) return undefined;
    return fourKingsSignal({ ...normalized, previous: normalized.previous });
  }
  return undefined;
}
