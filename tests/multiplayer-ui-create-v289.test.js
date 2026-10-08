import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = new URL('../src/ui/multiplayer.js', import.meta.url);
const source = fs.readFileSync(file, 'utf8');

test('v2.89 captures selected 5-player value before render during room creation', () => {
  const listenerStart = source.indexOf("document.querySelector('#create')?.addEventListener('click'");
  assert.ok(listenerStart >= 0, 'create listener missing');
  const segment = source.slice(listenerStart, source.indexOf("document.querySelector('#join')?.addEventListener('click'", listenerStart));
  const playerCountCapture = segment.indexOf("const playerCount = Number(document.querySelector('#playerCount')?.value ?? 4);");
  const renderCall = segment.indexOf("notice='Szoba létrehozása…';");
  const requestCall = segment.indexOf("jsonFetch('/lobby/rooms'", playerCountCapture);
  assert.ok(playerCountCapture >= 0, 'playerCount must be captured from the form');
  assert.ok(renderCall >= 0, 'creation notice should be set');
  assert.equal(renderCall, playerCountCapture + segment.slice(playerCountCapture).indexOf("notice='Szoba létrehozása…';"), 'sanity');
  assert.ok(playerCountCapture < requestCall, 'playerCount must be captured before POST');
  const preRequest = segment.slice(playerCountCapture, requestCall);
  assert.equal(preRequest.includes('render();'), false, 'no render should run between capture and POST');
  assert.match(segment, /body:JSON\.stringify\(\{displayName, matchRounds, playerCount\}\)/);
});
