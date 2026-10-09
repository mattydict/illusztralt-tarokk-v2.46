import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';

function hand({honour=22, tarokks=[20,19,18,17,16]}={}) {
  const ranks=[honour,...tarokks].filter((r,i,a)=>a.indexOf(r)===i).slice(0,5);
  return ranks.map(rank=>({kind:'tarokk',rank,id:`T${rank}`,points:rank===1||rank===21||rank===22?5:1}))
    .concat([{kind:'suit',suit:'hearts',rank:'K',id:'hK',points:5},{kind:'suit',suit:'diamonds',rank:'K',id:'dK',points:5},{kind:'suit',suit:'spades',rank:'Q',id:'sQ',points:4},{kind:'suit',suit:'clubs',rank:'Q',id:'cQ',points:4}]);
}

// A:pass, B:3, C:2, D:1, B:pass => C receives the holding turn.
{
  const hands={A:hand(),B:hand({honour:21}),C:hand(),D:hand({honour:22})};
  let a=createAuction(['A','B','C','D'],0);
  for (const [pid, action] of [
    ['A',{type:'pass'}],['B',{type:'bid',contract:'three'}],['C',{type:'bid',contract:'two'}],['D',{type:'bid',contract:'one'}],['B',{type:'pass'}]
  ]) a=applyAuctionAction(a,action,hands);
  assert.equal(a.seats[a.currentSeat].playerId,'C');
  assert.ok(legalAuctionActions(a,'C',hands).some(x=>x.type==='hold'&&x.contract==='one'));
}

// A:3, B:pass, C:2, D:pass, A:1 is an XIX invite to C; C may accept with hold or Solo.
{
  const hands={A:hand({honour:22,tarokks:[19,18,17,16]}),B:hand(),C:hand({honour:21}),D:hand()};
  let a=createAuction(['A','B','C','D'],0);
  a=applyAuctionAction(a,{type:'bid',contract:'three'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  a=applyAuctionAction(a,{type:'bid',contract:'two'},hands);
  a=applyAuctionAction(a,{type:'pass'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'A');
  a=applyAuctionAction(a,{type:'bid',contract:'one'},hands);
  assert.equal(a.seats[a.currentSeat].playerId,'C');
  const acts=legalAuctionActions(a,'C',hands);
  assert.ok(acts.some(x=>x.type==='hold'&&x.contract==='one'));
  assert.ok(acts.some(x=>x.type==='bid'&&x.contract==='solo'));
  assert.equal(acts.some(x=>x.type==='invite'&&x.target===18),false);
}

// Empty response queues must not block the normal auction finish.
{
  const hands={A:hand(),B:hand({honour:21}),C:hand(),D:hand()};
  let a=createAuction(['A','B','C'],0);
  for (const [pid, action] of [
    ['A',{type:'bid',contract:'three'}],['B',{type:'bid',contract:'two'}],['C',{type:'pass'}],['A',{type:'hold',contract:'two'}],['B',{type:'bid',contract:'one'}],['A',{type:'hold',contract:'one'}],['B',{type:'pass'}]
  ]) a=applyAuctionAction(a,action,hands);
  assert.equal(a.finished,true);
  assert.equal(a.highest?.playerId,'A');
  assert.equal(a.highest?.contract,'one');
}
