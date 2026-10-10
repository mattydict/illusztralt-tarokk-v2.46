import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeck } from '../src/engine/cards.js';
import { createAuction, legalAuctionActions, applyAuctionAction } from '../src/engine/auction.js';
import { auctionLabel } from '../src/ui/auctionLabels.js';
import { buildDealReview } from '../src/engine/dealReview.js';
import { createRound, dealRound } from '../src/engine/round.js';

const deck = createDeck();
const cardsById = new Map(deck.map(card => [card.id, card]));
const card = id => cardsById.get(id);
const handsForFalseInvite = {
  A: ['T2','T3','T4','T5','hearts-K','hearts-Q','hearts-C','hearts-J','hearts-10'].map(card),
  B: ['T21','T20','T12','T11','T10','diamonds-K','diamonds-Q','diamonds-C','diamonds-J'].map(card),
  C: ['T22','T18','T17','T16','T15','T14','T13','spades-K','spades-Q'].map(card),
  D: ['T1','T9','T8','T7','T6','clubs-K','clubs-Q','clubs-C','clubs-J'].map(card),
};
function take(state, playerId, choose) {
  const actions = legalAuctionActions(state, playerId, handsForFalseInvite);
  const action = choose(actions);
  assert.ok(action, `No legal action for ${playerId}; got ${JSON.stringify(actions)}`);
  return applyAuctionAction(state, action, handsForFalseInvite);
}

test('3-2-1 with an intervening One: later Solo and hold are not mislabeled as XVIII invite', () => {
  let auction = createAuction(['A','B','C','D']);
  auction = take(auction, 'A', actions => actions.find(a => a.type === 'pass'));
  auction = take(auction, 'B', actions => actions.find(a => a.type === 'bid' && a.contract === 'three'));
  auction = take(auction, 'C', actions => actions.find(a => a.type === 'bid' && a.contract === 'two'));
  auction = take(auction, 'D', actions => actions.find(a => a.type === 'bid' && a.contract === 'one'));
  auction = take(auction, 'B', actions => actions.find(a => a.type === 'hold' && a.contract === 'one'));
  auction = take(auction, 'C', actions => actions.find(a => a.type === 'bid' && a.contract === 'solo'));
  auction = take(auction, 'D', actions => actions.find(a => a.type === 'pass'));
  const actions = legalAuctionActions(auction, 'B', handsForFalseInvite);
  const holdSolo = actions.find(a => a.type === 'hold' && a.contract === 'solo');
  assert.ok(holdSolo, `Expected a normal Solo-hold response, got ${JSON.stringify(actions)}`);
  assert.equal(holdSolo.acceptsInviteTarget, undefined, 'a previously bid One means Solo is now an adjacent, non-invite step');
  assert.doesNotMatch(auctionLabel(holdSolo, auction), /XVIII-invit/i);
  assert.equal(auction.outstandingInvite, undefined);
});

test('immediate jump from Three to Solo remains an explicit XVIII invite', () => {
  const hands = {
    A: handsForFalseInvite.A,
    B: handsForFalseInvite.B,
    C: handsForFalseInvite.C,
    D: handsForFalseInvite.D,
  };
  let auction = createAuction(['A','B','C','D'], 1);
  const move = (id, choose) => {
    const actions = legalAuctionActions(auction, id, hands);
    const action = choose(actions);
    assert.ok(action, `No legal action for ${id}: ${JSON.stringify(actions)}`);
    auction = applyAuctionAction(auction, action, hands);
    return action;
  };
  move('B', actions => actions.find(a => a.type === 'bid' && a.contract === 'three'));
  const cActions = legalAuctionActions(auction, 'C', hands);
  const invite = cActions.find(a => a.type === 'invite' && a.target === 18 && a.contract === 'solo');
  assert.ok(invite, `Expected explicit XVIII jump invite; got ${JSON.stringify(cActions)}`);
  assert.match(auctionLabel(invite, auction), /XVIII-invit/i);
});

test('deal review retains nine original cards, talon cards, skart and all nine tricks', () => {
  const initial = createRound(['A','B','C','D'], 0);
  const roundDealt = dealRound(initial, () => 0.31);
  assert.ok(roundDealt.players.every(player => player.dealtHand?.length === 9));
  assert.ok(roundDealt.players.every(player => player.dealtHand !== player.hand));

  const originals = roundDealt.players[0].dealtHand;
  const receivedTalon = [roundDealt.talon[0], roundDealt.talon[1]];
  const skart = [receivedTalon[0], originals[0]];
  const fakeRound = {
    ...roundDealt,
    takerId: 'A',
    contract: 'two',
    auction: { records: [
      { playerId: 'A', action: { type: 'pass' } },
      { playerId: 'B', action: { type: 'bid', contract: 'three' } },
    ] },
    players: roundDealt.players.map((player, index) => index === 0 ? { ...player, receivedTalon, skart } : player),
  };
  const fullDeck = [...roundDealt.talon, ...roundDealt.players.flatMap(player => player.dealtHand)];
  const played = fullDeck.slice(0, 36);
  const completedTricks = Array.from({ length: 9 }, (_, index) => ({
    leader: ['A','B','C','D'][index % 4],
    winner: ['D','A','B','C'][index % 4],
    cards: ['A','B','C','D'].map((player, offset) => ({ player, card: played[index * 4 + offset] })),
  }));
  const review = buildDealReview(fakeRound, {
    contract: 'two', takerId: 'A', partnerId: 'C', calledTarokk: 19,
    players: ['A', 'B', 'C', 'D'].map(id => ({ id })),
    completedTricks,
    declarations: {
      declarations: [
        { id: 'd1', type: 'tuletroa', ownerId: 'A', status: 'fulfilled', contra: { level: 'none' } },
        { id: 'd2', type: 'pagatUltimo', ownerId: 'D', status: 'failed', contra: { level: 'kontra' } },
      ],
      silentFigures: [{ type: 'doubleGame', ownerId: 'B', status: 'fulfilled' }],
    },
    finalPoints: { result: 'taker', takerPair: 55, defencePair: 27 },
  }, 12, { result: 'taker', takerPairPoints: 55, defencePairPoints: 27, lines: [{ type: 'tuletroa', points: 5, positiveForTakerPair: true }] });
  assert.equal(review.dealNumber, 12);
  assert.equal(review.players.length, 4);
  assert.ok(review.players.every(player => player.dealtHand.length === 9));
  assert.equal(review.players[0].receivedTalon.length, 2);
  assert.deepEqual(review.players[0].skart.map(c => c.id), skart.map(c => c.id));
  assert.equal(review.tricks.length, 9);
  assert.ok(review.tricks.every(trick => trick.cards.length === 4));
  assert.equal(review.auction.length, 2);
  assert.equal(review.auction[1].playerId, 'B');
  assert.equal(review.takerId, 'A');
  assert.equal(review.partnerId, 'C');
  assert.deepEqual(review.defenceIds, ['B', 'D']);
  assert.deepEqual(review.declarations.map(item => item.status), ['fulfilled', 'failed']);
  assert.equal(review.declarations[1].ownerId, 'D');
  assert.equal(review.silentFigures[0].type, 'doubleGame');
  assert.equal(review.settlement.lines[0].points, 5);
});
