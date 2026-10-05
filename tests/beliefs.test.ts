import test from 'node:test';
import assert from 'node:assert/strict';
import { createPartnerBeliefState, updatePartnerBelief, applyDeclarationChain } from '../src/engine/beliefs.js';
import { emptyPartnerBeliefState, updatePartnerBeliefs } from '../src/engine/partnerBeliefs.js';

test('Trull + four kings creates XIX and at-least-five evidence', () => {
  const state = updatePartnerBelief(createPartnerBeliefState(), {
    previous: ['tuletroa', 'fourKings'],
    speakerDeclarations: ['fourKings'],
    isTaker: false,
  });
  assert.equal(state.tarokkCountAtLeast, 5);
  assert.ok(state.likelyTarokks.find(x => x.rank === 19)!.score > 0);
});

test('four kings without Trull is encouragement, not a card signal', () => {
  const state = updatePartnerBelief(createPartnerBeliefState(), {
    previous: ['fourKings'],
    speakerDeclarations: ['fourKings'],
  });
  assert.ok(state.encouragementScore > 0);
  assert.equal(state.likelyTarokks.every(x => x.score === 0), true);
});

test('partner Trull is sufficient context for four-kings signal', () => {
  const state = updatePartnerBelief(createPartnerBeliefState(), {
    previous: ['tuletroa', 'fourKings'],
    speakerDeclarations: ['fourKings'],
  });
  assert.ok(state.likelyTarokks.find(x => x.rank === 19)!.score > 0);
});


test('Centrum refines an existing XIX communication instead of replacing it', () => {
  let state = createPartnerBeliefState();
  state = applyDeclarationChain(state, { previous: ['tuletroa'] }, 'fourKings');
  state = applyDeclarationChain(state, { previous: ['tuletroa', 'fourKings'], calledTarokk: 19 }, 'centrum');
  assert.ok(state.likelyTarokks.find(x => x.rank === 19)!.score > 0);
  assert.ok(state.likelyTarokks.find(x => x.rank === 18)!.score > 0);
});

test('Centrum followed by double adds XVII as a convention, not hard ownership', () => {
  let state = createPartnerBeliefState();
  state = applyDeclarationChain(state, { previous: ['tuletroa', 'fourKings'], calledTarokk: 19 }, 'centrum');
  state = applyDeclarationChain(state, { previous: ['tuletroa', 'fourKings', 'centrum'], calledTarokk: 19 }, 'doubleGame');
  assert.ok(state.likelyTarokks.find(x => x.rank === 17)!.score > 0);
  assert.ok(state.evidence.some(e => e.statement.includes('Centrum után duplajáték')));
});


test('az invitáló XIX-hiányára vonatkozó negatív információ nem kerül tévesen a partner kezének kizárásai közé', () => {
  const state = updatePartnerBeliefs(emptyPartnerBeliefState(), {
    previous: ['tuletroa'],
    invitedTarokk: 18,
    calledTarokk: 18,
    speakerDeclarations: ['fourKings'],
  });
  assert.equal(state.excludedTarokk[19], undefined);
});
