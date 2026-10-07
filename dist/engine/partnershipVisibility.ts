import type { GameState } from './game.js';

function nonTakerIds(game: GameState): string[] {
  return (game.players ?? []).filter(p => p.active !== false && p.id !== game.takerId).map(p => p.id);
}

function figureDeclarationByNonTaker(game: GameState, declarationWindow?: any): string | undefined {
  const taker = game.takerId;
  if (!taker) return undefined;
  const defenders = publicDefenderIds(game);
  const record = (declarationWindow?.records ?? []).find((r: any) => r?.playerId !== taker && r?.type === 'declare' && !defenders.has(r.playerId));
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


const UNKNOWN_PARTNER_ID = '__UNKNOWN_PARTNER__';

export function publicPartnerIdFromState(game: GameState): string | undefined {
  if (!game.takerId || !game.partnerId) return undefined;
  const explicit = (game as any).publicPartnerId as string | undefined;
  if (explicit) return explicit;
  const called = calledPartnerFromPlay(game);
  if (called) return called;
  const defenders = publicDefenderIds(game);
  if (defenders.size >= 2) return nonTakerIds(game).find(id => !defenders.has(id));
  const declared = game.declarations.declarations.find(d => d.ownerId !== game.takerId && !defenders.has(d.ownerId));
  return declared?.ownerId;
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
  if (round?.auctionOutcome?.calledTarokk !== undefined && round?.auctionOutcome?.requiredPartnerCallId) return actualPartner;
  const played = calledPartnerFromPlay(game);
  if (played) return played;
  const defenders = publicDefenderIds(game);
  if (defenders.size >= 2) return nonTakerIds(game).find(id => !defenders.has(id));
  return figureDeclarationByNonTaker(game, declarationWindow);
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
