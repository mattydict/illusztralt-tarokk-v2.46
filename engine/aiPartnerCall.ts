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
  // An accepted invite fixes the called tarokk.  This is a hard rule, not a
  // strategic preference.
  if (context.requiredTarokk !== undefined) {
    return {
      rank: context.requiredTarokk,
      reasons: [`A licit rögzített ${context.requiredTarokk}. tarokkos invit miatt ezt a tarokkot kell meghívni.`],
    };
  }

  // Normal Illustrated Tarokk: the taker calls XX.  The important exception
  // is the XX-in-hand case: when the taker holds XX, calling XIX is legal and
  // is the standard way to avoid calling oneself.  XIX without XX is illegal
  // (unless it was explicitly fixed by an XIX-invite above).
  const hasXX = hasTarokk(hand, 20);
  const rank: 18 | 19 | 20 = hasXX ? 19 : 20;
  const reasons = hasXX
    ? ['A felvevőnél van a XX-as, ezért a partnerhívásban szabályosan a XIX-es hívható meg.']
    : ['Nincs XIX-invit és a XX-as nincs a kézben: a szabályos partnerhívás a XX-as.'];

  if (context.invitedTarokk !== undefined) {
    reasons.push(`A licitben szereplő ${context.invitedTarokk}. tarokkos információt figyelembe vettük.`);
  }
  if (context.contract === 'solo') {
    reasons.push('Szóló mellett is csak a konkrét játékállapot által engedett partnerhívás hajtható végre.');
  }
  return { rank, reasons };
}

function hasTarokk(hand: Card[], rank: 18 | 19 | 20): boolean {
  return hand.some(card => card.kind === 'tarokk' && card.rank === rank);
}
