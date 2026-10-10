const contractLabels = { three: 'Hármas', two: 'Kettes', one: 'Egyes', solo: 'Szóló' };

function inviteTargetLabel(target) {
  return target === 20 ? 'XX' : target === 19 ? 'XIX' : target === 18 ? 'XVIII' : `${target}`;
}

/**
 * Display only invite information explicitly emitted by the authoritative
 * auction state. Card ownership and a merely plausible sequence are not
 * sufficient to label an ordinary adjacent bid as an invitation.
 */
export function auctionLabel(action, auction) {
  if (action?.invitationSignalTarget !== undefined) {
    return `Licit: ${contractLabels[action.contract] || action.contract} · ${inviteTargetLabel(action.invitationSignalTarget)}-invit jelzés`;
  }
  if (action?.acceptsInviteTarget !== undefined) {
    const verb = action.type === 'bid'
      ? `Licit: ${contractLabels[action.contract] || action.contract}`
      : `Tartom: ${contractLabels[action.contract] || action.contract}`;
    return `${verb} · ${inviteTargetLabel(action.acceptsInviteTarget)}-invit fogadása`;
  }

  const actor = auction?.seats?.[auction.currentSeat]?.playerId;
  if (action.type === 'pass') {
    if (action.inviteTarget === 20) return 'Engedés / Passz · XX-invit felajánlása';
    if (action.inviteTarget !== undefined) return `Passz · ${inviteTargetLabel(action.inviteTarget)}-invit / partnerhívás`;
    if (auction?.outstandingInvite && auction?.inviteAcceptedBy && auction.outstandingInvite.inviterId === actor) {
      return `Passz · ${inviteTargetLabel(auction.outstandingInvite.target)}-invit lezárása`;
    }
    return 'Passz';
  }
  if (action.type === 'bid') {
    if (action.inviteTarget !== undefined) return `Licit: ${contractLabels[action.contract] || action.contract} · ${inviteTargetLabel(action.inviteTarget)}-invit`;
    if (action.honourless) return 'Honőr nélküli Hármas';
    if (auction?.outstandingInvite && !auction?.inviteAcceptedBy && actor !== auction?.outstandingInvite?.inviterId && actor !== auction?.inviteResponderId) {
      return `Licit: ${contractLabels[action.contract] || action.contract} · folyamatban lévő ${inviteTargetLabel(auction.outstandingInvite.target)}-invit közbeni válasz`;
    }
    return `Licit: ${contractLabels[action.contract] || action.contract}`;
  }
  if (action.type === 'hold') {
    if (auction?.outstandingInvite && auction?.inviteResponderId === actor && !auction?.inviteAcceptedBy) {
      return `Tartom: ${contractLabels[action.contract] || action.contract} · ${inviteTargetLabel(auction.outstandingInvite.target)}-invit fogadása`;
    }
    return `Tartom: ${contractLabels[action.contract] || action.contract}`;
  }
  if (action.type === 'hold-invite') return `Tartom: ${contractLabels[action.contract] || action.contract} · ${inviteTargetLabel(action.target)}-invit fogadása`;
  if (action.type === 'invite') {
    if (action.target === 20) return 'Engedés / Passz · XX-invit';
    return `Licit: ${contractLabels[action.contract || auction?.highest?.contract] || action.contract || 'Licit'} · ${inviteTargetLabel(action.target)}-invit`;
  }
  return action.type;
}
