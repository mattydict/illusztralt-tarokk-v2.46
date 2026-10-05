import { strict as assert } from 'node:assert';
import { createInitialState, dealNineCards, setPartnership, startPlay, legalCardsForPlay } from '../src/engine/game.js';
import { buildAIBeliefSnapshot, partnerBeliefsFromAIBeliefSnapshot } from '../src/engine/aiBeliefEngine.js';
import { buildHandHypotheses } from '../src/engine/aiHandHypotheses.js';
import { evaluateCardContinuation } from '../src/engine/aiRollout.js';
import { chooseAICard } from '../src/engine/aiPlay.js';
function seededState() {
    let state = createInitialState(['P1', 'P2', 'P3', 'P4'], 3);
    state = dealNineCards(state, () => 0.37).state;
    state = setPartnership(state, 'P1', 'P2');
    state = { ...state, contract: 'one', skartsByPlayer: { P1: [], P2: [], P3: [], P4: [] } };
    return startPlay(state, state.players.findIndex(p => p.id === state.startingPlayerId));
}
const state = seededState();
const snapshot = buildAIBeliefSnapshot(state, 'P1');
const hypotheses = buildHandHypotheses(state, 'P1', snapshot);
const candidate = legalCardsForPlay(state, 'P1')[0];
assert.ok(candidate, 'A determinisztikus tesztállapotban kell legyen szabályos jelölt lap.');
const terminal = evaluateCardContinuation(state, 'P1', hypotheses, candidate, 9, 6);
assert.equal(terminal.samples, 6);
assert.ok(Number.isFinite(terminal.expectedSettlementForTakerPair));
assert.ok(Number.isFinite(terminal.expectedSettlementForObserverSide));
assert.notEqual(terminal.expectedSettlementForObserverSide, 0, 'A teljes leosztást elérő rolloutnak a settlement-értéket is ki kell töltenie.');
const beliefs = partnerBeliefsFromAIBeliefSnapshot(snapshot);
const decision = chooseAICard(state, 'P1', beliefs);
assert.ok(legalCardsForPlay(state, 'P1').some(card => card.id === decision.card.id));
console.log('v1.94 terminal settlement behavioural test: PASS');
