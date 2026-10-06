import { isHonour } from './cards.js';
import { hasInviteCard } from './bidding.js';
const talonCountByContract = {
    three: 3,
    two: 2,
    one: 1,
    solo: 0,
};
export function contractTalonCount(contract) {
    return talonCountByContract[contract];
}
export function resolveAuctionOutcome(auction, hands, talon) {
    if (!auction.finished || !auction.highest)
        throw new Error('Az aukció még nem zárult le.');
    const highest = auction.highest;
    const inviter = [...auction.records].reverse().find(r => r.action.type === 'invite' || r.action.type === 'hold-invite');
    let requiredPartnerCallId;
    if (inviter && (inviter.action.type === 'invite' || inviter.action.type === 'hold-invite') && inviter.playerId !== highest.playerId) {
        const target = inviter.action.target;
        // Engedés / XX-invit is special: the inviter is the guaranteed partner
        // of the Kettő bidder, so no further acceptance is needed.
        if (target === 20 && highest.contract === 'two' && auction.engedes) {
            requiredPartnerCallId = inviter.playerId;
        } else {
            const acceptedBy = auction.records
                .filter(r => r.playerId !== inviter.playerId && r.action.type === 'bid')
                .map(r => r.playerId)
                .find(id => hasInviteCard(hands[id] ?? [], target));
            if (acceptedBy !== undefined)
                requiredPartnerCallId = inviter.playerId;
        }
    }
    const honourless = auction.records.some(r => r.playerId === highest.playerId && r.action.type === 'bid' && r.action.honourless === true);
    if (honourless && !talon.some(isHonour)) {
        throw new Error('Honőr nélküli hármasnál a talonban sincs honőr: a leosztás érvénytelen, újra kell osztani.');
    }
    return {
        takerId: highest.playerId,
        contract: highest.contract,
        talonCount: talonCountByContract[highest.contract],
        ...(requiredPartnerCallId ? { requiredPartnerCallId } : {}),
        ...(inviter && (inviter.action.type === 'invite' || inviter.action.type === 'hold-invite') && requiredPartnerCallId ? { calledTarokk: inviter.action.target } : {}),
        honourless,
    };
}
