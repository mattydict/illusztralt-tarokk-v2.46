import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDeclarations } from '../src/engine/declarations.js';
import { createDeclarationWindow, legalDeclarationActions } from '../src/engine/declarationWindow.js';

const hand = [
  { id: 'T10', kind: 'tarokk', rank: 10, points: 1 },
  { id: 'T9', kind: 'tarokk', rank: 9, points: 1 },
  { id: 'H-K', kind: 'suit', suit: 'hearts', rank: 'K', points: 5 },
];
const base = { isTaker: false, previousDeclarations: [], pairDeclaredTypes: [], partnersKnown: false, speakerIsDefence: true, speakerRolePubliclyKnown: false, hasPublicDefenceSignal: false };

test('Multiplayer bypass offers Four Kings, XXI-fogás and Centrum without Trull or XIX core once the role is public', () => {
  const declarations = availableDeclarations(hand, {
    ...base,
    speakerRolePubliclyKnown: true,
    multiplayerUnrestrictedDeclarations: true,
    trullDeclared: false,
    calledTarokk: 19,
    seatContext: 'lyukasCentrum',
    lastSeatHasXVIIAndUnboundHigherTarokk: false,
    previousDeclarations: ['volat'],
  }).map(x => x.type);
  for (const expected of ['fourKings', 'xxiFogas', 'centrum']) assert.ok(declarations.includes(expected), `${expected} should be available in multiplayer`);
});

test('Multiplayer declaration window blocks all declarations before defence signal, including the three unrestricted figures', () => {
  const window = createDeclarationWindow(['A', 'B', 'C', 'D']);
  const actions = legalDeclarationActions(window, 'A', hand, { ...base, multiplayerUnrestrictedDeclarations: true });
  assert.deepEqual(actions, [{ type: 'pass', playerId: 'A' }]);
});

test('Multiplayer declaration window offers the unrestricted figures after the role is public', () => {
  const window = createDeclarationWindow(['A', 'B', 'C', 'D']);
  const actions = legalDeclarationActions(window, 'A', hand, { ...base, speakerRolePubliclyKnown: true, multiplayerUnrestrictedDeclarations: true, trullDeclared: false, calledTarokk: 19, seatContext: 'lyukasCentrum', lastSeatHasXVIIAndUnboundHigherTarokk: false, previousDeclarations: ['volat'] });
  const declarations = actions.filter(x => x.type === 'declare').map(x => x.declaration);
  for (const expected of ['fourKings', 'xxiFogas', 'centrum']) assert.ok(declarations.includes(expected), `${expected} should be offered after identification`);
});

test('Single-player/default declaration context retains the prior unknown-defence restriction', () => {
  const window = createDeclarationWindow(['A', 'B', 'C', 'D']);
  const actions = legalDeclarationActions(window, 'A', hand, base);
  assert.deepEqual(actions, [{ type: 'pass', playerId: 'A' }]);
});
