import { Card, Suit, isTarokk } from './cards.js';
import { GameState } from './game.js';
import { PartnerBeliefState } from './beliefs.js';
import { pairOf } from './partnership.js';
import { DeclarationType } from './declarations.js';
import { declaredFigureValue, contractValue } from './settlement.js';
import { communicationSignalFor } from './signals.js';

export type SeatRelation = 'ahead' | 'opposite' | 'behind' | 'unknown';
export type LeadSuitRequest = 'spades' | 'clubs';
export type LeadSuitSource = 'bird' | 'contra-request' | 'generic';

export interface PartnerLeadHistorySignal {
  kind: PartnerOpeningLeadSignal['kind'];
  lead: Card;
  trickNumber: number;
  confidence: number;
  explanation: string;
  /** Number of later public partner-led tricks since this signal. */
  age: number;
  /** True when the same convention has been reinforced by another partner lead. */
  reinforced: boolean;
}

export interface LeadConventionAdvice {
  score: number;
  reasons: string[];
  /** Communication meaning of a tarokk played onto partner's tarokk lead. */
  tarokkRequest?: 'suit' | 'highTarokk';
  /** Concrete suit requested by a partner-side declaration kontra. */
  requestedSuit?: LeadSuitRequest;
  /** Why the opening suit preference exists. */
  leadSuitSource?: LeadSuitSource;
}

export interface SuitCountSnapshot {
  hearts: number;
  diamonds: number;
  spades: number;
  clubs: number;
}

export interface OpeningLeadRequest {
  suit: LeadSuitRequest;
  target: 'game' | DeclarationType;
  requestedBy: string;
  explanation: string;
}

function activePlayerIds(state: GameState): string[] {
  return state.players.filter(p => p.active).map(p => p.id);
}

export function seatRelation(state: GameState, fromPlayerId: string, toPlayerId: string): SeatRelation {
  const ids = activePlayerIds(state);
  const from = ids.indexOf(fromPlayerId);
  const to = ids.indexOf(toPlayerId);
  if (from < 0 || to < 0 || ids.length < 4) return 'unknown';
  const offset = (to - from + ids.length) % ids.length;
  if (offset === 1) return 'ahead';
  if (offset === ids.length - 1) return 'behind';
  if (ids.length === 4 && offset === 2) return 'opposite';
  return 'unknown';
}

function beliefScore(beliefs: PartnerBeliefState, rank: number): number {
  return beliefs.likelyTarokks.find(x => x.rank === rank)?.score ?? 0;
}

function likelyOwner(beliefs: PartnerBeliefState, rank: number): boolean {
  return beliefScore(beliefs, rank) >= 3;
}

function oppositionHasContra(state: GameState, leaderId: string): boolean {
  const leaderSide = pairOf(leaderId, state.takerId ?? '', state.partnerId);
  if (leaderSide === 'unknown') return false;
  return state.declarations.declarations.some(d => {
    if (d.contra.level === 'none') return false;
    return pairOf(d.ownerId, state.takerId ?? '', state.partnerId) !== leaderSide;
  });
}

function otherDefenderHasContra(state: GameState, leaderId: string): boolean {
  if (pairOf(leaderId, state.takerId ?? '', state.partnerId) !== 'defence') return false;
  const partner = state.players.find(p =>
    p.active && p.id !== leaderId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence'
  )?.id;
  if (!partner) return false;

  const declarationContra = state.declarations.declarations.some(d =>
    d.contra.level !== 'none' && d.contra.records.some(r => r.byPlayer === partner)
  );
  const gameContra = state.gameContraState?.records.some(r => r.byPlayer === partner) ?? false;
  return declarationContra || gameContra;
}

function headlessSuitCards(hand: Card[], suit: Suit): Card[] {
  return hand.filter(c => c.kind === 'suit' && c.suit === suit && c.rank !== 'K');
}

function kingSuitCards(hand: Card[]): Card[] {
  return hand.filter(c => c.kind === 'suit' && c.rank === 'K');
}

function chooseLowest(cards: Card[]): Card | undefined {
  return [...cards].sort((a, b) => a.points - b.points || a.id.localeCompare(b.id))[0];
}

function chooseLowestTarokk(cards: Card[]): Card | undefined {
  return [...cards].filter(isTarokk).sort((a, b) => a.rank - b.rank)[0];
}

function chooseMediumTarokk(cards: Card[]): Card | undefined {
  return [...cards].filter(isTarokk).sort((a, b) => a.rank - b.rank).find(c => c.rank >= 11 && c.rank <= 18)
    ?? [...cards].filter(isTarokk).sort((a, b) => a.rank - b.rank)[0];
}

function preSkartCounts(state: GameState, playerId: string): SuitCountSnapshot | undefined {
  return state.preSkartSuitCountsByPlayer?.[playerId];
}

function suitLengthBeforeSkart(state: GameState, playerId: string, suit: Suit, fallbackHand: Card[]): number {
  return preSkartCounts(state, playerId)?.[suit]
    ?? fallbackHand.filter(c => c.kind === 'suit' && c.suit === suit).length;
}

function suitLengthNow(hand: Card[], suit: Suit): number {
  return hand.filter(c => c.kind === 'suit' && c.suit === suit).length;
}

function chooseShorterAmongKingSuits(
  state: GameState,
  playerId: string,
  hand: Card[],
  suits: Suit[],
): Suit | undefined {
  const present = suits.filter(suit => hand.some(c => c.kind === 'suit' && c.suit === suit && c.rank === 'K'));
  if (!present.length) return undefined;
  return [...present].sort((a, b) =>
    suitLengthBeforeSkart(state, playerId, a, hand) - suitLengthBeforeSkart(state, playerId, b, hand)
    || suitLengthNow(hand, a) - suitLengthNow(hand, b)
    || a.localeCompare(b),
  )[0];
}

/**
 * Pick the concrete card for the bird-opening convention:
 * hearts headless -> diamonds headless -> a black headless suit ->
 * if only kings are available, the king-suit that was shorter before skart.
 */
function chooseShortestHeadlessCard(state: GameState, playerId: string): Card | undefined {
  const hand = state.players.find(p => p.id === playerId)?.hand ?? [];
  const suits: Suit[] = ['hearts', 'diamonds', 'spades', 'clubs'];
  const candidates = suits
    .map(suit => ({
      suit,
      card: chooseLowest(headlessSuitCards(hand, suit)),
    }))
    .filter((x): x is { suit: Suit; card: Card } => x.card !== undefined);
  candidates.sort((a, b) =>
    suitLengthNow(hand, a.suit) - suitLengthNow(hand, b.suit)
    || suitLengthBeforeSkart(state, playerId, a.suit, hand) - suitLengthBeforeSkart(state, playerId, b.suit, hand)
    || a.card.points - b.card.points
    || ['hearts','diamonds','spades','clubs'].indexOf(a.suit) - ['hearts','diamonds','spades','clubs'].indexOf(b.suit),
  );
  return candidates[0]?.card;
}


/**
 * Defence against a live Ultimó/Uhu: do not help the declared tarokk figure
 * by opening trump.  "Színezés" means leading a suit; for a declared king
 * figure we preferentially lead that king's suit, otherwise the shortest
 * available headless suit is the cleanest pressure.
 */
export function preferredLeadAgainstHardFigure(state: GameState, playerId: string): Card | undefined {
  const leaderSide = pairOf(playerId, state.takerId ?? '', state.partnerId);
  if (leaderSide !== 'defence') return undefined;
  const active = state.declarations.declarations
    .filter(d => d.status !== 'failed' && d.status !== 'fulfilled')
    .filter(d => ['pagatUltimo','pagatUhu','sasUltimo','sasUhu','kingUltimo','kingUhu'].includes(d.type))
    .at(-1);
  if (!active) return undefined;
  const ownerSide = pairOf(active.ownerId, state.takerId ?? '', state.partnerId);
  if (ownerSide !== 'taker') return undefined;
  const hand = state.players.find(p => p.id === playerId)?.hand ?? [];
  if (active.type === 'kingUltimo' || active.type === 'kingUhu') {
    const targetSuit = active.targetCardId?.split('-')[0] as Suit | undefined;
    if (targetSuit) {
      const headless = chooseLowest(headlessSuitCards(hand, targetSuit));
      if (headless) return headless;
      const king = hand.find(c => c.kind === 'suit' && c.suit === targetSuit && c.rank === 'K');
      if (king) return king;
    }
  }
  return chooseShortestHeadlessCard(state, playerId);
}

export function chooseDefensiveBirdLeadCard(state: GameState, playerId: string): Card | undefined {
  const hand = state.players.find(p => p.id === playerId)?.hand ?? [];
  for (const suit of ['hearts', 'diamonds'] as const) {
    const cards = headlessSuitCards(hand, suit);
    if (cards.length) return chooseLowest(cards);
  }

  const blackHeadless: Array<{ suit: Suit; card: Card }> = [];
  for (const suit of ['spades', 'clubs'] as const) {
    const card = chooseLowest(headlessSuitCards(hand, suit));
    if (card) blackHeadless.push({ suit, card });
  }
  if (blackHeadless.length) {
    blackHeadless.sort((a, b) =>
      suitLengthBeforeSkart(state, playerId, a.suit, hand) - suitLengthBeforeSkart(state, playerId, b.suit, hand)
      || a.card.points - b.card.points
      || a.suit.localeCompare(b.suit),
    );
    return blackHeadless[0]!.card;
  }

  const kingSuit = chooseShorterAmongKingSuits(state, playerId, hand, ['hearts', 'diamonds', 'spades', 'clubs']);
  return kingSuit ? hand.find(c => c.kind === 'suit' && c.suit === kingSuit && c.rank === 'K') : undefined;
}

/**
 * Pick the concrete card requested by a partner-side opening kontra:
 * headless spade -> headless club -> if only kings remain, the shorter
 * spade/club measured from the pre-skart hand.
 */
export function chooseRequestedDefensiveLeadCard(state: GameState, playerId: string): Card | undefined {
  const hand = state.players.find(p => p.id === playerId)?.hand ?? [];
  const spade = chooseLowest(headlessSuitCards(hand, 'spades'));
  if (spade) return spade;
  const club = chooseLowest(headlessSuitCards(hand, 'clubs'));
  if (club) return club;
  const kingSuit = chooseShorterAmongKingSuits(state, playerId, hand, ['spades', 'clubs']);
  return kingSuit ? hand.find(c => c.kind === 'suit' && c.suit === kingSuit && c.rank === 'K') : undefined;
}

function activeBirdDeclaredByOpposition(state: GameState, leaderId: string): boolean {
  const leaderSide = pairOf(leaderId, state.takerId ?? '', state.partnerId);
  if (leaderSide === 'unknown') return false;
  return state.declarations.declarations.some(d => {
    if (d.status === 'failed' || d.status === 'fulfilled') return false;
    if (!['centrum', 'kismadar', 'nagymadar'].includes(d.type)) return false;
    return pairOf(d.ownerId, state.takerId ?? '', state.partnerId) !== leaderSide;
  });
}

function openingTargetValue(target: 'game' | DeclarationType, state: GameState): number {
  if (target === 'game') return state.contract ? contractValue(state.contract) : 999;
  return declaredFigureValue(target) ?? 999;
}

function isOpeningLeadRequestTarget(target: 'game' | DeclarationType): boolean {
  return target === 'game' || target === 'tuletroa' || target === 'fourKings';
}

function lowestActiveOpeningRequestTarget(state: GameState): 'game' | DeclarationType | undefined {
  const candidates: Array<{ target: 'game' | DeclarationType; value: number; tie: number }> = [];

  if (state.contract) candidates.push({ target: 'game', value: openingTargetValue('game', state), tie: 1 });
  for (const declaration of state.declarations.declarations) {
    if (declaration.status === 'failed' || declaration.status === 'fulfilled') continue;
    if (!isOpeningLeadRequestTarget(declaration.type)) continue;
    candidates.push({
      target: declaration.type,
      value: openingTargetValue(declaration.type, state),
      // On equal value, four-kings is the normal request target; Trull is the
      // specialist alternative. Game is kept as the last tie-break.
      tie: declaration.type === 'fourKings' ? 0 : declaration.type === 'tuletroa' ? 2 : 3,
    });
  }
  return candidates.sort((a, b) => a.value - b.value || a.tie - b.tie)[0]?.target;
}

function firstKontraWasByPlayer(recordOwner: string, record: { level: string; byPlayer: string; side: string }): boolean {
  return record.level === 'kontra' && record.byPlayer === recordOwner && record.side === 'defence';
}

/**
 * Detect the specialist opening-suit signal: the non-leading defender
 * counters the lowest-value active game/Trull/four-kings target. The leader
 * answers with spade/club according to the convention and own hand shape.
 */
export function defenceOpeningRequestTargetFromPublicContra(state: GameState): 'game' | DeclarationType | undefined {
  const target = lowestActiveOpeningRequestTarget(state);
  if (!target) return undefined;
  const defenders = state.players.filter(p => p.active && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence');
  if (defenders.length < 2) return undefined;
  if (target === 'game') {
    return state.gameContraState?.records.some(r => r.level === 'kontra' && r.side === 'defence' && defenders.some(d => d.id === r.byPlayer))
      ? target
      : undefined;
  }
  const declaration = state.declarations.declarations.find(d =>
    d.type === target && d.status !== 'failed' && d.status !== 'fulfilled'
  );
  if (!declaration) return undefined;
  return declaration.contra.records.some(r => r.level === 'kontra' && r.side === 'defence' && defenders.some(d => d.id === r.byPlayer))
    ? target
    : undefined;
}

export function openingLeadRequestFromContra(state: GameState, leaderId: string): OpeningLeadRequest | undefined {
  if (!state.takerId || !state.partnerId || state.startingPlayerId !== leaderId) return undefined;
  if (pairOf(leaderId, state.takerId, state.partnerId) !== 'defence') return undefined;

  const defenders = state.players.filter(p => p.active && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence');
  const requestingPartner = defenders.find(p => p.id !== leaderId)?.id;
  if (!requestingPartner) return undefined;

  const target = lowestActiveOpeningRequestTarget(state);
  if (!target) return undefined;

  let signalled = false;
  if (target === 'game') {
    const first = state.gameContraState?.records.find(r => firstKontraWasByPlayer(requestingPartner, r));
    signalled = first !== undefined;
  } else {
    const declaration = state.declarations.declarations.find(d => d.type === target && d.status !== 'failed' && d.status !== 'fulfilled');
    const first = declaration?.contra.records.find(r => firstKontraWasByPlayer(requestingPartner, r));
    signalled = first !== undefined;
  }
  if (!signalled) return undefined;

  const card = chooseRequestedDefensiveLeadCard(state, leaderId);
  const leaderHand = state.players.find(p => p.id === leaderId)?.hand ?? [];
  const suit: LeadSuitRequest = card?.kind === 'suit' && card.suit === 'spades' ? 'spades'
    : card?.kind === 'suit' && card.suit === 'clubs' ? 'clubs'
    : (headlessSuitCards(leaderHand, 'spades').length > 0 ? 'spades' : 'clubs');

  return {
    suit,
    target,
    requestedBy: requestingPartner,
    explanation: `${requestingPartner} az indulás színét az ${target === 'game' ? 'parti' : target === 'tuletroa' ? 'Trull' : 'négykirály'} megkontrázásával kérte: ${suit === 'spades' ? 'pikk' : 'treff'}.`,
  };
}

export function preferredLeadAfterPartnerTarokkSignal(
  state: GameState,
  playerId: string,
): Card | undefined {
  const last = state.completedTricks.at(-1);
  if (!last || last.winner !== playerId || !state.takerId || !state.partnerId) return undefined;
  const playerSide = pairOf(playerId, state.takerId, state.partnerId);
  if (playerSide === 'unknown') return undefined;
  const partnerId = playerSide === 'taker'
    ? (playerId === state.takerId ? state.partnerId : state.takerId)
    : state.players.find(p => p.active && p.id !== playerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
  if (!partnerId) return undefined;
  const lead = last.cards[0];
  const reply = last.cards.find(c => c.player === playerId);
  if (!lead || !reply || lead.player !== partnerId || !isTarokk(lead.card) || !isTarokk(reply.card)) return undefined;

  const request = tarokkReplyRequest(reply.card);
  if (request === 'suit') return chooseShortestHeadlessCard(state, playerId);
  if (request === 'highTarokk') {
    const high = state.players.find(p => p.id === playerId)?.hand.filter(isTarokk).filter(c => c.rank >= 11) ?? [];
    return [...high].sort((a,b) => b.rank - a.rank)[0];
  }
  return undefined;
}

/**
 * Return a same-suit lead when the taker returns the suit that their partner
 * led on the previous trick. This is a specialist request for a later trump
 * lead; it is intentionally scoped to the exact return pattern.
 */
export function preferredLeadAfterTakerSuitReturnSignal(
  state: GameState,
  playerId: string,
): Card | undefined {
  if (playerId !== state.takerId || !state.partnerId) return undefined;
  const last = state.completedTricks.at(-1);
  if (!last || last.leader !== state.partnerId || last.cards.length < 2 || last.winner !== playerId) return undefined;
  const lead = last.cards[0]?.card;
  const takerReply = last.cards.find(c => c.player === playerId)?.card;
  if (!lead || lead.kind !== 'suit' || !takerReply || takerReply.kind !== 'suit' || takerReply.suit !== lead.suit) return undefined;
  const hand = state.players.find(p => p.id === playerId)?.hand ?? [];
  return chooseLowest(hand.filter(c => c.kind === 'suit' && c.suit === lead.suit))
    ?? hand.find(c => c.kind === 'suit' && c.suit === lead.suit);
}

/**
 * Resolve the concrete card preferred by the opening-lead conventions.
 * The AI still ranks all legal cards afterwards, but this central resolver
 * gives the specialist conventions a shared, testable target card.
 */

export type PartnerOpeningLeadSignalKind = 'skiz-drive' | 'xxi-small' | 'xxi-medium' | 'neutral-tarokk';

export interface PartnerOpeningLeadSignal {
  kind: PartnerOpeningLeadSignalKind;
  lead: Card;
  confidence: number;
  explanation: string;
}

/**
 * Interpret the taker's partner's opening tarokk lead from the taker's seat.
 * This is a communication signal, not hidden-card knowledge: the taker may
 * use it to choose a response, but must never treat the inferred XXI/Skíz
 * role as certain.
 */
export function inferPartnerOpeningLeadSignal(
  state: GameState,
  observerId: string,
): PartnerOpeningLeadSignal | undefined {
  if (observerId !== state.takerId || !state.partnerId) return undefined;
  if (state.completedTricks.length !== 0) return undefined;
  const trick = state.trick;
  if (!trick || trick.cards.length !== 1 || trick.leader !== state.partnerId) return undefined;
  const lead = trick.cards[0]?.card;
  if (!lead || !isTarokk(lead)) return undefined;

  if (lead.rank >= 19) {
    return {
      kind: 'skiz-drive',
      lead,
      confidence: 0.82,
      explanation: 'A partner magas tarokkos indulása erős Skíz-gyanús hajtójelzés: a XXI hajtása a cél.',
    };
  }
  if (lead.rank <= 10) {
    return {
      kind: 'xxi-small',
      lead,
      confidence: 0.78,
      explanation: 'A partner kis tarokkos indulása XXI-gyanús helyzetben a kis tarokkos kérésnek felel meg.',
    };
  }
  if (lead.rank >= 11 && lead.rank <= 18) {
    return {
      kind: 'xxi-medium',
      lead,
      confidence: 0.78,
      explanation: 'A partner közepes tarokkos indulása XXI-gyanús helyzetben közepes tarokkos kérés.',
    };
  }
  return {
    kind: 'neutral-tarokk',
    lead,
    confidence: 0.45,
    explanation: 'A partner tarokkos indulása jelzésértékű, de a lapból önmagában nem következik erős nagyhonőr-hipotézis.',
  };
}

/**
 * Reconstruct the partner's lead convention from the public trick history.
 *
 * The opening lead is the strongest signal, but later partner-led tarokk
 * leads can reinforce or revise it. This deliberately never inspects the
 * partner's hidden hand. A later contradictory lead therefore lowers the
 * confidence instead of being treated as a hard reversal.
 */
export function inferPartnerLeadSignalHistory(
  state: GameState,
  observerId: string,
): PartnerLeadHistorySignal | undefined {
  if (observerId !== state.takerId || !state.partnerId) return undefined;

  const history: Array<{ kind: 'skiz-drive' | 'xxi-small' | 'xxi-medium'; lead: Card; trickNumber: number }> = [];
  for (let index = 0; index < state.completedTricks.length; index += 1) {
    const trick = state.completedTricks[index]!;
    if (trick.leader !== state.partnerId || !trick.cards.length) continue;
    const lead = trick.cards[0]?.card;
    if (!lead || !isTarokk(lead)) continue;

    const kind: 'skiz-drive' | 'xxi-small' | 'xxi-medium' =
      lead.rank >= 19 ? 'skiz-drive' : lead.rank <= 10 ? 'xxi-small' : 'xxi-medium';
    history.push({ kind, lead, trickNumber: index + 1 });
  }

  const latest = history.length ? history[history.length - 1] : undefined;
  if (!latest) return undefined;

  const sameKindCount = history.filter(x => x.kind === latest.kind).length;
  const contradictoryCount = history.filter(x => x.kind !== latest.kind).length;
  const age = Math.max(0, state.completedTricks.length - latest.trickNumber);
  const reinforced = sameKindCount >= 2;

  let confidence = latest.kind === 'skiz-drive' ? 0.82 : 0.78;
  confidence -= Math.min(0.24, age * 0.06);
  confidence += Math.min(0.12, Math.max(0, sameKindCount - 1) * 0.06);
  confidence -= Math.min(0.16, contradictoryCount * 0.05);
  confidence = Math.max(0.25, Math.min(0.95, confidence));

  const explanation = reinforced
    ? `A partner ${sameKindCount}. alkalommal is ugyanabba a vezetési irányba jelez; a jelzés megerősített.`
    : `A legutóbbi partneri tarokkvezetés ${age === 0 ? 'aktuális' : `${age} ütéssel korábbi`} jelzésként értelmezhető.`;

  return { ...latest, confidence, explanation, age, reinforced };
}

/** Score how well a legal response respects an already observed partner lead. */
export function scoreResponseToPartnerOpeningLead(
  state: GameState,
  observerId: string,
  card: Card,
): LeadConventionAdvice {
  const signal = inferPartnerOpeningLeadSignal(state, observerId);
  const historical = inferPartnerLeadSignalHistory(state, observerId);
  if (!signal && !historical) return { score: 0, reasons: [] };

  // Once the first trick is gone, the latest public partner-led tarokk signal
  // becomes the operative hypothesis. Opening lead remains stronger when it
  // is still the live first trick.
  const effective = signal ?? historical!;
  const effectiveConfidence = signal?.confidence ?? historical!.confidence;
  const effectiveKind = effective.kind;
  const hand = state.players.find(p => p.id === observerId)?.hand ?? [];
  let score = 0;
  const reasons: string[] = [];
  const hasXXI = hand.some(c => c.kind === 'tarokk' && c.rank === 21);
  const hasSkiz = hand.some(c => c.kind === 'tarokk' && c.rank === 22);

  if (effectiveKind === 'skiz-drive') {
    if (hasSkiz && card.id === 'T22') {
      score -= 7;
      reasons.push('A partner magas tarokkos hajtójelzése mellett a Skíz felesleges korai elhasználását kerülni kell.');
    }
    if (hasSkiz && card.kind === 'tarokk' && card.rank >= 19 && card.rank < 22) {
      score += 2.5;
      reasons.push('A magas tarokkos hajtásban a közeli magas tarokk kontrollja megmarad.');
    }
  }

  if (effectiveKind === 'xxi-small' && hasXXI) {
    if (card.id === 'T21') {
      score += 5;
      reasons.push('A kis tarokkos partneri jelzés XXI-es választást valószínűsít.');
    } else if (card.kind === 'tarokk' && card.rank >= 19 && card.id !== 'T22') {
      score -= 2;
      reasons.push('A kis tarokkos kérés mellett a nagy tarokk felesleges átvételét kerülni érdemes.');
    }
  }

  if (effectiveKind === 'xxi-medium' && hasXXI) {
    if (card.id === 'T21') {
      score += 4;
      reasons.push('A közepes tarokkos partneri jelzés XXI-es kontrollt kérhet.');
    }
    if (card.kind === 'tarokk' && card.rank >= 19 && card.id !== 'T21') {
      score -= 1.5;
    }
  }

  if (!signal && historical) {
    score *= effectiveConfidence;
    reasons.unshift(historical.explanation);
    if (historical.reinforced) reasons.push('A korábbi partneri vezetési jelzés többször is megerősítést kapott.');
  }

  return { score: Math.max(-8, Math.min(8, score)), reasons };
}

/**
 * Score a deliberate acknowledgement of a partner's tarokk lead.
 *
 * This is intentionally softer than legality or trick economy: the player can
 * acknowledge a signal only when doing so is tactically meaningful. The
 * response itself becomes public evidence for the partner on the next trick.
 */
export function scorePartnerSignalAcknowledgement(
  state: GameState,
  observerId: string,
  card: Card,
): LeadConventionAdvice {
  if (!state.takerId || !state.partnerId) return { score: 0, reasons: [] };
  const trick = state.trick;
  if (!trick || trick.cards.length !== 1 || trick.leader !== state.partnerId) {
    return { score: 0, reasons: [] };
  }
  const lead = trick.cards[0]?.card;
  if (!lead || !isTarokk(lead) || !isTarokk(card)) return { score: 0, reasons: [] };

  const signal = inferPartnerOpeningLeadSignal(state, observerId);
  const history = inferPartnerLeadSignalHistory(state, observerId);
  const effective = signal ?? history;
  if (!effective) return { score: 0, reasons: [] };

  let score = 0;
  const reasons: string[] = [];
  if (effective.kind === 'skiz-drive') {
    if (card.rank >= 19 && card.rank < 22) {
      score += 4;
      reasons.push('A magas tarokkos partneri jelzésre magas kontroll-tarokkal válaszol: a XXI hajtása visszaigazolható.');
    }
    if (card.rank === 22) {
      score -= 5;
      reasons.push('A partner Skíz-hajtó jelzésére a Skíz korai kijátszása inkább elutasító válasz lenne.');
    }
  } else if (effective.kind === 'xxi-small') {
    if (card.rank === 21) {
      score += 5;
      reasons.push('A kis tarokkos jelzésre a XXI-vel való átvétel erős visszajelzés a partnernek.');
    } else if (card.rank <= 10) {
      score += 1.5;
      reasons.push('Kis tarokkos válasz: a partneri XXI-kérés fenntartása anélkül, hogy fölöslegesen magas lap fogyjon.');
    }
  } else if (effective.kind === 'xxi-medium') {
    if (card.rank === 21) {
      score += 4;
      reasons.push('A közepes tarokkos jelzésre a XXI-vel való átvétel visszaigazolja a partneri kontrollkérést.');
    } else if (card.rank >= 11 && card.rank <= 18) {
      score += 2;
      reasons.push('Közepes tarokkos válasz: a partner által kért XXI-kontrollvonalat tartja fenn.');
    }
  }

  if (!signal && history) score *= history.confidence;
  return { score: Math.max(-6, Math.min(6, score)), reasons };
}

export function preferredOpeningLeadCard(
  state: GameState,
  playerId: string,
  beliefs: PartnerBeliefState,
): Card | undefined {
  if (!state.takerId || !state.partnerId) return undefined;
  const side = pairOf(playerId, state.takerId, state.partnerId);
  const hand = state.players.find(p => p.id === playerId)?.hand ?? [];
  if (!hand.length) return undefined;

  const partnerTarokkSignal = preferredLeadAfterPartnerTarokkSignal(state, playerId);
  if (partnerTarokkSignal) return partnerTarokkSignal;

  const takerReturnSignal = preferredLeadAfterTakerSuitReturnSignal(state, playerId);
  if (takerReturnSignal) return takerReturnSignal;

  if (side === 'defence') {
    const request = openingLeadRequestFromContra(state, playerId);
    if (request) {
      const requested = chooseRequestedDefensiveLeadCard(state, playerId);
      if (requested) return requested;
    }
    if (activeBirdDeclaredByOpposition(state, playerId)) return chooseDefensiveBirdLeadCard(state, playerId);
    if (otherDefenderHasContra(state, playerId)) return [...hand].filter(isTarokk).sort((a,b) => b.rank-a.rank)[0];
    return chooseShortestHeadlessCard(state, playerId) ?? chooseLowestTarokk(hand);
  }

  const takerLikelySkiz = likelyOwner(beliefs, 22);
  const takerLikelyXXI = likelyOwner(beliefs, 21);
  const isTakerPartner = playerId === state.partnerId;
  if (isTakerPartner) {
    if (oppositionHasContra(state, playerId)) return chooseShortestHeadlessCard(state, playerId);
    const tarokks = hand.filter(isTarokk);
    if (tarokks.length) {
      if (takerLikelySkiz) return [...tarokks].sort((a,b) => b.rank-a.rank)[0];
      if (takerLikelyXXI) {
        const relation = seatRelation(state, playerId, state.takerId);
        if (relation === 'ahead') return chooseLowestTarokk(tarokks);
        return chooseMediumTarokk(tarokks);
      }
      return chooseLowestTarokk(tarokks);
    }
    return chooseShortestHeadlessCard(state, playerId);
  }

  if (playerId === state.takerId) {
    const activeCatch = state.declarations.declarations.some(d =>
      d.type === 'xxiFogas' && d.status !== 'failed' && d.status !== 'fulfilled' && d.ownerId === playerId,
    );
    const hasSkiz = hand.some(c => c.kind === 'tarokk' && c.rank === 22);
    if (activeCatch && hasSkiz) return chooseShortestHeadlessCard(state, playerId);

    const tarokkCount = hand.filter(isTarokk).length;
    const weakPagat = hand.some(c => c.kind === 'tarokk' && c.rank === 1)
      && tarokkCount >= 3 && tarokkCount <= 4
      && !hand.some(c => c.kind === 'tarokk' && (c.rank === 21 || c.rank === 22));
    if (weakPagat) {
      const kings = kingSuitCards(hand);
      if (kings.length) return chooseLowest(kings);
    }

    if (takerLikelyXXI) {
      const kings = kingSuitCards(hand);
      if (kings.length) return chooseLowest(kings);
    }

    const tarokks = hand.filter(isTarokk);
    if (tarokks.length) return chooseLowestTarokk(tarokks);
  }

  return undefined;
}

/**
 * Score for opening-lead conventions. This layer is intentionally soft: the
 * legal-play engine remains the sole legality authority.
 */
export function scoreOpeningLeadConvention(
  state: GameState,
  playerId: string,
  card: Card,
  beliefs: PartnerBeliefState,
): LeadConventionAdvice {
  if (!state.takerId || !state.partnerId) return { score: 0, reasons: [] };
  const side = pairOf(playerId, state.takerId, state.partnerId);
  if (side === 'unknown') return { score: 0, reasons: [] };

  const hand = state.players.find(p => p.id === playerId)?.hand ?? [];
  const isTaker = playerId === state.takerId;
  const isTakerPartner = playerId === state.partnerId;
  const hasDefenceContra = oppositionHasContra(state, playerId);
  const hasOtherDefenderContra = otherDefenderHasContra(state, playerId);
  const takerLikelySkiz = likelyOwner(beliefs, 22);
  const takerLikelyXXI = likelyOwner(beliefs, 21);
  let score = 0;
  const reasons: string[] = [];

  if (isTakerPartner) {
    // Core convention: taker's partner normally opens with a trump.
    if (isTarokk(card)) {
      score += 9;
      reasons.push('A felvevő partnere alapvetően tarokkal indít.');

      if (takerLikelySkiz) {
        if (card.rank >= 19) {
          score += 8;
          reasons.push('Skíz-gyanús felvevőnél magas tarokk hajtja a XXI-et.');
        } else if (card.rank <= 10) {
          score -= 4;
        }
      } else if (takerLikelyXXI) {
        const relation = seatRelation(state, playerId, state.takerId);
        if (relation === 'ahead') {
          if (card.rank <= 10) {
            score += 7;
            reasons.push('A XXI a partner előtt ül: kis tarokk indítása a preferált kérés.');
          } else if (card.rank >= 11 && card.rank <= 18) {
            score -= 1;
          }
        } else if (relation === 'behind' || relation === 'opposite') {
          if (card.rank >= 11 && card.rank <= 18) {
            score += 7;
            reasons.push('A XXI a partner mögött vagy szemben ül: közepes tarokk az alapjelzés.');
          }
        }
      }
    } else {
      score -= 7;
      reasons.push('A felvevő partnerének elsődleges vezetési konvenciója a tarokkvezetés.');
    }

    if (hasDefenceContra) {
      if (card.kind === 'suit' && card.rank !== 'K') {
        score += 15;
        reasons.push('Az ellenpár kontrázott: fejetlen szín a partneri induló konvenció.');
      } else if (card.kind === 'suit' && card.rank === 'K') {
        score -= 10;
      } else if (isTarokk(card)) {
        score -= 8;
      }
    }
  }

  if (isTaker) {
    // Taker normally leads trump.
    if (isTarokk(card)) {
      score += 7;
      reasons.push('A felvevő alapvetően tarokkal indul.');
    }

    // XXI-catch: the player who is in the Skíz-catching role opens headless,
    // rather than spending a trump immediately to create the catch sequence.
    const activeCatch = state.declarations.declarations.some(d =>
      d.type === 'xxiFogas' && d.status !== 'failed' && d.status !== 'fulfilled'
      && d.ownerId === playerId,
    );
    const hasSkiz = hand.some(c => c.kind === 'tarokk' && c.rank === 22);
    if (activeCatch && hasSkiz) {
      if (card.kind === 'suit' && card.rank !== 'K') {
        score += 18;
        reasons.push('Skízes XXI-fogási helyzetben fejetlen szín az indulási konvenció.');
      } else if (isTarokk(card)) {
        score -= 6;
      }
    }

    // Weak Pagát as taker: king-suit lead is the preferred conventional way
    // to start the hand. Weakness is modelled conservatively as Pagát +
    // 3–4 tarokks, without Skíz/XXI.
    const tarokkCount = hand.filter(isTarokk).length;
    const weakPagat = hand.some(c => c.kind === 'tarokk' && c.rank === 1)
      && tarokkCount >= 3 && tarokkCount <= 4
      && !hand.some(c => c.kind === 'tarokk' && (c.rank === 21 || c.rank === 22));
    if (weakPagat) {
      if (card.kind === 'suit' && card.rank === 'K') {
        score += 14;
        reasons.push('Gyenge Pagátos felvevőként a királyos szín az előnyben részesített indulás.');
      } else if (isTarokk(card)) {
        score -= 3;
      }
    }

    const xxiCapture = activeCatch;
    if (xxiCapture) {
      const kingSuits = kingSuitCards(hand);
      if (card.kind === 'suit' && card.rank === 'K') {
        score += 8;
        reasons.push('Fogási helyzetben a királyos szín további fogási lehetőséget készíthet elő.');
      }
      if (kingSuits.length && card.kind === 'suit' && card.rank !== 'K') score -= 1;
    } else if (takerLikelyXXI && card.kind === 'suit' && card.rank === 'K') {
      score += 6;
      reasons.push('XXI-gyanús felvevőnél a királyos szín általában erős indulási jelölt.');
    }
  }

  if (side === 'defence') {
    const birdStart = activeBirdDeclaredByOpposition(state, playerId);
    const request = openingLeadRequestFromContra(state, playerId);

    if (request && card.kind === 'suit' && card.suit === request.suit) {
      const headless = card.rank !== 'K';
      score += headless ? 28 : 12;
      reasons.push(`${request.explanation} A kért szín vezetése kiemelt konvenciós prioritás.`);
    } else if (request && card.kind === 'suit' && card.suit !== request.suit) {
      score -= 6;
    }

    if (birdStart) {
      const preferred = chooseDefensiveBirdLeadCard(state, playerId);
      if (preferred?.id === card.id) {
        score += 25;
        reasons.push('Centrum/Kismadár/Nagymadár mellett a védekező induló sorrend: fejetlen kőr → fejetlen káró → fejetlen fekete szín.');
      } else if (card.kind === 'suit' && card.rank !== 'K') {
        score += 3;
        reasons.push('Madárbemondás mellett a fejetlen szín elsőbbséget élvez.');
      } else if (isTarokk(card)) {
        score -= 5;
      }
    }

    // Defence normally opens headless. If the other defender has already
    // kontra'd outside the bird-specific request, high trump becomes a
    // pressure lead.
    if (hasOtherDefenderContra && !request && !birdStart) {
      if (isTarokk(card) && card.rank >= 19) {
        score += 14;
        reasons.push('Az ellenpár másik tagja kontrázott: magas tarokkos indulás a védekező konvenció.');
      }
      if (card.kind === 'suit' && card.rank !== 'K') score -= 2;
    } else if (!request && !hasOtherDefenderContra) {
      if (card.kind === 'suit' && card.rank !== 'K') {
        score += 12;
        reasons.push('A védekező oldal főszabály szerint fejetlen színnel indul.');
      }
      if (card.kind === 'suit' && card.rank === 'K') score -= 5;
      if (isTarokk(card)) score -= 3;
    }
  }

  const request = side === 'defence' ? openingLeadRequestFromContra(state, playerId) : undefined;
  return {
    score,
    reasons,
    ...(request ? { requestedSuit: request.suit, leadSuitSource: 'contra-request' as const } : {}),
    ...(side === 'defence' && !request && activeBirdDeclaredByOpposition(state, playerId) ? { leadSuitSource: 'bird' as const } : {}),
  };
}

/**
 * Interprets the tarokk played onto a partner's tarokk lead.
 * X or lower asks for a headless short suit; XI or higher asks for further
 * high-trump continuation. This is the core convention explicitly taught by
 * the user and is intentionally thresholded at X/XI.
 */
export function tarokkReplyRequest(card: Card): 'suit' | 'highTarokk' | undefined {
  if (!isTarokk(card)) return undefined;
  return card.rank <= 10 ? 'suit' : 'highTarokk';
}


export interface FigureCommunicationLeadAdvice {
  score: number;
  reasons: string[];
  signalledTarokk?: number;
  sourceDeclaration?: string;
}

/**
 * Translate the public Trull -> Four Kings -> bird/Double communication chain
 * into a lead preference. This never assumes that the signalled card is in the
 * partner's hand as a fact; it only rewards a lead that gives the partner a
 * plausible chance to use the communicated tarokk.
 */
export function scorePartnerFigureCommunicationLead(
  state: GameState,
  playerId: string,
  card: Card,
): FigureCommunicationLeadAdvice {
  if (!state.takerId || !state.partnerId || !isTarokk(card)) return { score: 0, reasons: [] };
  const side = pairOf(playerId, state.takerId, state.partnerId);
  if (side === 'unknown') return { score: 0, reasons: [] };

  const partnerId = side === 'taker'
    ? (playerId === state.takerId ? state.partnerId : state.takerId)
    : state.players.find(p => p.active && p.id !== playerId && pairOf(p.id, state.takerId!, state.partnerId) === 'defence')?.id;
  if (!partnerId) return { score: 0, reasons: [] };

  const sideDeclarations = state.declarations.declarations
    .filter(d => pairOf(d.ownerId, state.takerId!, state.partnerId) === side)
    .sort((a, b) => a.declaredAtTrick - b.declaredAtTrick);
  const partnerDeclarations = sideDeclarations.filter(d => d.ownerId === partnerId);
  if (!partnerDeclarations.length) return { score: 0, reasons: [] };

  let latest: { signalledTarokk: number; declaration: string; confidence: string } | undefined;
  for (const declaration of partnerDeclarations) {
    const before = sideDeclarations
      .filter(d => d.declaredAtTrick < declaration.declaredAtTrick ||
        (d.declaredAtTrick === declaration.declaredAtTrick && d.id < declaration.id))
      .map(d => d.type);
    const speakerBefore = partnerDeclarations
      .filter(d => d.declaredAtTrick < declaration.declaredAtTrick ||
        (d.declaredAtTrick === declaration.declaredAtTrick && d.id < declaration.id))
      .map(d => d.type);
    const resolved = communicationSignalFor({
      previous: before,
      speakerDeclarations: [...speakerBefore, declaration.type],
      calledTarokk: state.calledTarokk,
      invitedTarokk: (state as GameState & { invitedTarokk?: 18 | 19 | 20 }).invitedTarokk,
      isTaker: declaration.ownerId === state.takerId,
    }, declaration.type);
    if (resolved?.meaning === 'cardSignal' && resolved.signalledTarokk !== undefined) {
      latest = { signalledTarokk: resolved.signalledTarokk, declaration: declaration.type, confidence: resolved.confidence };
    }
  }
  if (!latest) return { score: 0, reasons: [] };

  const target = latest.signalledTarokk;
  let score = 0;
  const reasons: string[] = [];
  const confidenceWeight = latest.confidence === 'rule' ? 1 : latest.confidence === 'convention' ? 0.82 : 0.62;

  // A low/medium trump lead is the cleanest way to invite the partner to
  // produce the communicated high trump. Do not force the exact target: the
  // target may already be gone or may be held by the speaker.
  if (card.rank <= 10) {
    score += 7 * confidenceWeight;
    reasons.push(`A partneri bemondási lánc ${target}-es tarokkot jelez; kis tarokk vezetése lehetőséget ad a partnernek a jelzett lap használatára.`);
  } else if (card.rank >= 11 && card.rank < target) {
    score += 4 * confidenceWeight;
    reasons.push(`A ${target}-es kommunikációhoz közepes tarokk is megfelelő meghívóvezetés.`);
  } else if (card.rank === target) {
    score -= 4 * confidenceWeight;
    reasons.push(`A jelzett ${target}-es tarokkot nem célszerű automatikusan maga a vezető kijátszani; a kommunikáció inkább a partner kontrollját készíti elő.`);
  } else if (card.rank > target) {
    score -= 6 * confidenceWeight;
    reasons.push(`A jelzett ${target}-es tarokk fölötti indítás túl korán égethet el kommunikációs kontrollt.`);
  }

  return { score: Math.max(-8, Math.min(8, score)), reasons, signalledTarokk: target, sourceDeclaration: latest.declaration };
}

export function scorePartnerTarokkReply(
  state: GameState,
  playerId: string,
  card: Card,
): LeadConventionAdvice {
  if (!state.takerId || !state.partnerId || !state.trick || state.trick.cards.length === 0) return { score: 0, reasons: [] };
  const lead = state.trick.cards[0]!.card;
  if (!isTarokk(lead) || !isTarokk(card)) return { score: 0, reasons: [] };

  const leaderId = state.trick.cards[0]!.player;
  const playerSide = pairOf(playerId, state.takerId, state.partnerId);
  const leaderSide = pairOf(leaderId, state.takerId, state.partnerId);
  if (playerSide === 'unknown' || playerSide !== leaderSide) return { score: 0, reasons: [] };

  const request = tarokkReplyRequest(card);
  if (!request) return { score: 0, reasons: [] };
  const reasons = request === 'suit'
    ? ['X vagy alacsonyabb tarokk a partner tarokkjára: fejetlen rövid színt kér a következő vezetésben.']
    : ['XI vagy magasabb tarokk a partner tarokkjára: további magas tarokkot kér a következő vezetésben.'];
  return { score: 10, reasons, tarokkRequest: request };
}
