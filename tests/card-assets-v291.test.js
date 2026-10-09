import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDeck } from '../src/engine/cards.js';
import { cardDisplayName, cardImageFile, cardImageSrc } from '../src/ui/cardAssets.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const assetDir = path.join(here, '../src/ui/cards');

test('v2.91: all 42 engine cards map one-to-one to an available illustrated face', () => {
  const deck = createDeck();
  assert.equal(deck.length, 42);
  const files = deck.map(cardImageFile);
  assert.equal(new Set(files).size, 42, 'each deck card should resolve to one unique image');
  for (const file of files) assert.ok(fs.existsSync(path.join(assetDir, file)), `missing card asset ${file}`);
  assert.equal(fs.readdirSync(assetDir).filter(name => name.endsWith('.webp')).length, 42);
});

test('v2.91: Skíz and low red-suit Ace images resolve without changing engine ids', () => {
  const deck = createDeck();
  const skiz = deck.find(card => card.id === 'T22');
  const heartAce = deck.find(card => card.id === 'hearts-10');
  const diamondAce = deck.find(card => card.id === 'diamonds-10');
  const clubTen = deck.find(card => card.id === 'clubs-10');
  assert.equal(cardImageFile(skiz), 'tarock-skus.webp');
  assert.equal(cardImageFile(heartAce), 'tarock-herz-1.webp');
  assert.equal(cardImageFile(diamondAce), 'tarock-karo-1.webp');
  assert.equal(cardImageFile(clubTen), 'tarock-kreuz-10.webp');
  assert.equal(cardDisplayName(heartAce), '♥A');
  assert.equal(cardDisplayName(diamondAce), '♦A');
  assert.equal(cardImageSrc(skiz), './cards/tarock-skus.webp');
  assert.equal(heartAce.id, 'hearts-10', 'engine identifier remains unchanged');
});
