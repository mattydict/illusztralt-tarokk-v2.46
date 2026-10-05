import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAuctionPath, evaluateContraPath, evaluateDealPortfolio, evaluateDeclarationPath } from '../src/engine/aiDealPortfolio.js';

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} !== ${b}`);

test('a közös partiportfólió 50%-nál szimmetrikus kockázati alapon', () => {
  const win = evaluateDealPortfolio({ phase: 'play', successProbability: 0.7, upside: 10, downside: 10 });
  const lose = evaluateDealPortfolio({ phase: 'play', successProbability: 0.3, upside: 10, downside: 10 });
  assert.ok(win.score > lose.score);
  assert.ok(win.netExpectedValue > lose.netExpectedValue);
});

test('erős licitút pozitívabb, mint a passz tisztán gazdasági alapon', () => {
  const enter = evaluateAuctionPath({ action: 'enter', contract: 'two', successProbability: 0.70 });
  const pass = evaluateAuctionPath({ action: 'pass' });
  assert.ok(enter.score > pass.score);
});

test('gyenge licitút nem kap automatikus előnyt csak a szerződés névértéke miatt', () => {
  const weak = evaluateAuctionPath({ action: 'enter', contract: 'solo', successProbability: 0.20 });
  const strong = evaluateAuctionPath({ action: 'enter', contract: 'two', successProbability: 0.65 });
  assert.ok(strong.score > weak.score);
});

test('magas bemondási sikerarány magasabb portfólióértéket ad', () => {
  const weak = evaluateDeclarationPath({ type: 'kingUhu', successProbability: 0.25 });
  const strong = evaluateDeclarationPath({ type: 'kingUhu', successProbability: 0.80 });
  assert.ok(strong.score > weak.score);
  assert.ok(strong.netExpectedValue > weak.netExpectedValue);
});

test('kommunikáció növelheti a közös bemondási út értékét, de nem írja felül a reménytelen sikert', () => {
  const hopeless = evaluateDeclarationPath({ type: 'centrum', successProbability: 0.05, communicationValue: 2 });
  const plausible = evaluateDeclarationPath({ type: 'centrum', successProbability: 0.65 });
  assert.ok(plausible.score > hopeless.score);
});

test('a kontraérték a tényleges break-probability-val együtt nő', () => {
  const weak = evaluateContraPath({ targetValue: 10, currentLevel: 'none', breakProbability: 0.25 });
  const strong = evaluateContraPath({ targetValue: 10, currentLevel: 'none', breakProbability: 0.75 });
  assert.ok(strong.score > weak.score);
});

test('a kontraút 50%-os break-becslésnél gazdaságilag semleges', () => {
  const e = evaluateContraPath({ targetValue: 10, currentLevel: 'none', breakProbability: 0.50 });
  // Communication/position/tactical values are absent, so only the base
  // expected value should be neutral around 50%.
  close(e.grossExpectedValue - e.downsideRisk, 0);
});

test('mordkontra után nincs további marginális kitettség', () => {
  const e = evaluateContraPath({ targetValue: 25, currentLevel: 'mordkontra', breakProbability: 1 });
  assert.equal(e.exposure, 0);
});
