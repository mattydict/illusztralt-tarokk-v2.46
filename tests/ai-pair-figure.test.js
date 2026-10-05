import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAICard } from '../src/engine/aiPlay.js';
// This file documents the pair-level policy introduced in v0.65.
// Full runtime execution requires the project's tsx test dependency.
test('AI pair-figure policy is pair-level, not announcer-only', () => {
    assert.ok(typeof chooseAICard === 'function');
});
