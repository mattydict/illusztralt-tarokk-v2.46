import test from 'node:test';
import assert from 'node:assert/strict';
import { assessCommunicationRecovery } from '../src/engine/aiCommunicationRecovery.js';

function baseState() {
  return {
    takerId: 'A', partnerId: 'C',
    players: [{id:'A',active:true},{id:'B',active:true},{id:'C',active:true},{id:'D',active:true}],
    completedTricks: [],
    declarations: { declarations: [] },
    trick: { leader: 'C', cards: [{ player: 'C', card: {kind:'tarokk',rank:8,id:'T8',points:1} }] },
  };
}

test('v2.30 recovery module is conservative without signal history', () => {
  const s = baseState();
  const r = assessCommunicationRecovery(s, 'A', {kind:'tarokk',rank:10,id:'T10',points:1});
  assert.equal(r.recovery, 'none');
  assert.equal(r.score, 0);
});

test('v2.30 never forces a hard recovery outside tarokk replies', () => {
  const s = baseState();
  s.completedTricks = [{leader:'C', cards:[
    {player:'C', card:{kind:'tarokk',rank:10,id:'T10',points:1}},
    {player:'A', card:{kind:'suit',suit:'hearts',rank:'10',id:'hearts-10',points:1}}
  ]}];
  s.trick.cards[0].card = {kind:'tarokk',rank:10,id:'T10',points:1};
  const r = assessCommunicationRecovery(s, 'A', {kind:'suit',suit:'spades',rank:'10',id:'spades-10',points:1});
  assert.equal(r.score, 0);
});
