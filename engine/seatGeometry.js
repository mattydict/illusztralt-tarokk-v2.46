export function deriveSeatGeometry(speakerSeat, partnerSeat, playerCount = 4) {
    if (speakerSeat === undefined || partnerSeat === undefined || playerCount < 2) {
        return { relation: 'unknown', isAdjacent: false, isOpposite: false, supportsNonOppositePartnerGeometry: false };
    }
    const distance = (partnerSeat - speakerSeat + playerCount) % playerCount;
    if (distance === 0)
        return { relation: 'self', isAdjacent: false, isOpposite: false, supportsNonOppositePartnerGeometry: false };
    if (distance === 1)
        return { relation: 'adjacentRight', isAdjacent: true, isOpposite: false, supportsNonOppositePartnerGeometry: true };
    if (distance === playerCount - 1)
        return { relation: 'adjacentLeft', isAdjacent: true, isOpposite: false, supportsNonOppositePartnerGeometry: true };
    if (playerCount === 4 && distance === 2)
        return { relation: 'opposite', isAdjacent: false, isOpposite: true, supportsNonOppositePartnerGeometry: false };
    return { relation: 'unknown', isAdjacent: false, isOpposite: false, supportsNonOppositePartnerGeometry: false };
}
