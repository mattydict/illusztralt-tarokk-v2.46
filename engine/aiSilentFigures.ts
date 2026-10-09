import { Card, createDeck, isHonour, isTarokk } from './cards.js';
import { GameState, PlayerId } from './game.js';
import { determineWinner } from './play.js';
import { pairOf } from './partnership.js';
import type { HandHypothesisSummary, HandHypothesis } from './aiHandHypotheses.js';

/**
 * Silent figures that can be completed without an explicit declaration in the
 * published Illustrated Tarokk rules. Pagat/Sas Ultimo is inferred here only
 * independently of any Uhu declaration. Pagát/Sas Ultimó are distinct
 * figures; a silent Ultimó can be completed without a preceding Uhu.
 */
export type SilentFigureType =
  | 'tuletroa'
  | 'fourKings'
  | 'doubleGame'
  | 'volat'
  | 'pagatUltimo'
  | 'sasUltimo'
  | 'xxiFogas';

export type SilentFigureRelation = 'self' | 'partner' | 'opponent';

export interface SilentFigureThreat {
  type: SilentFigureType;
  relation: SilentFigureRelation;
  ownerId?: PlayerId;
  probability: number;
  urgency: number;
  importance: number;
  label: string;
  reasons: string[];
}

export interface SilentFigureLandscape {
  threats: SilentFigureThreat[];
  ownPotential: number;
  partnerPotential: number;
  opponentThreat: number;
}

export interface SilentFigurePlayAssessment {
  score: number;
  reasons: string[];
  ownSupport: number;
  partnerSupport: number;
  opponentDisruption: number;
}

interface SideContext {
  observerSide: 'taker' | 'defence';
  partnerId?: PlayerId;
}

const SILENT_TYPES: SilentFigureType[] = [
  'tuletroa', 'fourKings', 'doubleGame', 'volat',
  'pagatUltimo', 'sasUltimo', 'xxiFogas',
];

const IMPORTANCE: Record<SilentFigureType, number> = {
  tuletroa: 18,
  fourKings: 18,
  doubleGame: 28,
  volat: 50,
  pagatUltimo: 34,
  sasUltimo: 30,
  xxiFogas: 36,
};

const DEADLINES: Partial<Record<SilentFigureType, number>> = {
  pagatUltimo: 9,
  sasUltimo: 9,
};

const LABELS: Record<SilentFigureType, string> = {
  tuletroa: 'csendes Trull',
  fourKings: 'csendes Négykirály',
  doubleGame: 'csendes Duplajáték',
  volat: 'csendes Volát',
  pagatUltimo: 'csendes Pagátultimó',
  sasUltimo: 'csendes Sasultimó',
  xxiFogas: 'csendes XXI-fogás',
};

export function assessSilentFigureLandscape(
  state: GameState,
  observerId: PlayerId,
  hypotheses: HandHypothesisSummary,
): SilentFigureLandscape {
  const context = buildSideContext(state, observerId);
  const threats: SilentFigureThreat[] = [];

  const settledSilent = new Set<string>(
    (state.declarations?.silentFigures ?? [])
      .filter(s => s.status === 'fulfilled' || s.status === 'failed')
      .map(s => s.type),
  );

  for (const relation of ['self', 'partner', 'opponent'] as SilentFigureRelation[]) {
    const side = relation === 'opponent' ? opposite(context.observerSide) : context.observerSide;
    for (const type of SILENT_TYPES) {
      // A silent figure has one objective outcome in the deal. Once the
      // authoritative lifecycle has recorded it as fulfilled or failed, it
      // must disappear from the live opportunity landscape. Otherwise the AI
      // could spend future tricks optimizing a figure that cannot change.
      if (settledSilent.has(type)) continue;
      const signal = assessTypePotential(state, observerId, side, relation, type, hypotheses, context);
      if (signal.probability < 0.035 && signal.urgency < 0.5) continue;
      threats.push(signal);
    }
  }

  const ownPotential = threats
    .filter(t => t.relation === 'self')
    .reduce((s, t) => s + t.probability * t.importance * (0.65 + 0.35 * t.urgency), 0);
  const partnerPotential = threats
    .filter(t => t.relation === 'partner')
    .reduce((s, t) => s + t.probability * t.importance * (0.55 + 0.45 * t.urgency), 0);
  const opponentThreat = threats
    .filter(t => t.relation === 'opponent')
    .reduce((s, t) => s + t.probability * t.importance * (0.65 + 0.35 * t.urgency), 0);

  return { threats, ownPotential, partnerPotential, opponentThreat };
}

export function assessSilentFigurePlay(
  state: GameState,
  observerId: PlayerId,
  candidate: Card,
  hypotheses: HandHypothesisSummary,
  landscape?: SilentFigureLandscape,
): SilentFigurePlayAssessment {
  const context = buildSideContext(state, observerId);
  const currentLandscape = landscape ?? assessSilentFigureLandscape(state, observerId, hypotheses);
  const trick = state.trick;
  const closes = !!trick && trick.cards.length + 1 >= state.players.filter(p => p.active).length;
  const candidateWinner = trick?.cards.length
    ? determineWinner(
        [...trick.cards.map(x => ({ playerId: x.player, card: x.card })), { playerId: observerId, card: candidate }],
        trick.cards[0]!.card,
      )
    : observerId;

  const candidateSide = pairOf(candidateWinner, state.takerId ?? '', state.partnerId);
  const supports = {
    own: 0,
    partner: 0,
    opponent: 0,
  };
  const reasons: string[] = [];

  for (const threat of currentLandscape.threats) {
    const delta = candidateEffect(state, observerId, candidate, candidateWinner, candidateSide, closes, threat, context);
    if ((threat.type === 'pagatUltimo' || threat.type === 'sasUltimo') && candidate.id === targetForSilentUltimo(state, observerId, threat)) {
      const timing = silentUltimoTiming(state, observerId, candidate.id, candidateWinner, candidate);
      if (timing > 0 && state.completedTricks.length + 1 === 8)
        reasons.push('8. ütés: a még játékban lévő másik tarokkok miatt a Pagát/Sas kiadása veszteségminimalizáló döntés lehet.');
      else if (timing < 0 && state.completedTricks.length + 1 === 8)
        reasons.push('8. ütés: a többi tarokk már kiesőben vagy nincs játékban, ezért a Pagát/Sas megőrzése indokolt.');
      else if (state.completedTricks.length + 1 === 9 && delta < 0)
        reasons.push('9. ütés: a céllap várhatóan nem tud ütni, ezért a célfigura kockázata közvetlen veszteséggé válhat.');
    }
    if (Math.abs(delta) < 0.015) continue;
    const weight = threat.importance * (0.65 + 0.35 * threat.urgency) * Math.max(0.25, threat.probability);
    const scaled = Math.max(-22, Math.min(22, delta * weight));
    if (threat.relation === 'self') {
      supports.own += scaled;
    } else if (threat.relation === 'partner') {
      supports.partner += scaled;
    } else {
      supports.opponent += -scaled;
    }

    if (Math.abs(scaled) >= 4.0) {
      const direction = scaled > 0 ? 'segíti' : 'veszélyezteti';
      reasons.push(`${threat.label}: ez a kijátszás ${direction} a célt.`);
    }
  }

  // On lead, silent targets should be conserved unless the lead itself is a
  // useful pressure move against a public target in the current trick.
  if (!trick) {
    for (const threat of currentLandscape.threats) {
      if (candidate.id === 'T20' || candidate.id === 'T21' || candidate.id === 'T22') {
        if ((threat.type === 'tuletroa' || threat.type === 'xxiFogas') && threat.relation !== 'opponent') {
          const penalty = threat.probability * (threat.urgency > 0.8 ? 10 : 6);
          if (candidate.id === 'T20' && threat.type === 'tuletroa') supports.own -= penalty;
          if (candidate.id === 'T21' && threat.type === 'tuletroa') supports.own -= penalty;
          if (candidate.id === 'T22' && threat.type === 'tuletroa') supports.own -= penalty;
        }
      }
      if ((threat.type === 'pagatUltimo' || threat.type === 'sasUltimo') && threat.relation !== 'opponent') {
        if (candidate.id === targetForSilentUltimo(state, observerId, threat)) {
          supports.own -= threat.probability * 7;
          supports.partner -= threat.relation === 'partner' ? threat.probability * 6 : 0;
        }
      }
    }
  }

  // When a known target is actually in the current trick, let the candidate
  // winner decide whether the silent figure is being advanced or broken.
  if (trick?.cards.length) {
    if (candidateWinsTarget(trick.cards, candidateWinner, ['T20','T21','T22']) && closes) {
      const winnerGoodForOwn = candidateSide === context.observerSide;
      const winnerIsPartner = candidateWinner === context.partnerId;
      const magnitude = winnerGoodForOwn ? 5 : -5;
      supports.own += magnitude;
      if (winnerIsPartner) supports.partner += 4;
    }
    if (candidateWinsTarget(trick.cards, candidateWinner, ['hearts-K','diamonds-K','spades-K','clubs-K']) && closes) {
      supports.own += candidateSide === context.observerSide ? 4 : -4;
      if (candidateWinner === context.partnerId) supports.partner += 4;
    }
    if (candidateWinsTarget(trick.cards, candidateWinner, ['T21']) && trick.cards.some(x => x.card.id === 'T22') && closes) {
      const catchGood = candidateSide === context.observerSide;
      supports.own += catchGood ? 11 : -11;
      if (candidateWinner === context.partnerId) supports.partner += 9;
    }
  }

  const total = clampSigned(supports.own + supports.partner + supports.opponent, -60, 60);
  if (!reasons.length && Math.abs(total) >= 5) reasons.push(total > 0 ? 'Csendes figurák összességében kedvező irányba mutatnak.' : 'A csendes figurák összességében ellenérvet adnak ehhez a laphoz.');

  return {
    score: total,
    reasons: [...new Set(reasons)].slice(0, 3),
    ownSupport: supports.own,
    partnerSupport: supports.partner,
    opponentDisruption: supports.opponent,
  };
}

function assessTypePotential(
  state: GameState,
  observerId: PlayerId,
  side: 'taker' | 'defence',
  relation: SilentFigureRelation,
  type: SilentFigureType,
  hypotheses: HandHypothesisSummary,
  context: SideContext,
): SilentFigureThreat {
  const base = baseProbability(state, observerId, side, type, hypotheses, context);
  const trickNumber = state.completedTricks.length + 1;
  const deadline = DEADLINES[type];
  const urgency = deadline === undefined
    ? type === 'volat' ? Math.min(1, trickNumber / 9) : 0.35
    : Math.min(1, Math.max(0.15, (trickNumber - 5) / (deadline - 5)));

  const ownerId = ownerIdForSilentUltimo(state, observerId, side, type, hypotheses, context);
  const reasons: string[] = [];
  if (type === 'tuletroa') reasons.push('a három nagy honőr egyoldali elvitelének esélye');
  if (type === 'fourKings') reasons.push('a négy király egyoldali elvitelének esélye');
  if (type === 'doubleGame') reasons.push('a 71 pontos határ várható elérése');
  if (type === 'volat') reasons.push('minden ütés egyoldali kontrollja');
  if (type === 'pagatUltimo' || type === 'sasUltimo') reasons.push('a Pagát/Sas célkártya megőrzése és megnyerése a 9. ütésben; Uhu nem szükséges');
  if (type === 'xxiFogas') reasons.push('a Skíz XXI-fogási lehetősége');

  return {
    type,
    relation,
    ...(ownerId ? { ownerId } : {}),
    probability: clamp(base),
    urgency,
    importance: IMPORTANCE[type],
    label: LABELS[type],
    reasons,
  };
}

function baseProbability(
  state: GameState,
  observerId: PlayerId,
  side: 'taker' | 'defence',
  type: SilentFigureType,
  hypotheses: HandHypothesisSummary,
  context: SideContext,
): number {
  switch (type) {
    case 'tuletroa':
      return allRanksSideProbability(state, observerId, [20,21,22], side, hypotheses, context);
    case 'fourKings':
      return allKingsSideProbability(state, observerId, side);
    case 'doubleGame':
      return doubleGameProbability(state, observerId, side);
    case 'volat':
      return volatProbability(state, side);
    case 'pagatUltimo':
      return ultimoProbability(state, observerId, side, 1, hypotheses, context);
    case 'sasUltimo':
      return ultimoProbability(state, observerId, side, 2, hypotheses, context);
    case 'xxiFogas':
      return xxiFogasProbability(state, observerId, side, hypotheses, context);
  }
}

function allRanksSideProbability(
  state: GameState,
  observerId: PlayerId,
  ranks: number[],
  side: 'taker' | 'defence',
  hypotheses: HandHypothesisSummary,
  context: SideContext,
): number {
  const completed = new Map<number, 'taker' | 'defence' | 'unknown'>();
  for (const trick of state.completedTricks) {
    for (const play of trick.cards) {
      if (isTarokk(play.card) && ranks.includes(play.card.rank)) {
        completed.set(play.card.rank, pairOf(trick.winner ?? play.player, state.takerId ?? '', state.partnerId));
      }
    }
  }

  let totalKnown = 1;
  for (const rank of ranks) {
    const completedSide = completed.get(rank);
    if (completedSide) {
      if (completedSide !== side) return 0;
      continue;
    }

    // A target already played in the open trick is no longer in any hidden
    // hand. Its eventual ownership is the winner of that trick, so use the
    // current winner as a soft prior instead of assigning the card to a hidden
    // world. The exact candidate-play effect is evaluated separately below.
    const openTarget = state.trick?.cards.find(x => isTarokk(x.card) && x.card.rank === rank);
    if (openTarget && state.trick?.cards.length) {
      const openWinner = determineWinner(state.trick.cards.map(x => ({ playerId: x.player, card: x.card })), state.trick.cards[0]!.card);
      const openSide = pairOf(openWinner, state.takerId ?? '', state.partnerId);
      if (openSide === side) totalKnown *= 0.72;
      else if (openSide === opposite(side)) totalKnown *= 0.28;
      else totalKnown *= 0.5;
      continue;
    }

    const own = state.players.find(p => p.id === observerId)?.hand.some(c => isTarokk(c) && c.rank === rank) ?? false;
    const ownSkart = state.skartsByPlayer?.[observerId]?.some(c => isTarokk(c) && c.rank === rank) ?? false;
    if (own || ownSkart) {
      if (context.observerSide !== side) return 0;
      continue;
    }
    const p = probabilityRankOnSide(hypotheses.hypotheses, rank, observerId, context.partnerId, context.observerSide, side);
    totalKnown *= p;
  }
  return clamp(totalKnown);
}

function allKingsSideProbability(state: GameState, observerId: PlayerId, side: 'taker' | 'defence'): number {
  const knownWon = new Map<string, 'taker'|'defence'|'unknown'>();
  for (const trick of state.completedTricks) {
    for (const play of trick.cards) {
      if (play.card.kind === 'suit' && play.card.rank === 'K') {
        knownWon.set(play.card.id, pairOf(trick.winner ?? play.player, state.takerId ?? '', state.partnerId));
      }
    }
  }
  const total = createDeck().filter(c => c.kind === 'suit' && c.rank === 'K');
  const wonBySide = total.filter(c => knownWon.get(c.id) === side).length;
  const wonAgainst = total.filter(c => knownWon.get(c.id) && knownWon.get(c.id) !== side).length;
  if (wonAgainst) return 0;
  const remaining = total.length - wonBySide - total.filter(c => knownWon.has(c.id)).length;
  if (remaining <= 0) return 1;
  const activeHands = state.players.filter(p => p.active);
  const sideCapacity = activeHands
    .filter(p => pairOf(p.id, state.takerId ?? '', state.partnerId) === side)
    .reduce((s,p) => s + p.hand.length, 0);
  const totalCapacity = activeHands.reduce((s,p) => s + p.hand.length, 0) || 1;
  const perKing = sideCapacity / totalCapacity;
  return clamp(Math.pow(Math.max(0.05, Math.min(0.95, perKing)), remaining));
}

function doubleGameProbability(state: GameState, observerId: PlayerId, side: 'taker'|'defence'): number {
  const completedPoints = (state.completedTricks ?? []).reduce((sum, trick) => {
    if (pairOf(trick.winner ?? '', state.takerId ?? '', state.partnerId) !== side) return sum;
    return sum + trick.cards.reduce((s, c) => s + c.card.points, 0);
  }, 0);
  let knownSidePoints = completedPoints;
  let knownResolved = (state.completedTricks ?? []).reduce((sum, trick) => sum + trick.cards.reduce((s,c)=>s+c.card.points,0),0);
  const ownSkart = state.skartsByPlayer?.[observerId] ?? [];
  if (pairOf(observerId, state.takerId ?? '', state.partnerId) === side) {
    const skartPoints = ownSkart.reduce((s,c)=>s+c.points,0);
    knownSidePoints += skartPoints;
    knownResolved += skartPoints;
  }
  if (knownSidePoints >= 71) return 1;
  const remainingPoints = Math.max(0, 94 - knownResolved);
  const active = state.players.filter(p => p.active);
  const sideCards = active.filter(p => pairOf(p.id, state.takerId ?? '', state.partnerId) === side).reduce((s,p)=>s+p.hand.length,0);
  const totalCards = active.reduce((s,p)=>s+p.hand.length,0) || 1;
  const expected = knownSidePoints + remainingPoints * (sideCards / totalCards);
  if (expected + remainingPoints * 0.15 < 71) return 0.04;
  const margin = expected - 71;
  return clamp(0.5 + 0.44 * Math.tanh(margin / 10));
}

function volatProbability(state: GameState, side: 'taker'|'defence'): number {
  for (const trick of state.completedTricks) {
    const winnerSide = pairOf(trick.winner ?? '', state.takerId ?? '', state.partnerId);
    if (winnerSide !== side) return 0;
  }
  const completed = state.completedTricks.length;
  return clamp(0.18 + completed * 0.07);
}

function ultimoProbability(
  state: GameState,
  observerId: PlayerId,
  side: 'taker'|'defence',
  targetRank: 1|2,
  hypotheses: HandHypothesisSummary,
  context: SideContext,
): number {
  const targetId = targetRank === 1 ? 'T1' : 'T2';
  const targetDeclaration = targetRank === 1 ? 'pagatUltimo' : 'sasUltimo';

  // A declared Ultimó is a separate, explicit figure and should not also be
  // treated as a silent figure candidate.
  if (state.declarations.declarations.some(d =>
    d.type === targetDeclaration &&
    d.status !== 'failed'
  )) return 0;

  // Once the target card has been played, the silent Ultimó opportunity is
  // settled by the actual owner of the card. No Uhu declaration is required.
  const playedTrick = state.completedTricks.find(t =>
    t.cards.some(c => c.card.id === targetId)
  );
  if (playedTrick) return 0;

  const finalTrick = state.completedTricks.length >= 9;
  if (finalTrick) return 0;

  // Known ownership: own hand is exact; partner ownership is inferred from
  // the belief worlds; otherwise use the world-weighted side probability.
  const owns = state.players.find(p => p.id === observerId)?.hand.some(c => c.id === targetId) ?? false;
  if (owns) {
    if (context.observerSide !== side) return 0;
    const late = Math.max(0, state.completedTricks.length - 5);
    // Holding the target is necessary but not sufficient: the AI still needs
    // enough late control to win trick 9 with it.
    return clamp(0.24 + late * 0.055 + lateControlProxy(state, observerId));
  }

  const partnerOwnershipChance = context.partnerId
    ? probabilityRankOnSide(hypotheses.hypotheses, targetRank, observerId, context.partnerId, context.observerSide, side)
    : 0;
  if (context.partnerId && context.observerSide === side && partnerOwnershipChance > 0.55) {
    return clamp(0.20 + Math.max(0, state.completedTricks.length - 5) * 0.045 + partnerOwnershipChance * 0.10);
  }

  const ownershipChance = probabilityRankOnSide(
    hypotheses.hypotheses,
    targetRank,
    observerId,
    context.partnerId,
    context.observerSide,
    side,
  );
  const lateFactor = Math.max(0, state.completedTricks.length - 3) * 0.035;
  return clamp(0.04 + ownershipChance * 0.56 + lateFactor + lateControlProxy(state, observerId) * 0.35);
}

function lateControlProxy(state: GameState, observerId: PlayerId): number {
  const me = state.players.find(p => p.id === observerId);
  if (!me) return 0;
  const tarokks = me.hand.filter(isTarokk).length;
  const honours = me.hand.filter(isHonour).length;
  const hasSkiz = me.hand.some(c => c.id === 'T22');
  return Math.min(0.22, tarokks * 0.012 + honours * 0.006 + (hasSkiz ? 0.035 : 0));
}

function xxiFogasProbability(
  state: GameState,
  observerId: PlayerId,
  side: 'taker'|'defence',
  hypotheses: HandHypothesisSummary,
  context: SideContext,
): number {
  const already = state.completedTricks.some(t => {
    const cards = t.cards.map(c=>c.card.id);
    return cards.includes('T21') && cards.includes('T22') && pairOf(t.winner ?? '', state.takerId ?? '', state.partnerId) === side;
  });
  if (already) return 1;

  const completedXxiWithoutSkiz = state.completedTricks.some(t =>
    t.cards.some(c => c.card.id === 'T21') &&
    !t.cards.some(c => c.card.id === 'T22')
  );
  if (completedXxiWithoutSkiz) return 0;

  // An open trick can already contain the two relevant tarokks. In that case
  // the opportunity is public and the current best winner gives us a much
  // stronger estimate than hidden-card ownership priors alone.
  const current = state.trick;
  if (current?.cards.some(c => c.card.id === 'T21') && current.cards.some(c => c.card.id === 'T22')) {
    const winner = determineWinner(current.cards.map(c => ({ playerId: c.player, card: c.card })), current.cards[0]!.card);
    const winnerSide = pairOf(winner, state.takerId ?? '', state.partnerId);
    if (winnerSide === side) return 0.88;
    if (winnerSide === opposite(side)) return 0.08;
    return 0.35;
  }

  const skiz = probabilityRankOnSide(hypotheses.hypotheses, 22, observerId, context.partnerId, context.observerSide, side);
  const xxiOpp = probabilityRankOnSide(hypotheses.hypotheses, 21, observerId, context.partnerId, context.observerSide, opposite(side));
  return clamp(0.02 + skiz * xxiOpp * 0.82);
}

function probabilityRankOnSide(
  worlds: HandHypothesis[],
  rank: number,
  observerId: PlayerId,
  partnerId: PlayerId | undefined,
  observerSide: 'taker'|'defence',
  desiredSide: 'taker'|'defence',
): number {
  return worlds.reduce((sum, world) => {
    const owner = world.ownership[rank];
    if (!owner || owner === 'unknown') return sum;
    const ownerSide = owner === observerId || owner === partnerId ? observerSide : opposite(observerSide);
    return sum + (ownerSide === desiredSide ? world.weight : 0);
  }, 0);
}

function buildSideContext(state: GameState, observerId: PlayerId): SideContext {
  if (!state.takerId) throw new Error('Csendes figurákhoz nincs felvevő.');
  const observerSide = pairOf(observerId, state.takerId, state.partnerId);
  if (observerSide !== 'taker' && observerSide !== 'defence') throw new Error('Az AI oldala nem azonosítható.');
  let partnerId: PlayerId | undefined;
  if (observerId === state.takerId) partnerId = state.partnerId;
  else if (observerId === state.partnerId) partnerId = state.takerId;
  else partnerId = state.players.find(p => p.active && p.id !== observerId && pairOf(p.id, state.takerId ?? '', state.partnerId) === 'defence')?.id;
  return partnerId === undefined ? { observerSide } : { observerSide, partnerId };
}

function opposite(side: 'taker'|'defence'): 'taker'|'defence' { return side === 'taker' ? 'defence' : 'taker'; }
function clamp(n: number): number { return Math.max(0, Math.min(0.95, n)); }
function clampSigned(n: number, min: number, max: number): number { return Math.max(min, Math.min(max, n)); }

function ownerIdForSilentUltimo(
  state: GameState,
  observerId: PlayerId,
  side: 'taker'|'defence',
  type: SilentFigureType,
  hypotheses: HandHypothesisSummary,
  context: SideContext,
): PlayerId | undefined {
  const targetId = type === 'pagatUltimo' ? 'T1' : type === 'sasUltimo' ? 'T2' : undefined;
  if (!targetId) return undefined;

  // Only exact self-information may identify an owner. Partner/opponent hands
  // are hidden and therefore never inspected directly here.
  const owns = state.players.find(p => p.id === observerId)?.hand.some(c => c.id === targetId) ?? false;
  if (owns && context.observerSide === side) return observerId;

  const targetRank = targetId === 'T1' ? 1 : 2;
  if (context.partnerId && context.observerSide === side) {
    const partnerProbability = probabilityRankOnSide(
      hypotheses.hypotheses, targetRank, observerId, context.partnerId, context.observerSide, side,
    );
    if (partnerProbability > 0.55) return context.partnerId;
  }
  return undefined;
}

function targetForSilentUltimo(state: GameState, observerId: PlayerId, threat: SilentFigureThreat): string | undefined {
  if (threat.type === 'pagatUltimo') return 'T1';
  if (threat.type === 'sasUltimo') return 'T2';
  return undefined;
}

function visibleOtherTarokksRemaining(state: GameState, observerId: PlayerId): number {
  const playedTarokks = new Set<string>();
  for (const trick of state.completedTricks ?? []) {
    for (const item of trick.cards ?? []) if (isTarokk(item.card)) playedTarokks.add(item.card.id);
  }
  for (const item of state.trick?.cards ?? []) if (isTarokk(item.card)) playedTarokks.add(item.card.id);
  const ownTarokks = (state.players.find(p => p.id === observerId)?.hand ?? []).filter(isTarokk).map(c => c.id);
  return Math.max(0, 22 - playedTarokks.size - ownTarokks.length);
}

function silentUltimoTiming(state: GameState, observerId: PlayerId, targetId: string, candidateWinner: PlayerId, candidate: Card): number {
  if (candidate.id !== targetId) return 0;
  const trickNumber = state.completedTricks.length + 1;
  if (trickNumber === 9) return candidateWinner === observerId ? 1.20 : -1.55;
  if (trickNumber !== 8) return 0;
  const otherAfterCurrent = visibleOtherTarokksRemaining(state, observerId);
  if (otherAfterCurrent === 0) return -1.35;
  if (otherAfterCurrent === 1) return -0.20;
  return 2.40;
}

function candidateEffect(
  state: GameState,
  observerId: PlayerId,
  candidate: Card,
  candidateWinner: PlayerId,
  candidateSide: 'taker'|'defence'|'unknown',
  closes: boolean,
  threat: SilentFigureThreat,
  context: SideContext,
): number {
  const desiredSide = threat.relation === 'opponent' ? opposite(context.observerSide) : context.observerSide;
  const goodWinner = candidateSide === desiredSide;
  const partnerWinner = candidateWinner === context.partnerId;
  const trick = state.trick;
  const trickNumber = state.completedTricks.length + 1;

  if (!trick) {
    if ((threat.type === 'tuletroa' || threat.type === 'fourKings') && goodWinner) {
      return isTarokk(candidate) && candidate.rank >= 18 ? -0.08 : 0.03;
    }
    if (threat.type === 'doubleGame' && goodWinner && candidate.points <= 1) return 0.03;
    if (threat.type === 'volat' && goodWinner && isTarokk(candidate) && candidate.rank <= 12) return -0.04;
    if ((threat.type === 'pagatUltimo' || threat.type === 'sasUltimo') && candidate.id === (threat.type === 'pagatUltimo' ? 'T1' : 'T2')) return -0.35;
    return 0;
  }

  const hasHonour = trick.cards.some(x => isHonour(x.card));
  const hasT20 = trick.cards.some(x => x.card.id === 'T20');
  const hasT21 = trick.cards.some(x => x.card.id === 'T21');
  const hasT22 = trick.cards.some(x => x.card.id === 'T22');
  const hasKing = trick.cards.some(x => x.card.kind === 'suit' && x.card.rank === 'K');
  const target = threat.type === 'pagatUltimo' ? 'T1' : threat.type === 'sasUltimo' ? 'T2' : undefined;
  const hasTarget = target ? trick.cards.some(x => x.card.id === target) : false;

  if (target) {
    const timing = silentUltimoTiming(state, observerId, target, candidateWinner, candidate);
    if (timing !== 0) return timing;
  }

  if (!closes) {
    if ((threat.type === 'pagatUltimo' || threat.type === 'sasUltimo') && candidate.id === targetForSilentUltimo(state, observerId, threat) && trickNumber < 9) {
      return -0.35;
    }
    if (threat.type === 'doubleGame' && candidateSide === desiredSide && candidate.points <= 5) return 0.04;
    return 0;
  }

  if (threat.type === 'tuletroa') {
    if (hasT20 || hasT21 || hasT22) return goodWinner ? 0.45 : -0.55;
    return goodWinner ? 0.05 : -0.06;
  }
  if (threat.type === 'fourKings') {
    if (hasKing) return goodWinner ? 0.42 : -0.50;
    return goodWinner ? 0.03 : -0.04;
  }
  if (threat.type === 'doubleGame') {
    const points = trick.cards.reduce((s,c)=>s+c.card.points,0) + candidate.points;
    return goodWinner ? Math.min(0.28, points / 25) : -Math.min(0.30, points / 22);
  }
  if (threat.type === 'volat') {
    return goodWinner ? 0.90 : -0.95;
  }
  if (threat.type === 'xxiFogas') {
    if (hasT21 && hasT22) return goodWinner ? 0.98 : -0.98;
    if (hasT21 && isTarokk(candidate) && candidate.rank === 22) return goodWinner ? 0.7 : -0.7;
    return 0;
  }
  if (threat.type === 'pagatUltimo' || threat.type === 'sasUltimo') {
    if (hasTarget && trickNumber === 9) return goodWinner ? 0.98 : -1.15;
    if (candidate.id === target && trickNumber < 9) return -0.8;
    if (partnerWinner && trickNumber >= 7) return 0.18;
    return 0;
  }
  return 0;
}

function candidateWinsTarget(
  cards: Array<{ player: PlayerId; card: Card }>,
  winner: PlayerId,
  targetIds: string[],
): boolean {
  // A target only advances when the candidate's eventual winner actually
  // owns the target card in the completed trick. The earlier implementation
  // only checked whether the target was present anywhere in the trick, which
  // could falsely reward a player for an opponent/partner target.
  return cards.some(x => x.player === winner && targetIds.includes(x.card.id));
}
