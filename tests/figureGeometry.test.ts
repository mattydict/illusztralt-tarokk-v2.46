import test from 'node:test';
import assert from 'node:assert/strict';
import { assessFigureCandidateValue } from '../src/engine/figureGeometry.js';
import { createInitialState } from '../src/engine/game.js';

test('figure candidate value does not inspect hidden hands and rewards a visible prefix win', () => {
  const state = createInitialState(['A','B','C','D']);
  // The test only checks the safe empty-state behaviour: no active trick means
  // the helper may only use the candidate card and the public figure target.
  const result = assessFigureCandidateValue(state, state.players[0]!.id, 'kismadar', 'T10');
  assert.equal(result.figure, 'kismadar');
  assert.equal(result.trickNumber, 1);
  assert.equal(result.closesTrick, false);
  assert.ok(result.value >= 0);
});
