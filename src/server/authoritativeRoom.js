import { createRound, dealRound, finishAuction, distributeRoundTalon, preSkartRedealReason, skartRoundPlayer, createInitialState, setPartnership, recordPartnerCall, startDeclarations, startPlay, declareFigureInGame, playCard, legalCardsForPlay, canRaiseGameContraInGame, raiseGameContraInGame, canRaiseDeclarationContraInGame, raiseDeclarationContraInGame, getPlayer } from '../engine/index.js';
import { legalAuctionActions, applyAuctionAction } from '../engine/auction.js';
import { resolveCalledPartner, pairOf as pairOfEngine } from '../engine/partnership.js';
import { createDeclarationWindow, declarationOrderFromTaker, currentDeclarer, legalDeclarationActions, applyDeclarationAction, markDeclarationTurnAction } from '../engine/declarationWindow.js';
import { legalSkartCards } from '../engine/skart.js';
import { nextContraLevel } from '../engine/contra.js';
function cloneCard(card) { return card.kind === 'tarokk' ? { id: card.id, kind: card.kind, rank: card.rank, points: card.points } : { id: card.id, kind: card.kind, rank: card.rank, suit: card.suit, points: card.points }; }
function handsMap(round) { return Object.fromEntries(round.players.map(p => [p.playerId, p.hand])); }
function phaseOf(round, game) { return game ? game.phase : round.phase; }
const TALON_COUNTS = { three: [3, 1, 1, 1], two: [2, 2, 1, 1], one: [1, 2, 2, 1], solo: [0, 2, 2, 2] };
function expectedTalonCounts(round) { return round.contract ? TALON_COUNTS[round.contract] : undefined; }
function pairOfId(playerId, takerId, partnerId) { return pairOfEngine(playerId, takerId ?? '', partnerId); }
function contraLabel(level) {
  return { kontra: 'Kontra', rekontra: 'Rekontra', szubkontra: 'Szubkontra', mordkontra: 'Mordkontra' }[level] ?? level;
}
function sameDeclarationAction(expected, actual) {
  if (!expected || !actual || expected.type !== actual.type || expected.playerId !== actual.playerId) return false;
  if (expected.type === 'pass') return true;
  if (expected.type === 'tarokkCount') return Number(expected.count) === Number(actual.count);
  if (expected.type === 'declare') return expected.declaration === actual.declaration && (expected.targetCardId ?? undefined) === (actual.targetCardId ?? undefined);
  return false;
}
function getDeclarationContraActions(game, playerId, currentPlayerId) {
  if (!game || game.phase !== 'declarations' || (currentPlayerId && currentPlayerId !== playerId)) return [];
  return game.declarations.declarations
    .filter(d => canRaiseDeclarationContraInGame(game, d.id, playerId))
    .map(d => ({ id: d.id, type: d.type, ownerId: d.ownerId, level: nextContraLevel(d.contra.level), label: contraLabel(nextContraLevel(d.contra.level)) }));
}
function repairPersistedTalonState(round) {
  if (!round?.takerId || !expectedTalonCounts(round) || !['talon-distribution', 'skart'].includes(round.phase)) return round;
  const expected = expectedTalonCounts(round);
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
      preSkartSuitCounts: p.preSkartSuitCounts ?? suitCounts(p.hand),
    }));
    if (players.every((p, i) => p.receivedTalon.length === expected[(i - takerIndex + 4) % 4])) return { ...round, players, parallelSkart: true };
  }
  const noTalonInHands = talon.length === 6 && round.players.every(p => p.hand.length === 9 && (!p.receivedTalon || p.receivedTalon.length === 0));
  if (noTalonInHands) return distributeRoundTalon({ ...round, parallelSkart: true }, talon);
  return round;
}
export class AuthoritativeRoom {
  constructor(options) {
    if (options.playerIds.length !== 4) throw new Error('A multiplayer szobához jelenleg pontosan 4 játékos szükséges.');
    if (new Set(options.playerIds).size !== options.playerIds.length) throw new Error('A játékosazonosítóknak egyedieknek kell lenniük.');
    this.roomId = options.roomId; this.playerIds = [...options.playerIds]; this.dealerIndex = options.dealerIndex ?? 0; this.random = options.random ?? Math.random; this.matchRounds = [1, 2, 4].includes(Number(options.matchRounds)) ? Number(options.matchRounds) : Number(options.persisted?.matchRounds ?? 4);
    this.onCommit = options.onCommit;
    this.listeners = new Set();
    this.lastSettlement = options.persisted?.lastSettlement ? structuredClone(options.persisted.lastSettlement) : undefined;
    this.matchScores = structuredClone(options.persisted?.matchScores ?? Object.fromEntries(this.playerIds.map(id => [id, 0])));
    this.settlementHistory = structuredClone(options.persisted?.settlementHistory ?? (this.lastSettlement ? [this.lastSettlement] : []));
    this.instantScoreHistory = structuredClone(options.persisted?.instantScoreHistory ?? []);
    if (options.persisted) {
      if (options.persisted.schemaVersion !== 1) throw new Error('Ismeretlen mentett szobaverzió.');
      if (options.persisted.roomId !== this.roomId) throw new Error('A mentett szobaazonosító nem egyezik.');
      if (JSON.stringify(options.persisted.playerIds) !== JSON.stringify(this.playerIds)) throw new Error('A mentett játékoslista nem egyezik.');
      this.matchRounds = [1, 2, 4].includes(Number(options.persisted.matchRounds)) ? Number(options.persisted.matchRounds) : 4;
      this.round = structuredClone(options.persisted.round);
      this.round.parallelSkart = true;
      this.round = repairPersistedTalonState(this.round);
      if (this.round.takerId && this.round.players.every(p => p.skart.length === p.receivedTalon.length)) {
        const legacyNeeds = (this.round.phase === 'skart' || (this.round.phase === 'partner-call' && !this.round.skartAnnouncementResolved));
        if (legacyNeeds) {
          const preparedPlayers = this.round.players.map(p => {
            const tarokkCount = p.skartTarokkCount ?? p.skart.filter(c => c.kind === 'tarokk').length;
            if (p.playerId === this.round.takerId) return { ...p, skartRevealed: tarokkCount > 0, skartAnnounced: true };
            return { ...p, skartAnnounced: tarokkCount === 0 ? true : Boolean(p.skartAnnounced) };
          });
          const needsAnnouncements = preparedPlayers.some(p => p.playerId !== this.round.takerId && (p.skartTarokkCount ?? p.skart.filter(c => c.kind === 'tarokk').length) > 0 && !p.skartAnnounced);
          this.round = { ...this.round, players: preparedPlayers, phase: needsAnnouncements ? 'skart-announcement' : 'partner-call', currentPlayerId: needsAnnouncements ? undefined : this.round.takerId, skartAnnouncementResolved: !needsAnnouncements, eventLog: [...(this.round.eventLog ?? []), needsAnnouncements ? 'A fektetés lezárult; szükség szerint következik a fektetés közlése.' : 'A fektetés lezárult; következik a kötelező partnerhívás.'] };
        }
      }
      this.game = structuredClone(options.persisted.game);
      this.declarationWindow = structuredClone(options.persisted.declarationWindow);
      this.sequence = options.persisted.sequence;
      this.publicEvents = structuredClone(options.persisted.publicEvents);
      this.lastSettlement = options.persisted.lastSettlement ? structuredClone(options.persisted.lastSettlement) : this.lastSettlement;
      this.matchScores = structuredClone(options.persisted.matchScores ?? Object.fromEntries(this.playerIds.map(id => [id, this.round.players.find(p => p.playerId === id)?.score ?? 0])));
      this.settlementHistory = structuredClone(options.persisted.settlementHistory ?? (this.lastSettlement ? [this.lastSettlement] : []));
      this.instantScoreHistory = structuredClone(options.persisted.instantScoreHistory ?? []);
      for (const id of this.playerIds) this.matchScores[id] = Number(this.matchScores[id] ?? 0);
      this.connected = new Set();
      return;
    }
    const base = createRound(this.playerIds, (this.dealerIndex + 1) % 4);
    this.round = dealRound(base, this.random); this.round.parallelSkart = true; this.game = null; this.declarationWindow = null; this.sequence = 0; this.connected = new Set(this.playerIds); this.publicEvents = [];
  }

  exportPersistedState() {
    return structuredClone({ schemaVersion: 1, roomId: this.roomId, playerIds: this.playerIds, dealerIndex: this.dealerIndex, matchRounds: this.matchRounds, round: this.round, game: this.game, declarationWindow: this.declarationWindow, sequence: this.sequence, publicEvents: this.publicEvents, lastSettlement: this.lastSettlement, matchScores: this.matchScores, settlementHistory: this.settlementHistory, instantScoreHistory: this.instantScoreHistory, lastActionAt: this.lastActionAt });
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  connect(playerId) { this.assertPlayer(playerId); this.connected.add(playerId); }
  disconnect(playerId) { this.assertPlayer(playerId); this.connected.delete(playerId); }
  get currentPlayerId() { if (this.game?.phase === 'declarations') return this.round.currentPlayerId; if (this.game) return this.game.players[this.game.nextPlayerIndex]?.id; if ((this.round.phase === 'skart' || this.round.phase === 'skart-announcement') && this.round.parallelSkart) return this.round.currentPlayerId; return this.round.currentPlayerId ?? this.round.auction.seats[this.round.auction.currentSeat]?.playerId; }
  dispatch(playerId, expectedSequence, action) {
    this.assertPlayer(playerId);
    if (!this.connected.has(playerId)) throw new Error('A játékos nincs csatlakoztatva ehhez a szobához.');
    if (phaseOf(this.round, this.game) === 'auction' && !this.isReady()) throw new Error('A szoba még nem teljes; várd meg mind a négy játékost.');
    const parallelSkartStale = (action.type === 'skart' || action.type === 'skart-announce') && (this.round.phase === 'skart' || this.round.phase === 'skart-announcement') && this.round.parallelSkart && Number.isFinite(expectedSequence) && expectedSequence <= this.sequence;
    if (expectedSequence !== this.sequence && !parallelSkartStale) throw new Error(`Elavult játékállapot: várt szekvencia ${this.sequence}.`);
    const before = this.exportPersistedState();
    try {
      const beforePhase = phaseOf(this.round, this.game);
      this.applyAction(playerId, action);
      this.sequence += 1;
      this.lastActionAt = Date.now();
      if (this.onCommit) this.onCommit(this.exportPersistedState());
      const afterPhase = phaseOf(this.round, this.game);
      this.emit({ type: 'action-accepted', playerId, actionType: action.type, phase: afterPhase, message: 'Akció elfogadva.' });
      if (beforePhase !== afterPhase) this.emit({ type: 'phase-changed', phase: afterPhase, message: `Fázisváltás: ${afterPhase}.` });
      return this.snapshotFor(playerId);
    } catch (error) {
      this.restorePersistedState(before);
      throw error;
    }
  }

  async dispatchAsync(playerId, expectedSequence, action) {
    this.assertPlayer(playerId);
    if (!this.connected.has(playerId)) throw new Error('A játékos nincs csatlakoztatva ehhez a szobához.');
    if (phaseOf(this.round, this.game) === 'auction' && !this.isReady()) throw new Error('A szoba még nem teljes; várd meg mind a négy játékost.');
    const parallelSkartStale = (action.type === 'skart' || action.type === 'skart-announce') && (this.round.phase === 'skart' || this.round.phase === 'skart-announcement') && this.round.parallelSkart && Number.isFinite(expectedSequence) && expectedSequence <= this.sequence;
    if (expectedSequence !== this.sequence && !parallelSkartStale) throw new Error(`Elavult játékállapot: várt szekvencia ${this.sequence}.`);
    const before = this.exportPersistedState();
    try {
      const beforePhase = phaseOf(this.round, this.game);
      this.applyAction(playerId, action);
      this.sequence += 1;
      this.lastActionAt = Date.now();
      if (this.onCommit) await this.onCommit(this.exportPersistedState());
      const afterPhase = phaseOf(this.round, this.game);
      this.emit({ type: 'action-accepted', playerId, actionType: action.type, phase: afterPhase, message: 'Akció elfogadva.' });
      if (beforePhase !== afterPhase) this.emit({ type: 'phase-changed', phase: afterPhase, message: `Fázisváltás: ${afterPhase}.` });
      return this.snapshotFor(playerId);
    } catch (error) { this.restorePersistedState(before); throw error; }
  }

  restorePersistedState(state) {
    this.round = structuredClone(state.round); this.game = structuredClone(state.game); this.declarationWindow = structuredClone(state.declarationWindow); this.sequence = state.sequence; this.publicEvents = structuredClone(state.publicEvents); this.lastSettlement = state.lastSettlement ? structuredClone(state.lastSettlement) : this.lastSettlement; this.matchScores = structuredClone(state.matchScores ?? this.matchScores); this.settlementHistory = structuredClone(state.settlementHistory ?? this.settlementHistory); this.lastActionAt = state.lastActionAt;
  }
  turnTimeoutMs() { switch (phaseOf(this.round, this.game)) { case 'auction': return 90000; case 'skart': case 'skart-announcement': return 120000; case 'partner-call': return 60000; case 'declarations': return 60000; case 'play': return 45000; default: return 60000; } }
  eventsSince(sequence) { return this.publicEvents.filter(event => event.sequence > sequence); }
  snapshotFor(playerId) {
    this.assertPlayer(playerId);
    const players = this.round.players.map(p => {
      const own = p.playerId === playerId;
      const revealed = p.skartRevealed ? p.skart.map(cloneCard) : undefined;
      const announcedCount = this.round.parallelSkart ? (p.skartAnnounced || p.skartRevealed) : true;
      return {
        id: p.playerId,
        cardCount: p.hand.length,
        score: Number(this.matchScores[p.playerId] ?? this.game?.players.find(x => x.id === p.playerId)?.score ?? p.score ?? 0),
        connected: this.connected.has(p.playerId),
        ...(own ? { hand: p.hand.map(cloneCard) } : {}),
        ...(own ? { receivedTalon: p.receivedTalon.map(cloneCard), receivedTalonCount: p.receivedTalon.length } : {}),
        ...(own && p.skart.length ? { ownSkart: p.skart.map(cloneCard) } : {}),
        ...(announcedCount ? { skartCount: p.skart.length } : {}),
        ...(revealed ? { revealedSkart: revealed } : {})
      };
    });
    const auction = this.game ? undefined : { currentSeat: this.round.auction.currentSeat, highest: this.round.auction.highest, finished: this.round.auction.finished, out: [...this.round.auction.out], records: [...this.round.auction.records], outstandingInvite: this.round.auction.outstandingInvite, inviteAcceptedBy: this.round.auction.inviteAcceptedBy, holdOwnerId: this.round.auction.holdOwnerId };
    const game = this.game ? this.publicGameView(this.game) : undefined;
    return { roomId: this.roomId, sequence: this.sequence, phase: phaseOf(this.round, this.game), ...(this.currentPlayerId ? { currentPlayerId: this.currentPlayerId } : {}), players, ...(auction ? { auction } : {}), ...(game ? { game } : {}), ...(this.lastSettlement ? { lastSettlement: this.lastSettlement } : {}), match: { rounds: this.matchRounds, dealsPerRound: this.playerIds.length, totalDeals: this.matchRounds * this.playerIds.length, completedDeals: this.settlementHistory.length, currentRound: Math.min(this.matchRounds, Math.floor(this.settlementHistory.length / this.playerIds.length) + 1), complete: phaseOf(this.round, this.game) === 'match-complete' }, scoreboard: { dealsPlayed: this.settlementHistory.length, scores: Object.fromEntries(this.playerIds.map(id => [id, Number(this.matchScores[id] ?? 0)])), history: this.settlementHistory.slice(-12), instantHistory: this.instantScoreHistory.slice(-12) }, publicEvents: this.publicEvents.slice(-30), legalActionTypes: this.legalActionTypes(playerId), legalActionHints: this.legalActionHints(playerId), ...(this.currentPlayerId ? { turnTimeoutMs: this.turnTimeoutMs(), turnDeadlineAt: this.lastActionAt + this.turnTimeoutMs() } : {}) };
  }
  publicGameView(game) { return { phase: game.phase, contract: game.contract, takerId: game.takerId, partnerId: game.partnerId, calledTarokk: game.calledTarokk, gameContra: game.gameContraState?.level ?? game.gameContra, trick: game.trick ? { leader: game.trick.leader, cards: game.trick.cards.map(x => ({ player: x.player, card: cloneCard(x.card) })) } : null, completedTricks: game.completedTricks.map(t => ({ leader: t.leader, winner: t.winner, cards: t.cards.map(x => ({ player: x.player, card: cloneCard(x.card) })) })), declarations: game.declarations.declarations.map(d => ({ id: d.id, type: d.type, ownerId: d.ownerId, status: d.status, contra: d.contra.level })), finalPoints: game.finalPoints, settlement: game.settlement }; }
  legalActionTypes(playerId) {
    if (!this.connected.has(playerId)) return [];
    const phase = phaseOf(this.round, this.game);
    if (phase === 'auction' && !this.isReady()) return [];
    const current = this.currentPlayerId;
    if (!this.game && this.round.phase === 'skart' && this.round.parallelSkart) {
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
    if (this.game?.phase === 'declarations') {
      const types = [];
      if (current === playerId) types.push('declaration', 'game-contra');
      if (getDeclarationContraActions(this.game, playerId, current).length) types.push('declaration-contra');
      return types;
    }
    if (!current || current !== playerId) return [];
    if (!this.game && this.round.phase === 'auction') return this.round.auction.finished ? [] : (legalAuctionActions(this.round.auction, playerId, handsMap(this.round)).length ? ['auction'] : []);
    if (!this.game && this.round.phase === 'partner-call') return ['partner-call'];
    if (this.game?.phase === 'play') return ['play-card'];
    return [];
  }
  legalActionHints(playerId) {
    this.assertPlayer(playerId);
    const phase = phaseOf(this.round, this.game);
    if (!this.connected.has(playerId)) return { types: [] };
    if (phase === 'auction' && !this.isReady()) return { types: [] };

    const result = { types: this.legalActionTypes(playerId) };
    if (!this.game && this.round.phase === 'skart') {
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
    if (!this.game && this.round.phase === 'skart-announcement') {
      const p = this.round.players.find(x => x.playerId === playerId);
      if (p && p.playerId !== this.round.takerId && (p.skartTarokkCount ?? 0) > 0 && !p.skartAnnounced) result.skartNeedsAnnouncement = true;
      return result;
    }
    const current = this.currentPlayerId;
    if (this.game?.phase === 'declarations') {
      if (current === playerId && this.declarationWindow) {
        const gp = getPlayer(this.game, playerId);
        const legal = legalDeclarationActions(this.declarationWindow, playerId, gp.hand, this.declarationContext(playerId));
        result.declarationActions = legal.flatMap(action => {
          if (action.type === 'declare' && (action.declaration === 'kingUltimo' || action.declaration === 'kingUhu')) {
            return gp.hand.filter(c => c.kind === 'suit' && c.rank === 'K').map(targetCard => ({ ...action, targetCardId: targetCard.id }));
          }
          return [action];
        });
        const gameLevel = nextContraLevel(this.game.gameContraState?.level ?? this.game.gameContra ?? 'none');
        if (canRaiseGameContraInGame(this.game, playerId) && gameLevel) result.gameContra = { level: gameLevel, label: contraLabel(gameLevel) };
      }
      const dContra = getDeclarationContraActions(this.game, playerId, current);
      if (dContra.length) result.declarationContraActions = dContra;
      return result;
    }
    if (!current || current !== playerId) return result;
    if (!this.game && this.round.phase === 'auction') {
      result.auctionActions = legalAuctionActions(this.round.auction, playerId, handsMap(this.round));
    } else if (!this.game && this.round.phase === 'partner-call') {
      const player = this.round.players.find(p => p.playerId === playerId);
      const hands = this.round.players.map(p => ({ id: p.playerId, hand: p.hand }));
      const required = this.round.auctionOutcome?.calledTarokk;
      if (required !== undefined) {
        result.partnerRanks = [required].filter(rank => !!resolveCalledPartner(playerId, rank, hands));
      } else if (player) {
        const takerTarokks = new Set(player.hand.filter(c => c.kind === 'tarokk').map(c => Number(c.rank)));
        // No invite: the first unheld tarokk below XIX is the normal partner call;
        // XX is always a legal self-call when the taker holds it. If XX is absent,
        // XX is mandatory and no lower tarokk may be offered.
        const hasXX = takerTarokks.has(20);
        let target = 20;
        if (hasXX) {
          for (let rank = 19; rank >= 2; rank -= 1) {
            if (!takerTarokks.has(rank)) { target = rank; break; }
          }
        }
        result.partnerRanks = [target];
        if (hasXX) result.partnerRanks.push(20);
        result.partnerRanks = [...new Set(result.partnerRanks)].filter(rank => !!resolveCalledPartner(playerId, rank, hands));
      } else result.partnerRanks = [];
    } else if (this.game?.phase === 'play') {
      result.playCardIds = legalCardsForPlay(this.game, playerId).map(c => c.id);
    }
    return result;
  }
  canContraForAny(playerId) { if (!this.game || this.game.phase !== 'declarations') return false; if (canRaiseGameContraInGame(this.game, playerId)) return true; return this.game.declarations.declarations.some(d => canRaiseDeclarationContraInGame(this.game, d.id, playerId)); }
  applyAction(playerId, action) { switch (action.type) { case 'auction': return this.applyAuction(playerId, action.action); case 'skart': return this.applySkart(playerId, action.cardIds); case 'skart-announce': return this.applySkartAnnouncement(playerId); case 'partner-call': return this.applyPartnerCall(playerId, action.rank); case 'declaration': return this.applyDeclaration(playerId, action.action); case 'game-contra': return this.applyGameContra(playerId); case 'declaration-contra': return this.applyDeclarationContra(playerId, action.declarationId); case 'play-card': return this.applyPlayCard(playerId, action.cardId); default: throw new Error('Ismeretlen akciótípus.'); } }
  applyAuction(playerId, action) {
    if (this.round.phase !== 'auction') throw new Error('Most nincs licitfázis.');
    const currentBidder = this.round.auction.seats[this.round.auction.currentSeat]?.playerId;
    if (currentBidder !== playerId) throw new Error('Most nem ennek a játékosnak kell licitálnia.');
    this.round = { ...this.round, auction: applyAuctionAction(this.round.auction, action, handsMap(this.round)) };
    if (!this.round.auction.finished) {
      this.round = { ...this.round, currentPlayerId: this.round.auction.seats[this.round.auction.currentSeat]?.playerId };
      return;
    }
    if (!this.round.auction.highest) {
      this.redeal('Mind a négy játékos passzolt a licitben.');
      return;
    }
    this.round = finishAuction(this.round, this.round.talon);
    this.round = distributeRoundTalon({ ...this.round, parallelSkart: true }, this.round.talon);
    const redealReason = preSkartRedealReason(this.round);
    if (redealReason) {
      this.redeal(`Kötelező újraosztás talonfelvétel után: ${redealReason}`);
      return;
    }
    // In every 4-player contract the talon distribution must leave exactly the
    // contract-defined number of received talon cards with every active player.
    const expectedCounts = { three: [3, 1, 1, 1], two: [2, 2, 1, 1], one: [1, 2, 2, 1], solo: [0, 2, 2, 2] }[this.round.contract];
    const takerIndex = this.round.players.findIndex(p => p.playerId === this.round.takerId);
    if (!expectedCounts || takerIndex < 0 || this.round.players.some((p, i) => p.receivedTalon.length !== expectedCounts[(i - takerIndex + 4) % 4])) {
      throw new Error('A talon kiosztása nem fejeződött be szabályosan.');
    }
    this.emit({ type: 'phase-changed', phase: 'skart', message: 'Az aukció lezárult; a talon kiosztva, a párhuzamos fektetés következik.' });
  }
  applySkart(playerId, cardIds) { if (this.round.phase !== 'skart') throw new Error('Most nincs fektetési fázis.'); const p = this.round.players.find(x => x.playerId === playerId); if (!p) throw new Error('Ismeretlen játékos.'); if (new Set(cardIds).size !== cardIds.length) throw new Error('Egy lapot csak egyszer lehet fektetni.'); if (p.skart.length === p.receivedTalon.length) throw new Error('Ez a játékos már befejezte a fektetést.'); const cards = cardIds.map(id => p.hand.find(c => c.id === id)); if (cards.some(card => !card)) throw new Error('A fektetés ismeretlen vagy nem a játékos kezében lévő lapot tartalmaz.'); this.round = skartRoundPlayer(this.round, playerId, cards); }
  applySkartAnnouncement(playerId) {
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

  applyPartnerCall(playerId, rank) {
    if (this.round.phase !== 'partner-call' || this.round.takerId !== playerId) throw new Error('A partnerhívást csak a felvevő teheti meg.');
    const hands = this.round.players.map(p => ({ id: p.playerId, hand: p.hand }));
    const required = this.round.auctionOutcome?.calledTarokk;
    if (required !== undefined && required !== rank) throw new Error(`Ebben az invitált játékban a ${required}. tarokkot kötelező meghívni.`);
    const player = this.round.players.find(p => p.playerId === playerId);
    if (!required && player) {
      const held = new Set(player.hand.filter(c => c.kind === 'tarokk').map(c => Number(c.rank)));
      const hasXX = held.has(20);
      let normalTarget = 20;
      if (hasXX) { for (let r = 19; r >= 2; r -= 1) { if (!held.has(r)) { normalTarget = r; break; } } }
      const allowed = new Set([normalTarget, ...(hasXX ? [20] : [])]);
      if (!allowed.has(rank)) throw new Error('Ez a partnerhívás ebben a leosztásban nem szabályos.');
    }
    const partnerId = resolveCalledPartner(playerId, rank, hands);
    if (!partnerId) throw new Error(`A ${rank}. tarokk nem ad egyértelmű partnert.`);
    const g0 = createInitialState(this.playerIds, this.dealerIndex); const players = g0.players.map(p => { const source = this.round.players.find(x => x.playerId === p.id); return { ...p, hand: [...(source?.hand ?? [])], score: source?.score ?? 0, active: true }; }); let game = setPartnership({ ...g0, players, talon: [], contract: this.round.contract, startingPlayerId: this.round.startingPlayerId, skartsByPlayer: Object.fromEntries(this.round.players.map(p => [p.playerId, [...p.skart]])), preSkartSuitCountsByPlayer: Object.fromEntries(this.round.players.map(p => [p.playerId, p.preSkartSuitCounts ?? {}])) }, playerId, partnerId); game = recordPartnerCall(game, rank, partnerId); const takerIndex = game.players.findIndex(p => p.id === playerId); game = startDeclarations(game, takerIndex); this.game = game;
    // The mandatory partner call happens in the preceding partner-call phase.
    // The declaration phase itself always starts with the taker. The declaration
    // window separately excludes the taker's first actual declaration turn from
    // the three-pass closing streak.
    const declarationOrder = declarationOrderFromTaker(this.playerIds, playerId);
    this.declarationWindow = createDeclarationWindow(declarationOrder, true);
    this.round = { ...this.round, phase: 'declarations', currentPlayerId: declarationOrder[0], calledTarokk: rank }; }
  declarationContext(playerId) {
    if (!this.game) throw new Error('Nincs aktív játék.');
    const gp = getPlayer(this.game, playerId);
    const side = pairOfId(playerId, this.game.takerId, this.game.partnerId);
    const pairDeclaredTypes = this.game.declarations.declarations
      .filter(d => pairOfId(d.ownerId, this.game.takerId, this.game.partnerId) === side)
      .map(d => d.type);
    return { isTaker: playerId === this.game.takerId, invited: this.round.auctionOutcome?.calledTarokk !== undefined, ...(this.round.auctionOutcome?.calledTarokk !== undefined ? { invitedTarokk: this.round.auctionOutcome.calledTarokk } : {}), ...(this.round.contract ? { contract: this.round.contract } : {}), previousDeclarations: this.game.declarations.declarations.map(d => d.type), pairDeclaredTypes, firstRound: this.declarationWindow?.firstRound ?? true, partnersKnown: true, ...(playerId === this.game.partnerId ? { isPartner: true } : {}), ...(this.round.calledTarokk !== undefined ? { calledTarokk: this.round.calledTarokk } : {}), ...(this.game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullDeclared: true } : {}), ...(playerId === this.game.takerId && this.round.calledTarokk === 19 && !this.game.declarations.declarations.some(d => d.type === 'tuletroa') ? { trullOmittedByTaker: true } : {}), speakerSeat: this.game.players.findIndex(p => p.id === playerId), ...(this.game.partnerId ? { partnerSeat: this.game.players.findIndex(p => p.id === this.game.partnerId) } : {}), ...(this.game.startingPlayerId ? { starterSeat: this.game.players.findIndex(p => p.id === this.game.startingPlayerId) } : {}), xxiThreatScore: this.game.declarations.declarations.some(d => d.type === 'fourKings') ? 6 : 0, skizCapturePressure: gp.hand.some(c => c.kind === 'tarokk' && c.rank === 22) ? 5 : 0 };
  }
  applyDeclaration(playerId, payload) {
    if (!this.game || this.game.phase !== 'declarations' || !this.declarationWindow) throw new Error('Most nincs bemondási fázis.');
    const action = { ...payload, playerId };
    const gp = getPlayer(this.game, playerId);
    const legal = legalDeclarationActions(this.declarationWindow, playerId, gp.hand, this.declarationContext(playerId));
    if (!legal.some(x => sameDeclarationAction(x, action))) throw new Error('Ez a bemondási akció ebben a helyzetben nem szabályos.');
    if (action.type === 'declare') this.game = declareFigureInGame(this.game, action.declaration, playerId, this.game.completedTricks.length + 1, action.targetCardId);
    this.declarationWindow = applyDeclarationAction(this.declarationWindow, action, gp.hand);
    if (action.type === 'tarokkCount') this.recordInstantTarokkScore(playerId, action.count);
    if (!this.declarationWindow.finished) {
      const next = currentDeclarer(this.declarationWindow);
      this.round = { ...this.round, currentPlayerId: next };
      return;
    }
    const leaderIndex = this.game.players.findIndex(p => p.id === this.round.startingPlayerId);
    this.game = startPlay({ ...this.game, startingPlayerId: this.round.startingPlayerId }, leaderIndex);
    this.round = { ...this.round, phase: 'play', currentPlayerId: this.game.players[leaderIndex]?.id };
  }
  applyGameContra(playerId) { if (!this.game || !canRaiseGameContraInGame(this.game, playerId)) throw new Error('Most nem mondhatsz kontrát a játékra.'); this.game = raiseGameContraInGame(this.game, playerId); if (this.declarationWindow) this.declarationWindow = markDeclarationTurnAction(this.declarationWindow, playerId); }
  applyDeclarationContra(playerId, declarationId) { if (!this.game || !canRaiseDeclarationContraInGame(this.game, declarationId, playerId)) throw new Error('Most nem mondhatsz kontrát erre a bemondásra.'); this.game = raiseDeclarationContraInGame(this.game, declarationId, playerId); if (this.declarationWindow) this.declarationWindow = markDeclarationTurnAction(this.declarationWindow, playerId); }
  applyPlayCard(playerId, cardId) {
    if (!this.game || this.game.phase !== 'play') throw new Error('Most nincs lejátszási fázis.');
    const completedBefore = this.game.completedTricks.length;
    this.game = playCard(this.game, playerId, cardId);
    const firstTrickJustClosed = completedBefore === 0 && this.game.completedTricks.length === 1;
    if (this.game.phase !== 'scoring') {
      this.round = {
        ...this.round,
        players: firstTrickJustClosed ? this.round.players.map(p => p.playerId === this.round.takerId ? { ...p, skartRevealed: false } : p) : this.round.players,
        currentPlayerId: this.game.players[this.game.nextPlayerIndex]?.id,
        phase: 'play',
      };
      return;
    }
    const final = this.game.finalPoints;
    const settlement = this.game.settlement;
    if (!final || !settlement) throw new Error('A végelszámolás nem készült el.');
    const net = settlement.netForTakerPair ?? 0;
    const byPlayer = {
      [this.game.takerId]: net,
      [this.game.partnerId]: net,
    };
    for (const p of this.playerIds) if (!(p in byPlayer)) byPlayer[p] = -net;
    this.lastSettlement = {
      contract: this.game.contract,
      takerId: this.game.takerId,
      partnerId: this.game.partnerId,
      calledTarokk: this.game.calledTarokk,
      result: final.result,
      takerPairPoints: final.takerPair,
      defencePairPoints: final.defencePair,
      netForTakerPair: net,
      byPlayer,
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
    const totalDeals = this.matchRounds * this.playerIds.length;
    if (this.settlementHistory.length >= totalDeals) {
      this.round = { ...this.round, phase: 'match-complete', currentPlayerId: undefined };
      this.game = null;
      this.declarationWindow = null;
      this.publicEvents = [...this.publicEvents, { type: 'match-complete', message: `A mérkőzés véget ért ${totalDeals} leosztás után.` }].slice(-100);
      return;
    }
    this.dealerIndex = (this.dealerIndex + 1) % this.playerIds.length;
    const base = createRound(this.playerIds, (this.dealerIndex + 1) % this.playerIds.length);
    base.players = base.players.map(p => ({ ...p, score: accumulated[p.playerId] ?? 0 }));
    this.round = dealRound(base, this.random);
    this.round.parallelSkart = true;
    this.game = null;
    this.declarationWindow = null;
    this.publicEvents = [...this.publicEvents, { type: 'deal-complete', message: 'Leosztás elszámolva; következik az új leosztás.' }].slice(-100);
  }
  recordInstantTarokkScore(playerId, count) {
    const pointsEach = count === 9 ? 2 : count === 8 ? 1 : 0;
    if (!pointsEach) return;
    const deltas = Object.fromEntries(this.playerIds.map(id => [id, id === playerId ? pointsEach * 3 : -pointsEach]));
    for (const id of this.playerIds) this.matchScores[id] = Number(this.matchScores[id] ?? 0) + Number(deltas[id] ?? 0);
    this.instantScoreHistory = [...this.instantScoreHistory, { type: 'tarokk-count', playerId, count, pointsEach, totalWon: pointsEach * 3, deltas, immediate: true }].slice(-100);
    this.publicEvents = [...this.publicEvents, { type: 'instant-score', message: `${playerId} ${count} tarokkot mondott: ${pointsEach} pont játékosonként, azonnal elszámolva.` }].slice(-100);
  }
  redeal(reason) {
    const base = createRound(this.playerIds, (this.dealerIndex + 1) % 4);
    base.players = base.players.map(p => ({ ...p, score: Number(this.matchScores[p.playerId] ?? 0) }));
    this.round = dealRound(base, this.random);
    this.round.parallelSkart = true;
    this.round.redealCount = Number(this.round.redealCount ?? 0) + 1;
    this.round.redealReason = reason;
    this.game = null;
    this.declarationWindow = null;
    this.publicEvents = [...this.publicEvents, { type: 'redeal', message: `Újraosztás: ${reason}` }].slice(-100);
  }
  isReady() { return this.connected.size === this.playerIds.length; }
  isConnected(playerId) { this.assertPlayer(playerId); return this.connected.has(playerId); }
  assertPlayer(playerId) { if (!this.playerIds.includes(playerId)) throw new Error('A játékos nem tagja ennek a szobának.'); }
  emit(partial) { const event = { ...partial, sequence: this.sequence }; this.publicEvents.push(event); if (this.publicEvents.length > 100) this.publicEvents.shift(); for (const listener of this.listeners) listener(event); }
}
export function createAuthoritativeRoom(options) { return new AuthoritativeRoom(options); }
