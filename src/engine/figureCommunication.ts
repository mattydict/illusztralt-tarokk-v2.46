/**
 * Shared communication ladder for the Centrum -> Kismadár -> Nagymadár chain.
 *
 * The important distinction is between the figure being prepared and the
 * tarokk used to communicate it. In the special last-seat geometry a higher
 * still-unbound tarokk can be used, so the communicated tarokk may skip one
 * numerical rung. The declaration itself remains the normal figure (the
 * "lyukas" qualification belongs to the communication/fulfilment context).
 */
export type BirdFigure = 'kismadar' | 'nagymadar';

export interface BirdCommunicationContext {
  centrumDeclared: boolean;
  kismadarDeclared: boolean;
  nagymadarDeclared: boolean;
  /** Explicit table-position fact; seat number alone is never inferred. */
  speakerIsLastSeat?: boolean;
  /** A higher tarokk is still unbound by the preceding communication chain. */
  speakerHasHigherUnboundTarokk?: boolean;
}

export interface BirdCommunicationResolution {
  targetFigure?: BirdFigure;
  signalledTarokk?: 15 | 16 | 17;
  /** Number of numeric tarokk rungs skipped by the special geometry. */
  skippedRungs: 0 | 1;
  /** True when the communicated tarokk is one rung lower than normal. */
  hole: boolean;
  /** After Nagymadár there is no further bird figure to prepare. */
  encouragement: boolean;
}

export function resolveBirdCommunicationTarget(
  context: BirdCommunicationContext,
): BirdCommunicationResolution {
  if (!context.centrumDeclared || context.nagymadarDeclared) {
    return {
      skippedRungs: 0,
      hole: false,
      encouragement: true,
    };
  }

  const specialHole = context.speakerIsLastSeat === true &&
    context.speakerHasHigherUnboundTarokk === true;

  if (!context.kismadarDeclared) {
    return {
      targetFigure: 'kismadar',
      signalledTarokk: specialHole ? 16 : 17,
      skippedRungs: specialHole ? 1 : 0,
      hole: specialHole,
      encouragement: false,
    };
  }

  return {
    targetFigure: 'nagymadar',
    signalledTarokk: specialHole ? 15 : 16,
    skippedRungs: specialHole ? 1 : 0,
    hole: specialHole,
    encouragement: false,
  };
}
