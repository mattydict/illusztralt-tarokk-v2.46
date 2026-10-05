import { Card, isTarokk } from './cards.js';
import { GameState, PlayerId } from './game.js';
import { pairOf } from './partnership.js';
import { inferPartnerLeadSignalHistory } from './leadConventions.js';

export type CommunicationCorrection = 'none' | 'tactical-exception' | 'reinterpreted' | 'contradicted' | 'decaying';

export interface CommunicationErrorCorrectionAssessment {
  score: number;
  correction: CommunicationCorrection;
  confidence: number;
  contradiction: number;
  tacticalException: number;
  reasons: string[];
}

/**
 * v2.29: explains apparent partner-signalling contradictions from public play.
 * It never inspects the partner hand. A mismatch can be tactical rather than a
 * changed message; repeated public mismatches are needed before confidence is
 * materially reduced.
 */
export function assessCommunicationErrorCorrection(
  state: GameState,
  observerId: PlayerId,
  candidate: Card,
): CommunicationErrorCorrectionAssessment {
  const partner = partnerFor(state, observerId);
  if (!partner) return empty();
  const signal = inferPartnerLeadSignalHistory(state, observerId);
  if (!signal) return empty();

  const events = partnerLeadReplies(state, partner, observerId);
  if (!events.length) return empty();

  const mismatches = events.filter(e => e.reply && replyContradicts(signal.kind, e.reply));
  const tactical = mismatches.filter(e => e.tacticalException);
  const clear = mismatches.filter(e => !e.tacticalException);

  let contradiction = clamp((clear.length - tactical.length * 0.35) / 2.5, 0, 1);
  const tacticalException = clamp(tactical.length / 2.5, 0, 1);
  const recent = mismatches.slice(-2);

  let score = 0;
  const reasons: string[] = [];
  let correction: CommunicationCorrection = 'none';

  if (clear.length >= 2) {
    correction = 'reinterpreted';
    score -= 2.0 * contradiction;
    reasons.push('A partner több publikus válasza ellentmond a korábbi jelzésnek; a régi értelmezést az AI leminősíti, nem kezeli tovább biztos információként.');
  } else if (clear.length === 1 && tactical.length === 0) {
    correction = 'contradicted';
    score -= 0.8;
    reasons.push('Egy publikus eltérés látszik a korábbi jelzéshez képest, de egyetlen eltérésből még nem következik új partneri szándék.');
  }

  if (tactical.length > 0) {
    correction = clear.length > 0 ? 'reinterpreted' : 'tactical-exception';
    score += Math.min(0.8, tacticalException * 0.9);
    reasons.push('Az eltérés egy része taktikai kényszerrel magyarázható; ezért a jelzés bizalma csak mérsékelten csökken.');
  }

  const age = Math.max(0, signal.age - recent.length);
  if (age >= 2 && clear.length === 0) {
    correction = 'decaying';
    score -= Math.min(0.8, age * 0.12);
    reasons.push('A régi jelzés új megerősítés nélkül halványul, ezért az AI csak puha információként használja.');
  }

  // Candidate-level correction: do not punish a natural acknowledgement when
  // the partner's previous deviation was already explained as tactical.
  if (isTarokk(candidate) && tactical.length > 0 && clear.length === 0) score += 0.15;
  score = clamp(score, -2.5, 1.0);

  return {
    score,
    correction,
    confidence: clamp(signal.confidence * (1 - contradiction * 0.55), 0, 1),
    contradiction,
    tacticalException,
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}

interface PartnerReplyEvent { trickNumber: number; lead: Card; reply?: Card; tacticalException: boolean; }

function partnerLeadReplies(state: GameState, partner: string, observerId: string): PartnerReplyEvent[] {
  const out: PartnerReplyEvent[] = [];
  for (let i = 0; i < state.completedTricks.length; i += 1) {
    const trick = state.completedTricks[i]!;
    if (trick.leader !== partner || !trick.cards.length) continue;
    const lead = trick.cards[0]!.card;
    if (!isTarokk(lead)) continue;
    const replyEntry = trick.cards.find(x => x.player === observerId);
    if (!replyEntry) continue;
    const winner = trick.cards[trick.cards.length - 1]?.player;
    const trickPoints = trick.cards.reduce((sum, entry) => sum + cardPoint(entry.card), 0);
    const tacticalException = winner === observerId && trickPoints >= 10;
    out.push({ trickNumber: i + 1, lead, reply: replyEntry.card, tacticalException });
  }
  return out;
}

function replyContradicts(kind: string, reply: Card): boolean {
  if (!isTarokk(reply)) return true;
  if (kind === 'skiz-drive') return reply.rank <= 18 || reply.rank === 22;
  if (kind === 'xxi-small') return reply.rank >= 19 && reply.rank !== 21;
  if (kind === 'xxi-medium') return reply.rank <= 10;
  return false;
}

function cardPoint(card: Card): number {
  if (card.kind === 'tarokk') return 5;
  if (card.rank === 'A' || card.rank === 'K') return 10;
  return 1;
}

function partnerFor(state: GameState, observerId: string): string | undefined {
  const side = pairOf(observerId, state.takerId ?? '', state.partnerId);
  if (side === 'unknown') return undefined;
  if (side === 'taker') return observerId === state.takerId ? state.partnerId : state.takerId;
  return state.players.find(p => p.active && p.id !== observerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
}

function clamp(v: number, min: number, max: number): number { return Math.max(min, Math.min(max, v)); }
function empty(): CommunicationErrorCorrectionAssessment {
  return { score: 0, correction: 'none', confidence: 0, contradiction: 0, tacticalException: 0, reasons: [] };
}
