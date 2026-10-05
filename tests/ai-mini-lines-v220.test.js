import test from 'node:test';
import assert from 'node:assert/strict';
import { createInitialState } from '../src/engine/game.js';
import { createDeck } from '../src/engine/cards.js';
import { assessMiniLine } from '../src/engine/aiLinePlanner.js';

const deck = createDeck();
const card = id => deck.find(c => c.id === id);
const result = (value, partner, settlement, confidence=.8) => ({
  cardId: 'T10', samples: 20, horizon: 2, expectedValue: value,
  sideWinRate: .5, partnerWinRate: partner, targetSuccessRate: .5,
  confidence, expectedSettlementForTakerPair: settlement, expectedSettlementForObserverSide: settlement,
  reasons: []
});
function base(){
  const s=createInitialState(['A','B','C','D']);
  s.phase='play'; s.takerId='A'; s.partnerId='B'; s.players.forEach(p=>p.active=true);
  s.trick={leader:'A',cards:[],winner:undefined}; s.completedTricks=[];
  return s;
}
test('v2.20 identifies partner-pass-return on partner-next low trump lead',()=>{
  const s=base(); const a=card('T10');
  const x=assessMiniLine(s,'A',a,result(2,.35,0),result(2.8,.48,3));
  assert.equal(x.kind,'partner-pass-return'); assert.ok(x.score>0); assert.ok(x.reasons.some(r=>r.includes('Átadás')));
});
test('v2.20 identifies hold-return-partner when partner control appears later',()=>{
  const s=base(); s.trick={leader:'C',cards:[{player:'C',card:card('hearts-A')}],winner:undefined};
  const a=card('T10');
  const x=assessMiniLine(s,'A',a,result(1,.35,0),result(1.9,.44,2.5));
  assert.equal(x.kind,'hold-return-partner'); assert.ok(x.score>0);
});
test('v2.20 identifies control cycle from value and settlement',()=>{
  const s=base(); const a=card('hearts-K');
  const x=assessMiniLine(s,'A',a,result(0,.35,0),result(1.0,.42,3));
  assert.equal(x.kind,'control-cycle'); assert.ok(x.score>0);
});
test('v2.20 penalizes a line that loses both value and partner control',()=>{
  const s=base(); const a=card('T10');
  const x=assessMiniLine(s,'A',a,result(1,.45,0),result(.1,.39,-2));
  assert.ok(x.score<0); assert.ok(x.reasons.some(r=>r.includes('romlik')));
});
