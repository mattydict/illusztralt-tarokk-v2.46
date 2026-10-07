import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIAuctionAction } from '../src/engine/aiAuction.js';
import { createAuction } from '../src/engine/auction.js';
const c = (rank, id = `T${rank}`) => ({ kind: 'tarokk', rank, id, points: rank === 1 || rank === 21 || rank === 22 ? 5 : 1 });
test('erős kézzel az AI nem automatikusan passzol', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(22), c(21), c(20), c(19), c(18), c(17), c(16), c(15), c(14)];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand });
    assert.notEqual(d.action.type, 'pass');
});
test('gyenge, honőr nélküli kéznél az AI passzol', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(10), c(11), c(12), c(13), c(14), c(15)];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand });
    assert.equal(d.action.type, 'pass');
});
test('első körben az XIX invit előnyben van a ritka XX önhívással szemben', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(22), c(21), c(19), c(18), c(17), c(16)];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand });
    if (d.action.type === 'invite')
        assert.notEqual(d.action.target, 20);
});
test('illusztrált stratégia: gyenge, védtelen Pagáttal a veszteségminimalizáló Szóló előnyös lehet', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    // Pagát + 3 kis tarokk, nincs XX/XIX/XVIII és nincs nagyhonőr.
    const hand = [c(1), c(7), c(8), c(9), { kind: 'szin', suit: 'makk', rank: 10, id: 'M10', points: 10 }];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand });
    assert.equal(d.action.type, 'bid');
    assert.equal(d.action.contract, 'solo');
});
test('single-playerben a nyitó Szóló nem automatikus egy átlagos honőrös kéznél', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(1), c(7), c(8), c(9), c(10), c(11)];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand }, { singlePlayer: true });
    assert.notEqual(d.action.type === 'bid' ? d.action.contract : undefined, 'solo');
});
test('single-playerben a kivételes Skíz-kézhez is kell XIII-as vagy magasabb legalacsonyabb tarokk és király', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(22), c(21), c(20), c(19), c(18), c(17), c(16), { kind: 'suit', suit: 'hearts', rank: 'K', id: 'hearts-K', points: 5 }];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand }, { singlePlayer: true });
    assert.equal(d.action.type, 'bid');
    assert.equal(d.action.contract, 'solo');
});
test('5 tarokkos, XX-XIX-XVIII nélküli védtelen Pagát is veszteségminimalizáló kéz', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(1), c(7), c(8), c(9), c(10)];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand });
    assert.equal(d.action.type, 'bid');
    assert.equal(d.action.contract, 'solo');
});
test('Skíz + Pagát + 7 tarokk esetén a Szóló agresszív stratégiai opció', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(22), c(1), c(7), c(8), c(9), c(10), c(11)];
    const d = chooseAIAuctionAction(auction, 'A', hand, { A: hand });
    assert.equal(d.action.type, 'bid');
    assert.equal(d.action.contract, 'solo');
});
test('Csak XXI + közvetlenül előtte Hármas: a fogási veszély visszafogja a licitet', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const a = [c(22), c(7), c(8), c(9), c(10), c(11), c(12)];
    const b = [c(21), c(7), c(8), c(9), c(10), c(11), c(12)];
    // A has already shown a Hármas; B is the only XXI.
    const withBid = { ...auction, records: [{ playerId: 'A', action: { type: 'bid', contract: 'three' } }], highest: { playerId: 'A', contract: 'three', seat: 0 }, currentSeat: 1 };
    const d = chooseAIAuctionAction(withBid, 'B', b, { A: a, B: b });
    assert.notEqual(d.action.type, 'bid');
});
test('Csak XXI gyenge kézzel: a fogási veszély nem blokkolja a felvevőség keresését', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const b = [c(21), c(7), c(8), c(9)];
    const withBid = { ...auction, records: [{ playerId: 'A', action: { type: 'bid', contract: 'three' } }], highest: { playerId: 'A', contract: 'three', seat: 0 }, currentSeat: 1 };
    const d = chooseAIAuctionAction(withBid, 'B', b, { B: b });
    assert.notEqual(d.action.type, 'pass');
});
test('XXI-fogási védekezés: 3-2-1 után a gyenge XXI-es tart, nem engedi ki automatikusan', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(21), c(7), c(8), c(9)];
    const state = {
        ...auction,
        records: [
            { playerId: 'A', action: { type: 'bid', contract: 'three' } },
            { playerId: 'B', action: { type: 'bid', contract: 'two' } },
            { playerId: 'C', action: { type: 'bid', contract: 'one' } },
        ],
        highest: { playerId: 'C', contract: 'one', seat: 2 },
        currentSeat: 0,
    };
    const d = chooseAIAuctionAction(state, 'A', hand, { A: hand });
    assert.equal(d.action.type, 'hold');
});
test('Skíz + XX + rövidebb tarokk: a talonigény miatt a kiengedés is valós stratégiai opció', () => {
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const hand = [c(22), c(20), c(1), c(7), c(8), c(9)];
    const state = {
        ...auction,
        records: [{ playerId: 'A', action: { type: 'bid', contract: 'three' } }],
        highest: { playerId: 'A', contract: 'three', seat: 0 },
        currentSeat: 1,
    };
    const d = chooseAIAuctionAction(state, 'B', hand, { B: hand });
    assert.ok(d.reasons.some(r => r.includes('Skíz kiengedési lehetőség')) || d.action.type === 'hold' || d.action.type === 'bid');
});
test('3→2 nem azonosítja automatikusan a Kettesest Skízként', async () => {
    const { inferAuctionBeliefs } = await import('../src/engine/aiAuction.js');
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const state = {
        ...auction,
        records: [
            { playerId: 'A', action: { type: 'bid', contract: 'three' } },
            { playerId: 'B', action: { type: 'bid', contract: 'two' } },
            { playerId: 'C', action: { type: 'bid', contract: 'one' } },
        ],
        highest: { playerId: 'B', contract: 'two', seat: 1 },
        currentSeat: 3,
    };
    const beliefs = inferAuctionBeliefs(state);
    const b = beliefs.find(x => x.playerId === 'B');
    const c = beliefs.find(x => x.playerId === 'C');
    assert.ok(b);
    assert.ok(c);
    // B remains a plausible XXI as well as Skíz; the model must not hard-decode
    // the published example into “B = Skíz”.
    assert.ok(b.likelyXXI > 0.15);
    assert.ok(b.likelySkiz < 0.20);
    // C remains a live later-seat candidate for the Skíz/fogás role.
    assert.ok(c.likelySkiz > 0.10);
});
test('3→2→1 után az eredeti Hármasosnál nincs hamis XIX-invit: az Egyesről a Szóló a következő rendes licit', async () => {
    const { legalAuctionActions, applyAuctionAction } = await import('../src/engine/auction.js');
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    let state = auction;
    const hands = { A: [c(19), c(21), c(20), c(18), c(17), c(16), c(15), c(14)], B: [c(21), c(20), c(18), c(17), c(16), c(15), c(14), c(13)], C: [c(22), c(20), c(18), c(17), c(16), c(15), c(14), c(13)], D: [] };
    state = applyAuctionAction(state, { type: 'bid', contract: 'three' }, hands);
    state = applyAuctionAction(state, { type: 'bid', contract: 'two' }, hands);
    state = applyAuctionAction(state, { type: 'hold', contract: 'two' }, hands);
    assert.ok(state.seats[state.currentSeat]?.playerId === 'B');
    assert.ok(legalAuctionActions(state, 'B', hands).some(a => a.type === 'bid' && a.contract === 'one'));
    state = applyAuctionAction(state, { type: 'bid', contract: 'one' }, hands);
    // At current Egyes the next ordinary bid is Szóló, so no invite can be attached
    // merely to that next step. A genuine XIX-invit requires one skipped contract.
    const actions = legalAuctionActions(state, 'A', hands);
    assert.equal(actions.some(a => a.type === 'invite' && a.target === 19), false);
    assert.equal(actions.some(a => a.type === 'pass' && a.inviteTarget !== undefined), false);
});
test('3→2→1→2 szabálytalan: Kettesre nincs visszalépési lehetőség', async () => {
    const { legalAuctionActions } = await import('../src/engine/auction.js');
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const state = {
        ...auction,
        records: [
            { playerId: 'A', action: { type: 'bid', contract: 'three' } },
            { playerId: 'B', action: { type: 'bid', contract: 'two' } },
            { playerId: 'C', action: { type: 'bid', contract: 'one' } },
            { playerId: 'D', action: { type: 'pass' } },
        ],
        highest: { playerId: 'C', contract: 'one', seat: 2 },
        currentSeat: 0,
        out: ['D'],
    };
    const actions = legalAuctionActions(state, 'A');
    assert.ok(!actions.some(a => a.type === 'bid' && a.contract === 'two'));
});
test('3→2→1→Szóló XIX-invit: az invitáló nagyhonőre és legalább 5 tarokkra épül', async () => {
    const { inferCaptureConfigurations } = await import('../src/engine/aiAuction.js');
    const auction = createAuction(['A', 'B', 'C', 'D'], 0);
    const state = {
        ...auction,
        records: [
            { playerId: 'A', action: { type: 'bid', contract: 'three' } },
            { playerId: 'B', action: { type: 'bid', contract: 'two' } },
            { playerId: 'C', action: { type: 'bid', contract: 'one' } },
            { playerId: 'A', action: { type: 'invite', target: 19 } },
        ],
        highest: { playerId: 'A', contract: 'solo', seat: 0 },
        currentSeat: 1,
    };
    const cfg = inferCaptureConfigurations(state);
    // Any configuration treating A as Pagát is heavily suppressed by the
    // explicit XIX invite; A may still be XXI or Skíz.
    const aPagat = cfg.filter(x => x.pagat === 'A').reduce((n, x) => n + x.probability, 0);
    const aBig = cfg.filter(x => x.xxi === 'A' || x.skiz === 'A').reduce((n, x) => n + x.probability, 0);
    assert.ok(aBig > aPagat * 3);
});
test('explicit XIX-invit után csak XIX-et tartó fogadó emelhet, ha a kezek ismertek', async () => {
    const { legalAuctionActions } = await import('../src/engine/auction.js');
    const auction = createAuction(['A', 'B', 'C', 'D'], 1);
    const state = {
        ...auction,
        records: [
            { playerId: 'A', action: { type: 'invite', target: 19 } },
        ],
        highest: undefined,
        currentSeat: 1,
        outstandingInvite: { inviterId: 'A', target: 19 },
    };
    const noXix = [c(21), c(8), c(9), c(10), c(11)];
    const actionsNoXix = legalAuctionActions(state, 'B', { A: [c(19)], B: noXix, C: [], D: [] });
    assert.ok(!actionsNoXix.some(a => a.type === 'bid'));
    const withXix = [c(19), c(21), c(8), c(9), c(10), c(11)];
    const actionsWithXix = legalAuctionActions(state, 'B', { A: [c(19)], B: withXix, C: [], D: [] });
    assert.ok(actionsWithXix.some(a => a.type === 'bid'));
});
test('XIX-invit után a XIX-et tartó következő játékos nem passzol automatikusan', async () => {
    const { chooseAIAuctionAction } = await import('../src/engine/aiAuction.js');
    const auction = createAuction(['A', 'B', 'C', 'D'], 1);
    const state = {
        ...auction,
        records: [{ playerId: 'A', action: { type: 'invite', target: 19 } }],
        currentSeat: 1,
        outstandingInvite: { inviterId: 'A', target: 19 },
    };
    const hand = [c(19), c(21), c(8), c(9), c(10), c(11)];
    const d = chooseAIAuctionAction(state, 'B', hand, { A: [c(22), c(19)], B: hand, C: [], D: [] });
    assert.notEqual(d.action.type, 'pass');
    assert.ok(d.reasons.some(r => r.includes('invit')));
});
test('XIX-invit után a partnerjelöltekből kiesik a már passzolt játékos', async () => {
    const { inferInvitePartnerCandidates } = await import('../src/engine/aiAuction.js');
    const auction = createAuction(['A', 'B', 'C', 'D'], 1);
    const state = {
        ...auction,
        records: [
            { playerId: 'A', action: { type: 'invite', target: 19 } },
            { playerId: 'B', action: { type: 'pass' } },
        ],
        currentSeat: 2,
        outstandingInvite: { inviterId: 'A', target: 19 },
        out: ['B'],
    };
    const candidates = inferInvitePartnerCandidates(state);
    assert.ok(!candidates.some(c => c.playerId === 'B'));
    assert.ok(candidates.some(c => c.playerId === 'C'));
});
