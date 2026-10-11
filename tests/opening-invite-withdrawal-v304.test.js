import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuction, applyAuctionAction, legalAuctionActions } from '../src/engine/auction.js';

function hand(tarokks) {
  const cards = tarokks.map(rank => ({ kind: 'tarokk', rank, id: `T${rank}`, points: 1 }));
  cards.push({kind:'suit',suit:'hearts',rank:'K',id:'hK',points:5});
  cards.push({kind:'suit',suit:'diamonds',rank:'Q',id:'dQ',points:4});
  cards.push({kind:'suit',suit:'clubs',rank:'J',id:'cJ',points:2});
  return cards;
}
function progress(openingContract, responseContract, openerRanks) {
  const hands = { A: hand(openerRanks), B: hand([22,21,19,18,17]), C: [], D: [] };
  let state = createAuction(['A','B','C','D']);
  const opening = legalAuctionActions(state, 'A', hands).find(a => a.type === 'bid' && a.contract === openingContract);
  assert.ok(opening, `opening ${openingContract} exists`);
  state = applyAuctionAction(state, opening, hands);
  if (opening.invitationSignalTarget !== undefined) assert.equal(opening.invitationSignalTarget, openingContract === 'two' ? 19 : 18);
  state = applyAuctionAction(state, {type:'bid',contract:responseContract}, hands);
  state = applyAuctionAction(state, {type:'pass'}, hands);
  state = applyAuctionAction(state, {type:'pass'}, hands);
  assert.equal(state.seats[state.currentSeat].playerId, 'A');
  return { state, hands };
}

test('opening Kettő is labelled XIX-invit by big honour + five tarokks even without XIX; opener must Tartom', () => {
  const {state,hands} = progress('two','one',[22,20,18,17,16]);
  const actions = legalAuctionActions(state,'A',hands);
  assert.deepEqual(actions, [{type:'hold',contract:'one'}]);
});

test('opening Egyes is labelled XVIII-invit by big honour + five tarokks even without XVIII; opener must Tartom', () => {
  const {state,hands} = progress('one','solo',[22,21,20,19,17]);
  const actions = legalAuctionActions(state,'A',hands);
  assert.deepEqual(actions, [{type:'hold',contract:'solo'}]);
});

test('opening XIX-invit can be confirmed by Pass only when opener actually holds XIX', () => {
  const {state,hands} = progress('two','one',[22,20,19,18,17]);
  const actions = legalAuctionActions(state,'A',hands);
  assert.ok(actions.some(a => a.type === 'pass' && a.inviteTarget === 19));
  assert.ok(actions.some(a => a.type === 'hold' && a.contract === 'one'));
});

test('opening XVIII-invit can be confirmed by Pass only when opener actually holds XVIII', () => {
  const {state,hands} = progress('one','solo',[22,21,20,18,17]);
  const actions = legalAuctionActions(state,'A',hands);
  assert.ok(actions.some(a => a.type === 'pass' && a.inviteTarget === 18));
  assert.ok(actions.some(a => a.type === 'hold' && a.contract === 'solo'));
});
