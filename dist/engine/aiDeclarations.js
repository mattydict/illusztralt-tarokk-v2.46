import { availableDeclarations, tarokkCount, hasTarokk, kingCount } from './declarations.js';
import { inferPartnerInformation } from './signals.js';
import { declarationStrategicScore } from './aiStrategy.js';
import { evaluateDealPlan, declarationPortfolioValue } from './aiDealPlan.js';
import { evaluateDeclarationPath } from './aiDealPortfolio.js';
/**
 * Explainable declaration policy. This is intentionally conservative: formal
 * legality comes from availableDeclarations(); conventions only affect the
 * choice among legal options. It never treats an inferred card as a fact.
 */
export function chooseAIDeclaration(hand, context, beliefs = { tarokk: {}, tarokkCountAtLeast: {}, figures: {}, encouragements: {}, excludedTarokk: {} }, worldBeliefs, handHypotheses, gameState) {
    const options = availableDeclarations(hand, context);
    if (!options.length)
        return { action: { type: 'pass', reason: 'Nincs elérhető bemondás.' }, score: 0, reasons: [] };
    const strategicContext = { ...context, worldBeliefs, handHypotheses, gameState };
    const scored = options.map(option => {
        const base = scoreDeclaration(option, hand, context, beliefs);
        const strategic = declarationStrategicScore(option.type, hand, strategicContext, beliefs);
        base.score += strategic.score;
        base.reasons.push(`Stratégiai becslés: ${(strategic.estimate.success * 100).toFixed(0)}% teljesítési esély, kommunikáció ${strategic.estimate.communication.toFixed(1)}.`);
        if (context.contract) {
            const plan = evaluateDealPlan({ hand, contract: context.contract, isTaker: context.isTaker, partnerSupport: context.partnerTarokkCount === undefined ? 0.5 : Math.min(1, context.partnerTarokkCount / 9) });
            const declarationOptionalValue = declarationPortfolioValue(hand, option.type, strategic.estimate.success);
            // The common portfolio layer rewards declarations that fit a positive
            // deal path and slightly discounts high-variance declarations when the
            // underlying contract is already negative EV. The specialist declaration
            // model remains the dominant term.
            const portfolio = evaluateDeclarationPath({
                type: option.type,
                successProbability: strategic.estimate.success,
                ...(strategic.estimate.communication !== undefined ? { communicationValue: strategic.estimate.communication } : {}),
                tacticalValue: strategic.score * 0.05,
                positionValue: plan.gameExpectedValue * 0.03,
            });
            const portfolioFit = Math.max(-3.2, Math.min(3.2, plan.gameExpectedValue * 0.10 + declarationOptionalValue * 0.05 + portfolio.score * 0.12));
            base.score += portfolioFit;
            base.reasons.push(`Közös parti-portfólió: ${plan.gameExpectedValue.toFixed(1)} játékérték, ${declarationOptionalValue.toFixed(1)} opcionális figuraérték, ${portfolio.netExpectedValue.toFixed(1)} bemondási útérték.`);
        }
        return base;
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];
    return { action: best.option, score: best.score, reasons: best.reasons };
}
function scoreDeclaration(option, hand, context, beliefs) {
    let score = 0;
    const reasons = [];
    const t = tarokkCount(hand);
    if (option.type === 'tuletroa') {
        if (hasTarokk(hand, 22))
            score += 5;
        if (hasTarokk(hand, 21))
            score += 3;
        if (context.isTaker) {
            score += 1;
            reasons.push('Felvételi oldalon a nagyhonőr-jelzésnek kommunikációs értéke van.');
        }
    }
    if (option.type === 'fourKings') {
        score += 4;
        if (context.trullDeclared)
            score += 3;
        if (!context.trullDeclared)
            reasons.push('Trull nélkül a négy király általános bíztatás, nem fix tarokkjelzés.');
        if (kingCount(hand) === 4)
            reasons.push('Mind a négy király a kézben van.');
    }
    if (option.type === 'centrum') {
        score += 6;
        if (hasTarokk(hand, 22) && hasTarokk(hand, 21) && hasTarokk(hand, 20))
            score += 4;
        if (hasTarokk(hand, 18))
            score += 2;
        if (t >= 5)
            score += 2;
        if (context.trullOmittedByTaker) {
            score += 2;
            reasons.push('Ritka Trull nélküli XIX→Centrum jelzés aktív.');
        }
    }
    if (option.type === 'kismadar' || option.type === 'nagymadar') {
        score += 7;
        if (t >= 6)
            score += 2;
        if (context.trullDeclared)
            score += 2;
    }
    if (option.type === 'doubleGame') {
        score += 2;
        if (beliefs.encouragements.doubleGame)
            score += beliefs.encouragements.doubleGame.score;
        if (context.previousDeclarations.includes('centrum')) {
            score += 4;
            reasons.push('Centrum után a dupla kommunikációs jelzésként is működhet.');
        }
    }
    if (option.type === 'volat') {
        score += 1 + Math.min(t, 8) / 4;
        if (t >= 8)
            score += 2;
    }
    if (option.type === 'pagatUltimo' || option.type === 'sasUltimo' || option.type === 'kingUltimo')
        score += 5;
    if (option.type === 'pagatUhu' || option.type === 'sasUhu' || option.type === 'kingUhu')
        score += 7;
    if (option.type === 'xxiFogas') {
        // XXI-fogás is an exceptional, high-variance declaration. It is worth a
        // large number of points when successful, but the same size of risk makes
        // a speculative declaration strategically unattractive. The literature
        // therefore treats the catch as something to announce only when the
        // public information, seating and hand strength make the catch genuinely
        // plausible. Never equate holding the Skíz with having a viable catch.
        score -= 10;
        if (beliefs.encouragements.xxiFogas)
            score += 4;
        if (hasTarokk(hand, 22))
            score += 2;
        const hasSkiz = hasTarokk(hand, 22);
        const trull = context.trullDeclared === true;
        const trullOmitted = context.trullOmittedByTaker === true;
        const prior = context.previousDeclarations;
        // Trull + four kings is a strong partner-side communication context.
        // Trull without the corresponding shared-big-honour structure can also
        // make a threatened XXI worth actively considering.
        if (trull) {
            score += 1;
            reasons.push('Trull után a nagyhonőrök helyzete tisztább; a Skíz oldaláról a XXI-fogás külön mérlegelendő.');
        }
        // Four kings without Trull is intentionally only a general encouragement;
        // it must NOT be interpreted as a specific XXI/XX/XIX signal.
        if (!trull && prior.includes('fourKings')) {
            score += 1;
            reasons.push('Trull nélküli négy király: általános erősítés, nem specifikus XXI-jelzés.');
        }
        // A deliberately omitted Trull after a XIX/XX-family sequence can be a
        // position/structure signal. It is evidence, not certainty.
        if (trullOmitted && context.calledTarokk === 19 && hasSkiz) {
            score += 2;
            reasons.push('Szándékosan kihagyott Trull mellett a Skíz oldalán külön vizsgálandó a XXI-fogás.');
        }
        // If the table already contains the partner-side encouragement chain,
        // prefer the high-value catch over speculative lower-value declarations.
        if (prior.includes('fourKings') && prior.includes('doubleGame')) {
            score += 3;
            reasons.push('Négy király + dupla után a fogási lehetőség információs értéke magasabb.');
        }
        // Specialist practice: the Skíz should not announce the catch merely
        // because it holds the Skíz. The decision becomes materially stronger
        // when the public auction points to a threatened XXI and the seating lets
        // the Skíz pressure that player. This remains soft evidence.
        const threat = context.xxiThreatScore ?? 0;
        const pressure = context.skizCapturePressure ?? 0;
        if (hasSkiz && threat > 0) {
            score += threat * 0.9;
            reasons.push(`A licit-belief alapján a szorongatott XXI valószínűsége ${threat.toFixed(1)}/10.`);
        }
        if (hasSkiz && pressure > 0) {
            score += pressure * 0.7;
            reasons.push(`Az üléshelyzet és a licit alapján a Skíz fogási nyomása ${pressure.toFixed(1)}/10.`);
        }
        // A weak Skíz (3–4 tarokk) is a classic special case: it may still catch
        // the XXI, but should not inflate every such situation into a declared
        // catch. The declaration should follow genuine communication support.
        if (hasSkiz && t <= 4) {
            score -= 7;
            reasons.push('3–4 tarokkos Skíz: a bemondott XXI-fogás különösen kockázatos, ezért csak kivételesen vállalható.');
        }
        if (hasSkiz && t === 5) {
            score += 1;
            reasons.push('Öt tarokk már adhat valódi fogási alapot, de a bemondás továbbra sem automatikus.');
        }
        if (hasSkiz && t >= 6) {
            score += 2;
            reasons.push('Hat vagy több tarokk mellett a fogási terv tartósabban végrehajtható.');
        }
        if (hasSkiz && threat >= 8) {
            score += 5;
            reasons.push('Nagyon erős nyilvános XXI-gyanú: a ritka fogás már indokolható lehet.');
        }
        else if (hasSkiz && threat >= 6) {
            score += 2;
        }
        else if (hasSkiz && threat < 5) {
            score -= 5;
            reasons.push('A XXI helye nem elég valószínű: a 60 pontos fogás vállalása spekulatív lenne.');
        }
        if (hasSkiz && pressure >= 8)
            score += 3;
        // A bemondott XXI-fogás ritka kivétel. A névértékét nem kezeljük úgy,
        // mintha a siker valószínű lenne: a sikertelen vállalás nagy vesztesége
        // miatt a fogásnak a normál bemondásokkal szemben magasabb bizonyossági
        // küszöböt kell elérnie. A csendes fogás ezzel szemben a lejátszás közben
        // opportunisztikusan megmaradhat stratégiai lehetőségnek.
        if (hasSkiz && threat < 9 && pressure < 8) {
            score -= 8;
            reasons.push('Bemondott XXI-fogás csak kivételes bizonyosság mellett: a csendes fogás lehetősége megmaradhat.');
        }
        // A declared catch should remain an exception even after communication
        // support: without a strong threat signal it must not beat ordinary
        // declarations merely because its nominal value is high.
        if (hasSkiz && threat < 8 && !(prior.includes('fourKings') && prior.includes('doubleGame'))) {
            score -= 3;
        }
    }
    if (option.type === 'tarokk8' || option.type === 'tarokk9') {
        score += 1;
        // Specialist literature explicitly describes Pagát + tarokk-count
        // signalling as a way to increase the chance of a XXI-fogás against a
        // threatened XXI. This is deliberately a convention-level bonus: the
        // engine does not pretend to know where the hidden XXI is.
        if (hasTarokk(hand, 1) && context.firstRound === false && context.isPartner) {
            score += 5;
            reasons.push('Pagát + tarokkszám partneri oldalon: a szorongatott XXI-fogás esélyét növelő információs jelzés.');
        }
        if (hasTarokk(hand, 1) && context.previousDeclarations.includes('xxiFogas')) {
            score += 7;
            reasons.push('Már deklarált XXI-fogás mellett a Pagát tarokkszáma további támogatást ad a fogási stratégiához.');
        }
        if (hasTarokk(hand, 22) && option.type === 'tarokk8' && t >= 8) {
            // A Skíz oldalán a count can be useful, but it is not as direct a signal
            // as Pagát on the threatened-XXI side.
            score += 1;
        }
    }
    return { option, score, reasons };
}
/** Build partner-belief evidence from the declarations already on the table. */
export function communicationBeliefs(context) {
    const inferred = inferPartnerInformation(context);
    const state = { tarokk: {}, tarokkCountAtLeast: {}, figures: {}, encouragements: {}, excludedTarokk: {} };
    for (const item of inferred) {
        if (item.kind === 'tarokkCountAtLeast' && typeof item.value === 'number') {
            state.tarokkCountAtLeast[item.value] = { tarokkCountAtLeast: item.value, strength: item.confidence === 'rule' ? 'veryStrong' : 'likely', score: item.confidence === 'convention' ? 3 : 2, evidence: item.evidence.map(statement => ({ source: item.confidence === 'rule' ? 'formalRule' : item.confidence, statement, weight: 1 })) };
        }
    }
    return state;
}
