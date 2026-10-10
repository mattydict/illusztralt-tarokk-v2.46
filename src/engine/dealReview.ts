import type { Card } from './cards.js';
import type { GameState } from './game.js';
import type { RoundState } from './round.js';

function clonePublicCard(card: Card) {
  return card.kind === 'tarokk'
    ? { id: card.id, kind: card.kind, rank: card.rank, points: card.points }
    : { id: card.id, kind: card.kind, rank: card.rank, suit: card.suit, points: card.points };
}

export interface DealReviewSettlement {
  result?: string;
  takerPairPoints?: number;
  defencePairPoints?: number;
  netForTakerPair?: number;
  lines?: Array<{ type?: string; points?: number; positiveForTakerPair?: boolean; silent?: boolean; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Build a review record only once a deal has finished. This structure is also
 * designed to be stored permanently and used later for AI analysis. */
export function buildDealReview(round: RoundState, game: GameState, dealNumber: number, settlement?: DealReviewSettlement) {
  const players = round.players.map(player => {
    const receivedTalon = [...(player.receivedTalon ?? [])].map(clonePublicCard);
    const skart = [...(player.skart ?? [])].map(clonePublicCard);
    const receivedIds = new Set(receivedTalon.map(card => card.id));
    const dealtHand = Array.isArray(player.dealtHand) && player.dealtHand.length === 9
      ? player.dealtHand
      : [
          ...player.hand.filter(card => !receivedIds.has(card.id)),
          ...skart.filter(card => !receivedIds.has(card.id)),
        ];
    return { playerId: player.playerId, dealtHand: dealtHand.map(clonePublicCard), receivedTalon, skart };
  });
  const tricks = (game.completedTricks ?? []).map((trick, index) => ({
    number: index + 1,
    leader: trick.leader,
    winner: trick.winner,
    cards: trick.cards.map(played => ({ player: played.player, card: clonePublicCard(played.card) })),
  }));
  const declarations = (game.declarations?.declarations ?? []).map((declaration, index) => ({
    order: index + 1,
    id: declaration.id,
    type: declaration.type,
    ownerId: declaration.ownerId,
    status: declaration.status ?? 'unknown',
    contra: declaration.contra?.level ?? declaration.contra ?? 'none',
    ...(declaration.targetCardId ? { targetCardId: declaration.targetCardId } : {}),
    ...(declaration.declaredAtTrick !== undefined ? { trickNumber: declaration.declaredAtTrick } : {}),
  }));
  const silentFigures = (game.declarations?.silentFigures ?? []).map((figure, index) => ({
    order: index + 1,
    type: figure.type,
    ownerId: figure.ownerId,
    status: figure.status ?? 'unknown',
  }));
  const auction = (round.auction?.records ?? []).map((record, index) => ({
    order: index + 1,
    playerId: record.playerId,
    action: structuredClone(record.action),
  }));
  const takerId = game.takerId ?? round.takerId;
  const partnerId = game.partnerId;
  const activePlayerIds = game.players.length ? game.players.filter(player => player.active).map(player => player.id) : round.players.map(player => player.playerId);
  const defenceIds = activePlayerIds.filter(id => id && id !== takerId && id !== partnerId);
  const points = game.finalPoints;
  return {
    dealNumber,
    contract: game.contract ?? round.contract,
    takerId,
    partnerId,
    defenceIds,
    calledTarokk: game.calledTarokk ?? round.calledTarokk,
    auction,
    declarations,
    silentFigures,
    players,
    tricks,
    ...(points ? { finalPoints: { result: points.result, takerPair: points.takerPair, defencePair: points.defencePair } } : {}),
    ...(settlement ? { settlement: structuredClone(settlement) } : {}),
  };
}
