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

test('A3 B2 C solo is the documented XVIII special case', () => {
  const hands = { A: hand(), B: hand(), C: hand({ honour: 22, include: [18] }), D: hand() };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'three' },
    { type: 'bid', contract: 'two' },
    { type: 'hold', contract: 'two' },
    { type: 'pass' },
  ]);
  const cActs = legalAuctionActions(s, 'C', hands);
  assert.ok(cActs.some((a) => a.type === 'invite' && a.target === 18 && a.contract === 'solo'));
  assert.equal(cActs.some((a) => a.type === 'invite' && a.target === 19), false);
});

test('A3 B2 A1 BHold APass establishes the later XIX invite', () => {
  const hands = {
    A: hand({ honour: 22, include: [19, 18] }),
    B: hand({ honour: 21, include: [19] }),
    C: hand(), D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'three' },
    { type: 'bid', contract: 'two' },
    { type: 'bid', contract: 'one' },
    { type: 'hold', contract: 'one' },
    { type: 'pass' },
    { type: 'pass' },
  ]);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.deepEqual(legalAuctionActions(s, 'A', hands).filter((a) => a.type === 'pass'), [{ type: 'pass', inviteTarget: 19 }]);
  s = applyAuctionAction(s, { type: 'pass', inviteTarget: 19 }, hands);
  assert.deepEqual(s.outstandingInvite, { inviterId: 'A', target: 19 });
});

test('A3 B2 A1 BSolo APass establishes the later XVIII invite', () => {
  const hands = {
    A: hand({ honour: 22, include: [18, 19] }),
    B: hand({ honour: 21, include: [18] }),
    C: hand(), D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'three' },
    { type: 'bid', contract: 'two' },
    { type: 'bid', contract: 'one' },
    { type: 'bid', contract: 'solo' },
    { type: 'pass' },
    { type: 'pass' },
  ]);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.ok(legalAuctionActions(s, 'A', hands).some((a) => a.type === 'pass' && a.inviteTarget === 18));
});

test('A2 B1 Csolo Dpass APass keeps the XIX invite addressed to B', () => {
  const hands = {
    A: hand({ honour: 22, include: [19] }),
    B: hand({ honour: 21, include: [19] }),
    C: hand({ honour: 22 }),
    D: hand(),
  };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [
    { type: 'bid', contract: 'two' },
    { type: 'bid', contract: 'one' },
    { type: 'bid', contract: 'solo' },
    { type: 'pass' },
  ]);
  assert.equal(s.seats[s.currentSeat].playerId, 'A');
  assert.ok(legalAuctionActions(s, 'A', hands).some((a) => a.type === 'pass' && a.inviteTarget === 19));
});

test('Engedés / XX-invit remains exclusive to the first speaker after 3-2', () => {
  const strongA = hand({ honour: 22, include: [20, 19, 18, 17] });
  const hands = { A: strongA, B: hand({ honour: 21 }), C: hand(), D: hand() };
  let s = createAuction(['A', 'B', 'C', 'D']);
  s = run(s, hands, [{ type: 'bid', contract: 'three' }, { type: 'bid', contract: 'two' }]);
  const aActs = legalAuctionActions(s, 'A', hands);
  assert.ok(aActs.some((a) => a.type === 'invite' && a.target === 20));
  s = applyAuctionAction(s, { type: 'invite', target: 20, contract: 'two' }, hands);
  assert.equal(s.finished, true);
});
