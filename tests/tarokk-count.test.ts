import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeclarationWindow, legalDeclarationActions, applyDeclarationAction } from '../src/engine/declarationWindow.js';
import type { Card } from '../src/engine/cards.js';

const tarokk = (rank:number): Card => ({ kind:'tarokk', rank, id:`T${rank}`, points: rank===1||rank===21||rank===22 ? 5 : 1 });

test('8 tarokk esetén a tarokkszám bemondása önkéntes és nem blokkolja a figurát', () => {
  const hand = [1,2,3,4,5,6,7,8].map(tarokk);
  let w = createDeclarationWindow(['A','B','C','D']);
  const before = legalDeclarationActions(w,'A',hand,{isTaker:true,firstRound:true,previousDeclarations:[],partnersKnown:true});
  assert.ok(before.some(a => a.type==='tarokkCount' && a.count===8));
  assert.ok(before.some(a => a.type==='declare' && a.declaration==='pagatUltimo'));
  w = applyDeclarationAction(w,{type:'tarokkCount',playerId:'A',count:8});
  const after = legalDeclarationActions(w,'A',hand,{isTaker:true,firstRound:true,previousDeclarations:[],partnersKnown:true});
  assert.equal(after.some(a => a.type==='declare' && a.declaration==='pagatUltimo'), true);
});

test('9 tarokk kézben a 9-es bejelentés is elérhető', () => {
  const hand = [1,2,3,4,5,6,7,8,9].map(tarokk);
  const w = createDeclarationWindow(['A','B','C','D']);
  const acts = legalDeclarationActions(w,'A',hand,{isTaker:true,firstRound:true,previousDeclarations:[],partnersKnown:true});
  assert.ok(acts.some(a => a.type==='tarokkCount' && a.count===9));
});

test('Pagát ultimó után 8+ tarokknál kötelező a tarokkszám bejelentése', () => {
  const hand = [1,2,3,4,5,6,7,8].map(tarokk);
  let w = createDeclarationWindow(['A','B','C','D']);
  w = applyDeclarationAction(w,{type:'declare',playerId:'A',declaration:'pagatUltimo'},hand);
  const acts = legalDeclarationActions(w,'A',hand,{isTaker:true,firstRound:true,previousDeclarations:['pagatUltimo'],partnersKnown:true});
  assert.deepEqual(acts.map(a=>a.type), ['tarokkCount']);
});
