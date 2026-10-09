import type { GameState } from './game.js';

function nonTakerIds(game: GameState): string[] {
  return (game.players ?? []).filter(p => p.active !== false && p.id !== game.takerId).map(p => p.id);
}

function figureDeclarationByNonTaker(game: GameState, declarationWindow?: any): string | undefined {
  const taker = game.takerId;
  if (!taker) return undefined;
  const defenders = publicDefenderIds(game);
  const record = (declarationWindow?.records ?? []).find((r: any) => r?.playerId !== taker && (r?.type === 'declare' || r?.type === 'tarokkCount') && !defenders.has(r.playerId));
  if (record) return record.playerId;
  return game.declarations.declarations.find(d => d.ownerId !== taker && !defenders.has(d.ownerId))?.ownerId;
}

export function publicDefenderIds(game: GameState): Set<string> {
  const ids = new Set<string>();
  const taker = game.takerId;
  if (!taker) return ids;
  for (const r of game.gameContraState?.records ?? []) if (r?.side === 'defence' && r.byPlayer && r.byPlayer !== taker) ids.add(r.byPlayer);
  for (const d of game.declarations.declarations) {
    for (const r of d.contra?.records ?? []) if (r?.side === 'defence' && r.byPlayer && r.byPlayer !== taker) ids.add(r.byPlayer);
  }
  return ids;
}

function calledPartnerFromPlay(game: GameState): string | undefined {
  const taker = game.takerId;
  const called = game.calledTarokk;
  if (!taker || called === undefined) return undefined;
  const cards = [
    ...(game.trick?.cards ?? []),
    ...game.completedTricks.flatMap(t => t.cards ?? []),
  ];
  return cards.find(x => x.player !== taker && x.card.kind === 'tarokk' && Number(x.card.rank) === Number(called))?.player;
}


function contraPartnerFromRecords(game: GameState): string | undefined {
  const taker = game.takerId;
  if (!taker) return undefined;
  const defenders = publicDefenderIds(game);
  if (!defenders.size) return undefined;
  const records = [
    ...(game.gameContraState?.records ?? []),
    ...game.declarations.declarations.flatMap(d => d.contra?.records ?? []),
  ];
  return records.find((r: any) => r?.side === 'taker' && r?.byPlayer && r.byPlayer !== taker && !defenders.has(r.byPlayer))?.byPlayer;
}

function partnerFromDeclarationHistory(game: GameState, declarationWindow?: any): string | undefined {
  const taker = game.takerId;
  if (!taker) return undefined;
  const nonTakers = nonTakerIds(game);
  const defenders = publicDefenderIds(game);
  const records = declarationWindow?.records ?? [];
  const speeches = records.map((r: any, index: number) => ({ ...r, _index: index }))
    .filter((r: any) => r.playerId !== taker && (r.type === 'declare' || r.type === 'tarokkCount'));
  if (defenders.size === 0) return speeches[0]?.playerId;
  if (defenders.size >= 2) return nonTakers.find(id => !defenders.has(id));
  const defender = [...defenders][0];
  const contraIndex = records.findIndex((r: any) => r?.type === 'contraSignal' && r.playerId === defender);
  if (contraIndex < 0) return undefined;
  const before = speeches.find((r: any) => r._index < contraIndex && r.playerId !== defender);
  if (before) return before.playerId;
  const after = speeches.find((r: any) => r._index > contraIndex && r.playerId !== defender);
  if (after) return nonTakers.find(id => id !== defender && id !== after.playerId);
  return undefined;
}

const UNKNOWN_PARTNER_ID = '__UNKNOWN_PARTNER__';

export function publicPartnerIdFromState(game: GameState): string | undefined {
  if (!game.takerId || !game.partnerId) return undefined;
  const explicit = (game as any).publicPartnerId as string | undefined;
  if (explicit) return explicit;
  const called = calledPartnerFromPlay(game);
  if (called) return called;
  const kontraPartner = contraPartnerFromRecords(game);
  if (kontraPartner) return kontraPartner;
  const defenders = publicDefenderIds(game);
  if (defenders.size >= 2) return nonTakerIds(game).find(id => !defenders.has(id));
  if (defenders.size === 1) {
    // Once a defender has publicly countered, another non-taker may announce
    // directly only as the second defender. The hidden partner must first make
    // a public taker-side recontra, which contraPartnerFromRecords handles above.
    const defender = [...defenders][0];
    const secondDefenderSpeech = game.declarations.declarations.find(d =>
      d.ownerId !== game.takerId && d.ownerId !== defender
    );
    if (secondDefenderSpeech) {
      return nonTakerIds(game).find(id => id !== defender && id !== secondDefenderSpeech.ownerId);
    }
    // An 8/9-tarokk disclosure is a declaration signal too. The authoritative
    // declaration window provides chronology; this observer-only fallback is
    // used by AI code that receives the already-public count map.
    const secondDefenderTarokkCount = Object.keys((game as any).announcedTarokkCounts ?? {})
      .find(id => id !== game.takerId && id !== defender);
    if (secondDefenderTarokkCount) {
      return nonTakerIds(game).find(id => id !== defender && id !== secondDefenderTarokkCount);
    }
    return undefined;
  }
  return game.declarations.declarations.find(d => d.ownerId !== game.takerId)?.ownerId;
}

export function knownPartnerIdForObserver(game: GameState, observerId: string): string | undefined {
  if (!game.takerId || !game.partnerId || !observerId) return undefined;
  if (observerId === game.partnerId) return game.takerId;
  return publicPartnerIdFromState(game);
}

export function observerStateView(game: GameState, observerId: string): GameState {
  if (!observerId) return game;
  const known = knownPartnerIdForObserver(game, observerId);
  return { ...game, partnerId: (known ?? UNKNOWN_PARTNER_ID) as any };
}

export function publicPartnerId(game: GameState, round?: any, declarationWindow?: any): string | undefined {
  const taker = game.takerId;
  const actualPartner = game.partnerId;
  if (!taker || !actualPartner) return undefined;
  const explicit = (game as any).publicPartnerId as string | undefined;
  if (explicit) return explicit;
  if (round?.auctionOutcome?.calledTarokk !== undefined && round?.auctionOutcome?.requiredPartnerCallId) return actualPartner;
  const played = calledPartnerFromPlay(game);
  if (played) return played;
  const kontraPartner = contraPartnerFromRecords(game);
  if (kontraPartner) return kontraPartner;
  return partnerFromDeclarationHistory(game, declarationWindow);
}

export function privateSideForPlayer(game: GameState, playerId: string): 'taker'|'partner'|'defence'|'unknown' {
  if (!game.takerId || !playerId) return 'unknown';
  if (playerId === game.takerId) return 'taker';
  if (playerId === game.partnerId) return 'partner';
  return game.players.some(p => p.id === playerId) ? 'defence' : 'unknown';
}

export function publicRoleForPlayer(game: GameState, round: any, declarationWindow: any, playerId: string): 'taker'|'partner'|'defence'|'unknown' {
  if (!game.takerId || !playerId) return 'unknown';
  if (playerId === game.takerId) return 'taker';
  const partner = publicPartnerId(game, round, declarationWindow);
  const defenders = publicDefenderIds(game);
  if (defenders.has(playerId)) return 'defence';
  if (!partner) return 'unknown';
  return playerId === partner ? 'partner' : 'defence';
}

export function isRolePublicForPlayer(game: GameState, round: any, declarationWindow: any, playerId: string): boolean {
  return publicRoleForPlayer(game, round, declarationWindow, playerId) !== 'unknown';
}

export function defenceIsPublic(game: GameState, round: any, declarationWindow: any): boolean {
  return Boolean(publicPartnerId(game, round, declarationWindow));
}


export interface DeclarationFlowView {
  takerId: string;
  currentSpeakerId?: string;
  lastSpeakerId?: string;
  lastSpeechType?: string;
  lastFigure?: string;
  lastTarokkCount?: number;
  lastContraTarget?: string;
  lastContraFigure?: string;
  lastContraLevel?: string;
  pairsKnown: boolean;
  partnerId?: string;
  defenderIds: string[];
  recipientId?: string;
  recipientPlayerIds?: string[];
  recipientKind?: 'last-speaker' | 'opposing-pair';
  directionStatus?: 'addressing-last-speaker' | 'addressing-opposing-pair' | 'speaker-continuing' | 'awaiting-first-speaker';
  /** Sent only in the current speaker's own observer snapshot. */
  currentSpeakerGuidance?: string;
  currentSpeakerRequirement?: 'contra' | 'recontra';
}

/**
 * Public, observer-safe description of the declaration flow. The actual
 * partnership is used only to give private guidance to the current viewer;
 * no private role is included in the public fields.
 */
export function deriveDeclarationFlowView(
  game: GameState,
  round?: any,
  declarationWindow?: any,
  viewerId?: string,
): DeclarationFlowView | undefined {
  if (!game.takerId || !declarationWindow) return undefined;
  const records: any[] = Array.isArray(declarationWindow.records) ? declarationWindow.records : [];
  const lastSignal = [...records].reverse().find(r =>
    r?.type === 'declare' || r?.type === 'tarokkCount' || r?.type === 'contraSignal'
  );
  const lastContraDeclaration = lastSignal?.type === 'contraSignal' && lastSignal.declarationId
    ? (game.declarations?.declarations ?? []).find(d => d.id === lastSignal.declarationId)
    : undefined;
  const currentSpeakerId: string | undefined = declarationWindow.finished
    ? undefined
    : declarationWindow.order?.[declarationWindow.currentIndex];
  const partnerId = publicPartnerId(game, round, declarationWindow);
  const pairsKnown = Boolean(partnerId);
  const defenderIds = [...publicDefenderIds(game)];
  const view: DeclarationFlowView = {
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
