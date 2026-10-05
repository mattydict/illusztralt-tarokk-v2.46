import test from 'node:test';
import assert from 'node:assert/strict';
import { communicationSignalFor, communicationOpportunityFor, inferPartnerInformation, nextCommunicationSignal } from '../src/engine/signals.js';
test('XX-as hívásnál trull után a négykirály XIX-et jelez', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa'], calledTarokk: 20 }, 'fourKings')?.signalledTarokk, 19);
});
test('XIX-es invitnél a Trull + négykirály a még nem ismert XX-at jelzi', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa'], invitedTarokk: 19 }, 'fourKings')?.signalledTarokk, 20);
});
test('XVIII-as invitnél a Trull + négykirály a XX-at jelzi', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa'], invitedTarokk: 18 }, 'fourKings')?.signalledTarokk, 20);
});
test('XIX-es hívásnál a Trull + négykirály XVII-et jelez', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa'], calledTarokk: 19 }, 'fourKings')?.signalledTarokk, 17);
});
test('Centrum után a duplajáték XVII-et jelez', () => {
    assert.equal(communicationSignalFor(['tuletroa', 'fourKings', 'centrum'], 'doubleGame')?.signalledTarokk, 17);
});
test('a jelzés kommunikáció, nem birtoklási állítás', () => {
    assert.equal(nextCommunicationSignal({ previous: ['tuletroa'], invitedTarokk: 19 }), 19);
});
test('XIX + Centrum + tulétroá nélkül gazdag partneri következtetést ad', () => {
    const info = inferPartnerInformation({
        previous: ['centrum'],
        calledTarokk: 19,
        isTaker: true,
    });
    assert.ok(info.some(x => x.kind === 'tarokkCountAtLeast' && x.value === 5));
    const known = info.find(x => x.kind === 'knownTarokkSet');
    assert.deepEqual(known?.value, [22, 21, 20, 18]);
    assert.ok(info.some(x => x.kind === 'negativeInformation'));
});
test('trull után négykirály hiánya negatív információként kezelhető', () => {
    const info = inferPartnerInformation({ previous: ['tuletroa'] });
    assert.ok(info.some(x => x.kind === 'negativeInformation'));
});
test('Trull nélkül a négykirály általános bíztatás, nem konkrét tarokkjelzés', () => {
    const signal = communicationSignalFor({ previous: [], isTaker: false }, 'fourKings');
    assert.equal(signal?.meaning, 'encouragement');
    assert.equal(signal?.signalledTarokk, undefined);
});
test('Trull nélküli négykirály a partneri következtetésben bíztatásként jelenik meg', () => {
    const info = inferPartnerInformation({ previous: ['fourKings'], isTaker: false });
    assert.ok(info.some(x => x.kind === 'encouragement'));
});
test('Trull nélküli négykirály a felvevőnél is bíztatásként értelmezhető', () => {
    const signal = communicationSignalFor({ previous: [], isTaker: true }, 'fourKings');
    assert.equal(signal?.meaning, 'encouragement');
});
test('a partner Trullja is aktiválja a négykirály magas-tarokk jelzését', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa'],
        speakerDeclarations: [],
        calledTarokk: 20,
    }, 'fourKings');
    assert.equal(signal?.meaning, 'cardSignal');
    assert.equal(signal?.signalledTarokk, 19);
});
test('a beszélő saját Trullja ugyanúgy aktiválja a magas-tarokk jelzést', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa'],
        speakerDeclarations: ['tuletroa'],
        calledTarokk: 20,
    }, 'fourKings');
    assert.equal(signal?.meaning, 'cardSignal');
    assert.equal(signal?.signalledTarokk, 19);
});
test('Trull + négykirály legalább öt tarokkos erősségre utal, ritka négyes kivétellel', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa'],
        speakerDeclarations: ['fourKings'],
        calledTarokk: 20,
    });
    const count = info.find(x => x.kind === 'tarokkCountAtLeast');
    assert.equal(count?.value, 5);
    assert.ok(String(count?.evidence.join(' ')).includes('négy tarokkal'));
});
test('a partner Trullja és a beszélő négykirálya együtt is magas-tarokk jelzés', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa'],
        speakerDeclarations: ['fourKings'],
        calledTarokk: 20,
    }, 'fourKings');
    assert.equal(signal?.signalledTarokk, 19);
});
test('a partner Trullja esetén a következő kommunikációs jelzés is működik', () => {
    assert.equal(nextCommunicationSignal({
        previous: ['tuletroa', 'fourKings'],
        speakerDeclarations: ['fourKings'],
        calledTarokk: 20,
    }), 19);
});
test('a Trull + négykirály erősségi következtetés akkor is él, ha a Trull a partneré', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa'],
        speakerDeclarations: ['fourKings'],
        calledTarokk: 20,
    });
    assert.ok(info.some(x => x.kind === 'tarokkCountAtLeast' && x.value === 5));
});
test('Centrum -> Kismadár után a Dupla a következő, még ismeretlen tarokkot jelöli', () => {
    assert.equal(communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
        calledTarokk: 20,
    }, 'doubleGame')?.signalledTarokk, 16);
});
test('Centrum -> Kismadár -> Nagymadár után a Dupla már bíztatás, nem XV-jelzés', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar', 'nagymadar'],
        calledTarokk: 20,
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, undefined);
    assert.equal(signal?.meaning, 'encouragement');
});
test('A korábbi Centrum nem írhatja át egy későbbi Four Kings már lezárt jelentését', () => {
    assert.equal(communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        calledTarokk: 20,
    }, 'fourKings')?.signalledTarokk, 19);
});
import { emptyPartnerBeliefState, updatePartnerBeliefs, excludeObservedTarokk } from '../src/engine/partnerBeliefs.js';
test('Trull + négykirály a partneri beliefben növeli az 5+ tarokk valószínűségét és a jelzett tarokkokat', () => {
    const state = updatePartnerBeliefs(emptyPartnerBeliefState(), {
        previous: ['tuletroa'],
        speakerDeclarations: ['fourKings'],
        calledTarokk: 20,
    });
    assert.equal(state.tarokkCountAtLeast[5]?.strength, 'likely');
    assert.ok((state.tarokk[19]?.score ?? 0) > 0);
});
test('megfigyelt tarokk kijátszása erős negatív bizonyíték', () => {
    const state = updatePartnerBeliefs(emptyPartnerBeliefState(), {
        previous: ['tuletroa'],
        speakerDeclarations: ['fourKings'],
        calledTarokk: 20,
    });
    const next = excludeObservedTarokk(state, 19);
    assert.ok((next.tarokk[19]?.score ?? 1) <= 0);
    assert.equal(next.tarokk[19]?.evidence.at(-1)?.source, 'play');
});
test('Trull + XVIII-as invit és meghívás után a négykirály XX-at jelez', () => {
    assert.equal(communicationSignalFor({
        previous: ['tuletroa'],
        invitedTarokk: 18,
        calledTarokk: 18,
    }, 'fourKings')?.signalledTarokk, 20);
});
test('XVIII-as invit + Trull + négykirály önmagában még nem bizonyítja a XIX hiányát', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerDeclarations: ['fourKings'],
    });
    assert.ok(!info.some(x => x.kind === 'negativeInformation' && x.value === 'Az XVIII-as invitáló kezében nincs XIX.'));
});
test('XVIII-as invit után a partner XX-at jelző négykirálya és az invitáló Duplája XIX-hiányt és XVII-et közöl', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerId: 'B',
        speakerDeclarations: ['doubleGame'],
        events: [
            { declaration: 'tuletroa', speakerId: 'B' },
            { declaration: 'fourKings', speakerId: 'C' },
            { declaration: 'doubleGame', speakerId: 'B' },
        ],
    });
    assert.ok(info.some(x => x.kind === 'negativeInformation' && x.value === 'Az XVIII-as invitáló kezében nincs XIX.'));
    assert.ok(info.some(x => x.kind === 'speakerOwnTarokkSet' && Array.isArray(x.value) && x.value.includes(17)));
});
test('A későbbi Centrum nem írja át a Trull + négykirály alapjelzését', () => {
    assert.equal(communicationSignalFor({
        previous: ['tuletroa', 'centrum'],
        calledTarokk: 19,
    }, 'fourKings')?.signalledTarokk, 19);
});
test('a normál láncban a bemondó XVIII+XVII és legalább 5 tarokk információt ad, Kismadárra bíztat', () => {
    const ctx = {
        previous: ['tuletroa', 'fourKings', 'centrum', 'doubleGame'],
        speakerDeclarations: ['fourKings', 'centrum', 'doubleGame'],
        passedAfterChain: true,
    };
    const info = inferPartnerInformation(ctx);
    assert.ok(info.some(x => x.kind === 'tarokkCountAtLeast' && x.value === 5));
    assert.ok(info.some(x => x.kind === 'speakerOwnTarokkSet' && Array.isArray(x.value) && x.value.join(',') === '18,17'));
    assert.ok(info.some(x => x.kind === 'encouragement' && x.value === 'Kismadár'));
});
test('Ritka XXI-s alternatívát csak explicit XXI-információval és 8 tarokkos partnerjelzéssel erősíti', () => {
    const ctx = {
        previous: ['tuletroa', 'fourKings', 'centrum', 'doubleGame'],
        speakerDeclarations: ['fourKings', 'centrum', 'doubleGame'],
        passedAfterChain: true,
        speakerHasXXI: true,
        partnerHasDeclaredEightTarokk: true,
    };
    const info = inferPartnerInformation(ctx);
    assert.ok(info.some(x => x.kind === 'speakerOwnTarokkSet' && Array.isArray(x.value) && x.value.includes(21)));
    assert.ok(info.some(x => x.evidence.some(e => e.includes('8 tarokkos'))));
});
test('Centrum után a Kismadár elmaradása diszjunktív negatív információ', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        speakerId: 'B',
        speakerDeclarations: ['fourKings', 'centrum'],
        passedAfterChain: true,
        events: [
            { declaration: 'tuletroa', speakerId: 'B' },
            { declaration: 'fourKings', speakerId: 'C' },
            { declaration: 'centrum', speakerId: 'B' },
        ],
    });
    assert.ok(info.some(x => x.kind === 'negativeInformation' && x.value === 'A Kismadár legalább egy feltétele nem áll fenn az invitálónál.'));
    assert.ok(!info.some(x => x.kind === 'negativeInformation' && String(x.value).includes('nincs XXI')));
});
test('Kismadár után a Nagymadár elmaradása nem nevezi meg, melyik feltétel hiányzik', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
        speakerId: 'B',
        speakerDeclarations: ['fourKings', 'centrum', 'kismadar'],
        passedAfterChain: true,
        events: [
            { declaration: 'tuletroa', speakerId: 'B' },
            { declaration: 'fourKings', speakerId: 'C' },
            { declaration: 'centrum', speakerId: 'B' },
            { declaration: 'kismadar', speakerId: 'B' },
        ],
    });
    assert.ok(info.some(x => x.kind === 'negativeInformation' && x.value === 'A Nagymadár legalább egy feltétele nem áll fenn az invitálónál.'));
});
test('XX + Trull után válaszoló négykirály szabályszinten XIX-et és 98%-os 5+ tarokk erőt jelez', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa'],
        speakerDeclarations: ['fourKings'],
        calledTarokk: 20,
    });
    const xix = info.find(x => x.kind === 'knownTarokkSet' && Array.isArray(x.value) && x.value.includes(19));
    assert.equal(xix?.probability, 1);
    assert.equal(xix?.guaranteed, true);
    assert.equal(xix?.confidence, 'rule');
    const count = info.find(x => x.kind === 'tarokkCountAtLeast' && x.value === 5 && x.probability === 0.98);
    assert.ok(count);
    assert.equal(count?.confidence, 'rule');
});
test('XX + Trull + négykirály után a Trullt mondó fél Centrumja XVIII-at jelez normál ülésben', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings'],
        speakerDeclarations: ['centrum'],
        calledTarokk: 20,
    });
    const signal = info.find(x => x.kind === 'speakerOwnTarokkSet');
    assert.deepEqual(signal?.value, [18]);
    assert.equal(signal?.probability, 1);
    assert.equal(signal?.guaranteed, true);
});
test('XX + Trull + négykirály után ollóban/kör végén a Centrum XVII-et jelez', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings'],
        speakerDeclarations: ['centrum'],
        calledTarokk: 20,
        ollosPosition: true,
        speakerIsLastSeat: true,
        lastSeatHasXVIIAndUnboundHigherTarokk: true,
    });
    const signal = info.find(x => x.kind === 'speakerOwnTarokkSet');
    assert.deepEqual(signal?.value, [17]);
    assert.equal(signal?.probability, 1);
    assert.equal(signal?.guaranteed, true);
});
test('Trull + XIX hívás invit nélkül: a négykirály XVII-et jelöl', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa'], calledTarokk: 19 }, 'fourKings')?.signalledTarokk, 17);
});
test('Trull + XIX hívás invitnel: a négykirály XX-at jelöl', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa'], calledTarokk: 19, invitedTarokk: 19 }, 'fourKings')?.signalledTarokk, 20);
});
test('Trull + XIX hívás + Centrum után a következő négykirály XVII-et jelöl', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa', 'fourKings', 'centrum'], calledTarokk: 19 }, 'fourKings')?.signalledTarokk, 17);
});
test('Trull + négykirály + Centrum után Dupla XVII-et jelöl', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa', 'fourKings', 'centrum'], calledTarokk: 20 }, 'doubleGame')?.signalledTarokk, 17);
});
test('Ha Kismadár is azonosította a XXI-et, a Dupla XVI-ot jelöl', () => {
    assert.equal(communicationSignalFor({ previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar'], calledTarokk: 20 }, 'doubleGame')?.signalledTarokk, 16);
});
test('Trull + négykirály + Dupla Centrum nélkül nem jelöl következő tarokkot', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings'],
        calledTarokk: 20,
    }, 'doubleGame');
    assert.equal(signal?.meaning, 'encouragement');
    assert.equal(signal?.signalledTarokk, undefined);
});
test('Trull + négykirály + Dupla Centrum nélkül azt közli, hogy nincs XVIII és lyukas Centrum sem játszható', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings'],
        speakerDeclarations: ['fourKings', 'doubleGame'],
        calledTarokk: 20,
    });
    const negative = info.find(x => x.kind === 'negativeInformation' && x.value === 'A párnál nincs XVIII, és a lyukas Centrum sem játszható.');
    assert.equal(negative?.probability, 1);
    assert.equal(negative?.guaranteed, true);
});
test('Trull + négykirály + Dupla után Centrum nélkül a következő tarokk pointer nem aktiválódik', () => {
    assert.equal(nextCommunicationSignal({
        previous: ['tuletroa', 'fourKings'],
        speakerDeclarations: ['fourKings', 'doubleGame'],
        calledTarokk: 20,
    }), undefined);
});
test('Trull utáni Dupla négykirály nélkül nem jelez XVIII-at', () => {
    const signal = communicationSignalFor({ previous: ['tuletroa'], calledTarokk: 20 }, 'doubleGame');
    assert.equal(signal?.meaning, 'encouragement');
    assert.equal(signal?.signalledTarokk, undefined);
});
test('Trull utáni Dupla négykirály nélkül XIX-hiányt és további figurára bíztatást közöl', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa'],
        speakerDeclarations: ['doubleGame'],
        calledTarokk: 20,
    });
    const negative = info.find(x => x.kind === 'negativeInformation' && x.value === 'A bemondó nem XIX-et kommunikál.');
    assert.equal(negative?.probability, 1);
    assert.equal(negative?.guaranteed, true);
    assert.ok(info.some(x => x.kind === 'encouragement' && String(x.value).includes('további')));
});
test('Trull + négykirály + Dupla Centrum nélkül csak bíztatás', () => {
    const signal = communicationSignalFor({ previous: ['tuletroa', 'fourKings'], calledTarokk: 20 }, 'doubleGame');
    assert.equal(signal?.meaning, 'encouragement');
    assert.equal(signal?.signalledTarokk, undefined);
});
test('A legacy declarations helper is consistent with the contextual XIX-call chain', async () => {
    const { fourKingsSignalAfterTrull } = await import('../src/engine/declarations.js');
    assert.equal(fourKingsSignalAfterTrull({ calledTarokk: 19 }), 17);
    assert.equal(fourKingsSignalAfterTrull({ calledTarokk: 19, invitedTarokk: 19 }), 20);
    assert.equal(fourKingsSignalAfterTrull({ calledTarokk: 20 }), 19);
});
test('A legacy Centrum helper continues the descending figure chain', async () => {
    const { doubleGameSignalAfterCentrum } = await import('../src/engine/declarations.js');
    assert.equal(doubleGameSignalAfterCentrum(), 17);
    assert.equal(doubleGameSignalAfterCentrum({ kismadarDeclared: true }), 16);
    assert.equal(doubleGameSignalAfterCentrum({ nagymadarDeclared: true }), undefined);
});
test('Az olló megjelölése önmagában nem aktiválja a lyukas Centrumot', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings'],
        calledTarokk: 20,
        speakerDeclarations: ['centrum'],
        ollosPosition: true,
    }, 'centrum');
    assert.equal(signal?.signalledTarokk, 18);
});
test('A lyukas Centrumhoz az explicit XVII + szabad magasabb tarokk feltétel is kell', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings'],
        calledTarokk: 20,
        speakerDeclarations: ['centrum'],
        seatContext: 'lyukasCentrum',
        lastSeatHasXVIIAndUnboundHigherTarokk: true,
    }, 'centrum');
    assert.equal(signal?.signalledTarokk, 17);
});
test('Event chronology preserves repeated Four Kings declarations', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'fourKings'],
        events: [
            { declaration: 'tuletroa', speakerSeat: 0 },
            { declaration: 'fourKings', speakerSeat: 1 },
            { declaration: 'fourKings', speakerSeat: 3 },
        ],
        calledTarokk: 20,
    }, 'fourKings');
    assert.equal(signal?.signalledTarokk, 18);
});
test('Event chronology does not let a later Centrum rewrite the first Four Kings', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        events: [
            { declaration: 'tuletroa', speakerSeat: 0 },
            { declaration: 'fourKings', speakerSeat: 1 },
            { declaration: 'centrum', speakerSeat: 0 },
        ],
        calledTarokk: 20,
    }, 'fourKings');
    assert.equal(signal?.signalledTarokk, 19);
});
test('XVIII-as invit + Trull + négykirály csak a XX pozitív információját adja', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerDeclarations: ['fourKings'],
    });
    const positive = info.find(x => x.kind === 'knownTarokkSet' && Array.isArray(x.value) && x.value.includes(20));
    const negative = info.find(x => x.kind === 'negativeInformation' && x.value === 'Az XVIII-as invitáló kezében nincs XIX.');
    assert.deepEqual(positive?.value, [20]);
    assert.equal(negative, undefined);
});
test('XVIII-as invit után Kismadár: a Centrum fölé épülve XIX + XVII + XXI kommunikált', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerId: 'B',
        speakerDeclarations: ['kismadar'],
        events: [
            { declaration: 'tuletroa', speakerId: 'B' },
            { declaration: 'fourKings', speakerId: 'C' },
            { declaration: 'kismadar', speakerId: 'B' },
        ],
    });
    assert.ok(!info.some(x => x.kind === 'negativeInformation' && x.value === 'Az XVIII-as invitáló kezében nincs XIX.'));
    const own = info.find(x => x.kind === 'speakerOwnTarokkSet' && Array.isArray(x.value) && x.value.includes(17));
    assert.ok(own?.value.includes(19));
    assert.ok(own?.value.includes(21));
    assert.ok(info.some(x => x.kind === 'tarokkCountAtLeast' && x.value === 6));
});
test('XVIII-as invit után Nagymadár: a Centrum fölé épülve XIX + XVII + XVI + Skíz kommunikált', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerId: 'B',
        speakerDeclarations: ['nagymadar'],
        events: [
            { declaration: 'tuletroa', speakerId: 'B' },
            { declaration: 'fourKings', speakerId: 'C' },
            { declaration: 'nagymadar', speakerId: 'B' },
        ],
    });
    assert.ok(!info.some(x => x.kind === 'negativeInformation' && x.value === 'Az XVIII-as invitáló kezében nincs XIX.'));
    const own = info.find(x => x.kind === 'speakerOwnTarokkSet' && Array.isArray(x.value) && x.value.includes(16));
    assert.ok(own?.value.includes(19));
    assert.ok(own?.value.includes(17));
    assert.ok(own?.value.includes(22));
    assert.ok(info.some(x => x.kind === 'tarokkCountAtLeast' && x.value === 7));
});
test('A Kismadár elmaradása több lehetséges feltételt hagy nyitva, nem azonosítja a hiányzó lapot', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerId: 'B',
        speakerDeclarations: ['fourKings', 'centrum'],
        passedAfterChain: true,
        events: [
            { declaration: 'tuletroa', speakerId: 'B' },
            { declaration: 'fourKings', speakerId: 'C' },
            { declaration: 'centrum', speakerId: 'B' },
        ],
    });
    const omission = info.find(x => x.kind === 'negativeInformation' && String(x.value).includes('Kismadár legalább egy feltétele'));
    assert.ok(omission);
    assert.ok((omission?.unmetPrerequisites?.length ?? 0) >= 3);
    assert.ok(!omission?.excludedTarokkRanks);
});
test('A Nagymadár elmaradása külön feltételhalmazt őriz meg', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerId: 'B',
        speakerDeclarations: ['fourKings', 'centrum', 'kismadar'],
        passedAfterChain: true,
        events: [
            { declaration: 'tuletroa', speakerId: 'B' },
            { declaration: 'fourKings', speakerId: 'C' },
            { declaration: 'centrum', speakerId: 'B' },
            { declaration: 'kismadar', speakerId: 'B' },
        ],
    });
    const omission = info.find(x => x.kind === 'negativeInformation' && String(x.value).includes('Nagymadár legalább egy feltétele'));
    assert.ok(omission);
    assert.ok(omission?.unmetPrerequisites?.includes('Skíz a megfelelő oldalon'));
    assert.ok(!omission?.excludedTarokkRanks);
});
test('Elfogadott invitnél a felvevő Trulljának elmaradása önmagában is negatív információ, de nem bizonyítja keményen a másik nagyhonőr hiányát', () => {
    const info = inferPartnerInformation({
        previous: ['tuletroa'],
        invitedTarokk: 18,
        calledTarokk: 18,
        isTaker: true,
        speakerId: 'A',
        speakerDeclarations: ['fourKings'],
    });
    const omission = info.find(x => x.kind === 'negativeInformation' && String(x.value).includes('nem mondott Trullt'));
    assert.ok(omission);
    assert.equal(omission?.confidence, 'convention');
    assert.ok((omission?.unmetPrerequisites?.length ?? 0) >= 2);
});
test('Az invitált felvevőnél a Trull hiánya nem zárja ki a két nagyhonőrt gyenge lap esetén', () => {
    const info = inferPartnerInformation({
        previous: [],
        invitedTarokk: 19,
        calledTarokk: 19,
        isTaker: true,
        speakerId: 'A',
        speakerDeclarations: ['pagatUltimo'],
    });
    const omission = info.find(x => x.kind === 'negativeInformation' && String(x.value).includes('nem mondott Trullt'));
    assert.ok(omission);
    assert.ok(omission?.unmetPrerequisites?.some(x => x.includes('3–4')) || omission?.evidence.some(x => x.includes('3–4')));
});
test('XIX-es invit után a felvevő közvetlen Centrumja Négykirály nélkül XVIII-at jelez', () => {
    const info = inferPartnerInformation({
        previous: ['centrum'],
        invitedTarokk: 19,
        calledTarokk: 19,
        isTaker: true,
        speakerDeclarations: ['centrum'],
    });
    assert.ok(info.some(x => x.kind === 'knownTarokkSet' && Array.isArray(x.value) && x.value.includes(18)));
});
test('XIX-es invitnél a közvetlen Centrum kommunikációs rövidítés, nem negatív Négykirály-információ', () => {
    const info = inferPartnerInformation({
        previous: ['centrum'],
        invitedTarokk: 19,
        calledTarokk: 19,
        isTaker: true,
        speakerDeclarations: ['centrum'],
    });
    assert.ok(!info.some(x => x.kind === 'negativeInformation' && String(x.value).includes('négykirály')));
});
test('a kommunikációs lehetőség a beszélő saját láncából indul ki', () => {
    const opportunity = communicationOpportunityFor({
        previous: ['tuletroa', 'fourKings'],
        speakerDeclarations: ['tuletroa', 'fourKings'],
        events: [
            { declaration: 'tuletroa', speakerId: 'A' },
            { declaration: 'fourKings', speakerId: 'B' },
            { declaration: 'centrum', speakerId: 'B' },
        ],
        speakerId: 'A',
    });
    assert.equal(opportunity?.declaration, 'centrum');
});
test('Az ellenfél Négykirálya nem lépteti tovább a saját pár kommunikációs láncát', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'fourKings'],
        events: [
            { declaration: 'tuletroa', speakerId: 'A', side: 'taker' },
            { declaration: 'fourKings', speakerId: 'B', side: 'taker' },
            { declaration: 'centrum', speakerId: 'B', side: 'taker' },
            { declaration: 'fourKings', speakerId: 'C', side: 'defence' },
        ],
        speakerId: 'C',
        calledTarokk: 20,
    }, 'fourKings');
    assert.equal(signal?.signalledTarokk, 19);
});
test('A partner azonos oldali Négykirálya folytathatja a már megnyitott láncot', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'fourKings'],
        events: [
            { declaration: 'tuletroa', speakerId: 'A', side: 'taker' },
            { declaration: 'fourKings', speakerId: 'B', side: 'taker' },
            { declaration: 'centrum', speakerId: 'B', side: 'taker' },
            { declaration: 'fourKings', speakerId: 'A', side: 'taker' },
        ],
        speakerId: 'A',
        calledTarokk: 20,
    }, 'fourKings');
    assert.equal(signal?.signalledTarokk, 17);
});
test('Trull nélkül a Dupla csak bíztatás, közvetlen XX-as hívás után is', () => {
    const signal = communicationSignalFor({
        previous: [],
        calledTarokk: 20,
        speakerDeclarations: [],
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, undefined);
    assert.equal(signal?.meaning, 'encouragement');
});
test('Trull után Négykirály nélkül a Dupla csak bíztatás', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa'],
        calledTarokk: 20,
        speakerDeclarations: ['tuletroa'],
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, undefined);
    assert.equal(signal?.meaning, 'encouragement');
});
test('XVIII-as invit + Trull + Négykirály + Centrum + Dupla XVII-et jelent', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        invitedTarokk: 18,
        calledTarokk: 18,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum'],
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 17);
    assert.equal(signal?.meaning, 'cardSignal');
});
test('XIX-es invit + Trull + Négykirály + Centrum + Dupla szintén XVII-et jelent', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        invitedTarokk: 19,
        calledTarokk: 19,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum'],
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 17);
    assert.equal(signal?.meaning, 'cardSignal');
});
test('Trull + Négykirály + Centrum + Kismadár + Dupla XVI-ot jelent', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
        calledTarokk: 20,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 16);
    assert.equal(signal?.meaning, 'cardSignal');
});
test('Kör végén, magasabb le nem kötött tarokkal a Centrum utáni Dupla XVI-ot is jelezhet', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        calledTarokk: 20,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum'],
        speakerIsLastSeat: true,
        speakerHasHigherUnboundTarokk: true,
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 16);
    assert.equal(signal?.meaning, 'cardSignal');
});
test('Kismadár után ugyanebben a speciális üléshelyzetben a Dupla XV-öt is jelezhet', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
        calledTarokk: 20,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
        speakerIsLastSeat: true,
        speakerHasHigherUnboundTarokk: true,
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 15);
    assert.equal(signal?.meaning, 'cardSignal');
});
test('A puszta körvégi ülés önmagában nem engedi átugrani a Dupla kommunikációs lépcsőjét', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        calledTarokk: 20,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum'],
        speakerIsLastSeat: true,
        speakerHasHigherUnboundTarokk: false,
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 17);
});
test('Trull + Négykirály + Centrum + Kismadár + Nagymadár + Dupla ismét bíztatás', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar', 'nagymadar'],
        calledTarokk: 20,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum', 'kismadar', 'nagymadar'],
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, undefined);
    assert.equal(signal?.meaning, 'encouragement');
});
test('Trull + Négykirály + Centrum után a Dupla nem tér vissza a közvetlen XX-as szabályhoz', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        calledTarokk: 20,
        speakerDeclarations: ['tuletroa', 'fourKings', 'centrum'],
    }, 'doubleGame');
    assert.equal(signal?.meaning, 'cardSignal');
    assert.equal(signal?.signalledTarokk, 17);
});
test('körvégi, magasabb szabad tarokkos Centrum-dupla lyukas Kismadarat jelez: XVI', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum'],
        speakerIsLastSeat: true,
        speakerHasHigherUnboundTarokk: true,
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 16);
    assert.equal(signal?.targetFigure, 'kismadar');
});
test('körvégi, magasabb szabad tarokkos Kismadár-dupla lyukas Nagymadarat jelez: XV', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar'],
        speakerIsLastSeat: true,
        speakerHasHigherUnboundTarokk: true,
    }, 'doubleGame');
    assert.equal(signal?.signalledTarokk, 15);
    assert.equal(signal?.targetFigure, 'nagymadar');
});
test('Nagymadár után a Dupla ismét bíztatás, nem XV-jelzés', () => {
    const signal = communicationSignalFor({
        previous: ['tuletroa', 'fourKings', 'centrum', 'kismadar', 'nagymadar'],
        speakerIsLastSeat: true,
        speakerHasHigherUnboundTarokk: true,
    }, 'doubleGame');
    assert.equal(signal?.meaning, 'encouragement');
    assert.equal(signal?.signalledTarokk, undefined);
});
