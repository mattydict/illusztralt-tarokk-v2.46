import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseAIAuctionAction } from '../src/engine/aiAuction.js';
import { createAuction } from '../src/engine/auction.js';

const t = rank => ({kind:'tarokk', rank, id:`T${rank}`, points: rank === 1 || rank === 21 || rank === 22 ? 5 : 1});
const s = (suit, rank, points) => ({kind:'suit', suit, rank, id:`${suit}-${rank}`, points});

test('v2.77 gyenge 4 tarokkos XXI-es kéz élből Hármast mond', () => {
  const auction = createAuction(['A','B','C','D'], 0);
  const hand = [s('clubs','Q',4),s('hearts','K',5),s('hearts','Q',4),s('spades','Q',4),s('spades','10',1),t(5),t(6),t(14),t(21)];
  const d = chooseAIAuctionAction(auction, 'A', hand, {A:hand}, {singlePlayer:true});
  assert.equal(d.action.type, 'bid');
  assert.equal(d.action.contract, 'three');
});

test('v2.77 nyitó Egyes csak 8+ tarokk + nagyhonőr + legalább négy magas tarokk + király profilnál kényszerített', () => {
  const auction = createAuction(['A','B','C','D'], 0);
  const hand = [t(21),t(20),t(19),t(18),t(17),t(16),t(15),t(14),s('hearts','K',5)];
  const d = chooseAIAuctionAction(auction, 'A', hand, {A:hand}, {singlePlayer:true});
  assert.equal(d.action.type, 'bid');
  assert.equal(d.action.contract, 'one');
});

test('v2.77 7 tarokk + két király nem nyitó Egyes, de Kettesre jogosít', () => {
  const auction = createAuction(['A','B','C','D'], 0);
  const hand = [t(21),t(20),t(19),t(18),t(17),t(16),t(15),s('hearts','K',5),s('diamonds','K',5)];
  const d = chooseAIAuctionAction(auction, 'A', hand, {A:hand}, {singlePlayer:true});
  assert.equal(d.action.type, 'bid');
  assert.equal(d.action.contract, 'two');
});
