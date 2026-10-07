import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { availableDeclarations } from '../src/engine/declarations.js';
import { createDeclarationWindow, applyDeclarationAction, currentDeclarer } from '../src/engine/declarationWindow.js';
import { chooseAIDeclaration } from '../src/engine/aiDeclarations.js';

const deck = createDeck();
const t = (n) => deck.find(c => c.kind === 'tarokk' && c.rank === n);

function coreXixCentrumHand() {
  return [22,21,20,18,16,15].map(t);
}

test('v2.85 XIX-hívás után Centrum csak Skíz–XXI–XX–XVIII kézzel érhető el', () => {
  const weak = [22,21,20,17,16].map(t);
  const strong = coreXixCentrumHand();
  const base = { isTaker:false, firstRound:false, previousDeclarations:['tuletroa'], partnersKnown:true, calledTarokk:19, trullDeclared:true };
  const weakTypes = availableDeclarations(weak, base).map(x => x.type);
  const strongTypes = availableDeclarations(strong, base).map(x => x.type);
  assert.equal(weakTypes.includes('centrum'), false);
  assert.equal(strongTypes.includes('centrum'), true);
});

test('v2.85 AI nem mond XIX-hívás után tiltott Centrumot', () => {
  const weak = [22,21,20,17,16,15].map(t);
  const context = { isTaker:false, firstRound:false, previousDeclarations:['tuletroa'], partnersKnown:true, calledTarokk:19, trullDeclared:true, contract:'three' };
  const result = chooseAIDeclaration(weak, context);
  assert.notEqual(result.action?.type, 'centrum');
});

test('v2.85 három tiszta Passz kontra után is lezárja a bemondást', () => {
  let w = createDeclarationWindow(['A','B','C','D']);
  w = applyDeclarationAction(w, { type:'pass', playerId:'A' }); // opening taker pass is excluded
  // A hypothetical contra is outside declarationWindow state and must not turn the next pure Pass into a declaration action.
  w = applyDeclarationAction(w, { type:'pass', playerId:'B' });
  w = applyDeclarationAction(w, { type:'pass', playerId:'C' });
  w = applyDeclarationAction(w, { type:'pass', playerId:'D' });
  assert.equal(w.finished, true);
  assert.equal(currentDeclarer(w), undefined);
});
