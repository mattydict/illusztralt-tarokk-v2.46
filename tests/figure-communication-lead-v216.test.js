import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { scorePartnerFigureCommunicationLead } from '../src/engine/leadConventions.js';

function baseState() {
  return {
    takerId: 'A',
    partnerId: 'B',
    players: [
      { id: 'A', active: true, hand: [] },
      { id: 'B', active: true, hand: [] },
      { id: 'C', active: true, hand: [] },
      { id: 'D', active: true, hand: [] },
    ],
    declarations: { declarations: [] },
    calledTarokk: 20,
    invitedTarokk: undefined,
  };
}

function declaration(id, type, ownerId, declaredAtTrick) {
  return { id, type, ownerId, declaredAtTrick, status: 'active' };
}

test('XX + Trull + partner Four Kings: low trump lead invites the communicated XIX', () => {
  const state = baseState();
  state.declarations.declarations = [
    declaration('a-trull', 'tuletroa', 'A', 0),
    declaration('b-four', 'fourKings', 'B', 0),
  ];
  const t7 = createDeck().find(c => c.id === 'T7');
  const advice = scorePartnerFigureCommunicationLead(state, 'A', t7);
  assert.ok(advice.score > 0);
  assert.equal(advice.signalledTarokk, 19);
});

test('XX + Trull + partner Four Kings: leading the communicated XIX itself is discouraged', () => {
  const state = baseState();
  state.declarations.declarations = [
    declaration('a-trull', 'tuletroa', 'A', 0),
    declaration('b-four', 'fourKings', 'B', 0),
  ];
  const t19 = createDeck().find(c => c.id === 'T19');
  const advice = scorePartnerFigureCommunicationLead(state, 'A', t19);
  assert.ok(advice.score < 0);
});

test('Trull without a card-signalling declaration does not invent a target lead', () => {
  const state = baseState();
  state.declarations.declarations = [declaration('b-trull', 'tuletroa', 'B', 0)];
  const t7 = createDeck().find(c => c.id === 'T7');
  const advice = scorePartnerFigureCommunicationLead(state, 'A', t7);
  assert.equal(advice.score, 0);
  assert.equal(advice.signalledTarokk, undefined);
});

test('Trull + Four Kings + Centrum: the latest communicated rung is used', () => {
  const state = baseState();
  state.declarations.declarations = [
    declaration('a-trull', 'tuletroa', 'A', 0),
    declaration('b-four', 'fourKings', 'B', 0),
    declaration('b-centrum', 'centrum', 'B', 1),
  ];
  const t10 = createDeck().find(c => c.id === 'T10');
  const advice = scorePartnerFigureCommunicationLead(state, 'A', t10);
  assert.equal(advice.signalledTarokk, 18);
  assert.ok(advice.score > 0);
});
