import { Card, isTarokk } from './cards.js';
import { GameState } from './game.js';
import { pairOf } from './partnership.js';
import { communicationSignalFor } from './signals.js';
import { DeclarationType } from './declarations.js';
import { deriveDeclarationCommunicationState } from './declarationCommunicationState.js';

export interface DeclarationPlayCommunicationAssessment {
  score: number;
  confidence: number;
  signalledTarokk?: number;
  sourceDeclaration?: DeclarationType;
  sourceOwnerId?: string;
  reasons: string[];
}

/**
 * v2.28: connects the public declaration language to actual card play.
 *
 * A declaration is not treated as a hidden-card fact.  We only translate a
 * communication chain which the public table has actually established into a
 * preference for a natural subsequent play.  This deliberately sits below
 * hard figure/legality logic.
 */
export function assessDeclarationPlayCommunication(
  state: GameState,
  playerId: string,
  candidate: Card,
): DeclarationPlayCommunicationAssessment {
  if (!state.takerId || !state.partnerId) return empty();
  const side = pairOf(playerId, state.takerId, state.partnerId);
  if (side === 'unknown') return empty();

  const declarations = state.declarations.declarations
    .filter(d => pairOf(d.ownerId, state.takerId!, state.partnerId) === side && d.status !== 'failed')
    .sort((a, b) => a.declaredAtTrick - b.declaredAtTrick || a.id.localeCompare(b.id));
  if (!declarations.length) return empty();

  const events = declarations.map(d => ({ declaration: d.type, speakerId: d.ownerId }));
  const chain = deriveDeclarationCommunicationState({
    events,
    calledTarokk: state.calledTarokk,
    contract: state.contract,
    isTaker: playerId === state.takerId,
  });
  const latestSignal = chain.activeSignal;
  const latestEvent = latestSignal
    ? [...events].reverse().find(event => {
        const own = events.filter(e => e.speakerId === event.speakerId).map(e => e.declaration);
        return communicationSignalFor({
          previous: [],
          events,
          speakerId: event.speakerId,
          speakerDeclarations: own,
          calledTarokk: state.calledTarokk,
          contract: state.contract,
          isTaker: event.speakerId === state.takerId,
        }, event.declaration)?.signalledTarokk === latestSignal.signalledTarokk
      })
    : undefined;
  const latest = latestSignal?.signalledTarokk !== undefined && latestEvent
    ? {
        signalledTarokk: latestSignal.signalledTarokk,
        declaration: latestEvent.declaration,
        ownerId: latestEvent.speakerId ?? playerId,
        confidence: chain.confidence,
      }
    : undefined;

  if (!latest || !isTarokk(candidate)) return empty();

  const partnerId = playerId === state.takerId ? state.partnerId : state.takerId;
  const current = state.trick;
  const partnerLeading = current?.leader === partnerId && current.cards.length === 0;
  const respondingToPartner = current?.cards.length === 1 && current.cards[0]?.player === partnerId;
  const target = latest.signalledTarokk;
  let score = 0;
  const reasons: string[] = [];

  // A partner's declaration chain is most directly answered by a natural
  // tarokk lead that lets the partner produce the communicated high tarokk.
  if (partnerLeading) {
    if (candidate.rank <= 10) {
      score += 6.0;
      reasons.push(`A bemondási lánc ${target}-es tarokkot kommunikál; kis tarokk vezetése természetes lehetőséget ad a partnernek a jelzett lap használatára.`);
    } else if (candidate.rank < target) {
      score += 3.0;
      reasons.push(`A ${target}-es jelzéshez a közepes tarokkos vezetés is koherens folytatás.`);
    } else if (candidate.rank === target) {
      score -= 3.5;
      reasons.push(`A kommunikált ${target}-es tarokkot nem célszerű automatikusan saját vezetésben elégetni.`);
    } else {
      score -= 5.0;
      reasons.push(`A ${target}-es kommunikáció fölötti korai tarokkvezetés felülírhatja a partnernek szánt jelzést.`);
    }
  }

  // If the partner led a tarokk, answering with the signalled target is a
  // direct acknowledgement only when the target is actually legal. We do not
  // infer that the partner owns it; the value is purely communicative.
  if (respondingToPartner) {
    const lead = current!.cards[0]!.card;
    if (lead && isTarokk(lead)) {
      if (candidate.rank === target) {
        score += 4.0;
        reasons.push(`A partner bemondási jelzése és a jelenlegi tarokkvezetés együtt indokolja a ${target}-es tarokk visszajelzését.`);
      } else if (candidate.rank <= 10 && target >= 18) {
        score += 1.5;
        reasons.push('Kis tarokkos válasz fenntarthatja a kommunikációt anélkül, hogy a jelzett magas tarokkot korán kijátszaná.');
      } else if (candidate.rank > target && target >= 17) {
        score -= 2.5;
        reasons.push('A kommunikált tarokk fölötti válasz túl sok kontrollt égethet el a jelzés szempontjából.');
      }
    }
  }

  // If the player who made the declaration is the current player, the
  // communication is still relevant: after the partner responds, the speaker
  // should not accidentally contradict their own public message unless the
  // tactical layers have a stronger reason.
  if (latest.ownerId === playerId && partnerLeading && candidate.rank >= target) {
    score -= 1.0;
  }

  score = Math.max(-6, Math.min(6, score * latest.confidence));
  if (!reasons.length) reasons.push(`A ${latest.declaration} által jelzett ${target}-es tarokk kommunikációja a jelenlegi helyzetben csak gyenge preferenciát ad.`);

  return {
    score,
    confidence: latest.confidence,
    signalledTarokk: target,
    sourceDeclaration: latest.declaration,
    sourceOwnerId: latest.ownerId,
    reasons: [...new Set(reasons)].slice(0, 3),
  };
}

function empty(): DeclarationPlayCommunicationAssessment {
  return { score: 0, confidence: 0, reasons: [] };
}
