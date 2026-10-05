import { SignalTarokk, CommunicationContext, PartnerInference, inferPartnerInformation, communicationSignalFor } from './signals.js';
import { TargetFigure } from './figureTargets.js';

export type EvidenceKind = 'formal' | 'convention' | 'inference' | 'negative';

export interface BeliefEvidence {
  id: string;
  kind: EvidenceKind;
  statement: string;
  weight: number;
  source: string;
}

export interface TarokkBelief {
  rank: SignalTarokk;
  score: number;
  evidence: BeliefEvidence[];
}

export interface PartnerBeliefState {
  tarokkCountAtLeast: number;
  tarokkCountScore: number;
  likelyTarokks: TarokkBelief[];
  possibleFigures: Record<string, number>;
  positionHints: string[];
  encouragementScore: number;
  targetFigureInvitations: Record<TargetFigure, number>;
  speakerOwnHighTarokks: SignalTarokk[];
  evidence: BeliefEvidence[];
}

const HIGH_TAROKKS: SignalTarokk[] = [22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2];

export function createPartnerBeliefState(): PartnerBeliefState {
  return {
    tarokkCountAtLeast: 0,
    tarokkCountScore: 0,
    likelyTarokks: HIGH_TAROKKS.map(rank => ({ rank, score: 0, evidence: [] })),
    possibleFigures: {},
    positionHints: [],
    encouragementScore: 0,
    targetFigureInvitations: { centrum: 0, kismadar: 0, nagymadar: 0 },
    speakerOwnHighTarokks: [],
    evidence: [],
  };
}

/**
 * Apply communication evidence without turning a convention into a hard fact.
 * Scores are deliberately relative rather than probabilities; the future AI
 * can calibrate them once card/play evidence is available.
 */
export function updatePartnerBelief(state: PartnerBeliefState, context: CommunicationContext): PartnerBeliefState {
  const next = cloneState(state);
  const inferences = inferPartnerInformation(context);

  for (const inference of inferences) applyInference(next, inference);

  const signal = (context.previous.includes('tuletroa') || context.speakerDeclarations?.includes('tuletroa')) &&
      (context.previous.includes('fourKings') || context.speakerDeclarations?.includes('fourKings'))
    ? communicationSignalForChain({ ...context, previous: context.previous }, 'fourKings')?.signalledTarokk
    : undefined;
  if (signal !== undefined) {
    addTarokkEvidence(next, signal, {
      id: `trull-four-kings-${signal}`,
      kind: 'convention',
      statement: `Trull után négykirály: a legmagasabb még ismeretlen tarokk jelzése (${signal}).`,
      weight: 8,
      source: 'ITVB 4.3 / gyakorlati kommunikáció',
    });
  }

  if (context.previous.includes('fourKings') && !context.previous.includes('tuletroa')) {
    next.encouragementScore += 5;
    addEvidence(next, {
      id: 'four-kings-encouragement',
      kind: 'convention',
      statement: 'Trull nélküli négy király általános bíztatás.',
      weight: 5,
      source: 'gyakorlati konvenció',
    });
    for (const figure of ['pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu', 'kingUltimo', 'kingUhu', 'doubleGame']) {
      next.possibleFigures[figure] = (next.possibleFigures[figure] ?? 0) + 2;
    }
  }

  return next;
}

function applyInference(state: PartnerBeliefState, inference: PartnerInference): void {
  switch (inference.kind) {
    case 'tarokkCountAtLeast': {
      const n = Number(inference.value);
      if (Number.isFinite(n)) {
        state.tarokkCountAtLeast = Math.max(state.tarokkCountAtLeast, n);
        state.tarokkCountScore += inference.confidence === 'convention' ? 6 : 4;
      }
      break;
    }
    case 'knownTarokkSet': {
      for (const rank of inference.value as SignalTarokk[]) {
        addTarokkEvidence(state, rank, {
          id: `inference-known-${rank}`,
          kind: 'inference',
          statement: inference.evidence.join(' '),
          weight: 3,
          source: 'partner inference',
        });
      }
      break;
    }
    case 'speakerOwnTarokkSet': {
      // This is deliberately not added to partner ownership beliefs: the
      // declaration chain is communicating the SPEAKER'S own hand. Keep the
      // evidence on the state so the future AI can reason about what the
      // speaker is offering to the partner without misassigning cards.
      addEvidence(state, {
        id: `speaker-own-hand-${state.evidence.length}`,
        kind: 'inference',
        statement: `A bemondó saját magas tarokkstruktúrája: ${(inference.value as SignalTarokk[]).join(', ')}.`,
        weight: 5,
        source: 'speaker-hand communication',
      });
      break;
    }
    case 'encouragement':
      state.encouragementScore += 4;
      break;
    case 'partnerPositionHint':
      state.positionHints.push(String(inference.value));
      break;
    case 'negativeInformation':
      addEvidence(state, {
        id: `negative-${state.evidence.length}`,
        kind: 'negative',
        statement: String(inference.value),
        weight: 2,
        source: 'declaration omission',
      });
      break;
  }

  for (const evidenceText of inference.evidence) {
    addEvidence(state, {
      id: `inference-${state.evidence.length}`,
      kind: inference.confidence === 'inference' ? 'inference' : (inference.confidence === 'rule' ? 'formal' : 'convention'),
      statement: evidenceText,
      weight: 1,
      source: 'communication inference',
    });
  }
}

function addTarokkEvidence(state: PartnerBeliefState, rank: SignalTarokk, evidence: BeliefEvidence): void {
  const target = state.likelyTarokks.find(x => x.rank === rank);
  if (!target) return;
  target.score += evidence.weight;
  target.evidence.push(evidence);
}

function addEvidence(state: PartnerBeliefState, evidence: BeliefEvidence): void {
  state.evidence.push(evidence);
}

function cloneState(state: PartnerBeliefState): PartnerBeliefState {
  return JSON.parse(JSON.stringify(state)) as PartnerBeliefState;
}

/** Apply a declaration-chain event to an existing partner belief.
 *  This is intentionally additive: later declarations refine earlier evidence
 *  instead of replacing it.  It is a communication model, not card ownership.
 */
export function applyDeclarationChain(
  state: PartnerBeliefState,
  context: CommunicationContext,
  declaration: import('./declarations.js').DeclarationType,
): PartnerBeliefState {
  const next = cloneState(state);
  const chain = [...context.previous, declaration];

  const signal = communicationSignalForChain({ ...context, previous: chain }, declaration);
  if (signal?.signalledTarokk !== undefined) {
    addTarokkEvidence(next, signal.signalledTarokk, {
      id: `chain-signal-${signal.signalledTarokk}-${next.evidence.length}`,
      kind: signal.confidence === 'rule' ? 'formal' : signal.confidence,
      statement: signal.reason,
      weight: signal.confidence === 'convention' ? 8 : 5,
      source: 'declaration chain',
    });
  }

  // Centrum after a XIX communication narrows the high-tarokk picture. The
  // user-facing interpretation is deliberately probabilistic: the cards are
  // not asserted to be in one hand merely because the sequence occurred.
  if (declaration === 'centrum') {
    const hasXixSignal = next.likelyTarokks.find(x => x.rank === 19)?.score ?? 0;
    if (hasXixSignal > 0) {
      for (const rank of [18, 17] as SignalTarokk[]) {
        addTarokkEvidence(next, rank, {
          id: `centrum-after-xix-${rank}-${next.evidence.length}`,
          kind: 'inference',
          statement: 'A XIX-kommunikáció után a Centrum további magas-tarokk szerkezetre utal; a pontos birtoklás nem bizonyított.',
          weight: 3,
          source: 'partner communication inference',
        });
      }
      addEvidence(next, {
        id: `centrum-chain-${next.evidence.length}`,
        kind: 'inference',
        statement: 'XIX + Centrum: a korábbi XIX-jelzésre épülő további magas-tarokk információ; a következő jelzés értéke a teljes sorrendtől függ.',
        weight: 3,
        source: 'declaration chain',
      });
    }
  }

  // Centrum followed by double game is a specific next-high-tarokk convention
  // in the communication model. Keep it as a convention rather than a fact.
  if (declaration === 'doubleGame' && chain.includes('centrum')) {
    addEvidence(next, {
      id: `double-after-centrum-evidence-${next.evidence.length}`,
      kind: 'convention',
      statement: 'Centrum után duplajáték: XVII-es további magas-tarokk jelzésként értelmezhető.',
      weight: 7,
      source: 'ITVB 4.4 / gyakorlati kommunikáció',
    });
    addTarokkEvidence(next, 17, {
      id: `double-after-centrum-${next.evidence.length}`,
      kind: 'convention',
      statement: 'Centrum után duplajáték: XVII-es további magas-tarokk jelzésként értelmezhető.',
      weight: 7,
      source: 'ITVB 4.4 / gyakorlati kommunikáció',
    });
  }

  // The user-described chain is about the SPEAKER's own hand: after
  // Trull -> four kings -> Centrum -> double -> pass, the normal reading is
  // XVIII + XVII + at least five tarokks, with XXI left for the partner to
  // consider as Kismadár. Keep that as speaker-side evidence, not partner
  // ownership. If the speaker is known to hold XXI, retain the rare alternative
  // instead of treating it as a contradiction.
  if (
    chain.includes('tuletroa') &&
    chain.includes('fourKings') &&
    chain.includes('centrum') &&
    chain.includes('doubleGame') &&
    context.passedAfterChain === true
  ) {
    next.speakerOwnHighTarokks = Array.from(new Set<SignalTarokk>([...next.speakerOwnHighTarokks, 18, 17])).sort((a,b) => b-a);
    next.evidence.push({
      id: `speaker-structure-${next.evidence.length}`,
      kind: 'inference',
      statement: context.speakerHasXXI === true
        ? 'Ritka alternatíva: XXI + XVIII + három kisebb tarokk; a partner 8 tarokkos jelzése ezt az értelmezést erősítheti.'
        : 'Alapértelmezett partneri jelzés: a bemondónál XVIII + XVII és legalább 5 tarokk; a XXI-et a partner Kismadár-bemondására hagyja.',
      weight: context.speakerHasXXI === true ? 4 : 8,
      source: 'összetett partneri kommunikáció',
    });
    next.targetFigureInvitations.kismadar += context.speakerHasXXI === true ? 1 : 8;
  }

  return next;
}

function communicationSignalForChain(
  context: CommunicationContext,
  declaration: import('./declarations.js').DeclarationType,
): import('./signals.js').CommunicationSignal | undefined {
  return communicationSignalFor(context, declaration);
}
