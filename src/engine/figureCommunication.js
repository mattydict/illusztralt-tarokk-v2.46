export function resolveBirdCommunicationTarget(context) {
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
