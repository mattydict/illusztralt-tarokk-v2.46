import test from 'node:test';
import assert from 'node:assert/strict';
import { canAllow, canBidHonourlessThree, honourInTalon, legalBids, resolveHonourlessThree, tarokkCount } from '../src/engine/bidding.js';
import { createInitialState } from '../src/engine/game.js';

test('engedéshez nagy honőr és legalább öt tarokk kell', () => {
  const hand = [
    {kind:'tarokk' as const, rank:21, id:'T21', points:5},
    {kind:'tarokk' as const, rank:19, id:'T19', points:1},
    {kind:'tarokk' as const, rank:18, id:'T18', points:1},
    {kind:'tarokk' as const, rank:17, id:'T17', points:1},
    {kind:'tarokk' as const, rank:16, id:'T16', points:1},
  ];
  assert.equal(tarokkCount(hand), 5);
  assert.equal(canAllow(hand), true);
});

test('első licitáló hármast mondhat', () => {
  const state = createInitialState(['A','B','C','D']);
  state.players[0]!.hand = [{kind:'tarokk', rank:21, id:'T21', points:5}];
  const bidding = { turnIndex:0, records:[], active:true };
  assert.deepEqual(legalBids(state, bidding, 'A').filter(a => a.type === 'bid'), [{type:'bid',contract:'three'},{type:'bid',contract:'solo'}]);
});


test('három passz után a negyedik játékos honőr nélkül is mondhat hármast', () => {
  const state = createInitialState(['A','B','C','D']);
  const bidding = {
    turnIndex: 3,
    records: [
      { playerId: 'A', action: { type: 'pass' as const } },
      { playerId: 'B', action: { type: 'pass' as const } },
      { playerId: 'C', action: { type: 'pass' as const } },
    ],
    active: true,
  };
  assert.equal(canBidHonourlessThree(state, bidding, 'D'), true);
  assert.deepEqual(legalBids(state, bidding, 'D'), [
    { type: 'pass' },
    { type: 'bid', contract: 'three', honourless: true },
  ]);
});

test('honőr nélküli hármas csak akkor érvényes, ha a talonban van honőr', () => {
  const noHonour = [
    {kind:'tarokk' as const, rank:1, id:'T1', points:5},
    {kind:'tarokk' as const, rank:2, id:'T2', points:1},
  ];
  const withHonour = [
    {kind:'tarokk' as const, rank:1, id:'T1', points:5},
    {kind:'tarokk' as const, rank:21, id:'T21', points:5},
  ];
  assert.equal(honourInTalon(noHonour), false);
  assert.equal(honourInTalon(withHonour), true);
  assert.deepEqual(resolveHonourlessThree(noHonour), {valid:false, reason:'no-honour'});
  assert.deepEqual(resolveHonourlessThree(withHonour), {valid:true, reason:'honour-found'});
});

test('honőrös játékosnál a honőr nélküli kivétel nem jelenik meg', () => {
  const state = createInitialState(['A','B','C','D']);
  state.players[3]!.hand = [{kind:'tarokk' as const, rank:21, id:'T21', points:5}];
  const bidding = {
    turnIndex: 3,
    records: [
      { playerId: 'A', action: { type: 'pass' as const } },
      { playerId: 'B', action: { type: 'pass' as const } },
      { playerId: 'C', action: { type: 'pass' as const } },
    ],
    active: true,
  };
  assert.equal(canBidHonourlessThree(state, bidding, 'D'), true);
  assert.deepEqual(legalBids(state, bidding, 'D').filter(a => a.type === 'bid' && a.honourless), []);
});
