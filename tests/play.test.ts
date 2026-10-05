import test from 'node:test';
import assert from 'node:assert/strict';
import { Card } from '../src/engine/cards.js';
import { legalPlayCards, determineWinner } from '../src/engine/play.js';

const T = (rank:number):Card => ({kind:'tarokk', rank, id:`T${rank}`, points:1});
const S = (s:'hearts'|'diamonds'|'spades'|'clubs', rank:'K'|'Q'|'C'|'J'|'10'):Card => ({kind:'suit', suit:s, rank, id:`${s}-${rank}`, points:1});

test('when a suit is led, suit must be followed if possible', () => {
  const lead=S('hearts','10');
  const legal=legalPlayCards([S('hearts','K'), T(21), S('spades','K')], {leaderId:'a',cards:[{playerId:'a',card:lead}],lead});
  assert.deepEqual(legal.map(c=>c.id), ['hearts-K']);
});

test('when a suit is led and no suit is held, a tarokk must be played if available', () => {
  const lead=S('hearts','10');
  const legal=legalPlayCards([T(21), S('spades','K')], {leaderId:'a',cards:[{playerId:'a',card:lead}],lead});
  assert.deepEqual(legal.map(c=>c.id), ['T21']);
});

test('when tarokk is led, only tarokks may be played', () => {
  const lead=T(10);
  const legal=legalPlayCards([T(21), S('spades','K')], {leaderId:'a',cards:[{playerId:'a',card:lead}],lead});
  assert.deepEqual(legal.map(c=>c.id), ['T21']);
});

test('highest tarokk wins a tarokk-led trick', () => {
  const lead=T(10);
  const winner=determineWinner([{playerId:'a',card:T(10)},{playerId:'b',card:T(21)},{playerId:'c',card:T(15)}], lead);
  assert.equal(winner,'b');
});
