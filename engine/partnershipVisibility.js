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
  const hit = records.find(r => r?.playerId !== taker && (r?.type === 'declare' || r?.type === 'tarokkCount') && !defenders.has(r.playerId));
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


function contraPartnerFromRecords(game) {
  const taker = game?.takerId;
  if (!taker) return undefined;
  const defenders = publicDefenderIds(game);
  if (!defenders.size) return undefined;
  const records = [
    ...(game?.gameContraState?.records ?? []),
    ...((game?.declarations?.declarations ?? []).flatMap(d => d?.contra?.records ?? [])),
  ];
  return records.find(r => r?.side === 'taker' && r?.byPlayer && r.byPlayer !== taker && !defenders.has(r.byPlayer))?.byPlayer;
}

function partnerFromDeclarationHistory(game, declarationWindow) {
  const taker = game?.takerId;
  if (!taker) return undefined;
  const nonTakers = nonTakerIds(game);
  const defenders = publicDefenderIds(game);
  const records = declarationRecords(undefined, declarationWindow);
  const speeches = records.map((r, index) => ({ ...r, _index: index }))
    .filter(r => r.playerId !== taker && (r.type === 'declare' || r.type === 'tarokkCount'));
  if (defenders.size === 0) return speeches[0]?.playerId;
  if (defenders.size >= 2) return nonTakers.find(id => !defenders.has(id));
  const defender = [...defenders][0];
  const contraIndex = records.findIndex(r => r?.type === 'contraSignal' && r.playerId === defender);
  if (contraIndex < 0) return undefined;
  const before = speeches.find(r => r._index < contraIndex && r.playerId !== defender);
  if (before) return before.playerId;
  const after = speeches.find(r => r._index > contraIndex && r.playerId !== defender);
  if (after) return nonTakers.find(id => id !== defender && id !== after.playerId);
  return undefined;
}

const UNKNOWN_PARTNER_ID = '__UNKNOWN_PARTNER__';

export function publicPartnerIdFromState(game) {
  if (!game?.takerId || !game?.partnerId) return undefined;
  if (game.publicPartnerId) return game.publicPartnerId;
  const played = calledPartnerFromPlay(game);
  if (played) return played;
  const kontraPartner = contraPartnerFromRecords(game);
  if (kontraPartner) return kontraPartner;
  const defenders = publicDefenderIds(game);
  if (defenders.size >= 2) return nonTakerIds(game).find(id => !defenders.has(id));
  if (defenders.size === 1) {
    // Once a defender has publicly countered, another non-taker may announce
    // directly only as the second defender. The hidden partner must first make
    // a public taker-side recontra, which contraPartnerFromRecords handles above.
    const defender = [...defenders][0];
    const secondDefenderSpeech = game.declarations?.declarations?.find(d =>
      d?.ownerId !== game.takerId && d?.ownerId !== defender
    );
    if (secondDefenderSpeech) {
      return nonTakerIds(game).find(id => id !== defender && id !== secondDefenderSpeech.ownerId);
    }
    // An 8/9-tarokk disclosure is a declaration signal too. The authoritative
    // declaration window provides chronology; this observer-only fallback is
    // used by AI code that receives the already-public count map.
    const secondDefenderTarokkCount = Object.keys(game.announcedTarokkCounts ?? {})
      .find(id => id !== game.takerId && id !== defender);
    if (secondDefenderTarokkCount) {
      return nonTakerIds(game).find(id => id !== defender && id !== secondDefenderTarokkCount);
    }
    return undefined;
  }
  return game.declarations?.declarations?.find(d => d?.ownerId !== game.takerId)?.ownerId;
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
  if (game?.publicPartnerId) return game.publicPartnerId;
  // Invitations make the partnership public at auction end.
  if (round?.auctionOutcome?.calledTarokk !== undefined && round?.auctionOutcome?.requiredPartnerCallId) return actualPartner;
  const playedPartner = calledPartnerFromPlay(game);
  if (playedPartner) return playedPartner;
  const kontraPartner = contraPartnerFromRecords(game);
  if (kontraPartner) return kontraPartner;
  return partnerFromDeclarationHistory(game, declarationWindow);
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


/**
 * Public, observer-safe description of the declaration flow. The actual
 * partnership is used only to give private guidance to the current viewer;
 * no private role is included in the public fields.
 */
export function deriveDeclarationFlowView(game, round, declarationWindow, viewerId) {
  if (!game?.takerId || !declarationWindow) return undefined;
  const records = Array.isArray(declarationWindow.records) ? declarationWindow.records : [];
  const lastSignal = [...records].reverse().find(r =>
    r?.type === 'declare' || r?.type === 'tarokkCount' || r?.type === 'contraSignal'
  );
  const lastContraDeclaration = lastSignal?.type === 'contraSignal' && lastSignal.declarationId
    ? (game.declarations?.declarations ?? []).find(d => d.id === lastSignal.declarationId)
    : undefined;
  const currentSpeakerId = declarationWindow.finished
    ? undefined
    : declarationWindow.order?.[declarationWindow.currentIndex];
  const partnerId = publicPartnerId(game, round, declarationWindow);
  const pairsKnown = Boolean(partnerId);
  const defenderIds = [...publicDefenderIds(game)];
  const view = {
    takerId: game.takerId,
    ...(currentSpeakerId ? { currentSpeakerId } : {}),
    pairsKnown,
    defenderIds,
    ...(partnerId ? { partnerId } : {}),
    ...(lastSignal ? {
      lastSpeakerId: lastSignal.playerId,
      lastSpeechType: lastSignal.type,
      ...(lastSignal.type === 'tarokkCount' ? { lastTarokkCount: lastSignal.count } : {}),
      ...(lastSignal.type === 'declare' ? { lastFigure: lastSignal.declaration } : {}),
      ...(lastSignal.type === 'contraSignal' ? {
        lastContraTarget: lastSignal.target,
        ...(lastContraDeclaration?.type ? { lastContraFigure: lastContraDeclaration.type } : {}),
        ...(lastSignal.target === 'game'
          ? (game.gameContraState?.level ? { lastContraLevel: game.gameContraState.level } : {})
          : (() => {
              return lastContraDeclaration?.contra?.level ? { lastContraLevel: lastContraDeclaration.contra.level } : {};
            })()),
      } : {}),
    } : {}),
  };

  if (currentSpeakerId && lastSignal && currentSpeakerId !== lastSignal.playerId && !pairsKnown) {
    view.recipientId = lastSignal.playerId;
    view.recipientKind = 'last-speaker';
    view.directionStatus = 'addressing-last-speaker';
  } else if (pairsKnown && currentSpeakerId) {
    const currentRole = publicRoleForPlayer(game, round, declarationWindow, currentSpeakerId);
    const currentOnTakerPair = currentRole === 'taker' || currentRole === 'partner';
    const recipients = (game.players ?? [])
      .filter(p => p.active !== false && p.id !== currentSpeakerId)
      .filter(p => {
        const role = publicRoleForPlayer(game, round, declarationWindow, p.id);
        return currentOnTakerPair ? role === 'defence' : role === 'taker' || role === 'partner';
      })
      .map(p => p.id);
    if (recipients.length) {
      view.recipientPlayerIds = recipients;
      view.recipientKind = 'opposing-pair';
    }
    view.directionStatus = 'addressing-opposing-pair';
  } else if (currentSpeakerId && lastSignal?.playerId === currentSpeakerId) {
    view.directionStatus = 'speaker-continuing';
  } else if (!lastSignal) {
    view.directionStatus = 'awaiting-first-speaker';
  }

  // Only send the current speaker's role-specific instruction to that speaker.
  // Other players receive the public direction and recipient only.
  if (viewerId && currentSpeakerId === viewerId) {
    const privateSide = privateSideForPlayer(game, viewerId);
    const rolePublic = publicRoleForPlayer(game, round, declarationWindow, viewerId) !== 'unknown';
    const publicDefenceSignal = defenderIds.length > 0;
    if (!rolePublic && privateSide === 'defence' && !publicDefenceSignal) {
      view.currentSpeakerRequirement = 'contra';
      view.currentSpeakerGuidance = 'Ellenpárként előbb kontrával kell jelezned magad; közvetlen bemondás csak ezután szabályos.';
    } else if (!rolePublic && privateSide === 'partner' && publicDefenceSignal && declarationWindow.turnHadContra !== true) {
      view.currentSpeakerRequirement = 'recontra';
      view.currentSpeakerGuidance = 'Felvevőpartnerként előbb rekontráznod kell az ellenpár valamelyik nyilvános kontráját vagy az általa kontrázott bemondást; utána tehetsz bemondást.';
    } else if (pairsKnown) {
      view.currentSpeakerGuidance = 'A párok nyilvánosak; a bemondás címzettje az ellenpár.';
    } else if (!rolePublic && privateSide === 'partner' && !publicDefenceSignal) {
      const target = lastSignal && currentSpeakerId !== lastSignal.playerId ? ` A címzett: ${lastSignal.playerId}.` : '';
      view.currentSpeakerGuidance = `Partnerként közvetlenül tehetsz bemondást; ezzel nyilvánossá válik a partnerség.${target}`;
    } else if (lastSignal && currentSpeakerId !== lastSignal.playerId) {
      view.currentSpeakerGuidance = `A következő bemondás címzettje: ${lastSignal.playerId}.`;
    } else if (currentSpeakerId === lastSignal?.playerId) {
      view.currentSpeakerGuidance = 'Az utolsó megszólaló folytathatja a saját bemondási körét, vagy Passzt mondhat.';
    }
  }
  return view;
}
