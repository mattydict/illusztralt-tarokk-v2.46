import test from 'node:test';
import assert from 'node:assert/strict';
import { assessXXILeadRisk } from '../src/engine/aiPlay.js';

function t(rank){ return { id:`T${rank}`, kind:'tarokk', rank, points: rank === 1 || rank === 21 || rank === 22 ? 5 : 1 }; }
function s(id='H-K'){ return { id, kind:'suit', suit:'hearts', rank:'K', points:5 }; }

function state({ hand, takerId='A', partnerId='C', trickCards=[], completedTricks=[], records=[] } = {}) {
  return {
    singlePlayerPolicy: true,
    takerId,
    partnerId,
    publicAuctionRecords: records,
    players: [
      { id:'A', active:true, hand:[] },
      { id:'B', active:true, hand:hand ?? [t(21), t(18), t(15)] },
      { id:'C', active:true, hand:[] },
      { id:'D', active:true, hand:[] },
    ],
    completedTricks,
    trick: { leader: trickCards.length ? trickCards[0].player : 'A', cards:trickCards },
  };
}

// B is the XXI-es / defence side; A and C are the taker side. The exact
// bidding pattern must not by itself make a rear-position Skíz threat vanish.
test('v2.76 XXI-védelem: licitáló előző játékosok nem kapcsolják ki a Skíz-veszélyt', () => {
  const g = state({
    records: [
      { playerId:'B', action:{ type:'bid', contract:'three' } },
      { playerId:'C', action:{ type:'bid', contract:'two' } },
    ],
  });
  const risk = assessXXILeadRisk(g, 'B');
  assert.equal(risk.level, 'high');
  assert.equal(risk.hardHold, true);
  assert.equal(risk.tarokkCount, 3);
  assert.match(risk.reason, /Három tarokk maradt/);
});

test('v2.76 XXI-védelem: legalább három tarokknál erős megőrzési kényszer', () => {
  const g = state({ hand:[t(21), t(18), t(15), t(12)] });
  const risk = assessXXILeadRisk(g, 'B');
  assert.equal(risk.level, 'high');
  assert.equal(risk.hardHold, true);
  assert.equal(risk.tarokkCount, 4);
  assert.ok(risk.penalty >= 360);
});

test('v2.76 XXI-védelem: két tarokknál már nincs abszolút tiltás', () => {
  const g = state({ hand:[t(21), t(15), s()] });
  const risk = assessXXILeadRisk(g, 'B');
  assert.equal(risk.level, 'medium');
  assert.equal(risk.hardHold, false);
  assert.equal(risk.tarokkCount, 2);
  assert.ok(risk.penalty > 0 && risk.penalty < 50);
  assert.match(risk.reason, /utolsó előtti tarok/);
});

test('v2.76 XXI-védelem: ha nincs mögötte ellenpárti játékos, korai kijátszás is biztonságos', () => {
  const g = state({
    hand:[t(21), t(18), t(15)],
    trickCards:[
      { player:'C', card:t(18) },
      { player:'D', card:t(17) },
      { player:'A', card:t(16) },
    ],
  });
  const risk = assessXXILeadRisk(g, 'B');
  assert.equal(risk.level, 'none');
  assert.equal(risk.safe, true);
});

test('v2.76 XXI-védelem: az aktuális ütésben látható ellenfél-Skíz biztos veszély', () => {
  const g = state({
    hand:[t(21), t(15), s()],
    trickCards:[
      { player:'A', card:t(22) },
    ],
  });
  const risk = assessXXILeadRisk(g, 'B');
  assert.equal(risk.level, 'certain');
  assert.equal(risk.hardHold, true);
  assert.ok(risk.penalty >= 900);
});

test('v2.76 XXI-védelem: a már korábbi ütésben kijött Skíz megszünteti a fogás veszélyét', () => {
  const g = state({
    hand:[t(21), t(18), t(15)],
    completedTricks:[{ winner:'A', cards:[{ player:'A', card:t(22) }] }],
  });
  const risk = assessXXILeadRisk(g, 'B');
  assert.equal(risk.level, 'none');
  assert.equal(risk.safe, true);
});
