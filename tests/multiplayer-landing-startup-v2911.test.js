import test from 'node:test';
import assert from 'node:assert/strict';

 test('v2.91.1: multiplayer landing screen renders without a saved session', async () => {
  const app = { innerHTML: '' };
  globalThis.document = {
    querySelector(selector) { return selector === '#app' ? app : null; },
    querySelectorAll() { return []; },
  };
  globalThis.location = { protocol: 'https:', host: 'example.test', search: '' };
  globalThis.localStorage = { getItem() { return null; }, setItem() {}, removeItem() {} };
  globalThis.window = { addEventListener() {} };

  await import('../src/ui/multiplayer.js?landing-startup-v2911');
  assert.match(app.innerHTML, /Online Illusztrált Tarokk/);
  assert.match(app.innerHTML, /Új szoba/);
  assert.match(app.innerHTML, /Csatlakozás/);
});
