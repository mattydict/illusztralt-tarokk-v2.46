import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';

function hand({honour = 22, include = []} = {}) {
  const tarokks = [honour, ...include.filter(r => r !== honour), 20, 19, 18, 17, 16, 15].filter((r,i,a) => a.indexOf(r) === i).slice(0, 6);
  while (tarokks.length < 5) tarokks.push(14 - tarokks.length);
  const cards = tarokks.map(rank => ({kind:'tarokk', rank, id:`T${rank}`, points: rank === 21 || rank === 22 || rank === 1 ? 5 : 1}));
  cards.push({kind:'suit', suit:'hearts', rank:'K', id:'hK', points:5});
  cards.push({kind:'suit', suit:'diamonds', rank:'K', id:'dK', points:5});
  cards.push({kind:'suit', suit:'spades', rank:'Q', id:'sQ', points:4});
  return cards.slice(0, 8);
}
function noHonourHand() {
  return [20,19,18,17,16,15,14,13].map(rank => ({kind:'tarokk',rank,id:`T${rank}`,points:1}));
}

// Honőr nélkül normál licit nem adható, csak passz; a kivételes honőr nélküli 3 csak akkor jelenik meg,
// amikor előtte mindhárom másik játékos passzolt.
{
  const hands = {A:hand(), B:hand(), C:hand(), D:noHonourHand()};
  let a = createAuction(['A','B','C','D']);
  assert.ok(legalAuctionActions(a,'A',hands).some(x => x.type === 'bid'));
  a = applyAuctionAction(a, {type:'pass'}, hands);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  a = applyAuctionAction(a, {type:'pass'}, hands);
  assert.deepEqual(legalAuctionActions(a,'D',hands), [
    {type:'pass'}, {type:'bid', contract:'three', honourless:true}
  ]);
}

// 3-2-Tartom után a tartási jog az első licitálónál marad; a Tartom után a második licitáló
// kapja meg a megszólalási jogot, és a következő rendes licit az Egyes.
{
  const hands = {A:hand({honour:22}),B:hand({honour:21}),C:hand({honour:22}),D:hand({honour:22})};
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a = applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'A');
  assert.deepEqual(legalAuctionActions(a,'A',hands).filter(x => x.type === 'hold'), [{type:'hold',contract:'two'}]);
  assert.equal(legalAuctionActions(a,'B',hands).some(x => x.type === 'hold' && x.contract === 'three'), false);
  a = applyAuctionAction(a,{type:'hold',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'B');
  assert.ok(legalAuctionActions(a,'B',hands).some(x => x.type === 'bid' && x.contract === 'one'));
  assert.equal(legalAuctionActions(a,'B',hands).some(x => x.type === 'bid' && x.contract === 'solo'), false);
}

// Ha az első licitáló passzol, a tartási jog átkerül a második licitálóra.
{
  const hands = {A:hand(),B:hand({honour:21}),C:hand(),D:hand()};
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a = applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  a = applyAuctionAction(a,{type:'pass'},hands);
  a = applyAuctionAction(a,{type:'bid',contract:'one'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'B');
  assert.ok(legalAuctionActions(a,'B',hands).some(x => x.type === 'hold' && x.contract === 'one'));
}

// Az invithez kell a cél-tarokk, legalább 5 tarokk és nagyhonőr (XXI vagy Skíz).
{
  const valid19 = hand({honour:22,include:[19]});
  const noBig = hand({honour:1,include:[19]});
  const missing19 = hand({honour:22,include:[18,17,16,15]});
  let a = createAuction(['A','B','C','D']);
  assert.ok(legalAuctionActions(a,'A',{A:valid19,B:hand(),C:hand(),D:hand()}).some(x => x.type==='invite' && x.target===19));
  assert.equal(legalAuctionActions(a,'A',{A:noBig,B:hand(),C:hand(),D:hand()}).some(x => x.type==='invite'),false);
  assert.equal(legalAuctionActions(a,'A',{A:missing19,B:hand(),C:hand(),D:hand()}).some(x => x.type==='invite' && x.target===19),false);
}
