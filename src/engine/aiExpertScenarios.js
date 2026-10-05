import { createDeck } from './cards.js';
import { createInitialState } from './game.js';
import { initialDeclarationProgress } from './declarationLifecycle.js';
import { initialContraState, raiseContra } from './contra.js';
const DECK = createDeck();
const card = (id) => {
    const found = DECK.find((c) => c.id === id);
    if (!found)
        throw new Error(`Hiányzó kártya a szcenárióban: ${id}`);
    return found;
};
function makeState(playerId, ownIds, overrides = {}, publicCards = []) {
    const own = ownIds.map(card);
    const used = new Set([...own.map((c) => c.id), ...publicCards.map((c) => c.id)]);
    const rest = DECK.filter((c) => !used.has(c.id));
    const players = ['A', 'B', 'C', 'D'];
    const hands = { [playerId]: own };
    let cursor = 0;
    for (const id of players) {
        if (id === playerId)
            continue;
        hands[id] = rest.slice(cursor, cursor + 9);
        cursor += 9;
    }
    const initial = createInitialState(players, 0);
    return {
        ...initial,
        phase: 'play',
        takerId: 'A',
        partnerId: 'B',
        startingPlayerId: playerId,
        nextPlayerIndex: initial.players.findIndex((p) => p.id === playerId),
        leadSuit: null,
        trick: { leader: playerId, cards: [] },
        completedTricks: [],
        players: initial.players.map((p) => ({ ...p, hand: hands[p.id] })),
        declarations: initialDeclarationProgress(),
        ...overrides,
    };
}
function declaration(type, ownerId, declaredAtTrick, targetCardId, pairId) {
    return {
        id: `${ownerId}:${type}:${declaredAtTrick}`,
        type,
        ownerId,
        declaredAtTrick,
        status: 'active',
        ...(targetCardId ? { targetCardId } : {}),
        contra: initialContraState(type, pairId?.startsWith('defence:') ? 'defence' : 'taker'),
        ...(pairId ? { pairId } : {}),
    };
}
function completedTrick(cards, winner, leader) {
    return { leader, cards: cards.map(([player, id]) => ({ player, card: card(id) })), winner };
}
export function buildExpertScenarioCatalog() {
    const scenarios = [];
    scenarios.push({
        id: 'DEF-BIRD-OPEN-001', category: 'bird-defence', title: 'Madárbemondás ellen fejetlen kőr',
        playerId: 'C', goldCards: ['hearts-10'], acceptableCards: ['hearts-10'], forbiddenCards: ['T9'],
        state: makeState('C', ['hearts-10', 'diamonds-10', 'spades-10', 'clubs-10', 'hearts-J', 'diamonds-J', 'spades-J', 'clubs-J', 'T9'], {
            declarations: { ...initialDeclarationProgress(), declarations: [declaration('centrum', 'A', 1, 'T20', 'taker:A')] },
        }),
        rationale: 'Az ellenfél Centrum-bemondása mellett a védekező indulási konvenció elsődlegesen fejetlen színt kér.',
    });
    const contraDecl = declaration('fourKings', 'A', 1, undefined, 'taker:A');
    contraDecl.contra = raiseContra(contraDecl.contra, 'B', 'defence');
    scenarios.push({
        id: 'DEF-CONTRA-REQUEST-002', category: 'contra-request', title: 'Megkontrázott négykirály: pikk-kérés',
        playerId: 'C', goldCards: ['spades-10'], acceptableCards: ['spades-10'], forbiddenCards: ['hearts-K'],
        state: makeState('C', ['spades-10', 'clubs-10', 'hearts-K', 'diamonds-K', 'hearts-J', 'diamonds-J', 'spades-J', 'clubs-J', 'T9'], {
            declarations: { ...initialDeclarationProgress(), declarations: [contraDecl] },
        }),
        rationale: 'A védekező partner kontra-jelzése az indulási színt specialistán meghatározza.',
    });
    scenarios.push({
        id: 'TAKER-WEAK-PAGAT-003', category: 'taker-opening', title: 'Gyenge Pagát: királyos szín',
        playerId: 'A', goldCards: ['hearts-K'], acceptableCards: ['hearts-K'], forbiddenCards: ['T1', 'T8'],
        state: makeState('A', ['T1', 'T8', 'T9', 'T10', 'hearts-K', 'diamonds-Q', 'spades-J', 'clubs-J', 'hearts-10']),
        rationale: 'Gyenge, Skíz/XXI nélküli Pagátos felvevőnél a királyos szín indulási előny.',
    });
    scenarios.push({
        id: 'TAKER-XXI-CATCH-004', category: 'xxi-catch', title: 'Bemondott XXI-fogás: fejetlen szín',
        playerId: 'C', goldCards: ['hearts-10'], acceptableCards: ['hearts-10', 'diamonds-10'], forbiddenCards: ['T22'],
        state: makeState('C', ['T22', 'hearts-10', 'diamonds-10', 'spades-K', 'clubs-J', 'hearts-J', 'diamonds-J', 'spades-J', 'clubs-K'], {
            declarations: { ...initialDeclarationProgress(), declarations: [declaration('xxiFogas', 'C', 1, undefined, 'defence:C')] },
        }),
        rationale: 'A deklarált XXI-fogási helyzetben a Skíz megőrzése és fejetlen szín indítása az előnyben részesített vonal.',
    });
    scenarios.push({
        id: 'PARTNER-HIGH-RESPONSE-005', category: 'partner-signal', title: 'Magas partneri tarokkjelzés: olcsó visszajelzés',
        playerId: 'A', goldCards: ['T10'], acceptableCards: ['T10', 'T21'], forbiddenCards: ['T22'],
        state: makeState('A', ['T21', 'T12', 'T10', 'hearts-K', 'diamonds-K', 'spades-J', 'clubs-J', 'hearts-10', 'diamonds-10'], {
            trick: { leader: 'B', cards: [{ player: 'B', card: card('T20') }] },
        }, [card('T20')]),
        rationale: 'A magas partneri tarokkjelzés mellett, ha a partner már biztosan viszi az ütést, az olcsó tarokkos visszajelzés nem égeti el a XXI-et.',
    });
    scenarios.push({
        id: 'PARTNER-LOW-RESPONSE-006', category: 'partner-signal', title: 'Kis partneri tarokkjelzés: olcsó visszajelzés',
        playerId: 'A', goldCards: ['T10'], acceptableCards: ['T10', 'T21'], forbiddenCards: ['T22'],
        state: makeState('A', ['T21', 'T12', 'T10', 'hearts-K', 'diamonds-K', 'spades-J', 'clubs-J', 'hearts-10', 'diamonds-10'], {
            trick: { leader: 'B', cards: [{ player: 'B', card: card('T10') }] },
        }, [card('T10')]),
        rationale: 'A partner kis tarokkja után a partner ütésének megtartása mellett az olcsó tarokkos válasz stratégiailag elfogadható.',
    });
    scenarios.push({
        id: 'PARTNER-TAROKK-SIGNAL-007', category: 'partner-continuation', title: 'Partneri tarokkjelzés után fejetlen szín',
        playerId: 'B', goldCards: ['hearts-10'], acceptableCards: ['hearts-10'], forbiddenCards: ['T12'],
        state: makeState('B', ['hearts-10', 'diamonds-10', 'spades-10', 'clubs-10', 'hearts-J', 'diamonds-J', 'spades-J', 'clubs-J', 'T12'], {
            completedTricks: [completedTrick([['A', 'T18'], ['B', 'T10'], ['C', 'T9'], ['D', 'T8']], 'B', 'A')],
            trick: { leader: 'B', cards: [] },
        }, [card('T18'), card('T10'), card('T9'), card('T8')]),
        rationale: 'A partner T18 indulása és B T10 válasza után B következő vezetésén fejetlen színnel tarthatja fenn a kérést.',
    });
    scenarios.push({
        id: 'FIGURE-COMM-TRULL-008', category: 'figure-communication', title: 'Trull + Négykirály: alacsony tarokkos meghívás',
        playerId: 'A', goldCards: ['T7'], acceptableCards: ['T7', 'T10', 'T12'], forbiddenCards: ['T19'],
        state: makeState('A', ['T7', 'T19', 'T12', 'T10', 'hearts-K', 'diamonds-K', 'spades-J', 'clubs-J', 'hearts-10'], {
            calledTarokk: 20,
            declarations: { ...initialDeclarationProgress(), declarations: [declaration('tuletroa', 'A', 0), declaration('fourKings', 'B', 0, undefined, 'taker:A')] },
        }),
        rationale: 'A Trull + partneri Négykirály kommunikáció a partner magas jelzett tarokkja felé alacsony tarokkos meghívást támogat.',
    });
    scenarios.push({
        id: 'FIGURE-COMM-CENTRUM-009', category: 'figure-communication', title: 'Trull + Négykirály + Centrum: kommunikált XVIII',
        playerId: 'A', goldCards: ['T9'], acceptableCards: ['T9', 'T10'], forbiddenCards: ['T18'],
        state: makeState('A', ['T10', 'T18', 'T12', 'T9', 'hearts-K', 'diamonds-K', 'spades-J', 'clubs-J', 'hearts-10'], {
            calledTarokk: 20,
            declarations: { ...initialDeclarationProgress(), declarations: [declaration('tuletroa', 'A', 0), declaration('fourKings', 'B', 0, undefined, 'taker:A'), declaration('centrum', 'B', 1, undefined, 'taker:A')] },
        }),
        rationale: 'A legutóbbi kommunikáció XVIII-at jelez; a vezető feladata meghívni, nem önmaga elhasználni a jelzett lapot.',
    });
    scenarios.push({
        id: 'FIGURE-PRESERVE-010', category: 'figure-preservation', title: 'Centrum célkártya megőrzése a határidő előtt',
        playerId: 'A', goldCards: ['hearts-10'], acceptableCards: ['hearts-10', 'T10', 'T12'], forbiddenCards: ['T20'],
        state: makeState('A', ['T20', 'T10', 'T12', 'T9', 'hearts-K', 'diamonds-K', 'spades-J', 'clubs-J', 'hearts-10'], {
            declarations: { ...initialDeclarationProgress(), declarations: [declaration('centrum', 'A', 1, 'T20', 'taker:A')] },
            completedTricks: [completedTrick([['B', 'T10'], ['C', 'T9'], ['D', 'T8'], ['A', 'T12']], 'A', 'B')],
            trick: { leader: 'A', cards: [] },
            nextPlayerIndex: 0,
        }, [card('T10'), card('T9'), card('T8'), card('T12')]),
        rationale: 'A lekötött XX-at a határidő előtt meg kell őrizni, amennyiben más legális lap is rendelkezésre áll.',
    });
    scenarios.push({
        id: 'SUIT-RETURN-011', category: 'partner-signal', title: 'Partner színének visszavezetése',
        playerId: 'A', goldCards: ['hearts-10'], acceptableCards: ['hearts-10'], forbiddenCards: ['T12'],
        state: makeState('A', ['hearts-10', 'diamonds-10', 'spades-10', 'clubs-10', 'hearts-J', 'diamonds-J', 'spades-J', 'clubs-J', 'T12'], {
            completedTricks: [completedTrick([['B', 'hearts-Q'], ['C', 'T9'], ['D', 'hearts-J'], ['A', 'hearts-K']], 'A', 'B')],
            trick: { leader: 'A', cards: [] },
        }, [card('hearts-Q'), card('T9'), card('hearts-J'), card('hearts-K')]),
        rationale: 'A taker a partner korábbi színindulásának visszavezetése után ugyanabban a színben tartja a kommunikációt.',
    });
    scenarios.push({
        id: 'DEF-NEUTRAL-HEADLESS-012', category: 'defence-opening', title: 'Semleges védekező indulás: fejetlen szín',
        playerId: 'C', goldCards: ['hearts-10'], acceptableCards: ['hearts-10'], forbiddenCards: ['hearts-K', 'T9'],
        state: makeState('C', ['hearts-10', 'diamonds-10', 'spades-10', 'clubs-10', 'hearts-K', 'diamonds-Q', 'spades-J', 'clubs-J', 'T9']),
        rationale: 'Speciális kérés nélkül a védekező oldal fejetlen színt részesít előnyben.',
    });
    scenarios.push({
        id: 'PUBLIC-CONTROL-013', category: 'card-memory', title: 'Nyilvános tarokk-kontroll a végjátékban',
        playerId: 'A', goldCards: ['T17'], acceptableCards: ['T17', 'T18'], forbiddenCards: [],
        state: makeState('A', ['T17', 'T18', 'hearts-K', 'diamonds-K', 'spades-J', 'clubs-J', 'hearts-10', 'diamonds-10', 'hearts-Q'], {
            completedTricks: [
                completedTrick([['B', 'T19']], 'B', 'B'),
                completedTrick([['C', 'T20']], 'C', 'C'),
                completedTrick([['D', 'T21']], 'D', 'D'),
                completedTrick([['B', 'T22']], 'B', 'B'),
                completedTrick([['C', 'T16']], 'C', 'C'),
                completedTrick([['D', 'T15']], 'D', 'D'),
            ],
            trick: { leader: 'B', cards: [{ player: 'B', card: card('T10') }] },
            nextPlayerIndex: 0,
            startingPlayerId: 'B',
        }, [card('T19'), card('T20'), card('T21'), card('T22'), card('T16'), card('T15'), card('T10')]),
        rationale: 'A magasabb tarokkok nyilvánosan már megjelentek; az olcsóbb T17 a biztos kontrollt takarékosabban használja, T18 még elfogadható alternatíva.',
    });
    return scenarios;
}
/**
 * Advisory calibration catalog. These scenarios exercise rare/silent-figure
 * preservation without changing the release-gate benchmark catalog.
 */
export function buildAdvisoryExpertScenarioCatalog() {
    const scenarios = [];
    scenarios.push({
        id: 'FIGURE-KISMADAR-PRESERVE-014', category: 'figure-preservation', title: 'Kismadár alatt XXI megőrzése',
        playerId: 'A', goldCards: ['hearts-10'], acceptableCards: ['hearts-10', 'T9'], forbiddenCards: ['T21'],
        state: makeState('A', ['T21', 'T9', 'T10', 'hearts-10', 'diamonds-10', 'spades-J', 'clubs-J', 'hearts-K', 'diamonds-K'], {
            declarations: { ...initialDeclarationProgress(), declarations: [declaration('kismadar', 'A', 2, undefined, 'taker:A')] },
            completedTricks: [
                completedTrick([['B', 'hearts-Q'], ['C', 'T8'], ['D', 'hearts-J'], ['A', 'hearts-K']], 'A', 'B'),
                completedTrick([['A', 'diamonds-10'], ['B', 'T7'], ['C', 'diamonds-Q'], ['D', 'T6']], 'A', 'A'),
            ],
            trick: { leader: 'B', cards: [{ player: 'B', card: card('T18') }] },
        }, [card('hearts-Q'), card('T8'), card('hearts-J'), card('hearts-K'), card('diamonds-10'), card('T7'), card('diamonds-Q'), card('T6'), card('T18')]),
        rationale: 'A Kismadár céljához szükséges XXI-et a célütés előtt meg kell őrizni, ha más biztonságos vezetés rendelkezésre áll.',
    });
    scenarios.push({
        id: 'FIGURE-NAGYMADAR-PRESERVE-015', category: 'figure-preservation', title: 'Nagymadár alatt Skíz megőrzése',
        playerId: 'A', goldCards: ['hearts-10'], acceptableCards: ['hearts-10', 'T20', 'T10'], forbiddenCards: ['T22'],
        state: makeState('A', ['T22', 'T20', 'T12', 'T10', 'hearts-10', 'diamonds-10', 'spades-J', 'clubs-J', 'hearts-K'], {
            declarations: { ...initialDeclarationProgress(), declarations: [declaration('nagymadar', 'A', 3, undefined, 'taker:A')] },
            completedTricks: [
                completedTrick([['B', 'hearts-Q'], ['C', 'T8'], ['D', 'hearts-J'], ['A', 'hearts-K']], 'A', 'B'),
                completedTrick([['A', 'diamonds-10'], ['B', 'T7'], ['C', 'diamonds-Q'], ['D', 'T6']], 'A', 'A'),
                completedTrick([['A', 'spades-J'], ['B', 'T9'], ['C', 'spades-Q'], ['D', 'T11']], 'A', 'A'),
            ],
            trick: { leader: 'B', cards: [{ player: 'B', card: card('T18') }] },
        }, [card('hearts-Q'), card('T8'), card('hearts-J'), card('hearts-K'), card('diamonds-10'), card('T7'), card('diamonds-Q'), card('T6'), card('spades-J'), card('T9'), card('spades-Q'), card('T11'), card('T18')]),
        rationale: 'A Nagymadár célkártyáját, a Skízt, a célvonal előtt csak akkor szabad elhasználni, ha nincs más értelmes folytatás.',
    });
    scenarios.push({
        id: 'FIGURE-PAGAT-ULTIMO-PRESERVE-016', category: 'silent-figures', title: 'Csendes Pagátultimó: Pagát megőrzése',
        playerId: 'A', goldCards: ['hearts-10'], acceptableCards: ['hearts-10', 'T9'], forbiddenCards: ['T1'],
        state: makeState('A', ['T1', 'T9', 'T10', 'T12', 'hearts-10', 'diamonds-10', 'spades-J', 'clubs-J', 'hearts-K'], {
            completedTricks: [
                completedTrick([['B', 'T18'], ['C', 'T8'], ['D', 'hearts-Q'], ['A', 'hearts-K']], 'B', 'B'),
                completedTrick([['B', 'T20'], ['C', 'T7'], ['D', 'diamonds-Q'], ['A', 'diamonds-K']], 'B', 'B'),
            ],
            trick: { leader: 'B', cards: [{ player: 'B', card: card('T8') }] },
        }, [card('T18'), card('T8'), card('hearts-Q'), card('hearts-K'), card('T20'), card('T7'), card('diamonds-Q'), card('diamonds-K')]),
        rationale: 'Csendes Pagátultimó-cél esetén a Pagátot a 9. ütésig meg kell őrizni, amíg van más szabályos kijátszás.',
    });
    scenarios.push({
        id: 'FIGURE-SAS-ULTIMO-PRESERVE-017', category: 'silent-figures', title: 'Csendes Sasultimó: Sas megőrzése',
        playerId: 'A', goldCards: ['hearts-10'], acceptableCards: ['hearts-10', 'T9'], forbiddenCards: ['T2'],
        state: makeState('A', ['T2', 'T9', 'T10', 'T12', 'hearts-10', 'diamonds-10', 'spades-J', 'clubs-J', 'hearts-K'], {
            completedTricks: [
                completedTrick([['B', 'T18'], ['C', 'T8'], ['D', 'hearts-Q'], ['A', 'hearts-K']], 'B', 'B'),
                completedTrick([['B', 'T20'], ['C', 'T7'], ['D', 'diamonds-Q'], ['A', 'diamonds-K']], 'B', 'B'),
            ],
            trick: { leader: 'B', cards: [{ player: 'B', card: card('T8') }] },
        }, [card('T18'), card('T8'), card('hearts-Q'), card('hearts-K'), card('T20'), card('T7'), card('diamonds-Q'), card('diamonds-K')]),
        rationale: 'Csendes Sasultimó-cél esetén a Sast a 9. ütésig meg kell őrizni, amíg van más szabályos kijátszás.',
    });
    return scenarios;
}
export function validateExpertScenario(scenario, decision) {
    const legal = new Set(decision.legalCardIds ?? []);
    const chosen = decision.card.id;
    return {
        legalPass: legal.size === 0 ? true : legal.has(chosen),
        strategicPass: (scenario.acceptableCards ?? scenario.goldCards).includes(chosen) && !scenario.forbiddenCards.includes(chosen),
        chosenCardId: chosen,
    };
}
