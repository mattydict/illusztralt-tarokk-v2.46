import { Card, isHonour } from './cards.js';
import { AuctionAction, AuctionState, Contract } from './auction.js';
import { PlayerId } from './game.js';

export interface AuctionOutcome {
  takerId: PlayerId;
  contract: Contract;
  /** Number of talon cards belonging to the taker under the contract. */
  talonCount: 0 | 1 | 2 | 3;
  /** If an accepted invite was won by somebody other than the inviter,
   * that inviter is the player the taker must call. */
  requiredPartnerCallId?: PlayerId;
  /** The tarokk that must be called when an invite was accepted. */
  calledTarokk?: 18 | 19 | 20;
  honourless: boolean;
}

const talonCountByContract: Record<Contract, 0 | 1 | 2 | 3> = {
  three: 3,
  two: 2,
  one: 1,
  solo: 0,
};

export function contractTalonCount(contract: Contract): 0 | 1 | 2 | 3 {
  return talonCountByContract[contract];
}

export function resolveAuctionOutcome(
  auction: AuctionState,
  hands: Record<PlayerId, Card[]>,
  talon: Card[],
): AuctionOutcome {
  if (!auction.finished || !auction.highest) throw new Error('Az aukció még nem zárult le.');
  const highest = auction.highest;
  const invitationRecord = (action: AuctionAction): boolean => {
    const legacy = action as AuctionAction & {
      inviteTarget?: 18 | 19 | 20;
      invitationSignal?: boolean;
      target?: 18 | 19 | 20;
    };
    return action.type === 'invite'
      || (action.type === 'pass' && legacy.inviteTarget !== undefined)
      || legacy.inviteTarget !== undefined
      || (legacy.target !== undefined && legacy.invitationSignal === true);
  };
  let inviterIndex = -1;
  for (let i = auction.records.length - 1; i >= 0; i--) {
    const record = auction.records[i];
    if (record && invitationRecord(record.action)) {
      inviterIndex = i;
      break;
    }
  }
  const inviter = inviterIndex >= 0 ? auction.records[inviterIndex] : undefined;
  const inviterAction = inviter?.action as (AuctionAction & { inviteTarget?: 18 | 19 | 20; target?: 18 | 19 | 20 }) | undefined;
  const inviterTarget = inviterAction?.target ?? inviterAction?.inviteTarget;

  let requiredPartnerCallId: PlayerId | undefined;
  if (inviter && inviterTarget !== undefined && inviter.playerId !== highest.playerId) {
    // Engedés / XX-invit is special: the inviter is the guaranteed partner
    // of the Kettő bidder, so no further acceptance is needed.
    if (inviterTarget === 20 && highest.contract === 'two' && auction.engedes) {
      requiredPartnerCallId = inviter.playerId;
    } else if (auction.inviteAcceptedBy === highest.playerId
      || (auction.inviteResponderId === undefined
        && auction.records.some((r, i) => i > inviterIndex && r.playerId === highest.playerId))) {
      // The called tarokk belongs to the inviter. Acceptance is inferred from
      // the holding/bidding turn, never from the acceptor's private hand.
      requiredPartnerCallId = inviter.playerId;
    }
  }

  const honourless = auction.records.some(
    r => r.playerId === highest.playerId && r.action.type === 'bid' && r.action.honourless === true,
  );
  if (honourless && !talon.some(isHonour)) {
    throw new Error('Honőr nélküli hármasnál a talonban sincs honőr: a leosztás érvénytelen, újra kell osztani.');
  }

  return {
    takerId: highest.playerId,
    contract: highest.contract,
    talonCount: talonCountByContract[highest.contract],
    ...(requiredPartnerCallId ? { requiredPartnerCallId } : {}),
    ...(inviterTarget !== undefined && requiredPartnerCallId ? { calledTarokk: inviterTarget } : {}),
    honourless,
  };
}
