import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';


function noHonourHand() {
    return [20, 19, 18, 17, 16, 15, 14, 13].map(rank => ({ kind: 'tarokk', rank, id: `T${rank}`, points: 1 }));
}

// Honőr nélküli C és D nem maradhat ki a licitből: egy későbbi licit után
// mindkettőnek ténylegesen meg kell kapnia a Passz lehetőséget.
{
    const aHand = noHonourHand();
    aHand[0] = { kind: 'tarokk', rank: 22, id: 'T22', points: 5 };
    const bHand = noHonourHand();
    bHand[0] = { kind: 'tarokk', rank: 21, id: 'T21', points: 5 };
    const hands = { A: aHand, B: bHand, C: noHonourHand(), D: noHonourHand() };
    let a = createAuction(['A', 'B', 'C', 'D']);
    a = applyAuctionAction(a, { type: 'bid', contract: 'three' }, hands);
    a = applyAuctionAction(a, { type: 'bid', contract: 'two' }, hands);
    assert.equal(a.seats[a.currentSeat].playerId, 'C');
    assert.deepEqual(legalAuctionActions(a, 'C', hands), [{ type: 'pass' }]);
    a = applyAuctionAction(a, { type: 'pass' }, hands);
    assert.equal(a.seats[a.currentSeat].playerId, 'D');
    assert.deepEqual(legalAuctionActions(a, 'D', hands), [{ type: 'pass' }]);
    a = applyAuctionAction(a, { type: 'pass' }, hands);
    assert.equal(a.seats[a.currentSeat].playerId, 'A');
}

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
  // The third player must take their turn after 3-2. Once C has passed,
  // C cannot re-enter later; the remaining A/B sequence finishes with A's held One.
  const hands={A:fullHand(),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  let a=createAuction(['A','B','C'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'C');
  a=applyAuctionAction(a,{type:'pass'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'A');
  a=applyAuctionAction(a,{type:'hold',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'one'},hands);
  a=applyAuctionAction(a,{type:'hold',contract:'one'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  assert.equal(a.finished,true);
  assert.equal(a.highest?.playerId,'A');
  assert.equal(a.highest?.contract,'one');
}
{
  // After 3 -> 2 the first speaker cannot plain-pass. With XX+5 tarokks+big honour
  // the only way to yield is the explicit XX-invit (Engedés), which ends the auction.
  const hands={A:fullHand(),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  let a=createAuction(['A','B'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  const acts=legalAuctionActions(a,'A',hands);
  assert.equal(acts.some(x=>x.type==='pass' && x.inviteTarget===undefined),false);
  assert.ok(acts.some(x=>x.type==='pass' && x.inviteTarget===20));
  a=applyAuctionAction(a,{type:'pass',inviteTarget:20},hands);
  assert.equal(a.finished,true);
  assert.equal(a.highest?.playerId,'B');
  assert.equal(a.highest?.contract,'two');
  assert.equal(a.engedes,true);
}
{
  // If A holds 1 and B says Solo, A may hold/pass; C cannot speak again because it passed earlier.
  const hands={A:fullHand(),B:fullHand({honour:21}),C:fullHand(),D:fullHand()};
  let a=createAuction(['A','B','C'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  a=applyAuctionAction(a,{type:'hold',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'one'},hands);
  a=applyAuctionAction(a,{type:'hold',contract:'one'},hands);
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
  a=applyAuctionAction(a,{type:'pass'},valid);
  a=applyAuctionAction(a,{type:'pass'},valid);
  assert.ok(legalAuctionActions(a,'A',valid).some(x=>x.type==='pass'&&x.inviteTarget===19));
  let b=createAuction(['A','B','C','D']);
  b=applyAuctionAction(b,{type:'bid',contract:'two'},invalid);
  b=applyAuctionAction(b,{type:'bid',contract:'one'},invalid);
  b=applyAuctionAction(b,{type:'pass'},invalid);
  b=applyAuctionAction(b,{type:'pass'},invalid);
  assert.equal(legalAuctionActions(b,'A',invalid).some(x=>x.type==='hold-invite'),false);
}
