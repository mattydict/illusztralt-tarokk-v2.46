import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('v2.41 UI exposes mobile/accessibility affordances and persisted settings', () => {
  const ts = fs.readFileSync(path.resolve('src/ui/main.ts'), 'utf8');
  const html = fs.readFileSync(path.resolve('src/ui/index.html'), 'utf8');
  assert.match(ts, /settings-v241/);
  assert.match(ts, /Játékosok száma/);
  assert.match(ts, /aria-valuenow/);
  assert.match(ts, /legális kijátszás/);
  assert.match(ts, /aria-disabled/);
  assert.match(html, /v2\.44/);
  assert.match(html, /max-width:760px/);
  assert.match(html, /grid-template-columns:repeat\(4/);
});
