import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDeclarationCommunicationState } from '../src/engine/declarationCommunicationState.js';

test('v2.31: Trull + Four Kings is one canonical communication chain', () => {
  const s = deriveDeclarationCommunicationState({ events: [{ declaration: 'tuletroa', speakerId: 'A' }, { declaration: 'fourKings', speakerId: 'B' }], calledTarokk: 19, contract: 'three' });
  assert.equal(s.hasTrull, true); assert.equal(s.hasFourKings, true); assert.equal(s.phase, 'fourKings'); assert.ok(s.signalledTarokk !== undefined);
});

test('v2.31: Four Kings without Trull is encouragement only', () => {
  const s = deriveDeclarationCommunicationState({ events: [{ declaration: 'fourKings', speakerId: 'A' }] });
  assert.equal(s.signalledTarokk, undefined); assert.equal(s.encouragement, true);
});

test('v2.31: Centrum/Kismadar/Nagymadar remains a single public chain', () => {
  const s = deriveDeclarationCommunicationState({ events: [
    { declaration: 'tuletroa', speakerId: 'A' }, { declaration: 'fourKings', speakerId: 'B' },
    { declaration: 'centrum', speakerId: 'A' }, { declaration: 'kismadar', speakerId: 'B' }, { declaration: 'nagymadar', speakerId: 'A' },
  ], calledTarokk: 19, contract: 'three' });
  assert.equal(s.hasCentrum, true); assert.equal(s.hasKismadar, true); assert.equal(s.hasNagymadar, true); assert.equal(s.phase, 'nagymadar');
});

test('v2.31: communication state never asserts target-card ownership', () => {
  const s = deriveDeclarationCommunicationState({ events: [{ declaration: 'tuletroa', speakerId: 'A' }, { declaration: 'fourKings', speakerId: 'B' }] });
  assert.equal('ownerId' in s, false); assert.equal('cardOwner' in s, false);
});
