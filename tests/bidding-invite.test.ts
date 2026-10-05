import test from 'node:test';
import assert from 'node:assert/strict';
import { inviteTargetForJump, legalBids, canAllow, canInvite, hasInviteCard, resolveInvite, applyInviteResolution } from '../src/engine/bidding.js';
import { createInitialState } from '../src/engine/game.js';

test('elsőként mondott szóló nem invit', () => {
  assert.equal(inviteTargetForJump(undefined, 'solo'), undefined);
});

test('egy ugrás XIX, két ugrás XVIII', () => {
  assert.equal(inviteTargetForJump('three', 'one'), 19);
  assert.equal(inviteTargetForJump('three', 'solo'), 18);
  assert.equal(inviteTargetForJump('two', 'solo'), 19);
  assert.equal(inviteTargetForJump('one', 'solo'), undefined);
});

test('engedés csak XX-szal és legalább öt tarokkal, pagátos XX-szal nem', () => {
  const hand = [
    {kind:'tarokk' as const, rank:22, id:'T22', points:5},
    {kind:'tarokk' as const, rank:21, id:'T21', points:5},
    {kind:'tarokk' as const, rank:18, id:'T18', points:1},
    {kind:'tarokk' as const, rank:17, id:'T17', points:1},
    {kind:'tarokk' as const, rank:16, id:'T16', points:1},
  ];
  assert.equal(canAllow(hand), true);
  assert.equal(canInvite(hand), true);
  assert.equal(hasInviteCard(hand, 20), false);
  assert.equal(canAllow([...hand, {kind:'tarokk', rank:1, id:'T1', points:5}]), false);
});

test('invitnál csak a ténylegesen birtokolt invitlap jelenik meg', () => {
  const state = createInitialState(['A','B','C','D']);
  state.players[0]!.hand = [
    {kind:'tarokk', rank:22, id:'T22', points:5},
    {kind:'tarokk', rank:21, id:'T21', points:5},
    {kind:'tarokk', rank:19, id:'T19', points:1},
    {kind:'tarokk', rank:17, id:'T17', points:1},
    {kind:'tarokk', rank:16, id:'T16', points:1},
  ];
  const bidding = { turnIndex:0, records:[{playerId:'B', action:{type:'bid' as const, contract:'three' as const}}], active:true };
  const actions = legalBids(state, bidding, 'A');
  assert.ok(actions.some(a => a.type === 'invite' && a.target === 19 && a.contract === 'one'));
  assert.ok(!actions.some(a => a.type === 'invite' && a.target === 18));
});


test('elfogadott invit esetén a későbbi nyertesnek meg kell hívnia az invitálót', () => {
  const hands = {
    A: [
      {kind:'tarokk' as const, rank:22, id:'T22', points:5},
      {kind:'tarokk' as const, rank:21, id:'T21', points:5},
      {kind:'tarokk' as const, rank:19, id:'T19', points:1},
      {kind:'tarokk' as const, rank:17, id:'T17', points:1},
      {kind:'tarokk' as const, rank:16, id:'T16', points:1},
    ],
    B: [
      {kind:'tarokk' as const, rank:19, id:'B19', points:1},
      {kind:'tarokk' as const, rank:18, id:'B18', points:1},
      {kind:'tarokk' as const, rank:17, id:'B17', points:1},
      {kind:'tarokk' as const, rank:16, id:'B16', points:1},
      {kind:'tarokk' as const, rank:15, id:'B15', points:1},
    ],
    C: [], D: [],
  };
  const bidding = {
    turnIndex: 1,
    records: [
      {playerId:'A', action:{type:'invite' as const, target:19 as const, contract:'one' as const}},
      {playerId:'B', action:{type:'bid' as const, contract:'solo' as const}},
    ],
    active: false,
    invitedBy:'A',
    invitedTarget:19 as const,
  };
  const resolved = resolveInvite(bidding, hands, 'B');
  assert.equal(resolved?.accepted, true);
  assert.equal(resolved?.acceptedBy, 'B');
  assert.equal(resolved?.winnerMustCallInviter, true);
  assert.equal(applyInviteResolution(bidding, hands, 'B').inviterLockedOut, true);
});

test('ha az invit után nincs további licit, az invit nem fogadott és az invitáló normál licitáló marad', () => {
  const hands = {
    A: [{kind:'tarokk' as const, rank:22, id:'T22', points:5}, {kind:'tarokk' as const, rank:21, id:'T21', points:5}, {kind:'tarokk' as const, rank:19, id:'T19', points:1}, {kind:'tarokk' as const, rank:17, id:'T17', points:1}, {kind:'tarokk' as const, rank:16, id:'T16', points:1}],
    B: [], C: [], D: [],
  };
  const bidding = {
    turnIndex: 0,
    records: [{playerId:'A', action:{type:'invite' as const, target:19 as const, contract:'one' as const}}],
    active: false,
    invitedBy:'A', invitedTarget:19 as const,
  };
  const resolved = resolveInvite(bidding, hands, 'A');
  assert.equal(resolved?.accepted, false);
  assert.equal(resolved?.winnerMustCallInviter, false);
  assert.equal(applyInviteResolution(bidding, hands, 'A').inviterLockedOut, false);
});


test('el nem fogadott invit után az invitáló visszatérhet a normál licitbe', () => {
  const state = createInitialState(['A','B','C','D']);
  state.players[0]!.hand = [
    {kind:'tarokk' as const, rank:22, id:'T22', points:5},
    {kind:'tarokk' as const, rank:21, id:'T21', points:5},
    {kind:'tarokk' as const, rank:19, id:'T19', points:1},
    {kind:'tarokk' as const, rank:17, id:'T17', points:1},
    {kind:'tarokk' as const, rank:16, id:'T16', points:1},
  ];
  const bidding = {
    turnIndex:0,
    records:[{playerId:'A', action:{type:'invite' as const, target:19 as const, contract:'one' as const}}],
    active:true,
    invitedBy:'A', invitedTarget:19 as const,
  };
  const actions = legalBids(state, bidding, 'A');
  assert.ok(actions.some(a => a.type === 'bid' && a.contract === 'solo'));
});
