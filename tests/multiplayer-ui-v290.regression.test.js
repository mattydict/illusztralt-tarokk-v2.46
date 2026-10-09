import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../src/ui/multiplayer.html', import.meta.url), 'utf8');
const js = fs.readFileSync(new URL('../src/ui/multiplayer.js', import.meta.url), 'utf8');
const server = fs.readFileSync(new URL('../src/server/authoritativeRoom.js', import.meta.url), 'utf8');

assert.match(html, /game-columns/);
assert.match(html, /event-log/);
assert.match(html, /table-layout/);
assert.match(html, /seat-right/);
assert.match(html, /seat-left/);
assert.match(js, /v2\.98\.0 multiplayer/);
assert.match(js, /function playerName\(playerId\)/);
assert.match(js, /state\.publicEvents/);
assert.match(js, /revealUntil = Date\.now\(\) \+ 5000/);
assert.match(js, /setTimeout\(\(\) => \{ revealTrick = null/);
assert.match(server, /Kijátszott egy lapot/);
assert.doesNotMatch(server, /Kijátszotta:\s*\$\{cardLabel\}/);
assert.match(js, /currentTrickLabel/);
assert.match(js, /playedCardHtml\(x\.player, x\.card\)/);
