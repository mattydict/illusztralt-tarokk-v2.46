/**
 * Public/observer-relative partnership knowledge.
 *
 * The game engine always knows the real partner internally. AI and UI logic must
 * not leak that hidden relation before it becomes observable from auction,
 * declarations, contra, or play.
 */
function nonTakerIds(game) {
  return (game?.players ?? []).filter(p => p.active !== false && p.id !== game?.takerId).map(p => p.id);
}

function declarationRecords(round, declarationWindow) {
  return [
    ...(declarationWindow?.records ?? []),
    ...(round?.eventLog ? [] : []),
  ];
}

function figureDeclarationByNonTaker(game, declarationWindow) {
  const taker = game?.takerId;
  if (!taker) return undefined;

  // A figure declaration by the first non-taker who has not already
  // identified themselves as defence reveals that speaker as the partner.
  // A defence player who has already contrated must never be reclassified as
  // partner merely because they subsequently declare another figure.
  const defenders = publicDefenderIds(game);
  const records = declarationRecords(undefined, declarationWindow);
  const hit = records.find(r => r?.playerId !== taker && r?.type === 'declare' && !defenders.has(r.playerId));
  if (hit) return hit.playerId;

  const gameDecl = game?.declarations?.declarations?.find(d => d.ownerId !== taker && !defenders.has(d.ownerId));
  return gameDecl?.ownerId;
}

export function publicDefenderIds(game) {
  const taker = game?.takerId;
  if (!taker) return new Set();
  const ids = new Set();
  for (const r of game?.gameContraState?.records ?? []) {
    if (r?.side === 'defence' && r?.byPlayer && r.byPlayer !== taker) ids.add(r.byPlayer);
  }
  for (const d of game?.declarations?.declarations ?? []) {
    for (const r of d?.contra?.records ?? []) {
      if (r?.side === 'defence' && r?.byPlayer && r.byPlayer !== taker) ids.add(r.byPlayer);
    }
  }
  return ids;
}

function calledPartnerFromPlay(game) {
  const taker = game?.takerId;
  const called = game?.calledTarokk;
  if (!taker || called === undefined) return undefined;
  const cards = [
    ...(game?.trick?.cards ?? []),
    ...((game?.completedTricks ?? []).flatMap(t => t.cards ?? [])),
  ];
  const hit = cards.find(x => x?.player && x.player !== taker && x.card?.kind === 'tarokk' && Number(x.card.rank) === Number(called));
  return hit?.player;
}


const UNKNOWN_PARTNER_ID = '__UNKNOWN_PARTNER__';

export function publicPartnerIdFromState(game) {
  if (!game?.takerId || !game?.partnerId) return undefined;
  if (game.publicPartnerId) return game.publicPartnerId;
  const played = calledPartnerFromPlay(game);
  if (played) return played;
  const defenders = publicDefenderIds(game);
  if (defenders.size >= 2) {
    const remaining = nonTakerIds(game).find(id => !defenders.has(id));
    if (remaining) return remaining;
  }
  const declared = (game.declarations?.declarations ?? []).find(d => d?.ownerId !== game.takerId && !defenders.has(d.ownerId));
  if (declared?.ownerId) return declared.ownerId;
  return undefined;
}

export function knownPartnerIdForObserver(game, observerId) {
  if (!game?.takerId || !game?.partnerId || !observerId) return undefined;
  // The partner always knows that their partner is the taker. The taker does not
  // know the called-card holder until a public signal identifies that player.
  if (observerId === game.partnerId) return game.takerId;
  return publicPartnerIdFromState(game);
}

/**
 * Observer-relative game state for AI decision functions. The engine's internal
 * partnerId remains authoritative elsewhere, but decision code receives only the
 * partnership information that this observer could actually know.
 */
export function observerStateView(game, observerId) {
  if (!game || !observerId) return game;
  const known = knownPartnerIdForObserver(game, observerId);
  return { ...game, partnerId: known ?? UNKNOWN_PARTNER_ID };
}

/** Returns the partner identity once it is publicly inferable. */
export function publicPartnerId(game, round, declarationWindow) {
  const taker = game?.takerId;
  const actualPartner = game?.partnerId;
  if (!taker || !actualPartner) return undefined;

  // Invitation/accepted-invite establishes the pair during the auction itself.
  if (round?.auctionOutcome?.calledTarokk !== undefined && round?.auctionOutcome?.requiredPartnerCallId) {
    return actualPartner;
  }

  // A called tarokk actually played identifies its holder.
  const playedPartner = calledPartnerFromPlay(game);
  if (playedPartner) return playedPartner;

  // A defence-side contra publicly identifies that speaker. With four players,
  // the only remaining non-taker is then necessarily the partner.
  const defenders = publicDefenderIds(game);
  if (defenders.size >= 2) {
    const remaining = nonTakerIds(game).find(id => !defenders.has(id));
    if (remaining) return remaining;
  }

  // If one opponent has self-identified, a non-taker who subsequently makes a
  // figure declaration is necessarily the partner.
  // Tarokk-count announcements are deliberately excluded: they are informational
  // and do not identify the side.
  const declaredPartner = figureDeclarationByNonTaker(game, declarationWindow);
  if (declaredPartner) return declaredPartner;

  return undefined;
}

/**
 * Returns the speaker's own side as the speaker can know it privately.
 * This is observer-relative and does not expose another player's hidden side.
 */
export function privateSideForPlayer(game, playerId) {
  if (!game?.takerId || !playerId) return 'unknown';
  if (playerId === game.takerId) return 'taker';
  if (playerId === game.partnerId) return 'partner';
  if ((game.players ?? []).some(p => p.id === playerId)) return 'defence';
  return 'unknown';
}

/** Public role, as opposed to the speaker's private knowledge. */
export function publicRoleForPlayer(game, round, declarationWindow, playerId) {
  if (!game?.takerId || !playerId) return 'unknown';
  if (playerId === game.takerId) return 'taker';
  const defenders = publicDefenderIds(game);
  if (defenders.has(playerId)) return 'defence';
  const partner = publicPartnerId(game, round, declarationWindow);
  if (!partner) return 'unknown';
  return playerId === partner ? 'partner' : 'defence';
}

export function isRolePublicForPlayer(game, round, declarationWindow, playerId) {
  return publicRoleForPlayer(game, round, declarationWindow, playerId) !== 'unknown';
}

export function defenceIsPublic(game, round, declarationWindow) {
  const partner = publicPartnerId(game, round, declarationWindow);
  return Boolean(partner);
}
