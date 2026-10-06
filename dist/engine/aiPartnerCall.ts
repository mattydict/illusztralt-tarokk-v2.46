import { Card } from './cards.js';

export interface AIPartnerCallContext {
  requiredTarokk?: 18 | 19 | 20;
  invitedTarokk?: 18 | 19 | 20;
  contract?: 'three' | 'two' | 'one' | 'solo';
}

export interface AIPartnerCallDecision {
  rank: 18 | 19 | 20;
  reasons: string[];
}

/**
 * Chooses the tarokk to call using only the taker's own post-skart hand and
 * public auction information. The identity of the holder is deliberately not
 * an input: the real game reveals the partner only after the rank is called.
 */
export function chooseAIPartnerCall(hand: Card[], context: AIPartnerCallContext = {}): AIPartnerCallDecision {
  if (context.requiredTarokk !== undefined) {
    if (hasTarokk(hand, context.requiredTarokk) && context.requiredTarokk !== 20) {
      return {
        rank: context.requiredTarokk,
        reasons: [`A licit rögzített meghívása miatt a ${context.requiredTarokk}. tarokkot kell hívni.`],
      };
    }
    return {
      rank: context.requiredTarokk,
      reasons: [`A licitben rögzített ${context.requiredTarokk}. tarokk hívása kötelező.`],
    };
  }

  const preferred = [19, 18, 20] as const;
  const available = preferred.filter(rank => !hasTarokk(hand, rank) || rank === 20);
  const rank = (available[0] ?? 19) as 18 | 19 | 20;
  const reasons = [
    rank === 20
      ? 'A magasabb hívások nem maradtak szabadon a saját kézben; XX-önhívás csak kivételesen marad opciónak.'
      : `Partnerhívás: a ${rank}. tarokk szabad a saját kézben, ezért a hívás csak a nyílt tarokkszámot jelöli, nem a partner személyét.`,
  ];
  if (context.invitedTarokk !== undefined) {
    reasons.push(`A korábbi invitált ${context.invitedTarokk}. tarokk közismert licit-információ, ezért a hívást ahhoz igazítjuk.`);
  }
  if (context.contract === 'solo') reasons.push('Szóló esetén a partnerhívás csak akkor jelenik meg, ha a konkrét játékállapot ezt megköveteli.');
  return { rank, reasons };
}

function hasTarokk(hand: Card[], rank: 18 | 19 | 20): boolean {
  return hand.some(card => card.kind === 'tarokk' && card.rank === rank);
}
