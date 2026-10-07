import test from 'node:test';
import assert from 'node:assert/strict';
import { createRound, dealRound } from '../src/engine/round.js';
import { declarationOrderFromTaker, createDeclarationWindow, currentDeclarer } from '../src/engine/declarationWindow.js';

test('v2.78 declaration order starts with taker and proceeds clockwise', () => {
  assert.deepEqual(declarationOrderFromTaker(['A','B','C','D'], 'B'), ['B','C','D','A']);
  assert.deepEqual(declarationOrderFromTaker(['A','B','C','D'], 'A'), ['A','B','C','D']);
  const w = createDeclarationWindow(declarationOrderFromTaker(['A','B','C','D'], 'B'), true);
  assert.equal(currentDeclarer(w), 'B');
  assert.deepEqual(w.order, ['B','C','D','A']);
});

test('v2.78 a fresh deal seed produces a different shuffle', () => {
  const rng = seed0 => { let x = seed0 >>> 0; return () => { x = (1664525 * x + 1013904223) >>> 0; return x / 4294967296; }; };
  const a = dealRound(createRound(['A','B','C','D'], 0), rng(123456));
  const b = dealRound(createRound(['A','B','C','D'], 0), rng(123457));
  const handA = a.players.map(p => p.hand.map(c => c.id).join(','));
  const handB = b.players.map(p => p.hand.map(c => c.id).join(','));
  assert.notDeepEqual(handA, handB);
});

test('v2.78 UI no longer exposes internal English auction contract codes', async () => {
  const { readFile } = await import('node:fs/promises');
  const ui = await readFile(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  assert.equal(ui.includes("'tartom '+a.contract"), false);
  assert.equal(ui.includes("'licit '+a.contract"), false);
  assert.match(ui, /Tartom: \$\{contractLabel\(a\.contract\)\}/);
});
