import { Card, isHonour, isTarokk } from './cards.js';
import { GameState, PlayerId, getPlayer } from './game.js';

export type Contract = 'three' | 'two' | 'one' | 'solo';
export type BidAction =
  | { type: 'pass' }
  | { type: 'bid'; contract: Contract; honourless?: boolean }
  | { type: 'invite'; target: 20 | 19 | 18; contract?: Contract }
  | { type: 'allow' };

export type InviteTarget = 20 | 19 | 18;

export function inviteTargetForJump(previous: Contract | undefined, announced: Contract): InviteTarget | undefined {
  // No previous contract: an explicit invite may start the auction.
  if (!previous) return undefined;
  const ladder: Contract[] = ['three', 'two', 'one', 'solo'];
  const from = ladder.indexOf(previous);
  const to = ladder.indexOf(announced);
  const jumps = to - from - 1;
  if (jumps === 1) return 19;
  if (jumps === 2) return 18;
  return undefined;
}

export interface BidRecord {
  playerId: PlayerId;
  action: BidAction;
}

export interface BiddingState {
  turnIndex: number;
  records: BidRecord[];
  active: boolean;
  winner?: PlayerId;
  contract?: Contract;
  invitedBy?: PlayerId;
  invitedTarget?: 20 | 19 | 18;
  /** The player who actually accepted the outstanding invite, if any. */
  inviteAcceptedBy?: PlayerId;
  /** Once an invite has been accepted, the inviter may not bid again. */
  inviterLockedOut?: boolean;
}

export interface InviteResolution {
  invitedBy: PlayerId;
  target: InviteTarget;
  accepted: boolean;
  acceptedBy?: PlayerId;
  winnerMustCallInviter: boolean;
}


const order: Contract[] = ['three', 'two', 'one', 'solo'];

// IMPORTANT: 'allow' (tartás/engedés) is deliberately a distinct action.
// It must not be modelled as a normal higher bid: who may hold depends on the
// previous bidding position, and accepting an invite changes the subsequent path.

export function honours(hand: Card[]): Card[] {
  return hand.filter(isHonour);
}

export function tarokkCount(hand: Card[]): number {
  return hand.filter(isTarokk).length;
}

export function canBid(hand: Card[]): boolean {
  return honours(hand).length > 0;
}

/**
 * The only honourless bidding exception: after every other active player has
 * passed, the last player may announce Three without an honour. If no honour
 * is obtained from the talon, the deal is void and must be redealt.
 */
export function canBidHonourlessThree(state: GameState, bidding: BiddingState, playerId: PlayerId): boolean {
  if (!bidding.active || state.players[bidding.turnIndex]?.id !== playerId) return false;
  if (bidding.records.some(r => r.action.type === 'bid' || r.action.type === 'invite' || r.action.type === 'allow')) return false;
  const activeIds = state.players.filter(p => p.active).map(p => p.id);
  if (!activeIds.includes(playerId)) return false;
  const passed = new Set(bidding.records.filter(r => r.action.type === 'pass').map(r => r.playerId));
  return activeIds.filter(id => id !== playerId).every(id => passed.has(id));
}

export function honourInTalon(talon: Card[]): boolean {
  // For the sole honourless-Three validity exception, "honour" means one of
  // the two big honours (XXI/Skíz). Pagát is not enough to validate the deal.
  return talon.some(c => c.kind === 'tarokk' && (c.rank === 21 || c.rank === 22));
}

export function resolveHonourlessThree(talon: Card[]): { valid: boolean; reason: 'honour-found' | 'no-honour' } {
  return honourInTalon(talon)
    ? { valid: true, reason: 'honour-found' }
    : { valid: false, reason: 'no-honour' };
}

export function canInvite(hand: Card[]): boolean {
  const hasBigHonour = hand.some(c => c.kind === 'tarokk' && (c.rank === 21 || c.rank === 22));
  return hasBigHonour && tarokkCount(hand) >= 5;
}

/** Engedés is an XX-invit, so it requires XX and at least five tarokks. */
export function canAllow(hand: Card[]): boolean {
  return tarokkCount(hand) >= 5
    && hand.some(c => c.kind === 'tarokk' && (c.rank === 21 || c.rank === 22))
    && !hand.some(c => c.kind === 'tarokk' && c.rank === 1);
}

export function hasInviteCard(hand: Card[], target: InviteTarget): boolean {
  return hand.some(c => c.kind === 'tarokk' && c.rank === target);
}


/**
 * Determines whether an outstanding invite was actually accepted.
 *
 * In Illusztrált Tarokk the invite is accepted by a later bid from the player
 * who holds the invited tarokk. If nobody bids after the invite, the invite
 * was not accepted; the inviter is then treated under the ordinary bidding
 * rules. There is no counter-invite.
 */
export function resolveInvite(
  bidding: Pick<BiddingState, 'records' | 'invitedBy' | 'invitedTarget'>,
  hands: Record<PlayerId, Card[]>,
  winnerId: PlayerId,
): InviteResolution | undefined {
  if (!bidding.invitedBy || bidding.invitedTarget === undefined) return undefined;
  const target = bidding.invitedTarget;
  const acceptedBy = bidding.records
    .filter(r => r.playerId !== bidding.invitedBy && r.action.type === 'bid')
    .map(r => r.playerId)
    .find(id => hasInviteCard(hands[id] ?? [], target));
  const accepted = acceptedBy !== undefined;
  return {
    invitedBy: bidding.invitedBy,
    target,
    accepted,
    ...(acceptedBy ? { acceptedBy } : {}),
    winnerMustCallInviter: accepted && winnerId !== bidding.invitedBy,
  };
}

/**
 * Apply the structural consequence of an invite without inventing a new bid.
 * If the invite was accepted and somebody else wins, that winner must call the
 * inviter. If the invite was not accepted, the inviter remains an ordinary
 * bidder.
 */
export function applyInviteResolution(
  bidding: BiddingState,
  hands: Record<PlayerId, Card[]>,
  winnerId: PlayerId,
): BiddingState {
  const resolution = resolveInvite(bidding, hands, winnerId);
  if (!resolution) return bidding;
  const next: BiddingState = {
    ...bidding,
    inviterLockedOut: resolution.accepted,
  };
  if (resolution.acceptedBy !== undefined) next.inviteAcceptedBy = resolution.acceptedBy;
  return next;
}

export function legalBids(state: GameState, bidding: BiddingState, playerId: PlayerId): BidAction[] {
  if (!bidding.active || state.players[bidding.turnIndex]?.id !== playerId) return [];
  const player = getPlayer(state, playerId);
  const result: BidAction[] = [{ type: 'pass' }];
  const bids = bidding.records.filter(r => r.action.type === 'bid') as Array<{ playerId: string; action: Extract<BidAction, {type:'bid'}> }>;
  const invites = bidding.records.filter(r => r.action.type === 'invite');
  const previous = bids[bids.length - 1]?.action.contract;

  // An inviter may continue under ordinary bidding rules if nobody has
  // accepted the invite. Once the invited tarokk holder has bid, however,
  // the invite is accepted and the inviter is locked out (no re-invite).
  const outstandingInvite = bidding.invitedBy && bidding.invitedTarget !== undefined
    ? { inviter: bidding.invitedBy, target: bidding.invitedTarget }
    : (() => {
        const last = [...invites].pop();
        if (!last || last.action.type !== 'invite') return undefined;
        return { inviter: last.playerId, target: last.action.target };
      })();
  if (outstandingInvite && outstandingInvite.inviter === playerId) {
    const accepted = bidding.records.some(r =>
      r.playerId !== outstandingInvite!.inviter &&
      r.action.type === 'bid' &&
      hasInviteCard(state.players.find(p => p.id === r.playerId)?.hand ?? [], outstandingInvite!.target),
    );
    if (accepted) return result;
  }

  if (!canBid(player.hand)) {
    if (canBidHonourlessThree(state, bidding, playerId)) result.push({ type: 'bid', contract: 'three', honourless: true });
    return result;
  }

  if (!previous) {
    result.push({ type: 'bid', contract: 'three' });
    result.push({ type: 'bid', contract: 'solo' });
    if (canInvite(player.hand)) {
      for (const target of [20, 19, 18] as const) {
        if (hasInviteCard(player.hand, target)) result.push({ type: 'invite', target, contract: 'solo' });
      }
    }
    return result;
  }

  const ladder: Contract[] = ['three', 'two', 'one', 'solo'];
  const idx = ladder.indexOf(previous);
  if (idx >= 0 && idx < ladder.length - 1) {
    const next = ladder[idx + 1]!;
    result.push({ type: 'bid', contract: next });

    // A one/two-step jump is an invite, not a normal bid. The invited tarokk
    // is determined by the jump: one skipped contract => XIX, two => XVIII.
    if (canInvite(player.hand)) {
      for (const announced of ladder.slice(idx + 2)) {
        const target = inviteTargetForJump(previous, announced);
        if (target !== undefined && hasInviteCard(player.hand, target)) {
          result.push({ type: 'invite', target, contract: announced });
        }
      }
    }
  }

  // Engedés is an XX-invit and is therefore not an unrestricted extra action.
  if (canAllow(player.hand)) result.push({ type: 'allow' });
  return result;
}
