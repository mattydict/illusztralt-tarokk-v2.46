import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';

function sparseHand(...cards){ return cards; }
function fullHand({honour=22, tarokks=[20,19,18,17,16]}={}) {
  const ranks=[honour,...tarokks].filter((r,i,a)=>a.indexOf(r)===i).slice(0,5);
  return ranks.map(rank=>({kind:'tarokk',rank,id:`T${rank}`,points:rank===1||rank===21||rank===22?5:1}))
    .concat([
      {kind:'suit',suit:'hearts',rank:'K',id:'hK',points:5},
      {kind:'suit',suit:'diamonds',rank:'K',id:'dK',points:5},
      {kind:'suit',suit:'spades',rank:'Q',id:'sQ',points:4},
      {kind:'suit',suit:'clubs',rank:'Q',id:'cQ',points:4},
    ]);
}
{
  // A=3, B=2, A holds 2, B=1, A holds 1; B passes, C=Solo; A passes => C wins.
  const hands={A:fullHand(),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  let a=createAuction(['A','B','C'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'A');
  assert.ok(legalAuctionActions(a,'A',hands).some(x=>x.type==='hold'&&x.contract==='two'));
  a=applyAuctionAction(a,{type:'hold',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'B');
  assert.ok(legalAuctionActions(a,'B',hands).some(x=>x.type==='bid'&&x.contract==='one'));
  a=applyAuctionAction(a,{type:'bid',contract:'one'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'A');
  a=applyAuctionAction(a,{type:'hold',contract:'one'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'B');
  a=applyAuctionAction(a,{type:'pass'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'solo'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'A');
  a=applyAuctionAction(a,{type:'pass'},hands);
  assert.equal(a.finished,true);
  assert.equal(a.highest?.playerId,'C');
  assert.equal(a.highest?.contract,'solo');
}
{
  // A passes after opening; B becomes the holder and gets the next speaking turn.
  // B may raise to One; C then speaks, and B can hold only if C raises further.
  const hands={A:fullHand(),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  let a=createAuction(['A','B','C','D'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'B');
  a=applyAuctionAction(a,{type:'bid',contract:'one'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'C');
  a=applyAuctionAction(a,{type:'bid',contract:'solo'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'B');
  assert.ok(legalAuctionActions(a,'B',hands).some(x=>x.type==='hold'&&x.contract==='solo'));
}
{
  // If A holds 1 and B says Solo, A may hold/pass; C cannot speak again because it passed earlier.
  const hands={A:fullHand(),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  let a=createAuction(['A','B','C'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'hold',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'one'},hands);
  a=applyAuctionAction(a,{type:'hold',contract:'one'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'solo'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'A');
  assert.deepEqual(legalAuctionActions(a,'C',hands),[]);
}
{
  // A two + B one can become an XIX invite only when A actually has the required invite card/hand strength.
  const t19={kind:'tarokk',rank:19,id:'T19',points:1};
  const valid={A:fullHand({honour:22,tarokks:[19,18,17,16]}),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  const invalid={A:fullHand({honour:22,tarokks:[20,18,17,16]}),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  let a=createAuction(['A','B','C','D']);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},valid);
  a=applyAuctionAction(a,{type:'bid',contract:'one'},valid);
  assert.ok(legalAuctionActions(a,'A',valid).some(x=>x.type==='hold-invite'&&x.target===19));
  let b=createAuction(['A','B','C','D']);
  b=applyAuctionAction(b,{type:'bid',contract:'two'},invalid);
  b=applyAuctionAction(b,{type:'bid',contract:'one'},invalid);
  assert.equal(legalAuctionActions(b,'A',invalid).some(x=>x.type==='hold-invite'),false);
}
