import { DeclarationType } from './declarations.js';
import { CommunicationContext, inferPartnerInformation } from './signals.js';

export type BeliefStrength = 'possible' | 'likely' | 'strong' | 'veryStrong';

export interface EvidenceItem {
  source: 'formalRule' | 'convention' | 'inference' | 'omission' | 'play';
  statement: string;
  weight: number;
}

export interface PartnerBelief {
  tarokk?: number;
  tarokkCountAtLeast?: number;
  figure?: 'centrum' | 'kismadar' | 'nagymadar' | 'pagatUltimo' | 'pagatUhu' | 'sasUltimo' | 'sasUhu' | 'kingUltimo' | 'kingUhu' | 'doubleGame' | 'volat' | 'xxiFogas';
  encouragement?: 'figure' | 'doubleGame' | 'xxiFogas';
  strength: BeliefStrength;
  score: number;
  evidence: EvidenceItem[];
  /** For omission-based evidence: at least one prerequisite in this set is unresolved. */
  unmetPrerequisites?: string[];
}


export interface PartnerBeliefState {
  /** Positive evidence that a particular tarokk is in the partner's hand. */
  tarokk: Record<number, PartnerBelief>;
  /** Evidence about the number of tarokks in the partner's hand. */
  tarokkCountAtLeast: Record<number, PartnerBelief>;
  /** Figure/contract intentions inferred from communication. */
  figures: Partial<Record<NonNullable<PartnerBelief['figure']>, PartnerBelief>>;
  encouragements: Partial<Record<NonNullable<PartnerBelief['encouragement']>, PartnerBelief>>;
  /** Explicit negative card evidence kept separate from positive ownership beliefs. */
  excludedTarokk: Record<number, PartnerBelief>;
}

export function emptyPartnerBeliefState(): PartnerBeliefState {
  return { tarokk: {}, tarokkCountAtLeast: {}, figures: {}, encouragements: {}, excludedTarokk: {} };
}

/**
 * Convert communication evidence into a small, explainable belief state.
 * Scores are deliberately not probabilities: they are evidence weights that
 * can later be combined with cards already seen, bidding and play history.
 */
export function updatePartnerBeliefs(
  state: PartnerBeliefState,
  context: CommunicationContext,
): PartnerBeliefState {
  const next: PartnerBeliefState = {
    tarokk: { ...state.tarokk },
    tarokkCountAtLeast: { ...state.tarokkCountAtLeast },
    figures: { ...state.figures },
    encouragements: { ...state.encouragements },
    excludedTarokk: { ...state.excludedTarokk },
  };

  const evidence = inferPartnerInformation(context);
  for (const item of evidence) {
    if (item.kind === 'tarokkCountAtLeast' && typeof item.value === 'number') {
      add(next.tarokkCountAtLeast, item.value, {
        source: item.confidence === 'rule' ? 'formalRule' : item.confidence,
        statement: item.evidence.join(' '),
        weight: item.confidence === 'convention' ? 3 : 2,
      }, item.confidence);
    }

    if (item.kind === 'knownTarokkSet' && Array.isArray(item.value)) {
      for (const rank of item.value) {
        add(next.tarokk, rank, {
          source: item.confidence === 'rule' ? 'formalRule' : 'inference',
          statement: item.evidence.join(' '),
          weight: item.guaranteed ? 100 : item.confidence === 'rule' ? 12 : 2,
        }, item.confidence);
      }
    }

    if (item.kind === 'negativeInformation' && item.excludedTarokkRanks?.length && (item.subject === undefined || item.subject === 'partner')) {
      for (const rank of item.excludedTarokkRanks) {
        addNegative(next.excludedTarokk, rank, {
          source: item.confidence === 'rule' ? 'formalRule' : item.confidence,
          statement: item.evidence.join(' '),
          weight: item.guaranteed ? -100 : item.confidence === 'convention' ? -6 : -3,
        }, item.confidence);
      }
    }

    if (item.kind === 'negativeInformation' && item.unmetPrerequisites?.length) {
      // Omission is not a card-level exclusion. Preserve it as evidence on the
      // figure/communication layer so the AI can keep multiple possible causes
      // alive instead of collapsing them into a false hard fact.
      const key = item.value === 'A Kismadár legalább egy feltétele nem áll fenn az invitálónál.'
        ? 'kismadar'
        : item.value === 'A Nagymadár legalább egy feltétele nem áll fenn az invitálónál.'
          ? 'nagymadar'
          : undefined;
      if (key) {
        const existing = next.figures[key];
        next.figures[key] = {
          ...existing,
          figure: key,
          strength: existing?.strength ?? 'likely',
          score: existing?.score ?? 0,
          evidence: [
            ...(existing?.evidence ?? []),
            {
              source: 'omission',
              statement: `${item.evidence.join(' ')} Lehetséges hiányok: ${item.unmetPrerequisites.join('; ')}.`,
              weight: -1,
            },
          ],
        };
      }
    }

    if (item.kind === 'encouragement') {
      addEncouragement(next, 'figure', {
        source: 'convention',
        statement: String(item.value),
        weight: 2,
      }, 'convention');
      addEncouragement(next, 'doubleGame', {
        source: 'convention',
        statement: String(item.value),
        weight: 2,
      }, 'convention');
    }
  }

  return next;
}

function add(
  target: Record<number, PartnerBelief>,
  key: number,
  evidence: EvidenceItem,
  confidence: 'rule' | 'convention' | 'inference',
): void {
  const previous = target[key];
  const score = (previous?.score ?? 0) + evidence.weight;
  target[key] = {
    ...previous,
    tarokk: key,
    strength: confidence === 'convention' && score < 6 ? 'likely' : strengthFor(score, confidence),
    score,
    evidence: [...(previous?.evidence ?? []), evidence],
  };
}

function addNegative(
  target: Record<number, PartnerBelief>,
  key: number,
  evidence: EvidenceItem,
  confidence: 'rule' | 'convention' | 'inference',
): void {
  const previous = target[key];
  const score = (previous?.score ?? 0) + evidence.weight;
  target[key] = {
    ...previous,
    tarokk: key,
    strength: 'veryStrong',
    score,
    evidence: [...(previous?.evidence ?? []), evidence],
  };
}

function addEncouragement(
  state: PartnerBeliefState,
  key: NonNullable<PartnerBelief['encouragement']>,
  evidence: EvidenceItem,
  confidence: 'rule' | 'convention' | 'inference',
): void {
  const previous = state.encouragements[key];
  const score = (previous?.score ?? 0) + evidence.weight;
  state.encouragements[key] = {
    ...previous,
    encouragement: key,
    strength: strengthFor(score, confidence),
    score,
    evidence: [...(previous?.evidence ?? []), evidence],
  };
}

function strengthFor(score: number, confidence: 'rule' | 'convention' | 'inference'): BeliefStrength {
  if (confidence === 'rule' && score >= 4) return 'veryStrong';
  if (score >= 6) return 'veryStrong';
  if (score >= 4) return 'strong';
  if (score >= 2) return 'likely';
  return 'possible';
}

/**
 * Apply an observed played card as hard negative evidence against ownership.
 * This is intentionally separate from declaration inference: seeing a card
 * played is stronger evidence than a communication convention.
 */
export function excludeObservedTarokk(
  state: PartnerBeliefState,
  tarokk: number,
  statement = `A ${tarokk}. tarokk már látható volt, ezért nem lehet a partner kezében.`,
): PartnerBeliefState {
  const next: PartnerBeliefState = {
    tarokk: { ...state.tarokk },
    tarokkCountAtLeast: { ...state.tarokkCountAtLeast },
    figures: { ...state.figures },
    encouragements: { ...state.encouragements },
    excludedTarokk: { ...state.excludedTarokk },
  };
  const previous = next.tarokk[tarokk];
  next.tarokk[tarokk] = {
    ...previous,
    tarokk,
    strength: 'possible',
    score: Math.min(previous?.score ?? 0, 0),
    evidence: [...(previous?.evidence ?? []), { source: 'play', statement, weight: -100 }],
  };
  return next;
}

/** Helper for a fresh communication pass. */
export function inferBeliefsFromDeclarations(
  declarations: DeclarationType[],
  extra: Omit<CommunicationContext, 'previous'> = {},
): PartnerBeliefState {
  return updatePartnerBeliefs(emptyPartnerBeliefState(), { ...extra, previous: declarations });
}
