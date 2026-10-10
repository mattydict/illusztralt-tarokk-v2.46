import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createAuction, legalAuctionActions, applyAuctionAction } from '../src/engine/auction.js';
import { resolveAuctionOutcome } from '../src/engine/auctionOutcome.js';

function invitingHand(target, suffix = 'I') {
  const ranks = [...new Set([22, 21, target, 20, 19, 18, 17, 16, 15, 14])]
    .filter((rank) => rank !== 1).slice(0, 6);
  return [
    ...ranks.map((rank) => ({ kind: 'tarokk', rank, id: `${suffix}-T${rank}`, points: rank >= 21 ? 5 : 1 })),
    { kind: 'suit', suit: 'hearts', rank: 'K', id: `${suffix}-HK`, points: 5 },
    { kind: 'suit', suit: 'clubs', rank: 'Q', id: `${suffix}-CQ`, points: 4 },
    { kind: 'suit', suit: 'spades', rank: 'J', id: `${suffix}-SJ`, points: 3 },
  ];
}

function ordinaryHand(excludedTarget, suffix = 'O') {
  const ranks = [22, 21, 20, 19, 18, 17, 16, 15, 14].filter((rank) => rank !== excludedTarget).slice(0, 5);
  return [
    ...ranks.map((rank) => ({ kind: 'tarokk', rank, id: `${suffix}-T${rank}`, points: rank >= 21 ? 5 : 1 })),
    { kind: 'suit', suit: 'hearts', rank: 'K', id: `${suffix}-HK`, points: 5 },
    { kind: 'suit', suit: 'clubs', rank: 'Q', id: `${suffix}-CQ`, points: 4 },
    { kind: 'suit', suit: 'spades', rank: 'J', id: `${suffix}-SJ`, points: 3 },
    { kind: 'suit', suit: 'diamonds', rank: '10', id: `${suffix}-D10`, points: 1 },
  ];
}

function playInviteLine({ name, target, inviterRole, winnerRole, contract, steps, seatIds, firstSeat = 0 }) {
  const count = seatIds?.length ?? Math.max(2, ...steps.map((step) => 'ABCD'.indexOf(step.who) + 1));
  const ids = seatIds ?? Array.from({ length: count }, (_, i) => `player-${i + 1}`);
  const roleIds = {};
  for (let i = 0; i < 4; i++) roleIds['ABCD'[i]] = ids[(firstSeat + i) % ids.length];
  let state = createAuction(ids, firstSeat);
  const hands = {};
  for (const id of ids) {
    hands[id] = id === roleIds[inviterRole] ? invitingHand(target, id) : ordinaryHand(target, id);
  }

  for (const [index, step] of steps.entries()) {
    const actor = roleIds[step.who];
    assert.equal(state.finished, false, `${name}: auction unexpectedly finished before step ${index + 1}`);
    assert.equal(state.seats[state.currentSeat]?.playerId, actor,
      `${name}: wrong turn at step ${index + 1}; expected ${actor}, got ${state.seats[state.currentSeat]?.playerId}; history=${JSON.stringify(state.records)}`);
    const legal = legalAuctionActions(state, actor, hands);
    const action = legal.find((candidate) => {
      if (candidate.type !== step.type) return false;
      if (step.contract !== undefined && candidate.contract !== step.contract) return false;
      if (step.target !== undefined && candidate.target !== step.target && candidate.inviteTarget !== step.target) return false;
      if (step.inviteTarget !== undefined && candidate.inviteTarget !== step.inviteTarget) return false;
      return true;
    });
    assert.ok(action, `${name}: expected ${JSON.stringify(step)}, legal=${JSON.stringify(legal)}, history=${JSON.stringify(state.records)}`);
    if (step.signalTarget !== undefined) assert.equal(action.invitationSignalTarget, step.signalTarget, `${name}: missing invite signal metadata`);
    if (step.acceptsTarget !== undefined) assert.equal(action.acceptsInviteTarget, step.acceptsTarget, `${name}: missing invite acceptance metadata`);
    state = applyAuctionAction(state, action, hands);
  }

  assert.equal(state.finished, true, `${name}: auction did not finish`);
  assert.equal(state.highest?.playerId, roleIds[winnerRole], `${name}: wrong winning player`);
  assert.equal(state.highest?.contract, contract, `${name}: wrong final contract`);
  assert.deepEqual(state.outstandingInvite, { inviterId: roleIds[inviterRole], target }, `${name}: incorrect invit identity`);
  const outcome = resolveAuctionOutcome(state, hands, []);
  assert.equal(outcome.requiredPartnerCallId, roleIds[inviterRole], `${name}: the invitadó must be the partner to call`);
  return { state, hands, roleIds };
}

const cases = [
  {
    name: 'XX / Engedés: Három – Kettő – Passz', target: 20, inviterRole: 'A', winnerRole: 'B', contract: 'two',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'bid', contract: 'two' }, { who: 'A', type: 'pass', target: 20 }],
  },
  {
    name: 'XIX, két licitáló: Kettő – Egy – Passz', target: 19, inviterRole: 'A', winnerRole: 'B', contract: 'one',
    steps: [{ who: 'A', type: 'bid', contract: 'two' }, { who: 'B', type: 'bid', contract: 'one' }, { who: 'A', type: 'pass', target: 19 }],
  },
  {
    name: 'XIX, két licitáló: Három – invit-Egy – Tartom – Passz', target: 19, inviterRole: 'B', winnerRole: 'A', contract: 'three',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'invite', target: 19, contract: 'one' }, { who: 'A', type: 'hold-invite', target: 19, contract: 'three' }, { who: 'B', type: 'pass' }],
  },
  {
    name: 'XIX, két licitáló: Három – Kettő – Egy jelzés – Tartom – Passz', target: 19, inviterRole: 'A', winnerRole: 'B', contract: 'one',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'bid', contract: 'two' }, { who: 'A', type: 'bid', contract: 'one', signalTarget: 19 }, { who: 'B', type: 'hold', contract: 'one', acceptsTarget: 19 }, { who: 'A', type: 'pass', target: 19 }],
  },
  {
    name: 'XIX, két licitáló: Három – Kettő – Tartom – Szóló jelzés – Tartom – Passz', target: 19, inviterRole: 'B', winnerRole: 'A', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'bid', contract: 'two' }, { who: 'A', type: 'hold', contract: 'two' }, { who: 'B', type: 'invite', contract: 'solo', target: 19 }, { who: 'A', type: 'hold-invite', target: 19, contract: 'solo' }, { who: 'B', type: 'pass' }],
  },
  {
    name: 'XIX, két licitáló: Három – Kettő – Tartom – Egy – Szóló jelzés – Tartom – Passz', target: 19, inviterRole: 'A', winnerRole: 'B', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'bid', contract: 'two' }, { who: 'A', type: 'hold', contract: 'two' }, { who: 'B', type: 'bid', contract: 'one' }, { who: 'A', type: 'invite', contract: 'solo', target: 19 }, { who: 'B', type: 'hold-invite', target: 19, contract: 'solo' }, { who: 'A', type: 'pass' }],
  },
  {
    name: 'XIX, három licitáló: Kettő – Egy – Szóló jelzés – Passz – Tartom', target: 19, inviterRole: 'C', winnerRole: 'B', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'two' }, { who: 'B', type: 'bid', contract: 'one' }, { who: 'C', type: 'bid', contract: 'solo', signalTarget: 19 }, { who: 'A', type: 'pass' }, { who: 'B', type: 'hold', contract: 'solo', acceptsTarget: 19 }],
  },
  {
    name: 'XIX, három licitáló: Három – invit-Egy – Szóló – Tartom – Passz', target: 19, inviterRole: 'B', winnerRole: 'A', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'invite', contract: 'one', target: 19 }, { who: 'C', type: 'bid', contract: 'solo' }, { who: 'A', type: 'hold-invite', target: 19, contract: 'solo' }, { who: 'B', type: 'pass' }],
  },
  {
    name: 'XIX, három licitáló: Három – Kettő – Szóló jelzés – Tartom – Passz', target: 19, inviterRole: 'C', winnerRole: 'A', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'bid', contract: 'two' }, { who: 'C', type: 'bid', contract: 'solo', signalTarget: 19 }, { who: 'A', type: 'hold', contract: 'solo', acceptsTarget: 19 }, { who: 'B', type: 'pass' }],
  },
  {
    name: 'XIX, három licitáló: Három – Kettő – Egy – Szóló jelzés – Tartom – Passz', target: 19, inviterRole: 'A', winnerRole: 'B', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'bid', contract: 'two' }, { who: 'C', type: 'bid', contract: 'one' }, { who: 'A', type: 'invite', contract: 'solo', target: 19 }, { who: 'B', type: 'hold-invite', target: 19, contract: 'solo' }, { who: 'C', type: 'pass' }],
  },
  {
    name: 'XVIII: Egy – Szóló – Passz', target: 18, inviterRole: 'A', winnerRole: 'B', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'one' }, { who: 'B', type: 'bid', contract: 'solo' }, { who: 'A', type: 'pass', target: 18 }],
  },
  {
    name: 'XVIII: Három – invit-Szóló – Tartom – Passz', target: 18, inviterRole: 'B', winnerRole: 'A', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'invite', contract: 'solo', target: 18 }, { who: 'A', type: 'hold-invite', target: 18, contract: 'solo' }, { who: 'B', type: 'pass' }],
  },
  {
    name: 'XVIII: Három – Kettő – invit-Szóló – Tartom – Passz', target: 18, inviterRole: 'A', winnerRole: 'B', contract: 'solo',
    steps: [{ who: 'A', type: 'bid', contract: 'three' }, { who: 'B', type: 'bid', contract: 'two' }, { who: 'A', type: 'invite', contract: 'solo', target: 18 }, { who: 'B', type: 'hold-invite', target: 18, contract: 'solo' }, { who: 'A', type: 'pass' }],
  },
];

for (const line of cases) {
  test(`2.93 invite matrix · ${line.name}`, () => playInviteLine(line));
}

test('a három–egy XIX-invit közben a harmadik játékos szabályosan mondhat Szólót, és csak utána fogad a felvevő', () => {
  // The names and starting seat are deliberately rotated: patterns are based on
  // clockwise turns and player IDs, never literal A/B/C strings.
  const rotated = {
    name: 'rotated four-seat XIX invite', target: 19, inviterRole: 'B', winnerRole: 'A', contract: 'solo',
    seatIds: ['seat-east', 'seat-south', 'seat-west', 'seat-north'], firstSeat: 2,
    steps: [
      { who: 'A', type: 'bid', contract: 'three' },
      { who: 'B', type: 'invite', target: 19, contract: 'one' },
      { who: 'C', type: 'bid', contract: 'solo' },
      { who: 'D', type: 'pass' },
      { who: 'A', type: 'hold-invite', target: 19, contract: 'solo' },
      { who: 'B', type: 'pass' },
    ],
  };
  playInviteLine(rotated);
});

test('az XX-engedés nem ajánlható fel, ha a játékosnál nincs meg az XX', () => {
  const ids = ['opener', 'second'];
  const state0 = createAuction(ids);
  const hands = {
    opener: ordinaryHand(20, 'no-XX'),
    second: ordinaryHand(20, 'second'),
  };
  let state = applyAuctionAction(state0, { type: 'bid', contract: 'three' }, hands);
  state = applyAuctionAction(state, { type: 'bid', contract: 'two' }, hands);
  const actions = legalAuctionActions(state, 'opener', hands);
  assert.ok(!actions.some((action) => action.type === 'pass' && action.inviteTarget === 20));
});

test('a multiplayer licit UI feliratokat ad az invitjelzéshez, az invit elfogadásához és az invit közbeni Szólóhoz', () => {
  const ui = fs.readFileSync(new URL('../src/ui/auctionLabels.js', import.meta.url), 'utf8');
  assert.match(ui, /\$\{inviteTargetLabel\(action\.invitationSignalTarget\)\}-invit jelzés/);
  assert.match(ui, /\$\{inviteTargetLabel\(action\.acceptsInviteTarget\)\}-invit fogadása/);
  assert.match(ui, /folyamatban lévő \$\{inviteTargetLabel\(auction\.outstandingInvite\.target\)\}-invit közbeni válasz/);
  assert.match(ui, /\$\{inviteTargetLabel\(action\.inviteTarget\)\}-invit \/ partnerhívás/);
});


test('a nyitó Kettő és Egy invitként megjelölt, ha a kéz alkalmas XIX/XVIII hívására', () => {
  const ids = ['opener', 'responder'];
  const state = createAuction(ids);
  const xixHand = invitingHand(19, 'open-xix');
  const xixActions = legalAuctionActions(state, 'opener', { opener: xixHand, responder: ordinaryHand(19, 'resp') });
  assert.ok(xixActions.some(a => a.type === 'bid' && a.contract === 'two' && a.invitationSignalTarget === 19));

  const xviiiHand = invitingHand(18, 'open-xviii');
  const xviiiActions = legalAuctionActions(state, 'opener', { opener: xviiiHand, responder: ordinaryHand(18, 'resp2') });
  assert.ok(xviiiActions.some(a => a.type === 'bid' && a.contract === 'one' && a.invitationSignalTarget === 18));
});

test('az AI az XX-engedést invitként ismeri fel, nem általános passzként', async () => {
  const { inferInvitePartnerCandidates, inferCaptureConfigurations } = await import('../src/engine/aiAuction.js');
  const base = createAuction(['A','B','C','D']);
  const state = {
    ...base,
    records: [
      { playerId: 'A', action: { type: 'bid', contract: 'three' } },
      { playerId: 'B', action: { type: 'bid', contract: 'two' } },
      { playerId: 'A', action: { type: 'pass', inviteTarget: 20 } },
    ],
    highest: { playerId: 'B', contract: 'two', seat: 1 },
    currentSeat: 1,
    outstandingInvite: { inviterId: 'A', target: 20 },
    inviteAcceptedBy: 'B',
    out: ['A'],
  };
  const candidates = inferInvitePartnerCandidates(state);
  assert.ok(candidates.some(candidate => candidate.inviterId === 'A' && candidate.target === 20));
  const configs = inferCaptureConfigurations(state);
  assert.ok(configs.some(configuration => configuration.reasons.some(reason => reason.includes('XX-engedés'))));
});
