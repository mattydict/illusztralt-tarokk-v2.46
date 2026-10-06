import { Card, isHonour, isTarokk } from './cards.js';
import { contractTalonCount } from './auctionOutcome.js';
import { Contract } from './auction.js';
import { DeclarationType } from './declarations.js';
import { declaredFigureValue } from './settlement.js';

export interface DealPlanInput {
  hand: Card[];
  contract: Contract;
  isTaker: boolean;
  partnerSupport?: number;
}

export interface DealPlanEvaluation {
  contract: Contract;
  talonCount: 0 | 1 | 2 | 3;
  strength: number;
  successProbability: number;
  gameExpectedValue: number;
  figureExpectedValue: number;
  totalExpectedValue: number;
  riskExposure: number;
  planScore: number;
  reasons: string[];
}

const BASE_SUCCESS: Record<Contract, number> = {
  three: 0.50,
  two: 0.46,
  one: 0.41,
  solo: 0.35,
};

const GAME_RISK_FACTOR: Record<Contract, number> = {
  three: 0.72,
  two: 0.78,
  one: 0.84,
  solo: 0.90,
};

/**
 * Unified pre-deal portfolio model. It is deliberately conservative and
 * does not replace any specialist rule. Its purpose is to make auction,
 * skart, declaration and contra layers price the same strategic question:
 * what is the expected value of entering this deal path?
 */
export function evaluateDealPlan(input: DealPlanInput): DealPlanEvaluation {
  const { hand, contract } = input;
  const reasons: string[] = [];
  const t = hand.filter(isTarokk).length;
  const bigHonours = hand.filter(c => isTarokk(c) && (c.rank === 21 || c.rank === 22)).length;
  const highControl = hand.filter(c => isTarokk(c) && c.rank >= 17 && c.rank <= 20).length;
  const honours = hand.filter(isHonour).length;
  const kings = hand.filter(c => c.kind === 'suit' && c.rank === 'K').length;
  const suitVoidPotential = countNaturalShortness(hand);
  const support = clamp(input.partnerSupport ?? 0.5);
  const talonCount = contractTalonCount(contract);

  let strength =
    t * 0.055
    + bigHonours * 0.145
    + highControl * 0.035
    + honours * 0.025
    + kings * 0.012
    + suitVoidPotential * 0.018;

  // The contract changes the amount of hand improvement available from the
  // talon. A cheaper contract naturally gets more talon leverage.
  const talonImprovement = talonCount * (0.018 + Math.max(0, 0.006 - t * 0.0006));
  strength += talonImprovement;
  if (talonCount > 0) reasons.push(`${talonCount} talonlap javítási lehetőség beárazva.`);
  if (t >= 7) reasons.push('7+ tarokk: magasabb kezdeti kontrollérték.');
  if (bigHonours === 2) reasons.push('Mindkét nagyhonőr: magasabb parti- és figurapotenciál.');
  if (suitVoidPotential > 0) reasons.push('Rövid színstruktúra: a későbbi ütésátadás/vezetés értéke nő.');

  // Keep the hand-strength effect smooth instead of letting a modest hand
  // hit an early hard ceiling. This preserves contract ordering while keeping
  // genuinely stronger and weaker hands distinguishable to downstream line search.
  const normalizedStrength = strength / (1 + strength);
  const strengthContribution = Math.min(0.42, normalizedStrength * 0.45);
  const success = clamp(BASE_SUCCESS[contract] + strengthContribution + support * 0.045);
  const nominalGame = gameNominal(contract);
  const riskExposure = nominalGame * (1 - success) * GAME_RISK_FACTOR[contract];
  const gameExpectedValue = nominalGame * success - riskExposure;
  const figureExpectedValue = estimateFigurePortfolioValue(hand, success, support);
  const totalExpectedValue = gameExpectedValue + figureExpectedValue;

  // Keep the common layer bounded: specialist tactical scores can still
  // dominate where they should. The plan score is a portfolio stabilizer.
  const planScore = clampRange(totalExpectedValue * 1.15, -18, 18);
  if (gameExpectedValue < 0) reasons.push('A szerződés önmagában negatív kockázat-adjustált várható értékű.');
  else reasons.push('A szerződés kockázat-adjustált partiértéke pozitív.');
  if (figureExpectedValue > 2.5) reasons.push('A kéz további figurákra érdemi opcionális értéket hordoz.');
  if (!input.isTaker) reasons.push('Védőoldalon a modell a saját oldal esetleges ellenjáték-értékét konzervatívan kezeli.');

  return {
    contract,
    talonCount,
    strength,
    successProbability: success,
    gameExpectedValue,
    figureExpectedValue,
    totalExpectedValue,
    riskExposure,
    planScore,
    reasons,
  };
}

/** Reuses the same hand economics for the existing contra probability model. */
export function dealPlanSuccessProbability(hand: Card[], contract: Contract, partnerSupport = 0.5): number {
  return evaluateDealPlan({ hand, contract, isTaker: true, partnerSupport }).successProbability;
}

/**
 * Conservative declaration optionality used by phases that need to price a
 * prospective figure without duplicating the whole declaration evaluator.
 */
export function declarationPortfolioValue(hand: Card[], type: DeclarationType, baseSuccess: number): number {
  const nominal = declaredFigureValue(type) ?? 0;
  if (!nominal || type === 'xxiFogas') return 0;
  const optionality = declarationOptionality(hand, type);
  return nominal * clamp(baseSuccess) * optionality;
}

function estimateFigurePortfolioValue(hand: Card[], gameSuccess: number, support: number): number {
  const t = hand.filter(isTarokk).length;
  const pagat = hand.some(c => c.kind === 'tarokk' && c.rank === 1);
  const sas = hand.some(c => c.kind === 'tarokk' && c.rank === 2);
  const skiz = hand.some(c => c.kind === 'tarokk' && c.rank === 22);
  const xxi = hand.some(c => c.kind === 'tarokk' && c.rank === 21);
  const kings = hand.filter(c => c.kind === 'suit' && c.rank === 'K').length;

  let value = 0;
  const successFloor = 0.18 + gameSuccess * 0.35 + support * 0.08;
  if (t >= 8) value += 1.1;
  if (t >= 9) value += 0.9;
  if (kings === 4) value += 1.6;
  if (pagat) value += declarationOptionality(hand, 'pagatUltimo') * 10 * successFloor * 0.28;
  if (sas) value += declarationOptionality(hand, 'sasUltimo') * 10 * successFloor * 0.24;
  if (xxi && t >= 5) value += 10 * declarationOptionality(hand, 'kismadar') * successFloor * 0.12;
  if (skiz && t >= 6) value += 10 * declarationOptionality(hand, 'nagymadar') * successFloor * 0.12;
  return clampRange(value, 0, 9);
}

function declarationOptionality(hand: Card[], type: DeclarationType): number {
  const t = hand.filter(isTarokk).length;
  const has = (rank: number) => hand.some(c => c.kind === 'tarokk' && c.rank === rank);
  switch (type) {
    case 'tarokk8': return t >= 8 ? 1 : 0;
    case 'tarokk9': return t >= 9 ? 1 : 0;
    case 'fourKings': return hand.filter(c => c.kind === 'suit' && c.rank === 'K').length === 4 ? 1 : 0.35;
    case 'centrum': return clamp(0.18 + Number(has(20)) * 0.34 + Number(has(21) || has(22)) * 0.10 + Math.max(0, t - 4) * 0.03);
    case 'kismadar': return clamp(0.14 + Number(has(21)) * 0.32 + Number(has(22)) * 0.12 + Math.max(0, t - 5) * 0.03);
    case 'nagymadar': return clamp(0.12 + Number(has(22)) * 0.34 + Math.max(0, t - 5) * 0.03);
    case 'pagatUltimo': case 'pagatUhu': return clamp(0.14 + Number(has(1)) * 0.36 + Number(has(22)) * 0.13 + Math.max(0, t - 4) * 0.03);
    case 'sasUltimo': case 'sasUhu': return clamp(0.14 + Number(has(2)) * 0.32 + Number(has(22)) * 0.12 + Math.max(0, t - 4) * 0.03);
    case 'kingUltimo': case 'kingUhu': return clamp(0.14 + hand.filter(c => c.kind === 'suit' && c.rank === 'K').length * 0.12 + Math.max(0, t - 4) * 0.02);
    case 'volat': return clamp(0.05 + t * 0.07 + Number(has(21) || has(22)) * 0.06);
    default: return 0.35;
  }
}

function gameNominal(contract: Contract): number {
  return contract === 'three' ? 1 : contract === 'two' ? 2 : contract === 'one' ? 3 : 4;
}

function countNaturalShortness(hand: Card[]): number {
  const counts: Record<string, number> = {};
  for (const card of hand) if (card.kind === 'suit') counts[card.suit] = (counts[card.suit] ?? 0) + 1;
  return Object.values(counts).reduce((sum, count) => sum + (count <= 2 ? 1 : 0), 0);
}

function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function clampRange(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, value)); }
