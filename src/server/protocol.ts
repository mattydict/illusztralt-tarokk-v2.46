import type { AuctionAction } from '../engine/auction.js';
import type { DeclarationAction } from '../engine/declarationWindow.js';
import type { DeclarationType } from '../engine/declarations.js';

export type PlayerAction =
  | { type: 'auction'; action: AuctionAction }
  | { type: 'skart'; cardIds: string[] }
  | { type: 'skart-announce' }
  | { type: 'partner-call'; rank: 18 | 19 | 20 }
  | { type: 'declaration'; action: Omit<DeclarationAction, 'playerId'> }
  | { type: 'game-contra' }
  | { type: 'declaration-contra'; declarationId: string }
  | { type: 'play-card'; cardId: string };

export interface ActionRequest {
  playerId: string;
  expectedSequence: number;
  action: PlayerAction;
}

export interface PublicEvent {
  sequence: number;
  type: 'action-accepted' | 'phase-changed' | 'action-rejected' | 'deal-complete';
  playerId?: string;
  actionType?: PlayerAction['type'];
  phase?: string;
  message: string;
}

export interface PublicCard { id: string; kind: 'tarokk' | 'suit'; rank: number | string; suit?: string; points: number; }
export interface PublicPlayerView {
  id: string;
  cardCount: number;
  score: number;
  connected: boolean;
  hand?: PublicCard[];
  receivedTalon?: PublicCard[];
  ownSkart?: PublicCard[];
  skartCount?: number;
  revealedSkart?: PublicCard[];
}

export interface AuthoritativeView {
  roomId: string;
  sequence: number;
  phase: string;
  currentPlayerId?: string;
  players: PublicPlayerView[];
  auction?: unknown;
  game?: unknown;
  scoreboard?: { dealsPlayed: number; scores: Record<string, number>; history: unknown[] };
  publicEvents: PublicEvent[];
  legalActionTypes: PlayerAction['type'][];
  legalActionHints?: Record<string, unknown>;
  turnTimeoutMs?: number;
  turnDeadlineAt?: number;
}
