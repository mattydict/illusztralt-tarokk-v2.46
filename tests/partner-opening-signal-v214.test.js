import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { inferPartnerOpeningLeadSignal, scoreResponseToPartnerOpeningLead } from '../src/engine/leadConventions.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);
function base() {
  const state = createInitialState(['A','B','C','D']);
  state.phase = 'play'; state.takerId = 'A'; state.partnerId = 'B';
  state.players.find(p => p.id === 'A').hand = [card('T21'), card('T10'), card('hearts-J')];
  state.players.find(p => p.id === 'B').hand = [card('T20')];
  state.trick = { leader:'B', cards:[] }; state.completedTricks=[];
  return state;
}
test('v2.14 high trump opening is interpreted as Skíz-drive signal',()=>{
  const s=base(); s.trick={leader:'B',cards:[{player:'B',card:card('T20')}]};
  const x=inferPartnerOpeningLeadSignal(s,'A'); assert.equal(x?.kind,'skiz-drive'); assert.ok((x?.confidence??0)>=.8);
});
test('v2.14 small trump opening is interpreted as XXI request',()=>{
  const s=base(); s.players.find(p=>p.id==='B').hand=[card('T10')]; s.trick={leader:'B',cards:[{player:'B',card:card('T10')}]};
  assert.equal(inferPartnerOpeningLeadSignal(s,'A')?.kind,'xxi-small');
  assert.ok(scoreResponseToPartnerOpeningLead(s,'A',card('T21')).score>0);
});
test('v2.14 medium trump opening is distinguished from small-trump XXI request',()=>{
  const s=base(); s.players.find(p=>p.id==='B').hand=[card('T15')]; s.trick={leader:'B',cards:[{player:'B',card:card('T15')}]};
  assert.equal(inferPartnerOpeningLeadSignal(s,'A')?.kind,'xxi-medium');
});
test('v2.14 signal is only inferred from the actual taker-partner opening lead',()=>{
  const s=base(); s.trick={leader:'C',cards:[{player:'C',card:card('T20')}]};
  assert.equal(inferPartnerOpeningLeadSignal(s,'A'),undefined);
});
