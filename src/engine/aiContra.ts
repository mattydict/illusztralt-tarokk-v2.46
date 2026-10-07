import { Card, isTarokk } from './cards.js';
import { DeclarationType } from './declarations.js';
import { ContraLevel, ContraState, canRaiseContra, initialContraState } from './contra.js';
import { GameState, PlayerId } from './game.js';
import { buildAIBeliefSnapshot } from './aiBeliefEngine.js';
import { observerStateView } from './partnershipVisibility.js';
import { buildHandHypotheses } from './aiHandHypotheses.js';
import { simulateDeclarationWorlds } from './aiWorldSimulation.js';
import { defenceOpeningRequestTargetFromPublicContra } from './leadConventions.js';
import { evaluateStakeEscalation, estimateGameSuccessProbability } from './aiStake.js';
import { evaluateContraPath } from './aiDealPortfolio.js';

export interface AIContraDecision {
  target: 'game' | string;
  score: number;
  reason: string;
}

/**
 * AI countering policy: counter only when the AI has a credible way to break
 * the target figure, or when the expected loss of letting it stand is clearly
 * larger than the cost of the counter. It is deliberately imperfect.
 */
export function chooseAIContra(state: GameState, byPlayer: PlayerId): AIContraDecision | undefined {
  if (state.phase !== 'declarations' || !state.takerId) return undefined;
  const side = sideOf(state, byPlayer);
  if (!side) return undefined;
  const candidates: AIContraDecision[] = [];
  const beliefs = buildAIBeliefSnapshot(state, byPlayer);
  const hypotheses = buildHandHypotheses(state, byPlayer, beliefs);

  const gameState = state.gameContraState ?? initialContraState('game', 'taker');
  if (canRaiseContra(gameState, side, 'game')) {
    const p = state.players.find(x => x.id === byPlayer);
    if (p) {
      let score = counterStrength('game', p.hand, state, beliefs, hypotheses);
      let reason = 'A saját lap, a látható lapok és a licit/bemondási információk alapján van reális esély a parti megbuktatására.';
      const stake = evaluateStakeEscalation({
        target: 'game',
        ...(state.contract !== undefined ? { contract: state.contract } : {}),
        currentLevel: gameState.level,
        successProbability: estimateGameSuccessProbability(state, p.hand),
      });
      if (stake) {
        const stakeAdjustment = Math.max(-3, Math.min(3, stake.expectedMarginalValue * 0.18));
        const portfolio = evaluateContraPath({
          targetValue: stake.nominalValue,
          currentLevel: gameState.level,
          breakProbability: stake.successProbability,
          tacticalValue: score * 0.08,
        });
        score += stakeAdjustment + Math.max(-1.5, Math.min(1.5, portfolio.score * 0.12));
        reason += ` A következő kontra gazdasági kitettsége ${stake.marginalStake.toFixed(1)} pont, a közös partiút marginális értéke ${portfolio.netExpectedValue.toFixed(1)}.`;
      }
      const openingRequestTarget = side === 'defence' && byPlayer !== state.startingPlayerId
        ? lowestOpeningRequestTarget(state)
        : undefined;
      if (openingRequestTarget === 'game') {
        score += 2.6;
        reason += ' A parti megkontrázása ebben a sorrendben indulási színkérésként is szolgálhat.';
      }
      candidates.push({ target: 'game', score, reason });
    }
  }

  const openingRequestTarget = side === 'defence' && byPlayer !== state.startingPlayerId
    ? lowestOpeningRequestTarget(state)
    : undefined;
  const openingRequestAlreadyInPlace = side === 'taker' && state.startingPlayerId !== byPlayer
    ? defenceOpeningRequestTargetFromPublicContra(state)
    : undefined;

  for (const d of state.declarations.declarations) {
    if (!d.contra || d.status === 'failed' || d.status === 'fulfilled') continue;
    if (!canRaiseContra(d.contra, side, d.type)) continue;
    const p = state.players.find(x => x.id === byPlayer);
    if (!p) continue;
    let score = counterStrength(d.type, p.hand, state, beliefs, hypotheses);
    let reason = reasonFor(d.type, score);
    const stake = evaluateStakeEscalation({
      target: d.type,
      currentLevel: d.contra.level,
      successProbability: Math.max(0.05, Math.min(0.95, score / 10)),
    });
    if (stake) {
      const stakeAdjustment = Math.max(-3.5, Math.min(3.5, stake.expectedMarginalValue * 0.10));
      const portfolio = evaluateContraPath({
        targetValue: stake.nominalValue,
        currentLevel: d.contra.level,
        breakProbability: stake.successProbability,
        tacticalValue: score * 0.08,
      });
      score += stakeAdjustment + Math.max(-1.75, Math.min(1.75, portfolio.score * 0.12));
      reason += ` A következő kontra marginális kitettsége ${stake.marginalStake.toFixed(1)} pont; a közös partiút ${portfolio.netExpectedValue.toFixed(1)} várható marginális értéket ad.`;
    }

    if (side === 'defence' && d.type === openingRequestTarget) {
      score += 2.6;
      reason += ' Ez egyben a le nem induló védekező játékos indulási-szín kérése lehet.';
    }
    if (side === 'taker' && openingRequestAlreadyInPlace === d.type) {
      score += 1.6;
      reason += ' Az ellenfél első kontrája indulási színkérésnek minősülhet; erős felvevőpár esetén a rekontra ezt felülkontrázhatja.';
    }

    candidates.push({ target: d.id, score, reason });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  return best && best.score >= 7 ? best : undefined;
}

function lowestOpeningRequestTarget(state: GameState): 'game' | DeclarationType | undefined {
  const candidates: Array<{ target: 'game' | DeclarationType; value: number; tie: number }> = [];
  const contractValue = state.contract === 'solo' ? 4 : state.contract === 'one' ? 3 : state.contract === 'two' ? 2 : state.contract === 'three' ? 1 : undefined;
  if (contractValue !== undefined) candidates.push({ target: 'game', value: contractValue, tie: 1 });
  for (const d of state.declarations.declarations) {
    if (d.status === 'failed' || d.status === 'fulfilled') continue;
    if (d.type !== 'tuletroa' && d.type !== 'fourKings') continue;
    const value = d.type === 'tuletroa' || d.type === 'fourKings' ? 2 : 999;
    candidates.push({ target: d.type, value, tie: d.type === 'fourKings' ? 0 : 2 });
  }
  return candidates.sort((a,b) => a.value - b.value || a.tie - b.tie)[0]?.target;
}

function sideOf(state: GameState, id: PlayerId): 'taker' | 'defence' | undefined {
  if (id === state.takerId || id === state.partnerId) return 'taker';
  return state.players.some(p => p.id === id) ? 'defence' : undefined;
}

function counterStrength(type: 'game' | DeclarationType, hand: Card[], state: GameState, beliefs: ReturnType<typeof buildAIBeliefSnapshot>, hypotheses?: ReturnType<typeof buildHandHypotheses>): number {
  const t = hand.filter(isTarokk).length;
  const hasSkiz = hand.some(c => c.kind === 'tarokk' && c.rank === 22);
  const hasXXI = hand.some(c => c.kind === 'tarokk' && c.rank === 21);
  const hasXX = hand.some(c => c.kind === 'tarokk' && c.rank === 20);
  const kings = hand.filter(c => c.kind === 'suit' && c.rank === 'K').length;
  const simulated = type === 'game' ? undefined : simulateDeclarationWorlds(state, state.players.find(p => p.hand === hand)?.id ?? state.players[0]!.id, hand, hypotheses, type);
  const simBonus = simulated ? simulated.successProbability * simulated.confidence * 3.2 : 0;
  switch (type) {
    case 'game': return Math.min(10, (3 + t * 0.45 + (hasSkiz ? 1.5 : 0) + (hasXXI ? 0.8 : 0)) + simBonus);
    case 'volat': return Math.min(10, (1 + t * 0.7 + (hasSkiz ? 1.2 : 0) + (beliefs.figurePressure.volat ?? 0) * 3 + (beliefs.handHypotheses?.targetProfiles.xxiThreat ?? 0) * 1.2) + simBonus);
    case 'doubleGame': return Math.min(10, (2 + t * 0.55 + kings * 0.15) + simBonus);
    case 'centrum': return Math.min(10, (2 + Number(hasXX) * 3 + Number(hasSkiz) * 1.5 + t * 0.3 + (1 - (beliefs.figurePressure.centrum ?? 0)) * 1.5 + (beliefs.handHypotheses?.targetProfiles.centrumCore ?? 0) * 2) + simBonus);
    case 'kismadar': return Math.min(10, (2 + Number(hasXXI) * 3 + Number(hasSkiz) * 1.5 + t * 0.3 + (1 - (beliefs.figurePressure.kismadar ?? 0)) * 1.5 + (beliefs.handHypotheses?.targetProfiles.kismadarCore ?? 0) * 2) + simBonus);
    case 'nagymadar': return Math.min(10, (2 + Number(hasSkiz) * 4 + t * 0.35 + (1 - (beliefs.figurePressure.nagymadar ?? 0)) * 1.5 + (beliefs.handHypotheses?.targetProfiles.nagymadarCore ?? 0) * 2.2) + simBonus);
    case 'pagatUltimo': case 'pagatUhu': return Math.min(10, (2 + Number(hasSkiz) * 4 + Number(hasXXI) * 1.5 + t * 0.25) + simBonus);
    case 'sasUltimo': case 'sasUhu': return Math.min(10, (2 + Number(hasSkiz) * 3 + Number(hasXXI) * 1.2 + t * 0.25) + simBonus);
    case 'kingUltimo': case 'kingUhu': return Math.min(10, (2 + kings * 0.9 + t * 0.25) + simBonus);
    case 'tuletroa': return Math.min(10, (2 + Number(hasSkiz) * 2 + Number(hasXXI) * 1.5 + t * 0.2) + simBonus);
    case 'fourKings': return Math.min(10, (2 + kings * 0.8 + t * 0.2) + simBonus);
    case 'xxiFogas': return Math.min(10, (1 + Number(hasSkiz) * 4 + t * 0.4 + (beliefs.figurePressure.xxiFogas ?? 0) * 2 + (beliefs.handHypotheses?.targetProfiles.xxiThreat ?? 0) * 3) + simBonus);
    default: return 0;
  }
}

function reasonFor(type: string, score: number): string {
  return `${type}: a buktatási esély becsült erőssége ${score.toFixed(1)}/10.`;
}
