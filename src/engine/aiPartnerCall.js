/**
 * Chooses the tarokk to call using only the taker's own post-skart hand and
 * public auction information. The identity of the holder is deliberately not
 * an input: the real game reveals the partner only after the rank is called.
 */
export function chooseAIPartnerCall(hand, context = {}) {
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
    const preferred = [19, 18, 20];
    const available = preferred.filter(rank => !hasTarokk(hand, rank) || rank === 20);
    const rank = (available[0] ?? 19);
    const reasons = [
        rank === 20
            ? 'A magasabb hívások nem maradtak szabadon a saját kézben; XX-önhívás csak kivételesen marad opciónak.'
            : `Partnerhívás: a ${rank}. tarokk szabad a saját kézben, ezért a hívás csak a nyílt tarokkszámot jelöli, nem a partner személyét.`,
    ];
    if (context.invitedTarokk !== undefined) {
        reasons.push(`A korábbi invitált ${context.invitedTarokk}. tarokk közismert licit-információ, ezért a hívást ahhoz igazítjuk.`);
    }
    if (context.contract === 'solo')
        reasons.push('Szóló esetén a partnerhívás csak akkor jelenik meg, ha a konkrét játékállapot ezt megköveteli.');
    return { rank, reasons };
}
function hasTarokk(hand, rank) {
    return hand.some(card => card.kind === 'tarokk' && card.rank === rank);
}
