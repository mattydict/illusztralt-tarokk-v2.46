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

// Ha Három-Kettő után az első licitáló rendelkezik az XX-invit feltételeivel,
// az Engedés lezárja az aukciót, és a Kettes licitáló lesz a felvevő.
{
  const hands = {A:hand([22,20,19,18,17]),B:hand({honour:21}),C:hand(),D:hand()};
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a = applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  assert.equal(legalAuctionActions(a,'A',hands).some(x => x.type === 'pass'), false);
  a = applyAuctionAction(a,{type:'invite',target:20,contract:'two'},hands);
  assert.equal(a.finished,true);
  assert.equal(a.highest?.playerId,'B');
  assert.equal(a.engedes,true);
}

// Plain opening bids are not invites. An XIX/XVIII opening invite is created
// by the original speaker PASSING after the immediate higher response; holding
// that response is a strong opening instead.
{
  const valid19 = hand({honour:22,include:[19,18,17,16]});
  const bHands = {A:valid19,B:hand({honour:21,include:[19]}),C:hand(),D:hand()};
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a,{type:'bid',contract:'two'},bHands);
  a = applyAuctionAction(a,{type:'bid',contract:'one'},bHands);
  a = applyAuctionAction(a,{type:'pass'},bHands);
  a = applyAuctionAction(a,{type:'pass'},bHands);
  const actions = legalAuctionActions(a,'A',bHands);
  assert.ok(actions.some(x => x.type==='pass' && x.inviteTarget===19));
  assert.ok(actions.some(x => x.type==='hold' && x.contract==='one'));
  a = applyAuctionAction(a,{type:'pass',inviteTarget:19},bHands);
  assert.deepEqual(a.outstandingInvite,{inviterId:'A',target:19});
  assert.equal(a.inviteAcceptedBy,'B');
}
{
  const valid18 = hand({honour:22,include:[18,17,16,15]});
  const bHands = {A:valid18,B:hand({honour:21,include:[18]}),C:hand(),D:hand()};
  let a = createAuction(['A','B','C','D']);
  a = applyAuctionAction(a,{type:'bid',contract:'one'},bHands);
  a = applyAuctionAction(a,{type:'bid',contract:'solo'},bHands);
  a = applyAuctionAction(a,{type:'pass'},bHands);
  a = applyAuctionAction(a,{type:'pass'},bHands);
  const actions = legalAuctionActions(a,'A',bHands);
  assert.ok(actions.some(x => x.type==='pass' && x.inviteTarget===18));
  assert.ok(actions.some(x => x.type==='hold' && x.contract==='solo'));
  a = applyAuctionAction(a,{type:'pass',inviteTarget:18},bHands);
  assert.deepEqual(a.outstandingInvite,{inviterId:'A',target:18});
  assert.equal(a.inviteAcceptedBy,'B');
}
