import { isHonour } from './cards.js';
const talonCountByContract = { three: 3, two: 2, one: 1, solo: 0 };
export function contractTalonCount(contract) { return talonCountByContract[contract]; }
function isInvitationRecord(record) {
  const action = record?.action;
  return Boolean(action && (
    action.type === 'invite' ||
    (action.type === 'pass' && action.inviteTarget !== undefined) ||
    action.inviteTarget !== undefined || action.target !== undefined && action.invitationSignal === true
  ));
}
export function resolveAuctionOutcome(auction, hands, talon) {
  if (!auction.finished || !auction.highest) throw new Error('Az aukció még nem zárult le.');
  const highest = auction.highest;
  const inviter = [...auction.records].reverse().find(isInvitationRecord);
  let requiredPartnerCallId;
  if (inviter && inviter.playerId !== highest.playerId) {
    const target = inviter.action.target ?? inviter.action.inviteTarget;
    if (target === 20 && highest.contract === 'two' && auction.engedes) {
      requiredPartnerCallId = inviter.playerId;
    } else if (auction.inviteAcceptedBy === highest.playerId || (auction.inviteResponderId === undefined
      && auction.records.some((r, i) => i > auction.records.indexOf(inviter) && r.playerId === highest.playerId))) {
      // The invited tarokk is held by the inviter, not by the accepting winner.
      // Acceptance is determined by the bidding/holding signal stored in auction state.
      requiredPartnerCallId = inviter.playerId;
    }
  }
  const honourless = auction.records.some(r => r.playerId === highest.playerId && r.action.type === 'bid' && r.action.honourless === true);
  if (honourless && !talon.some(isHonour)) throw new Error('Honőr nélküli hármasnál a talonban sincs honőr: a leosztás érvénytelen, újra kell osztani.');
  return {
    takerId: highest.playerId,
    contract: highest.contract,
    talonCount: talonCountByContract[highest.contract],
    ...(requiredPartnerCallId ? { requiredPartnerCallId } : {}),
    ...(requiredPartnerCallId && inviter ? { calledTarokk: inviter.action.target ?? inviter.action.inviteTarget } : {}),
    honourless,
  };
}
