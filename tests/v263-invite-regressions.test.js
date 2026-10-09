import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';

function card(rank, id = `T${rank}`) {
  return { kind: 'tarokk', rank, id, points: [1, 21, 22].includes(rank) ? 5 : 1 };
}
function hand({ honour = 22, include = [] } = {}) {
  const ranks = [...new Set([honour, ...include, 20, 19, 18, 17, 16, 15])].slice(0, 5);
  return [
    ...ranks.map((r) => card(r)),
    { kind: 'suit', suit: 'hearts', rank: 'K', id: 'hK', points: 5 },
    { kind: 'suit', suit: 'diamonds', rank: 'K', id: 'dK', points: 5 },
    { kind: 'suit', suit: 'spades', rank: 'Q', id: 'sQ', points: 4 },
  ];
}

function run(state, hands, actions) {
  for (const action of actions) state = applyAuctionAction(state, action, hands);
  return state;
}

test('direct first Solo is never an invite', () => {
  const hands = { A: hand({ honour: 22, include: [18] }), B: hand(), C: hand(), D: hand() };
  const s = createAuction(['A', 'B', 'C', 'D']);
  const acts = legalAuctionActions(s, 'A', hands);
  assert.ok(acts.some((a) => a.type === 'bid' && a.contract === 'solo'));
  assert.equal(acts.some((a) => a.type === 'invite'), false);
});

test('A3 B1 is an XIX invite candidate for B, while A may hold or accept the invite', () => {
  const hands = {
    A: hand({ honour: 22, include: [19] }),
    B: hand({ honour: 21, include: [19] }),
    C: hand(), D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [{ type: 'bid', contract: 'three' }]);
  const bActs = legalAuctionActions(s, 'B', hands);
  assert.ok(bActs.some((a) => a.type === 'invite' && a.target === 19 && a.contract === 'one'));
  assert.ok(bActs.some((a) => a.type === 'invite' && a.target === 18 && a.contract === 'solo'));
});

test('A3 BSolo is an XVIII invite candidate, never XIX', () => {
  const hands = {
    A: hand({ honour: 22, include: [18] }),
    B: hand({ honour: 21, include: [18] }),
    C: hand(), D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [{ type: 'bid', contract: 'three' }]);
  const bActs = legalAuctionActions(s, 'B', hands);
  assert.ok(bActs.some((a) => a.type === 'invite' && a.target === 18 && a.contract === 'solo'));
});

test('A2 B1 can become XIX invite when A passes', () => {
  const hands = { A: hand({ honour: 22, include: [19] }), B: hand({ honour: 21, include: [19] }), C: hand(), D: hand() };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'two' },
    { type: 'bid', contract: 'one' },
    { type: 'pass' },
    { type: 'pass' },
  ]);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.ok(legalAuctionActions(s, 'A', hands).some((a) => a.type === 'pass' && a.inviteTarget === 19));
});

test('A2 BSolo is XIX invite, not XVIII', () => {
  const hands = { A: hand({ honour: 22, include: [19] }), B: hand({ honour: 21, include: [19] }), C: hand(), D: hand() };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [{ type: 'bid', contract: 'two' }]);
  const bActs = legalAuctionActions(s, 'B', hands);
  assert.ok(bActs.some((a) => a.type === 'invite' && a.target === 19 && a.contract === 'solo'));
  assert.equal(bActs.some((a) => a.type === 'invite' && a.target === 18), false);
});

test('A1 BSolo is XVIII invite when A passes', () => {
  const hands = { A: hand({ honour: 22, include: [18] }), B: hand({ honour: 21, include: [18] }), C: hand(), D: hand() };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'one' },
    { type: 'bid', contract: 'solo' },
    { type: 'pass' },
    { type: 'pass' },
  ]);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.ok(legalAuctionActions(s, 'A', hands).some((a) => a.type === 'pass' && a.inviteTarget === 18));
});

test('A3 B2 C:Solo* A:Tartom B:Pass is an XIX signal from the third bidder', () => {
  const hands = { A: hand(), B: hand(), C: hand({ honour: 22, include: [19] }), D: hand() };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'three' },
    { type: 'bid', contract: 'two' },
  ]);
  assert.equal(s.seats[s.currentSeat].playerId, 'C');
  const cSolo = legalAuctionActions(s, 'C', hands).find(a => a.type === 'bid' && a.contract === 'solo' && a.invitationSignalTarget === 19);
  assert.ok(cSolo, 'C sees Solo labelled as an XIX-invit signal');
  s = applyAuctionAction(s, cSolo, hands);
  assert.equal(s.seats[s.currentSeat].playerId, 'D');
  s = applyAuctionAction(s, { type: 'pass' }, hands);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  const accept = legalAuctionActions(s, 'A', hands).find(a => a.type === 'hold' && a.contract === 'solo' && a.acceptsInviteTarget === 19);
  assert.ok(accept, 'A is offered Tartom as the XIX-invit acceptance');
  s = applyAuctionAction(s, accept, hands);
  assert.equal(s.seats[s.currentSeat].playerId, 'B');
  s = applyAuctionAction(s, { type: 'pass' }, hands);
  assert.equal(s.finished, true);
});

test('A3 B2 A1* B:Tartom A:Pass establishes the later XIX invite', () => {
  const hands = {
    A: hand({ honour: 22, include: [19, 18] }),
    B: hand({ honour: 21, include: [19] }),
    C: hand(), D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'three' },
    { type: 'bid', contract: 'two' },
    { type: 'pass' },
    { type: 'pass' },
    { type: 'bid', contract: 'one' },
  ]);
  assert.equal(s.seats[s.currentSeat].playerId, 'B');
  const acceptance = legalAuctionActions(s, 'B', hands).find(a => a.type === 'hold' && a.contract === 'one' && a.acceptsInviteTarget === 19);
  assert.ok(acceptance, 'Tartom-One is labelled as acceptance of the XIX-invit');
  s = applyAuctionAction(s, acceptance, hands);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.deepEqual(legalAuctionActions(s, 'A', hands).filter(a => a.type === 'pass'), [{ type: 'pass', inviteTarget: 19 }]);
  s = applyAuctionAction(s, { type: 'pass', inviteTarget: 19 }, hands);
  assert.deepEqual(s.outstandingInvite, { inviterId: 'A', target: 19 });
  assert.equal(s.inviteAcceptedBy, 'B');
});

test('A3 B2 A1* B:Solo is an XIX acceptance, not a false XVIII-invit', () => {
  const hands = {
    A: hand({ honour: 22, include: [18, 19] }),
    B: hand({ honour: 21, include: [18] }),
    C: hand(), D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'three' },
    { type: 'bid', contract: 'two' },
    { type: 'pass' },
    { type: 'pass' },
    { type: 'bid', contract: 'one' },
  ]);
  const acceptSolo = legalAuctionActions(s, 'B', hands).find(a => a.type === 'bid' && a.contract === 'solo' && a.acceptsInviteTarget === 19);
  assert.ok(acceptSolo, 'B can accept the XIX-invit by raising to Solo without holding XIX');
  s = applyAuctionAction(s, acceptSolo, hands);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.ok(legalAuctionActions(s, 'A', hands).some(a => a.type === 'pass' && a.inviteTarget === 19));
  s = applyAuctionAction(s, { type: 'pass', inviteTarget: 19 }, hands);
  assert.equal(s.finished, true);
});

test('A2 B1 C:Solo* A:Pass B:Tartom resolves to B taking and C as partner', () => {
  const hands = {
    A: hand({ honour: 22, include: [19] }),
    B: hand({ honour: 21, include: [19] }),
    C: hand({ honour: 22, include: [19] }),
    D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'two' },
    { type: 'bid', contract: 'one' },
  ]);
  const cSolo = legalAuctionActions(s, 'C', hands).find(a => a.type === 'bid' && a.contract === 'solo' && a.invitationSignalTarget === 19);
  assert.ok(cSolo, 'C Solo is labelled as an XIX signal, not an XVIII jump');
  s = applyAuctionAction(s, cSolo, hands);
  s = applyAuctionAction(s, { type: 'pass' }, hands); // D has to respond first
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.ok(legalAuctionActions(s, 'A', hands).some(a => a.type === 'pass' && a.inviteTarget === undefined));
  s = applyAuctionAction(s, { type: 'pass' }, hands);
  assert.equal(s.seats[s.currentSeat].playerId, 'B');
  const hold = legalAuctionActions(s, 'B', hands).find(a => a.type === 'hold' && a.contract === 'solo' && a.acceptsInviteTarget === 19);
  assert.ok(hold);
  s = applyAuctionAction(s, hold, hands);
  assert.equal(s.finished, true, 'this marked three-bidder sequence closes on B hold');
  // The hold establishes the intended partner; the engine stores it as invitation origin C.
  assert.equal(s.outstandingInvite?.inviterId, 'C');
  assert.equal(s.inviteAcceptedBy, 'B');
});

test('Engedés / XX-invit remains exclusive to the first speaker after 3-2', () => {
  const strongA = hand({ honour: 22, include: [20, 19, 18, 17] });
  const hands = { A: strongA, B: hand({ honour: 21 }), C: hand(), D: hand() };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'three' }, { type: 'bid', contract: 'two' },
    { type: 'pass' }, { type: 'pass' },
  ]);
  const aActs = legalAuctionActions(s, 'A', hands);
  assert.ok(aActs.some((a) => a.type === 'pass' && a.inviteTarget === 20));
  s = applyAuctionAction(s, { type: 'pass', inviteTarget: 20 }, hands);
  assert.equal(s.finished, true);
});
