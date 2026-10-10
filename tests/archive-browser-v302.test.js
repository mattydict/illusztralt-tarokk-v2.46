import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ui = fs.readFileSync(path.join(root, 'src/ui/multiplayer.js'), 'utf8');

test('v3.0.3 multiplayer UI exposes searchable archive and authenticated detail replay', () => {
  assert.match(ui, /id="open-archives" class="review-open">Korábbi partik/);
  assert.match(ui, /id="archive-filter" class="archive-filter"/);
  assert.match(ui, /data-archive-deal=/);
  assert.match(ui, /new URLSearchParams\(\{ roomId: requestedRoom, playerId: session\.playerId, token: session\.token, limit: '100' \}\)/);
  assert.match(ui, /`\/archives\/\$\{encodeURIComponent\(session\.roomId\)\}\/\$\{Number\(dealNumber\)\}\?/);
  assert.match(ui, /review\?\.playerNames\?\.\[playerId\]/);
  assert.match(ui, /toLocaleLowerCase\('hu-HU'\)/);
});
