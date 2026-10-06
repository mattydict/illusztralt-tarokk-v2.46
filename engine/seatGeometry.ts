export type SeatRelation = 'self' | 'adjacentLeft' | 'opposite' | 'adjacentRight' | 'unknown';

export interface SeatGeometry {
  relation: SeatRelation;
  isAdjacent: boolean;
  isOpposite: boolean;
  /** True only when the partner is in an adjacent seat; this is not by itself a lyukas-Centrum claim. */
  supportsNonOppositePartnerGeometry: boolean;
}

export function deriveSeatGeometry(speakerSeat: number | undefined, partnerSeat: number | undefined, playerCount = 4): SeatGeometry {
  if (speakerSeat === undefined || partnerSeat === undefined || playerCount < 2) {
    return { relation: 'unknown', isAdjacent: false, isOpposite: false, supportsNonOppositePartnerGeometry: false };
  }
  const distance = (partnerSeat - speakerSeat + playerCount) % playerCount;
  if (distance === 0) return { relation: 'self', isAdjacent: false, isOpposite: false, supportsNonOppositePartnerGeometry: false };
  if (distance === 1) return { relation: 'adjacentRight', isAdjacent: true, isOpposite: false, supportsNonOppositePartnerGeometry: true };
  if (distance === playerCount - 1) return { relation: 'adjacentLeft', isAdjacent: true, isOpposite: false, supportsNonOppositePartnerGeometry: true };
  if (playerCount === 4 && distance === 2) return { relation: 'opposite', isAdjacent: false, isOpposite: true, supportsNonOppositePartnerGeometry: false };
  return { relation: 'unknown', isAdjacent: false, isOpposite: false, supportsNonOppositePartnerGeometry: false };
}
