import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initialDeclarationProgress, evaluateDeclarations } from '../src/engine/declarationLifecycle.js';
import { figureSettlementsFromProgress, settlementLines } from '../src/engine/settlement.js';

function trick(winner, cards) {
  return { winner, cards: cards.map(({ player, id }) => ({
    player,
    card: id.startsWith('T')
      ? { id, kind: 'tarokk', rank: Number(id.slice(1)), points: 1 }
      : { id, kind: 'suit', suit: 'makk', rank: 'A', points: 1 },
  })) };
}

const sideOf = id => (id === 'A' || id === 'D') ? 'taker' : 'defence';

function finalTricks(finalWinner) {
  const tricks = Array.from({ length: 8 }, (_, i) => trick('A', [{ player: 'A', id: `makk-A-${i}` }]));
  tricks.push(trick(finalWinner, [
    { player: 'B', id: 'T2' },
    { player: 'C', id: 'makk-C-final' },
    { player: 'D', id: 'makk-D-final' },
    { player: 'A', id: 'makk-A-final' },
  ]));
  return tricks;
}

test('csendes Sasultimó teljesül, ha a célkártya tulajdonosa nyeri a kilencedik ütést', () => {
  const progress = evaluateDeclarations(initialDeclarationProgress(), finalTricks('B'), sideOf, 9);
  const sas = progress.silentFigures.find(f => f.type === 'sasUltimo');
  assert.deepEqual({ ownerId: sas?.ownerId, status: sas?.status }, { ownerId: 'B', status: 'fulfilled' });

  const figures = figureSettlementsFromProgress(progress, 'A', 'D');
  const lines = settlementLines({ contract: 'three', takerPairWon: false, takerTrickPoints: 40, gameContra: 'none', figures });
  const line = lines.find(x => x.type === 'sasUltimo');
  assert.equal(line?.points, 5);
  assert.equal(line?.silent, true);
  assert.equal(line?.positiveForTakerPair, false, 'a sikeres ellenpár-figura az ellenpár javára számolódik el');
});

test('a csendes Sasultimó elbukik, ha csak a célkártya tulajdonosának partnere nyeri a kilencedik ütést', () => {
  const progress = evaluateDeclarations(initialDeclarationProgress(), finalTricks('C'), sideOf, 9);
  const sas = progress.silentFigures.find(f => f.type === 'sasUltimo');
  assert.deepEqual({ ownerId: sas?.ownerId, status: sas?.status }, { ownerId: 'B', status: 'failed' });

  const figures = figureSettlementsFromProgress(progress, 'A', 'D');
  const lines = settlementLines({ contract: 'three', takerPairWon: false, takerTrickPoints: 40, gameContra: 'none', figures });
  const line = lines.find(x => x.type === 'sasUltimo');
  assert.equal(line?.points, 5);
  assert.equal(line?.positiveForTakerPair, true, 'az ellenpár bukott figurája a felvevő pár javára számolódik el');
});

test('a csendes Sasultimó elbukik, ha a felvevő párja nyeri a kilencedik ütést', () => {
  const progress = evaluateDeclarations(initialDeclarationProgress(), finalTricks('A'), sideOf, 9);
  const sas = progress.silentFigures.find(f => f.type === 'sasUltimo');
  assert.deepEqual({ ownerId: sas?.ownerId, status: sas?.status }, { ownerId: 'B', status: 'failed' });
});

test('multiplayer eseménynapló 100 eseményt jelenít meg és a lap értékét nem írja ki', () => {
  const server = fs.readFileSync(new URL('../src/server/authoritativeRoom.js', import.meta.url), 'utf8');
  const serverTs = fs.readFileSync(new URL('../src/server/authoritativeRoom.ts', import.meta.url), 'utf8');
  const multiplayer = fs.readFileSync(new URL('../src/ui/multiplayer.js', import.meta.url), 'utf8');
  assert.match(server, /return 'Kijátszott egy lapot'/);
  assert.match(serverTs, /return 'Kijátszott egy lapot'/);
  assert.match(serverTs, /publicEvents: this\.publicEvents\.slice\(-100\)/);
  assert.match(server, /publicEvents: this\.publicEvents\.slice\(-100\)/);
  assert.match(server, /if \(this\.publicEvents\.length > 100\) this\.publicEvents\.shift\(\)/);
  assert.match(serverTs, /if \(this\.publicEvents\.length > 100\) this\.publicEvents\.shift\(\)/);
  assert.match(multiplayer, /state\.publicEvents[^\n]*slice\(-100\)/);
  assert.match(multiplayer, /utolsó 100 esemény/);
  assert.doesNotMatch(server, /Kijátszotta: \$\{cardLabel\}/);
});

test('single-player eseménynapló nem mutatja a kijátszott kártyát', () => {
  const mainJs = fs.readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.match(mainJs, /kijátszott egy lapot/);
  assert.match(mainJs, /eventLog\.slice\(-100\)/);
  assert.doesNotMatch(mainJs, /kijátszotta: \$\{cardName\(chosen\.card\)\}/);
});
