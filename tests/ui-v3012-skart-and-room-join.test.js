import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('v3.0.12: skart selection updates only the selected cards and keeps the current view', () => {
  const sources = [read('src/ui/main.js'), read('src/ui/main.ts'), read('src/ui/multiplayer.js')];
  for (const source of sources) {
    const start = source.indexOf("document.querySelectorAll('[data-card]')") >= 0
      ? source.indexOf("document.querySelectorAll('[data-card]')")
      : source.indexOf("document.querySelectorAll<HTMLButtonElement>('[data-card]')");
    assert.notEqual(start, -1, 'card click handler exists');
    const next = source.indexOf("document.querySelectorAll('[data-auction-index]')", start);
    const end = next >= 0 ? next : source.indexOf('\n}', start);
    const handler = source.slice(start, end >= 0 ? end : undefined);
    assert.match(handler, /classList\.toggle\('selected'/, 'selection styling updates in-place');
    assert.doesNotMatch(handler, /\brender\(\)\s*;/, 'selecting a skart card does not rebuild the page');
  }
  assert.match(read('src/ui/main.js'), /id="skart-selected-count"/);
  assert.match(read('src/ui/main.ts'), /id="skart-selected-count"/);
  assert.match(read('src/ui/multiplayer.js'), /Fektetés \(\$\{selectedSkart\.size\}\/\$\{Number\(hints\.skartCount \|\| 0\)\}\)/);
});

test('v3.0.12: each open room has its own name field beside Belépés', () => {
  const source = read('src/ui/multiplayer.js');
  const markupStart = source.indexOf('function publicRoomsMarkup()');
  const markupEnd = source.indexOf('\nasync function refreshPublicRooms()', markupStart);
  const markup = source.slice(markupStart, markupEnd);
  assert.match(markup, /data-public-name="\$\{esc\(room\.roomId\)\}"/);
  assert.match(markup, /data-public-join="\$\{esc\(room\.roomId\)\}">Belépés/);
  assert.match(markup, /publicRoomNames\.get\(String\(room\.roomId\)\)/, 'names survive room-list polling');
  assert.match(source, /const nameInput = row\?\.querySelector\('\[data-public-name\]'\)/);
  assert.match(source, /nextInput\.focus\(\{ preventScroll: true \}\)/, 'refresh preserves focused name entry');
  assert.match(read('src/ui/multiplayer.html'), /\.public-room-join\{display:flex;align-items:center;gap:8px/);
});
