import { SignalTarokk } from './signals.js';

export type Pair = 'takerPair' | 'defensePair' | 'declaringPair';
export type TargetLocation = 'speaker' | 'partner';

export type TargetFigure = 'centrum' | 'kismadar' | 'nagymadar';

export interface TargetBelief {
  figure: TargetFigure;
  targetTarokk: SignalTarokk;
  possibleLocations: TargetLocation[];
  targetMayBeInAnnouncingHand: boolean;
  requiredWinningPair: Pair;
  evidence: string[];
}

/**
 * In Illusztrált Tarokk the target card of Centrum/Kismadár/Nagymadár must be
 * available to the declaring pair: the fifth/sixth/seventh trick is won by
 * playing XX/XXI/Skíz. The card may be in the announcer's hand or the partner's
 * hand, but it is not a defence-side ownership hypothesis.
 */
export function targetBeliefFor(figure: TargetFigure): TargetBelief {
  switch (figure) {
    case 'centrum':
      return {
        figure,
        targetTarokk: 20,
        possibleLocations: ['speaker', 'partner'],
        targetMayBeInAnnouncingHand: true,
        requiredWinningPair: 'declaringPair',
        evidence: ['Centrum: az ötödik ütést a XX-szal kell a bemondó párnak megnyernie.'],
      };
    case 'kismadar':
      return {
        figure,
        targetTarokk: 21,
        possibleLocations: ['speaker', 'partner'],
        targetMayBeInAnnouncingHand: true,
        requiredWinningPair: 'declaringPair',
        evidence: ['Kismadár: a hatodik ütést a XXI-gyel kell a bemondó párnak megnyernie.'],
      };
    case 'nagymadar':
      return {
        figure,
        targetTarokk: 22,
        possibleLocations: ['speaker', 'partner'],
        targetMayBeInAnnouncingHand: true,
        requiredWinningPair: 'declaringPair',
        evidence: ['Nagymadár: a hetedik ütést a Skízzel kell a bemondó párnak megnyernie.'],
      };
  }
}

export interface TargetOwnershipHypothesis {
  playerId: string;
  targetTarokk: SignalTarokk;
  probabilityWeight: number;
  reason: string;
}

/**
 * Convert a communication hint into ownership hypotheses without asserting
 * that the announcer owns the target card.
 */
export function targetOwnershipHypotheses(
  figure: TargetFigure,
  speakerId: string,
  partnerId: string,
  _opponentIds: string[],
  partnerEncouraged: boolean,
): TargetOwnershipHypothesis[] {
  const target = targetBeliefFor(figure).targetTarokk;
  return [
    { playerId: speakerId, targetTarokk: target, probabilityWeight: 1, reason: 'A célkártya a bemondó kezében lehet.' },
    { playerId: partnerId, targetTarokk: target, probabilityWeight: partnerEncouraged ? 3 : 1, reason: 'A célkártya a partner kezében lehet; bíztatás esetén ez kiemelt hipotézis.' },
  ];
}
