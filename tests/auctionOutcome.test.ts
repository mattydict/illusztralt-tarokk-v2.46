import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction } from '../src/engine/auction.js';
import { resolveAuctionOutcome } from '../src/engine/auctionOutcome.js';

const c = (rank: 18|19|20, id: string) => ({kind:'tarokk' as const, rank, id, points:1});
const h = (id: string) => ({kind:'tarokk' as const, rank: 21 as const, id, points:5});

test('licit lezárása meghatározza a felvevőt és a talonmennyiséget', () => {
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'bid', contract:'two'});
  a = applyAuctionAction(a, {type:'pass'});
  a = applyAuctionAction(a, {type:'pass'});
  a = applyAuctionAction(a, {type:'pass'});
  assert.equal(a.finished, true);
  const out = resolveAuctionOutcome(a, {A:[],B:[],C:[],D:[]}, []);
  assert.equal(out.takerId, 'A');
  assert.equal(out.contract, 'two');
  assert.equal(out.talonCount, 2);
});

test('elfogadott invit után más nyertesnek kötelező az invitálót meghívnia', () => {
  const a = {
    seats: ['A','B','C','D'].map((playerId, seat) => ({playerId, seat})),
    currentSeat: 1,
    records: [
      {playerId:'A', action:{type:'invite' as const, target:19 as const}},
      {playerId:'B', action:{type:'bid' as const, contract:'solo' as const}},
    ],
    highest: {playerId:'B', contract:'solo' as const, seat:1},
    finished: true,
    out: [],
  };
  const out = resolveAuctionOutcome(a, {
    A:[c(19,'A19'), h('A21')], B:[c(19,'B19')], C:[], D:[]
  }, [h('talon21')]);
  assert.equal(out.takerId, 'B');
  assert.equal(out.requiredPartnerCallId, 'A');
});

test('honőr nélküli hármas csak honőrt tartalmazó talonnal érvényes', () => {
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a, {type:'pass'});
  a = applyAuctionAction(a, {type:'pass'});
  a = applyAuctionAction(a, {type:'pass'});
  a = applyAuctionAction(a, {type:'bid', contract:'three'});
  assert.equal(a.finished, false); // a generikus auction nem tudja a honőr nélküli kivételt megkülönböztetni
});
