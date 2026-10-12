import test from 'node:test';
import assert from 'node:assert/strict';
import { availableDeclarations } from '../src/engine/declarations.js';
import { createDeclarationWindow, applyDeclarationAction, legalDeclarationActions, pairHasFixedVolatDeclaration } from '../src/engine/declarationWindow.js';
import { initialDeclarationProgress, declareFigure } from '../src/engine/declarationLifecycle.js';

const hand = [
  { id: 'T10', kind: 'tarokk', rank: 10, points: 1 },
  { id: 'T9', kind: 'tarokk', rank: 9, points: 1 },
  { id: 'H-K', kind: 'suit', suit: 'hearts', rank: 'K', points: 5 },
];
const contextFor = (window, playerId, options = {}) => ({
  isTaker: playerId === 'A' || playerId === 'C', previousDeclarations: options.previousDeclarations ?? [],
  pairDeclaredTypes: options.pairDeclaredTypes ?? [], partnersKnown: true, speakerRolePubliclyKnown: true,
  multiplayerUnrestrictedDeclarations: true,
  pairVolatAlreadyFixed: pairHasFixedVolatDeclaration(window, playerId, 'A', 'C'), ...options,
});

test('Volát leaves Four Kings and Double Game available in the same open declaration turn', () => {
  let window = createDeclarationWindow(['A', 'B', 'C', 'D']);
  window = applyDeclarationAction(window, { type: 'declare', playerId: 'A', declaration: 'volat' });
  assert.equal(pairHasFixedVolatDeclaration(window, 'A', 'A', 'C'), false);
  const actions = legalDeclarationActions(window, 'A', hand, contextFor(window, 'A', { previousDeclarations: ['volat'], pairDeclaredTypes: ['volat'] }));
  const offered = actions.filter(a => a.type === 'declare').map(a => a.declaration);
  assert.ok(offered.includes('fourKings'));
  assert.ok(offered.includes('doubleGame'));
});

test('Pass fixes Volát for its pair, but the opposing pair may still announce Four Kings and Double Game', () => {
  let window = createDeclarationWindow(['A', 'B', 'C', 'D']);
  window = applyDeclarationAction(window, { type: 'declare', playerId: 'A', declaration: 'volat' });
  window = applyDeclarationAction(window, { type: 'pass', playerId: 'A' });
  assert.equal(pairHasFixedVolatDeclaration(window, 'C', 'A', 'C'), true);
  assert.equal(pairHasFixedVolatDeclaration(window, 'B', 'A', 'C'), false);
  const opponentActions = legalDeclarationActions(window, 'B', hand, contextFor(window, 'B', { previousDeclarations: ['volat'] }));
  const opposingOffered = opponentActions.filter(a => a.type === 'declare').map(a => a.declaration);
  assert.ok(opposingOffered.includes('fourKings'));
  assert.ok(opposingOffered.includes('doubleGame'));
  window = applyDeclarationAction(window, { type: 'pass', playerId: 'B' });
  const partnerActions = legalDeclarationActions(window, 'C', hand, contextFor(window, 'C', { previousDeclarations: ['volat'], pairDeclaredTypes: ['volat'] }));
  const partnerOffered = partnerActions.filter(a => a.type === 'declare').map(a => a.declaration);
  assert.ok(!partnerOffered.includes('fourKings'));
  assert.ok(!partnerOffered.includes('doubleGame'));
});

test('availability applies the Volát lock only when the speaking pair has fixed it', () => {
  const openTurn = availableDeclarations(hand, { isTaker: true, firstRound: false, previousDeclarations: ['volat'], partnersKnown: true });
  assert.ok(openTurn.some(x => x.type === 'fourKings'));
  assert.ok(openTurn.some(x => x.type === 'doubleGame'));
  const locked = availableDeclarations(hand, { isTaker: true, firstRound: false, previousDeclarations: ['volat'], partnersKnown: true, pairVolatAlreadyFixed: true });
  assert.ok(!locked.some(x => x.type === 'fourKings'));
  assert.ok(!locked.some(x => x.type === 'doubleGame'));
});

test('the rule validator accepts the opposing pair and open-turn combination but rejects the locked pair', () => {
  let progress = initialDeclarationProgress();
  progress = declareFigure(progress, 'volat', 'A', 1, undefined, 'taker:A', { pairVolatAlreadyFixed: false });
  assert.doesNotThrow(() => declareFigure(progress, 'doubleGame', 'A', 1, undefined, 'taker:A', { pairVolatAlreadyFixed: false }));
  assert.throws(() => declareFigure(progress, 'fourKings', 'C', 1, undefined, 'taker:A', { pairVolatAlreadyFixed: true }), /Volátja Passzal már rögzült/);
  assert.doesNotThrow(() => declareFigure(progress, 'doubleGame', 'B', 1, undefined, 'defence:B', { pairVolatAlreadyFixed: false }));
});
