import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDeclarations } from '../src/engine/declarations.js';
import { publicPartnerId, publicRoleForPlayer, privateSideForPlayer, observerStateView } from '../src/engine/partnershipVisibility.js';

const baseHand = [
  { id:'T22', kind:'tarokk', rank:22, points:5 },
  { id:'SK', kind:'suit', rank:'K', suit:'spades', points:5 },
  { id:'HK', kind:'suit', rank:'K', suit:'hearts', points:5 },
  { id:'CK', kind:'suit', rank:'K', suit:'clubs', points:5 },
  { id:'D10', kind:'suit', rank:10, suit:'diamonds', points:0 },
  { id:'T5', kind:'tarokk', rank:5, points:5 },
  { id:'T6', kind:'tarokk', rank:6, points:5 },
  { id:'T14', kind:'tarokk', rank:14, points:5 },
  { id:'T3', kind:'tarokk', rank:3, points:5 },
];

function game(overrides={}) {
  return {
    takerId:'B', partnerId:'C', calledTarokk:19,
    players:['A','B','C','D'].map(id=>({id,active:true})),
    declarations:{declarations:[]},
    completedTricks:[], trick:null,
    ...overrides,
  };
}

test('v2.82 defence Four Kings is hidden until public defence identification', () => {
  const hidden = availableDeclarations(baseHand, {
    isTaker:false, firstRound:true, previousDeclarations:[], partnersKnown:false,
    speakerIsDefence:true, speakerRolePubliclyKnown:false,
  });
  assert.equal(hidden.some(x=>x.type==='fourKings'), false);

  const publicDefence = availableDeclarations(baseHand, {
    isTaker:false, firstRound:true, previousDeclarations:[], partnersKnown:true,
    speakerIsDefence:true, speakerRolePubliclyKnown:true,
  });
  assert.equal(publicDefence.some(x=>x.type==='fourKings'), true);
});

test('v2.82 invitation makes partner public from auction', () => {
  const g = game();
  const p = publicPartnerId(g, { auctionOutcome:{calledTarokk:19, requiredPartnerCallId:'A'} }, {records:[]});
  assert.equal(p, 'C');
  assert.equal(publicRoleForPlayer(g, {auctionOutcome:{calledTarokk:19,requiredPartnerCallId:'A'}}, {records:[]}, 'D'), 'defence');
});

test('v2.82 a partner figure declaration publicly reveals that partner', () => {
  const g = game();
  const round = {};
  const window = {records:[{playerId:'C',type:'declare',declaration:'fourKings'}]};
  assert.equal(publicPartnerId(g, round, window), 'C');
});

test('v2.82 a defence contra publicly reveals the opposition and partner by elimination', () => {
  const g = game({ partnerId:'C', gameContraState:{records:[{byPlayer:'D',side:'defence',level:'kontra'}]} });
  assert.equal(publicPartnerId(g, {}, {records:[]}), undefined);
  assert.equal(publicRoleForPlayer(g, {}, {records:[]}, 'D'), 'defence');
  assert.equal(privateSideForPlayer(g,'D'),'defence');
});


test('v2.83 one defence contra identifies only that defender; their later Four Kings do not reclassify them as partner', () => {
  const g = game({ partnerId:'C', gameContraState:{records:[{byPlayer:'D',side:'defence',level:'kontra'}]} });
  const window = {records:[{playerId:'D',type:'declare',declaration:'fourKings'}]};
  assert.equal(publicPartnerId(g, {}, window), undefined);
  assert.equal(publicRoleForPlayer(g, {}, window, 'D'), 'defence');
  const hidden = availableDeclarations(baseHand, { isTaker:false, previousDeclarations:[], partnersKnown:false, speakerIsDefence:true, speakerRolePubliclyKnown:false });
  assert.equal(hidden.some(x=>x.type==='fourKings'), false);
});

test('v2.83 observer state hides unknown partner from a taker', () => {
  const g = game({ takerId:'B', partnerId:'C', calledTarokk:19, declarations:{declarations:[]}, gameContraState:{records:[]} });
  const view = observerStateView(g, 'B');
  assert.notEqual(view.partnerId, 'C');
});

test('v2.83 observer state exposes the partner after an invitation', () => {
  const g = game({ publicPartnerId:'C' });
  const view = observerStateView(g, 'B');
  assert.equal(view.partnerId, 'C');
});
