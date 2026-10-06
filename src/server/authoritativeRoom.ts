import {
  createRound, dealRound, finishAuction, distributeRoundTalon, preSkartRedealReason, skartRoundPlayer,
  createInitialState, setPartnership, recordPartnerCall, startDeclarations, startPlay,
  declareFigureInGame, playCard, canRaiseGameContraInGame, raiseGameContraInGame,
  canRaiseDeclarationContraInGame, raiseDeclarationContraInGame,
  getPlayer, type GameState,
} from '../engine/index.js';
import { legalAuctionActions, applyAuctionAction, type AuctionAction, type AuctionState } from '../engine/auction.js';
import { resolveCalledPartner } from '../engine/partnership.js';
import { createDeclarationWindow, currentDeclarer, legalDeclarationActions, applyDeclarationAction, type DeclarationWindowState } from '../engine/declarationWindow.js';
import type { Card } from '../engine/cards.js';
import { legalCardsForPlay } from '../engine/game.js';
import { legalSkartCards } from '../engine/skart.js';
import type { DeclarationContext } from '../engine/declarations.js';
import type { RoundState } from '../engine/round.js';
import type { PlayerAction, AuthoritativeView, PublicEvent, PublicPlayerView, PublicCard } from './protocol.js';

export interface RoomOptions {
  roomId: string;
  playerIds: string[];
  dealerIndex?: number;
  random?: () => number;
  persisted?: PersistedRoomState;
  onCommit?: (state: PersistedRoomState) => void | Promise<void>;
}

export interface PersistedRoomState {
  schemaVersion: 1;
  roomId: string;
  playerIds: string[];
  dealerIndex: number;
  round: RoundState;
  game: GameState | null;
  declarationWindow: DeclarationWindowState | null;
  sequence: number;
  publicEvents: PublicEvent[];
  lastActionAt: number;
  matchScores?: Record<string, number>;
  settlementHistory?: unknown[];
  lastSettlement?: unknown;
  instantScoreHistory?: unknown[];
}

type Listener = (event: PublicEvent) => void;

function cloneCard(card: Card): PublicCard {
  return card.kind === 'tarokk'
    ? { id: card.id, kind: card.kind, rank: card.rank, points: card.points }
    : { id: card.id, kind: card.kind, rank: card.rank, suit: card.suit, points: card.points };
}

function handsMap(round: RoundState): Record<string, Card[]> {
  return Object.fromEntries(round.players.map(p => [p.playerId, p.hand]));
}

function actionType(action: PlayerAction): PlayerAction['type'] { return action.type; }

function phaseOf(round: RoundState, game: GameState | null): string {
  return game ? game.phase : round.phase;
}

function statePlayerIds(round: RoundState): string[] { return round.players.map(p => p.playerId); }
function sameDeclarationAction(expected: any, actual: any): boolean {
  if (!expected || !actual || expected.type !== actual.type || expected.playerId !== actual.playerId) return false;
  if (expected.type === 'pass') return true;
  if (expected.type === 'tarokkCount') return Number(expected.count) === Number(actual.count);
  if (expected.type === 'declare') return expected.declaration === actual.declaration && (expected.targetCardId ?? undefined) === (actual.targetCardId ?? undefined);
  return false;
}

const TALON_COUNTS: Record<RoundState['contract'], number[]> = {
  three: [3, 1, 1, 1],
  two: [2, 2, 1, 1],
  one: [1, 2, 2, 1],
  solo: [0, 2, 2, 2],
};
function repairPersistedTalonState(round: RoundState): RoundState {
  if (!round.takerId || !round.contract || !['talon-distribution', 'skart'].includes(round.phase)) return round;
  const expected = TALON_COUNTS[round.contract];
  const takerIndex = round.players.findIndex(p => p.playerId === round.takerId);
  if (takerIndex < 0) return round;
  const hasCorrectMetadata = round.players.every((p, i) => p.receivedTalon?.length === expected[(i - takerIndex + 4) % 4]);
  if (hasCorrectMetadata && round.phase === 'skart') return round;
  if (round.phase === 'talon-distribution') return distributeRoundTalon({ ...round, parallelSkart: true }, round.talon ?? []);
  const talon = Array.isArray(round.talon) ? round.talon : [];
  const talonIds = new Set(talon.map(c => c.id));
  const talonCardsInHands = round.players.flatMap(p => p.hand.filter(c => talonIds.has(c.id)));
  if (talon.length === 6 && talonCardsInHands.length === 6) {
    const players = round.players.map(p => ({
      ...p,
      receivedTalon: talon.filter(c => p.hand.some(h => h.id === c.id)),
      preSkartSuitCounts: p.preSkartSuitCounts ?? { hearts: 0, diamonds: 0, spades: 0, clubs: 0 },
    }));
    if (players.every((p, i) => p.receivedTalon.length === expected[(i - takerIndex + 4) % 4])) return { ...round, players, parallelSkart: true };
  }
  const noTalonInHands = talon.length === 6 && round.players.every(p => p.hand.length === 9 && (!p.receivedTalon || p.receivedTalon.length === 0));
  if (noTalonInHands) return distributeRoundTalon({ ...round, parallelSkart: true }, talon);
  return round;
}

export class AuthoritativeRoom {
  readonly roomId: string;
  readonly playerIds: string[];
  dealerIndex: number;
  private random: () => number;
  private round: RoundState;
  private game: GameState | null = null;
  private declarationWindow: DeclarationWindowState | null = null;
  private sequence = 0;
  private connected = new Set<string>();
  private listeners = new Set<Listener>();
  private publicEvents: PublicEvent[] = [];
  private onCommit?: (state: PersistedRoomState) => void;
  private lastActionAt = Date.now();
  private matchScores: Record<string, number>;
  private settlementHistory: any[];
  private lastSettlement?: any;
  private instantScoreHistory: any[];

  constructor(options: RoomOptions) {
    if (options.playerIds.length !== 4) throw new Error('A multiplayer szobához jelenleg pontosan 4 játékos szükséges.');
    if (new Set(options.playerIds).size !== options.playerIds.length) throw new Error('A játékosazonosítóknak egyedieknek kell lenniük.');
    this.roomId = options.roomId;
    this.playerIds = [...options.playerIds];
    this.dealerIndex = options.dealerIndex ?? 0;
    this.random = options.random ?? Math.random;
    this.onCommit = options.onCommit;
    this.matchScores = structuredClone(options.persisted?.matchScores ?? Object.fromEntries(this.playerIds.map(id => [id, 0])));
    this.settlementHistory = structuredClone(options.persisted?.settlementHistory ?? (options.persisted?.lastSettlement ? [options.persisted.lastSettlement] : [])) as any[];
    this.instantScoreHistory = structuredClone(options.persisted?.instantScoreHistory ?? []) as any[];
    if (options.persisted) {
      if (options.persisted.schemaVersion !== 1) throw new Error('Ismeretlen mentett szobaverzió.');
      if (options.persisted.roomId !== this.roomId) throw new Error('A mentett szobaazonosító nem egyezik.');
      if (JSON.stringify(options.persisted.playerIds) !== JSON.stringify(this.playerIds)) throw new Error('A mentett játékoslista nem egyezik.');
      this.round = repairPersistedTalonState({ ...options.persisted.round, parallelSkart: true });
      // Migrate older rooms that skipped the fektetés-közlés subphase.
      if (this.round.takerId && this.round.players.every(p => p.skart.length === p.receivedTalon.length)) {
        const needsAnnouncements = (this.round.phase === 'skart' || (this.round.phase === 'partner-call' && !this.round.skartAnnouncementResolved))
          ? this.round.players.some(p => p.playerId !== this.round.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced)
          : false;
        const preparedPlayers = this.round.players.map(p => {
          if (p.playerId === this.round.takerId) {
            return { ...p, skartRevealed: (p.skartTarokkCount ?? p.skart.filter(c => c.kind === 'tarokk').length) > 0, skartAnnounced: true };
          }
          return { ...p, skartAnnounced: (p.skartTarokkCount ?? p.skart.filter(c => c.kind === 'tarokk').length) === 0 ? true : p.skartAnnounced };
        });
        if (this.round.phase === 'skart' || (this.round.phase === 'partner-call' && !this.round.skartAnnouncementResolved)) {
          this.round = {
            ...this.round,
            players: preparedPlayers,
            phase: needsAnnouncements ? 'skart-announcement' : 'partner-call',
            currentPlayerId: needsAnnouncements ? undefined : this.round.takerId,
            skartAnnouncementResolved: !needsAnnouncements,
            eventLog: [...(this.round.eventLog ?? []), needsAnnouncements
              ? 'A fektetés lezárult; szükség szerint következik a fektetés közlése.'
              : 'A fektetés lezárult; következik a kötelező partnerhívás.'],
          };
        }
      }
      this.game = options.persisted.game;
      this.declarationWindow = options.persisted.declarationWindow;
      this.sequence = options.persisted.sequence;
      this.publicEvents = [...options.persisted.publicEvents];
      this.lastSettlement = options.persisted.lastSettlement as any | undefined;
      this.lastActionAt = options.persisted.lastActionAt ?? Date.now();
      this.matchScores = structuredClone(options.persisted.matchScores ?? Object.fromEntries(this.playerIds.map(id => [id, this.round.players.find(p => p.playerId === id)?.score ?? 0])));
      this.settlementHistory = structuredClone(options.persisted.settlementHistory ?? (this.lastSettlement ? [this.lastSettlement] : [])) as any[];
      this.instantScoreHistory = structuredClone(options.persisted.instantScoreHistory ?? []) as any[];
      // Connections are ephemeral and must never be restored as online after a process restart.
      this.connected = new Set();
      return;
    }
    const base = createRound(this.playerIds, (this.dealerIndex + 1) % 4);
    this.round = { ...dealRound(base, this.random), parallelSkart: true };
    for (const id of this.playerIds) this.connected.add(id);
  }

  exportPersistedState(): PersistedRoomState {
    return structuredClone({
      schemaVersion: 1 as const,
      roomId: this.roomId,
      playerIds: this.playerIds,
      dealerIndex: this.dealerIndex,
      round: this.round,
      game: this.game,
      declarationWindow: this.declarationWindow,
      sequence: this.sequence,
      publicEvents: this.publicEvents,
      lastActionAt: this.lastActionAt,
      matchScores: this.matchScores,
      settlementHistory: this.settlementHistory,
      lastSettlement: this.lastSettlement,
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(playerId: string): void {
    this.assertPlayer(playerId);
    this.connected.add(playerId);
  }

  disconnect(playerId: string): void {
    this.assertPlayer(playerId);
    this.connected.delete(playerId);
  }

  get currentPlayerId(): string | undefined {
    if (this.game?.phase === 'declarations') return this.round.currentPlayerId;
    if (this.game) return this.game.players[this.game.nextPlayerIndex]?.id;
    if ((this.round.phase === 'skart' || this.round.phase === 'skart-announcement') && this.round.parallelSkart) return this.round.currentPlayerId;
    return this.round.currentPlayerId ?? this.round.auction.seats[this.round.auction.currentSeat]?.playerId;
  }

  dispatch(playerId: string, expectedSequence: number, action: PlayerAction): AuthoritativeView {
    this.assertPlayer(playerId);
    if (!this.connected.has(playerId)) throw new Error('A játékos nincs csatlakoztatva ehhez a szobához.');
    if (phaseOf(this.round, this.game) === 'auction' && !this.isReady()) throw new Error('A szoba még nem teljes; várd meg mind a négy játékost.');
    const parallelSkartStale = (action.type === 'skart' || action.type === 'skart-announce')
      && (this.round.phase === 'skart' || this.round.phase === 'skart-announcement')
      && this.round.parallelSkart
      && Number.isFinite(expectedSequence)
      && expectedSequence <= this.sequence;
    if (expectedSequence !== this.sequence && !parallelSkartStale) throw new Error(`Elavult játékállapot: várt szekvencia ${this.sequence}.`);
    const before = this.exportPersistedState();
    try {
      const beforePhase = phaseOf(this.round, this.game);
      this.applyAction(playerId, action);
      this.sequence += 1;
      this.lastActionAt = Date.now();
      if (this.onCommit) this.onCommit(this.exportPersistedState());
      const afterPhase = phaseOf(this.round, this.game);
      this.emit({ type: 'action-accepted', playerId, actionType: actionType(action), phase: afterPhase, message: 'Akció elfogadva.' });
      if (beforePhase !== afterPhase) {
        this.emit({ type: 'phase-changed', phase: afterPhase, message: `Fázisváltás: ${afterPhase}.` });
      }
      return this.snapshotFor(playerId);
    } catch (error) {
      this.restorePersistedState(before);
      throw error;
    }
  }


  async dispatchAsync(playerId: string, expectedSequence: number, action: PlayerAction): Promise<AuthoritativeView> {
    this.assertPlayer(playerId);
    if (!this.connected.has(playerId)) throw new Error('A játékos nincs csatlakoztatva ehhez a szobához.');
    if (phaseOf(this.round, this.game) === 'auction' && !this.isReady()) throw new Error('A szoba még nem teljes; várd meg mind a négy játékost.');
    const parallelSkartStale = (action.type === 'skart' || action.type === 'skart-announce')
      && (this.round.phase === 'skart' || this.round.phase === 'skart-announcement')
      && this.round.parallelSkart
      && Number.isFinite(expectedSequence)
      && expectedSequence <= this.sequence;
    if (expectedSequence !== this.sequence && !parallelSkartStale) throw new Error(`Elavult játékállapot: várt szekvencia ${this.sequence}.`);
    const before = this.exportPersistedState();
    try {
      const beforePhase = phaseOf(this.round, this.game);
      this.applyAction(playerId, action);
      this.sequence += 1;
      this.lastActionAt = Date.now();
      if (this.onCommit) await this.onCommit(this.exportPersistedState());
      const afterPhase = phaseOf(this.round, this.game);
      this.emit({ type: 'action-accepted', playerId, actionType: actionType(action), phase: afterPhase, message: 'Akció elfogadva.' });
      if (beforePhase !== afterPhase) {
        this.emit({ type: 'phase-changed', phase: afterPhase, message: `Fázisváltás: ${afterPhase}.` });
      }
      return this.snapshotFor(playerId);
    } catch (error) {
      this.restorePersistedState(before);
      throw error;
    }
  }

  private restorePersistedState(state: PersistedRoomState): void {
    this.round = structuredClone(state.round);
    this.game = structuredClone(state.game);
    this.declarationWindow = structuredClone(state.declarationWindow);
    this.sequence = state.sequence;
    this.publicEvents = structuredClone(state.publicEvents);
    this.lastSettlement = state.lastSettlement ? structuredClone(state.lastSettlement) : this.lastSettlement;
    this.matchScores = structuredClone(state.matchScores ?? this.matchScores);
    this.settlementHistory = structuredClone(state.settlementHistory ?? this.settlementHistory) as any[];
    this.instantScoreHistory = structuredClone(state.instantScoreHistory ?? this.instantScoreHistory) as any[];
    this.lastActionAt = state.lastActionAt;
  }

  private turnTimeoutMs(): number {
    switch (phaseOf(this.round, this.game)) {
      case 'auction': return 90_000;
      case 'skart':
      case 'skart-announcement': return 120_000;
      case 'partner-call': return 60_000;
      case 'declarations': return 60_000;
      case 'play': return 45_000;
      default: return 60_000;
    }
  }

  eventsSince(sequence: number): PublicEvent[] { return this.publicEvents.filter(event => event.sequence > sequence); }

  legalActionHints(playerId: string): Record<string, unknown> {
    this.assertPlayer(playerId);
    const phase = phaseOf(this.round, this.game);
    if (!this.connected.has(playerId)) return { types: [] };
    if (phase === 'auction' && !this.isReady()) return { types: [] };
    const result: Record<string, unknown> = { types: this.legalActionTypes(playerId) };
    if (!this.game && this.round.phase === 'skart' && this.round.parallelSkart) {
      const p = this.round.players.find(x => x.playerId === playerId);
      if (p) {
        const allDone = this.round.players.every(x => x.skart.length === x.receivedTalon.length);
        result.skartCount = p.receivedTalon.length;
        result.skartCardIds = allDone ? [] : legalSkartCards(p.hand, this.round.invitedTarokk).map(c => c.id);
        result.skartComplete = p.skart.length === p.receivedTalon.length;
        result.skartAllDone = allDone;
      }
      return result;
    }
    if (!this.game && this.round.phase === 'skart-announcement' && this.round.parallelSkart) {
      const p = this.round.players.find(x => x.playerId === playerId);
      if (p && p.playerId !== this.round.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced) {
        result.skartNeedsAnnouncement = true;
      }
      return result;
    }
    const current = this.currentPlayerId;
    if (!current || current !== playerId) {
      const declarationContraIds = this.game?.phase === 'declarations'
        ? this.game.declarations.declarations.filter(d => canRaiseDeclarationContraInGame(this.game!, d.id, playerId)).map(d => d.id)
        : [];
      if (this.game && canRaiseGameContraInGame(this.game, playerId)) result.gameContra = true;
      if (declarationContraIds.length) result.declarationContraIds = declarationContraIds;
      return result;
    }
    if (!this.game && this.round.phase === 'auction') {
      result.auctionActions = legalAuctionActions(this.round.auction, playerId, handsMap(this.round));
    } else if (!this.game && this.round.phase === 'skart') {
      const p = this.round.players.find(x => x.playerId === playerId);
      if (p) {
        result.skartCount = p.receivedTalon.length;
        result.skartCardIds = legalSkartCards(p.hand, this.round.invitedTarokk).map(c => c.id);
        result.skartComplete = p.skart.length === p.receivedTalon.length;
      }
    } else if (!this.game && this.round.phase === 'partner-call') {
      result.partnerRanks = ([18, 19, 20] as const).filter(rank => !!resolveCalledPartner(playerId, rank, this.round.players.map(p => ({ id: p.playerId, hand: p.hand }))));
      const required = this.round.auctionOutcome?.calledTarokk;
      if (required !== undefined) result.partnerRanks = [required].filter(rank => (result.partnerRanks as number[]).includes(rank));
    } else if (this.game?.phase === 'declarations' && this.declarationWindow) {
      const gp = getPlayer(this.game, playerId);
      const legal = legalDeclarationActions(this.declarationWindow, playerId, gp.hand, this.declarationContext(playerId));
      result.declarationActions = legal.map(action => {
        if (action.type === 'declare' && (action.declaration === 'kingUltimo' || action.declaration === 'kingUhu')) {
          const targets = gp.hand.filter(c => c.kind === 'suit' && c.rank === 'K').map(c => c.id);
          return targets.map(targetCardId => ({ ...action, targetCardId }));
        }
        return [action];
      }).flat();
    } else if (this.game?.phase === 'play') {
      result.playCardIds = this.game.players[this.game.nextPlayerIndex]?.id === playerId
        ? this.game.players[this.game.nextPlayerIndex].hand.filter(() => true).map(c => c.id)
        : [];
      // The server still validates legality; expose only the cards that the engine allows.
      const legalIds = new Set(legalCardsForPlay(this.game, playerId).map(c => c.id));
      result.playCardIds = [...legalIds];
    }
    return result;
  }

  snapshotFor(playerId: string): AuthoritativeView {
    this.assertPlayer(playerId);
    const publicPlayers = this.round.players.map(p => {
      const own = p.playerId === playerId;
      const revealed = p.skartRevealed ? p.skart.map(cloneCard) : undefined;
      return {
        id: p.playerId,
        cardCount: p.hand.length,
        score: Number(this.matchScores[p.playerId] ?? this.game?.players.find(x => x.id === p.playerId)?.score ?? 0),
        connected: this.connected.has(p.playerId),
        ...(own ? { hand: p.hand.map(cloneCard) } : {}),
        ...(own ? { receivedTalon: p.receivedTalon.map(cloneCard), receivedTalonCount: p.receivedTalon.length } : {}),
        ...(own && p.skart.length ? { ownSkart: p.skart.map(cloneCard) } : {}),
        ...(this.round.parallelSkart ? ((p.skartAnnounced || p.skartRevealed) ? { skartCount: p.skart.length } : {}) : { skartCount: p.skart.length }),
        ...(revealed ? { revealedSkart: revealed } : {}),
      } satisfies PublicPlayerView;
    });
    const auction = this.game ? undefined : {
      currentSeat: this.round.auction.currentSeat,
      highest: this.round.auction.highest,
      finished: this.round.auction.finished,
      out: [...this.round.auction.out],
      records: [...this.round.auction.records],
      outstandingInvite: this.round.auction.outstandingInvite,
      inviteAcceptedBy: this.round.auction.inviteAcceptedBy,
      holdOwnerId: this.round.auction.holdOwnerId,
    } satisfies Partial<AuctionState>;
    const game = this.game ? this.publicGameView(this.game) : undefined;
    return {
      roomId: this.roomId,
      sequence: this.sequence,
      phase: phaseOf(this.round, this.game),
      ...(this.currentPlayerId ? { currentPlayerId: this.currentPlayerId } : {}),
      players: publicPlayers,
      ...(auction ? { auction } : {}),
      ...(game ? { game } : {}),
      scoreboard: { dealsPlayed: this.settlementHistory.length, scores: Object.fromEntries(this.playerIds.map(id => [id, Number(this.matchScores[id] ?? 0)])), history: this.settlementHistory.slice(-12), instantHistory: this.instantScoreHistory.slice(-12) },
      publicEvents: this.publicEvents.slice(-30),
      legalActionTypes: this.legalActionTypes(playerId),
      legalActionHints: this.legalActionHints(playerId),
      ...(this.currentPlayerId ? { turnTimeoutMs: this.turnTimeoutMs(), turnDeadlineAt: this.lastActionAt + this.turnTimeoutMs() } : {}),
    };
  }

  private publicGameView(game: GameState) {
    return {
      phase: game.phase,
      contract: game.contract,
      takerId: game.takerId,
      partnerId: game.partnerId,
      calledTarokk: game.calledTarokk,
      gameContra: game.gameContraState?.level ?? game.gameContra,
      trick: game.trick ? { leader: game.trick.leader, cards: game.trick.cards.map(x => ({ player: x.player, card: cloneCard(x.card) })) } : null,
      completedTricks: game.completedTricks.map(t => ({ leader: t.leader, winner: t.winner, cards: t.cards.map(x => ({ player: x.player, card: cloneCard(x.card) })) })),
      declarations: game.declarations.declarations.map(d => ({ id: d.id, type: d.type, ownerId: d.ownerId, status: d.status, contra: d.contra.level })),
      finalPoints: game.finalPoints,
      settlement: game.settlement,
    };
  }

  private legalActionTypes(playerId: string): PlayerAction['type'][] {
    if (!this.connected.has(playerId)) return [];
    const phase = phaseOf(this.round, this.game);
    if (phase === 'auction' && !this.isReady()) return [];
    if (!this.game && this.round.phase === 'skart') {
      const p = this.round.players.find(x => x.playerId === playerId);
      if (!p) return [];
      const allDone = this.round.players.every(x => x.skart.length === x.receivedTalon.length);
      if (!allDone && p.skart.length < p.receivedTalon.length) return ['skart'];
      return [];
    }
    if (!this.game && this.round.phase === 'skart-announcement') {
      const p = this.round.players.find(x => x.playerId === playerId);
      if (p && p.playerId !== this.round.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced) return ['skart-announce'];
      return [];
    }
    const current = this.currentPlayerId;
    if (!current || current !== playerId) {
      if (this.game?.phase === 'declarations' && this.canContraForAny(playerId)) return ['game-contra', 'declaration-contra'];
      return [];
    }
    if (!this.game) {
      if (this.round.phase === 'auction') return legalAuctionActions(this.round.auction, playerId, handsMap(this.round)).length ? ['auction'] : [];
      if (this.round.phase === 'skart') {
        const p = this.round.players.find(x => x.playerId === playerId)!;
        return p.skart.length < p.receivedTalon.length ? ['skart'] : [];
      }
      if (this.round.phase === 'partner-call') return ['partner-call'];
    }
    if (this.game?.phase === 'declarations') return ['declaration', 'game-contra', 'declaration-contra'];
    if (this.game?.phase === 'play') return ['play-card'];
    return [];
  }

  private canContraForAny(playerId: string): boolean {
    if (!this.game || this.game.phase !== 'declarations') return false;
    if (canRaiseGameContraInGame(this.game, playerId)) return true;
    return this.game.declarations.declarations.some(d => canRaiseDeclarationContraInGame(this.game!, d.id, playerId));
  }

  private applyAction(playerId: string, action: PlayerAction): void {
    switch (action.type) {
      case 'auction': return this.applyAuction(playerId, action.action);
      case 'skart': return this.applySkart(playerId, action.cardIds);
      case 'skart-announce': return this.applySkartAnnouncement(playerId);
      case 'partner-call': return this.applyPartnerCall(playerId, action.rank);
      case 'declaration': return this.applyDeclaration(playerId, action.action);
      case 'game-contra': return this.applyGameContra(playerId);
      case 'declaration-contra': return this.applyDeclarationContra(playerId, action.declarationId);
      case 'play-card': return this.applyPlayCard(playerId, action.cardId);
    }
  }

  private applyAuction(playerId: string, action: AuctionAction): void {
    if (this.round.phase !== 'auction') throw new Error('Most nincs licitfázis.');
    const currentBidder = this.round.auction.seats[this.round.auction.currentSeat]?.playerId;
    if (currentBidder !== playerId) throw new Error('Most nem ennek a játékosnak kell licitálnia.');
    this.round = { ...this.round, auction: applyAuctionAction(this.round.auction, action, handsMap(this.round)) };
    if (!this.round.auction.finished) {
      this.round = { ...this.round, currentPlayerId: this.round.auction.seats[this.round.auction.currentSeat]?.playerId };
      return;
    }
    if (!this.round.auction.highest) {
      this.round = { ...this.round, phase: 'complete', currentPlayerId: undefined, eventLog: [...this.round.eventLog, 'Nincs felvevő; a leosztás érvénytelen.'] };
        return;
    }
    this.round = finishAuction(this.round, this.round.talon);
    this.round = distributeRoundTalon({ ...this.round, parallelSkart: true }, this.round.talon);
    const expectedCounts = { three: [3, 1, 1, 1], two: [2, 2, 1, 1], one: [1, 2, 2, 1], solo: [0, 2, 2, 2] }[this.round.contract as 'three' | 'two' | 'one' | 'solo'];
    const takerIndex = this.round.players.findIndex(p => p.playerId === this.round.takerId);
    if (!expectedCounts || takerIndex < 0 || this.round.players.some((p, i) => p.receivedTalon.length !== expectedCounts[(i - takerIndex + 4) % 4])) {
      throw new Error('A talon kiosztása nem fejeződött be szabályosan.');
    }
  }

  private applySkart(playerId: string, cardIds: string[]): void {
    if (this.round.phase !== 'skart') throw new Error('Most nincs fektetési fázis.');
    const p = this.round.players.find(x => x.playerId === playerId);
    if (!p) throw new Error('Ismeretlen játékos.');
    if (new Set(cardIds).size !== cardIds.length) throw new Error('Egy lapot csak egyszer lehet fektetni.');
    const cards = cardIds.map(id => p.hand.find(c => c.id === id));
    if (cards.some(card => !card)) throw new Error('A fektetés ismeretlen vagy nem a játékos kezében lévő lapot tartalmaz.');
    this.round = skartRoundPlayer(this.round, playerId, cards as Card[]);
  }


  private applySkartAnnouncement(playerId: string): void {
    if (this.round.phase !== 'skart-announcement') throw new Error('Most nincs fektetésközlési fázis.');
    const p = this.round.players.find(x => x.playerId === playerId);
    if (!p) throw new Error('Ismeretlen játékos.');
    if (playerId === this.round.takerId) throw new Error('A felvevő fektetett tarokkjait a rendszer automatikusan felfedi.');
    if ((p.skartTarokkCount ?? 0) <= 0) throw new Error('Nincs mit közölni: nem fektettél tarokkot.');
    if (p.skartAnnounced) throw new Error('A fektetés már közölve lett.');
    const players = this.round.players.map(x => x.playerId === playerId ? { ...x, skartAnnounced: true } : x);
    const pending = players.some(x => x.playerId !== this.round.takerId && (x.skartTarokkCount ?? 0) > 0 && !x.skartAnnounced);
    this.round = pending
      ? { ...this.round, players, currentPlayerId: undefined, eventLog: [...this.round.eventLog, `${playerId} közölte: tarokkot fektetett.`] }
      : { ...this.round, players, phase: 'partner-call', currentPlayerId: this.round.takerId, skartAnnouncementResolved: true, eventLog: [...this.round.eventLog, `${playerId} közölte: tarokkot fektetett.`, 'Minden szükséges fektetésközlés lezárult; következik a kötelező partnerhívás.'] };
  }

  private applyPartnerCall(playerId: string, rank: 18 | 19 | 20): void {
    if (this.round.phase !== 'partner-call' || this.round.takerId !== playerId) throw new Error('A partnerhívást csak a felvevő teheti meg.');
    const required = this.round.auctionOutcome?.calledTarokk;
    if (required !== undefined && required !== rank) throw new Error(`Ebben az invitált játékban a ${required}. tarokkot kötelező meghívni.`);
    const partnerId = resolveCalledPartner(playerId, rank, this.round.players.map(p => ({ id: p.playerId, hand: p.hand })));
    if (!partnerId) throw new Error(`A ${rank}. tarokk nem ad egyértelmű partnert.`);

    const g0 = createInitialState(this.playerIds, this.dealerIndex);
    const players = g0.players.map(p => {
      const source = this.round.players.find(x => x.playerId === p.id)!;
      return { ...p, hand: [...source.hand], active: true };
    });
    let game = setPartnership({ ...g0, players, talon: [], startingPlayerId: this.round.startingPlayerId }, playerId, partnerId);
    game = recordPartnerCall(game, rank, partnerId);
    const takerIndex = game.players.findIndex(p => p.id === playerId);
    game = startDeclarations(game, takerIndex);
    this.game = game;
    this.declarationWindow = createDeclarationWindow([playerId, ...this.playerIds.filter(id => id !== playerId)], true);
    this.round = { ...this.round, phase: 'declarations', currentPlayerId: playerId, calledTarokk: rank };
  }

  private declarationContext(playerId: string): DeclarationContext {
    if (!this.game || !this.round) throw new Error('Nincs aktív játék.');
    const gp = getPlayer(this.game, playerId);
    return {
      isTaker: playerId === this.game.takerId,
      invited: this.round.auctionOutcome?.calledTarokk !== undefined,
      ...(this.round.auctionOutcome?.calledTarokk !== undefined ? { invitedTarokk: this.round.auctionOutcome.calledTarokk as 18 | 19 | 20 } : {}),
      ...(this.round.contract ? { contract: this.round.contract } : {}),
      previousDeclarations: this.game.declarations.declarations.map(d => d.type),
      firstRound: this.declarationWindow?.firstRound ?? true,
      partnersKnown: true,
      ...(playerId === this.game.partnerId ? { isPartner: true } : {}),
      ...(this.round.calledTarokk !== undefined ? { calledTarokk: this.round.calledTarokk as 18 | 19 | 20 } : {}),
      ...(this.game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullDeclared: true } : {}),
      ...(playerId === this.game.takerId && this.round.calledTarokk === 19 && !this.game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullOmittedByTaker: true } : {}),
      xxiThreatScore: this.game.declarations.declarations.some(d => d.type === 'fourKings') ? 6 : 0,
      skizCapturePressure: gp.hand.some(c => c.kind === 'tarokk' && c.rank === 22) ? 5 : 0,
    };
  }

  private applyDeclaration(playerId: string, payload: Omit<import('../engine/declarationWindow.js').DeclarationAction, 'playerId'>): void {
    if (!this.game || this.game.phase !== 'declarations' || !this.declarationWindow) throw new Error('Most nincs bemondási fázis.');
    const action = { ...payload, playerId } as import('../engine/declarationWindow.js').DeclarationAction;
    if (action.type === 'declare') {
      const gp = getPlayer(this.game, playerId);
      const legal = legalDeclarationActions(this.declarationWindow, playerId, gp.hand, this.declarationContext(playerId));
      if (!legal.some(x => JSON.stringify(x) === JSON.stringify(action))) throw new Error('Ez a bemondás ebben a helyzetben nem szabályos.');
      const targetCardId = action.targetCardId;
      this.game = declareFigureInGame(this.game, action.declaration, playerId, this.game.completedTricks.length + 1, targetCardId);
    }
    if (action.type !== 'declare') {
      const gp = getPlayer(this.game, playerId);
      const legal = legalDeclarationActions(this.declarationWindow, playerId, gp.hand, this.declarationContext(playerId));
      if (!legal.some(x => sameDeclarationAction(x, action))) throw new Error('Ez a bemondási akció ebben a helyzetben nem szabályos.');
    }
    const gp = getPlayer(this.game, playerId);
    this.declarationWindow = applyDeclarationAction(this.declarationWindow, action, gp.hand);
    if (action.type === 'tarokkCount') this.recordInstantTarokkScore(playerId, action.count as 8|9);
    if (!this.declarationWindow.finished) {
      const next = currentDeclarer(this.declarationWindow);
      this.round = { ...this.round, currentPlayerId: next };
      return;
    }
    const leaderIndex = this.game.players.findIndex(p => p.id === this.round.startingPlayerId);
    this.game = startPlay({ ...this.game, startingPlayerId: this.round.startingPlayerId }, leaderIndex);
    this.round = { ...this.round, phase: 'play', currentPlayerId: this.game.players[leaderIndex]?.id };
  }

  private applyGameContra(playerId: string): void {
    if (!this.game || !canRaiseGameContraInGame(this.game, playerId)) throw new Error('Most nem mondhatsz kontrát a játékra.');
    this.game = raiseGameContraInGame(this.game, playerId);
  }

  private applyDeclarationContra(playerId: string, declarationId: string): void {
    if (!this.game || !canRaiseDeclarationContraInGame(this.game, declarationId, playerId)) throw new Error('Most nem mondhatsz kontrát erre a bemondásra.');
    this.game = raiseDeclarationContraInGame(this.game, declarationId, playerId);
  }

  private applyPlayCard(playerId: string, cardId: string): void {
    if (!this.game || this.game.phase !== 'play') throw new Error('Most nincs lejátszási fázis.');
    const completedBefore = this.game.completedTricks.length;
    this.game = playCard(this.game, playerId, cardId);
    const firstTrickJustClosed = completedBefore === 0 && this.game.completedTricks.length === 1;
    const nextPhase: RoundState['phase'] = this.game.phase === 'scoring' ? 'scoring' : this.game.phase === 'complete' ? 'complete' : 'play';
    this.round = {
      ...this.round,
      players: firstTrickJustClosed ? this.round.players.map(p => p.playerId === this.round.takerId ? { ...p, skartRevealed: false } : p) : this.round.players,
      currentPlayerId: nextPhase === 'play' ? this.game.players[this.game.nextPlayerIndex]?.id : undefined,
      phase: nextPhase,
    };
    if (this.game.phase !== 'scoring') return;
    const final = this.game.finalPoints;
    const settlement = this.game.settlement;
    if (!final || !settlement || !this.game.takerId || !this.game.partnerId || !this.game.contract) {
      throw new Error('A végelszámolás nem készült el.');
    }
    const net = settlement.netForTakerPair ?? 0;
    const byPlayer: Record<string, number> = { [this.game.takerId]: net, [this.game.partnerId]: net };
    for (const id of this.playerIds) if (!(id in byPlayer)) byPlayer[id] = -net;
    this.lastSettlement = {
      contract: this.game.contract, takerId: this.game.takerId, partnerId: this.game.partnerId, calledTarokk: this.game.calledTarokk,
      result: final.result, takerPairPoints: final.takerPair, defencePairPoints: final.defencePair, netForTakerPair: net, byPlayer,
      declarations: this.game.declarations.declarations.map(d => ({ id: d.id, type: d.type, ownerId: d.ownerId, status: d.status, contra: d.contra?.level ?? 'none' })),
      silentFigures: this.game.declarations.silentFigures.map(s => ({ type: s.type, ownerId: s.ownerId, status: s.status })),
      lines: settlement.lines,
    };
    const accumulated = Object.fromEntries(this.playerIds.map(id => [id, Number(this.matchScores[id] ?? 0)]));
    for (const [id, delta] of Object.entries(byPlayer)) accumulated[id] = (accumulated[id] ?? 0) + delta;
    this.matchScores = accumulated;
    const dealNumber = this.settlementHistory.length + 1;
    this.lastSettlement = { ...this.lastSettlement, dealNumber, dealerIndex: this.dealerIndex };
    this.settlementHistory = [...this.settlementHistory, this.lastSettlement].slice(-100);
    this.dealerIndex = (this.dealerIndex + 1) % this.playerIds.length;
    const base = createRound(this.playerIds, (this.dealerIndex + 1) % this.playerIds.length);
    base.players = base.players.map(p => ({ ...p, score: accumulated[p.playerId] ?? 0 }));
    this.round = dealRound(base, this.random);
    this.round.parallelSkart = true;
    this.game = null;
    this.declarationWindow = null;

  private recordInstantTarokkScore(playerId: string, count: 8|9): void {
    const pointsEach = count === 9 ? 2 : 1;
    const deltas: Record<string, number> = Object.fromEntries(this.playerIds.map(id => [id, id === playerId ? pointsEach * 3 : -pointsEach]));
    for (const id of this.playerIds) this.matchScores[id] = Number(this.matchScores[id] ?? 0) + Number(deltas[id] ?? 0);
    this.instantScoreHistory = [...this.instantScoreHistory, { type: 'tarokk-count', playerId, count, pointsEach, totalWon: pointsEach * 3, deltas, immediate: true }].slice(-100);
    this.publicEvents.push({ sequence: this.sequence, type: 'deal-complete', message: `${playerId} ${count} tarokkot mondott: ${pointsEach} pont játékosonként, azonnal elszámolva.` });
  }
  private redeal(reason: string): void {
    const base = createRound(this.playerIds, (this.dealerIndex + 1) % 4);
    base.players = base.players.map(p => ({ ...p, score: Number(this.matchScores[p.playerId] ?? 0) }));
    this.round = dealRound(base, this.random);
    this.round.parallelSkart = true;
    this.round = { ...this.round, redealCount: Number(this.round.redealCount ?? 0) + 1, redealReason: reason };
    this.game = null;
    this.declarationWindow = null;
    this.publicEvents.push({ sequence: this.sequence, type: 'deal-complete', message: `Újraosztás: ${reason}` });
  }
  isReady(): boolean { return this.connected.size === this.playerIds.length; }

  isConnected(playerId: string): boolean { this.assertPlayer(playerId); return this.connected.has(playerId); }

  private assertPlayer(playerId: string): void {
    if (!this.playerIds.includes(playerId)) throw new Error('A játékos nem tagja ennek a szobának.');
  }

  private emit(partial: Omit<PublicEvent, 'sequence'>): void {
    const event: PublicEvent = { ...partial, sequence: this.sequence };
    this.publicEvents.push(event);
    if (this.publicEvents.length > 100) this.publicEvents.shift();
    for (const listener of this.listeners) listener(event);
  }
}

export function createAuthoritativeRoom(options: RoomOptions): AuthoritativeRoom { return new AuthoritativeRoom(options); }
