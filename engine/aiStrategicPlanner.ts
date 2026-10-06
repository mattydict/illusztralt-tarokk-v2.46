export type StrategicSide = 'taker' | 'defence' | 'unknown';
export type StrategicObjective = 'own-figure' | 'break-opponent-figure' | 'partner-control' | 'neutral';

export interface BirdObjectiveSignal {
  deadline: number;
  successProbability: number;
  breakProbability: number;
  confidence: number;
  label: string;
}

export interface StrategicArbitrationInput {
  trickNumber: number;
  playerSide: StrategicSide;
  partnerWinRate: number;
  continuationScore: number;
  communicationValue: number;
  ownBird?: BirdObjectiveSignal;
  opponentBird?: BirdObjectiveSignal;
  candidateWins: boolean;
  candidateWinsForPartner: boolean;
}

export interface StrategicArbitrationResult {
  score: number;
  priority: StrategicObjective;
  ownUrgency: number;
  defenceUrgency: number;
  reasons: string[];
}

/**
 * Resolve competing multi-trick objectives instead of blindly adding
 * specialist module scores together.
 *
 * This layer is intentionally small. Legality, declaration locks and the
 * specialist tactical rules stay authoritative elsewhere. The arbitrator only
 * decides which already-calculated strategic objective deserves more weight
 * when two objectives point in different directions.
 */
export function arbitrateStrategicObjectives(input: StrategicArbitrationInput): StrategicArbitrationResult {
  const ownUrgency = urgency(input.trickNumber, input.ownBird?.deadline);
  const defenceUrgency = urgency(input.trickNumber, input.opponentBird?.deadline);
  const ownMargin = input.ownBird
    ? confidenceAdjusted(input.ownBird.successProbability - 0.5, input.ownBird.confidence)
    : 0;
  const breakMargin = input.opponentBird
    ? confidenceAdjusted(input.opponentBird.breakProbability - 0.5, input.opponentBird.confidence)
    : 0;

  const ownPressure = ownMargin * ownUrgency;
  const breakPressure = breakMargin * defenceUrgency;
  const partnerPressure = confidenceAdjusted(input.partnerWinRate - 0.5, 0.8);

  let score = 0;
  let priority: StrategicObjective = 'neutral';
  const reasons: string[] = [];

  if (input.ownBird && input.opponentBird) {
    if (ownPressure > breakPressure + 0.08) {
      priority = 'own-figure';
      score += ownPressure * 18;
      reasons.push(`A saját ${input.ownBird.label} célja jelenleg sürgetőbb, mint az ellenfél ${input.opponentBird.label} megtörése.`);
    } else if (breakPressure > ownPressure + 0.08) {
      priority = 'break-opponent-figure';
      score += breakPressure * 18;
      reasons.push(`Az ellenfél ${input.opponentBird.label} veszélye sürgetőbb; a saját cél rövid távú előnye helyett a megtörés kap elsőbbséget.`);
    } else {
      priority = 'partner-control';
      score += partnerPressure * 10;
      reasons.push('A két cél hasonló súlyú; a partner által megszerzett vagy megtartott kontroll dönti el a konfliktust.');
    }
  } else if (input.ownBird) {
    priority = 'own-figure';
    score += ownPressure * 12;
    if (ownPressure > 0.18) reasons.push(`A ${input.ownBird.label} célütésének közelsége miatt a saját páros célja kiemelt.`);
  } else if (input.opponentBird) {
    priority = 'break-opponent-figure';
    score += breakPressure * 12;
    if (breakPressure > 0.18) reasons.push(`Az ellenfél ${input.opponentBird.label} célja ellen most erősebb a védekezési nyomás.`);
  }

  // A partneri kontroll csak akkor kap érdemi pluszt, ha a jelölt ténylegesen
  // a partnernek adja az ütést. Ez prevents a generic "partner bonus" from
  // dominating hands where the candidate wins the trick personally.
  if (input.candidateWinsForPartner && partnerPressure > 0.1) {
    const bonus = Math.min(8, partnerPressure * 12);
    score += bonus;
    if (!reasons.some(r => r.includes('partner'))) {
      reasons.push('A partner valószínű kontrolljának megtartása javítja a következő ütési vonalat.');
    }
  }

  // Continuation score is already computed from the same hidden-world beam.
  // Use a small stabilizer so the arbitration layer resolves conflicts rather
  // than becoming a second, independent rollout evaluator.
  const continuation = Math.max(-8, Math.min(8, input.continuationScore));
  score += continuation * 0.45;

  // Communication is deliberately capped. Signals are probabilistic evidence,
  // never hidden-card facts.
  score += Math.max(-2, Math.min(2, input.communicationValue)) * 0.8;

  if (input.candidateWins && input.playerSide === 'defence' && priority === 'break-opponent-figure') {
    score += 2;
    reasons.push('A védő meg tudja tartani az ellenfél célvonalának megtöréséhez szükséges ütést.');
  }

  return {
    score: Math.max(-25, Math.min(25, score)),
    priority,
    ownUrgency,
    defenceUrgency,
    reasons,
  };
}

function urgency(trickNumber: number, deadline?: number): number {
  if (deadline === undefined) return 0;
  if (trickNumber > deadline) return 0;
  const remaining = Math.max(0, deadline - trickNumber);
  if (remaining === 0) return 3.5;
  if (remaining === 1) return 2.6;
  if (remaining === 2) return 2.0;
  return 1 + Math.max(0, 0.8 - remaining * 0.1);
}

function confidenceAdjusted(margin: number, confidence: number): number {
  return margin * Math.max(0.35, Math.min(1, confidence));
}
