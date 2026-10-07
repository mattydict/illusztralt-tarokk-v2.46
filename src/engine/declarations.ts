import { Card, isHonour, isTarokk } from './cards.js';
import { resolveBirdCommunicationTarget } from './figureCommunication.js';

export type DeclarationType =
  | 'tarokk8' | 'tarokk9' | 'tuletroa' | 'fourKings' | 'doubleGame' | 'volat'
  | 'pagatUltimo' | 'sasUltimo' | 'kingUltimo' | 'pagatUhu' | 'sasUhu' | 'kingUhu'
  | 'centrum' | 'kismadar' | 'nagymadar' | 'xxiFogas';

export interface DeclarationOption {
  type: DeclarationType;
  required: boolean;
  reason?: string;
}

export interface DeclarationContext {
  isTaker: boolean;
  invited?: boolean;
  invitedTarokk?: 18 | 19 | 20;
  contract?: 'three' | 'two' | 'one' | 'solo';
  firstRound: boolean;
  previousDeclarations: DeclarationType[];
  /** Figure types already declared by the speaker's pair; used only for UI availability. */
  pairDeclaredTypes?: DeclarationType[];
  /** Whether the player's partner has become unambiguous. */
  partnersKnown: boolean;
  /** Speaker's own side, as inferred from their private information. */
  speakerIsDefence?: boolean;
  /** Whether the speaker's side is publicly identifiable to the table. */
  speakerRolePubliclyKnown?: boolean;
  /** AI-only planning hint: lets the AI consider Four Kings, then identify itself with a contra first. */
  allowHiddenDefenceFourKings?: boolean;
  /** True when this player is the invited/partner side rather than the taker. */
  isPartner?: boolean;
  /** If the taker explicitly called a tarokk, this is the called card. */
  calledTarokk?: 18 | 19 | 20;
  /** Tarokk-count announcement already made by this player in this declaration window. */
  announcedTarokkCount?: 8 | 9;
  /** Pair-level information used to evaluate Centrum/Kismadár/Nagymadár. Trull is communication context, not a formal prerequisite. */
  partnerHand?: Card[];
  trullDeclared?: boolean;
  /** Rare taker-led exception where Trull is deliberately omitted. */
  trullOmittedByTaker?: boolean;
  seatContext?: 'standard' | 'lyukasCentrum' | 'special';
  lastSeatHasXVIIAndUnboundHigherTarokk?: boolean;
  /** Soft strategic context supplied by the auction/belief layer. 0..10. */
  xxiThreatScore?: number;
  /** Soft estimate that the speaker is the Skíz-side player. 0..10. */
  skizCapturePressure?: number;
  /** Soft estimate of partner's tarokk length when this is a partner signal. */
  partnerTarokkCount?: number;
  /** Communication geometry for the specialist XX-Trull-Centrum chain. */
  speakerIsLastSeat?: boolean;
  /** Higher tarokk remains unbound; together with last-seat geometry this enables a lyukas bird signal. */
  speakerHasHigherUnboundTarokk?: boolean;
  /** True when the speaker explicitly passed after completing an information chain. */
  passedAfterChain?: boolean;
  ollosPosition?: boolean;
}

export function tarokkCount(hand: Card[]): number { return hand.filter(isTarokk).length; }
export function hasTarokk(hand: Card[], rank: number): boolean { return hand.some(c => c.kind === 'tarokk' && c.rank === rank); }
export function hasBigHonour(hand: Card[]): boolean { return hasTarokk(hand, 21) || hasTarokk(hand, 22); }
export function kingCount(hand: Card[]): number { return hand.filter(c => c.kind === 'suit' && c.rank === 'K').length; }

/**
 * Returns declarations that can legally be offered in the current declaration window.
 * It deliberately does not claim that a declaration will succeed; success is evaluated
 * from the completed tricks.
 */
export function availableDeclarations(hand: Card[], context: DeclarationContext): DeclarationOption[] {
  const previous = new Set(context.previousDeclarations);
  const pairDeclared = new Set(context.pairDeclaredTypes ?? []);
  const result: DeclarationOption[] = [];
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
    if (t === 8) result.push({ type: 'tarokk8', required: false });
    else if (t >= 9) result.push({ type: 'tarokk9', required: false });
  }

  if (!previous.has('volat')) {
    result.push({ type: 'tuletroa', required: false });
    const hiddenDefence = context.speakerIsDefence === true && context.speakerRolePubliclyKnown !== true && context.allowHiddenDefenceFourKings !== true;
    if (!hiddenDefence) result.push({ type: 'fourKings', required: false });
    result.push({ type: 'doubleGame', required: false });
  }
  result.push(
    { type: 'volat', required: false },
    { type: 'pagatUltimo', required: false },
    { type: 'sasUltimo', required: false },
    { type: 'kingUltimo', required: false, reason: 'A Király ultimóhoz a jelzett királyt külön kell megadni, ha a felület kéri.' },
    { type: 'pagatUhu', required: false },
    { type: 'sasUhu', required: false },
    { type: 'kingUhu', required: false, reason: 'A Király uhuhoz a jelzett királyt külön kell megadni, ha a felület kéri.' },
  );

  // Undefined means the caller has not supplied an explicit Trull context.
  // Keep legacy declaration availability in that unknown state; explicit false
  // remains a hard close for the normal bird ladder.
  const hasTrullContext = context.trullDeclared === true || previous.has('tuletroa') || context.trullDeclared === undefined;
  const rareTakerCentrum = context.isTaker === true && context.trullOmittedByTaker === true;
  const lyukasAllowed = context.seatContext !== 'lyukasCentrum' || context.lastSeatHasXVIIAndUnboundHigherTarokk === true;
  if ((hasTrullContext || rareTakerCentrum) && lyukasAllowed) result.push({ type: 'centrum', required: false });
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

function dedupeDeclarations(items: DeclarationOption[]): DeclarationOption[] {
  const seen = new Set<DeclarationType>();
  return items.filter(item => seen.has(item.type) ? false : (seen.add(item.type), true));
}

/**
 * Returns the count that becomes mandatory AFTER a Pagát/Sas ultimo or uhu
 * has been declared, if the declaring player holds at least eight tarokks.
 * This is intentionally not a prerequisite for making the declaration.
 */
export function mandatoryTarokkCountAfterFigure(type: DeclarationType, hand: Card[], alreadyAnnounced?: 8 | 9): 8 | 9 | undefined {
  if (!['pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu'].includes(type)) return undefined;
  if (alreadyAnnounced !== undefined) return undefined;
  const count = tarokkCount(hand);
  return count >= 9 ? 9 : count >= 8 ? 8 : undefined;
}

export function declarationRequiresTarokkCount(type: DeclarationType): boolean {
  return ['pagatUltimo', 'pagatUhu', 'sasUltimo', 'sasUhu'].includes(type);
}

/**
 * Illusztrált Tarokk communication convention: after tulétroá, a four-kings
 * declaration is commonly used to signal the highest still-unidentified
 * tarokk. After a trull, that signal is XIX.
 */
export function fourKingsSignalAfterTrull(
  context: Pick<DeclarationContext, 'invitedTarokk' | 'calledTarokk' | 'contract'> = {},
): 17 | 18 | 19 | 20 | 21 | 22 {
  // Keep this legacy helper aligned with the central communication model.
  // ITVB 4.3 defines the post-Trull Four Kings as the highest still-unknown
  // relevant tarokk. The bidding context therefore matters: an ordinary XIX
  // call has XX already identified, while an XIX invite does not. A plain
  // Trull without a specific call starts from XIX.
  const known = new Set<number>();
  if (context.invitedTarokk !== undefined) known.add(context.invitedTarokk);
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
    if (!known.has(rank)) return rank as 17 | 18 | 19 | 20 | 21 | 22;
  }
  return 17;
}

/**
 * Shared Centrum -> Kismadár -> Nagymadár communication resolver.
 * Returns undefined when Dupla is only encouragement (before Centrum or after
 * Nagymadár). The same resolver is used by the signal engine, so declaration
 * helpers cannot drift from partner-inference semantics.
 */
export function doubleGameSignalAfterCentrum(
  context: Partial<Pick<DeclarationContext, 'speakerIsLastSeat' | 'speakerHasHigherUnboundTarokk'>> & {
    kismadarDeclared?: boolean;
    nagymadarDeclared?: boolean;
  } = {},
): 15 | 16 | 17 | undefined {
  const resolved = resolveBirdCommunicationTarget({
    centrumDeclared: true,
    kismadarDeclared: context.kismadarDeclared === true,
    nagymadarDeclared: context.nagymadarDeclared === true,
    ...(context.speakerIsLastSeat === undefined ? {} : { speakerIsLastSeat: context.speakerIsLastSeat }),
    ...(context.speakerHasHigherUnboundTarokk === undefined ? {} : { speakerHasHigherUnboundTarokk: context.speakerHasHigherUnboundTarokk }),
  });
  return resolved.encouragement ? undefined : resolved.signalledTarokk;
}
