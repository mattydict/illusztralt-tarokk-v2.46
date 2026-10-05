import test from 'node:test';
import assert from 'node:assert/strict';
import { arbitrateStrategicObjectives } from '../src/engine/aiStrategicPlanner.js';
test('v1.93 prefers the more urgent own figure when its target line is clearly stronger', () => {
    const result = arbitrateStrategicObjectives({
        trickNumber: 5,
        playerSide: 'taker',
        partnerWinRate: 0.55,
        continuationScore: 1.5,
        communicationValue: 0.2,
        ownBird: { deadline: 5, successProbability: 0.86, breakProbability: 0, confidence: 0.9, label: 'centrum' },
        opponentBird: { deadline: 7, successProbability: 0, breakProbability: 0.42, confidence: 0.8, label: 'kismadar' },
        candidateWins: true,
        candidateWinsForPartner: false,
    });
    assert.equal(result.priority, 'own-figure');
    assert.ok(result.score > 0);
    assert.equal(result.ownUrgency, 3.5);
});
test('v1.93 prefers breaking an opponent figure when its deadline and break margin dominate', () => {
    const result = arbitrateStrategicObjectives({
        trickNumber: 5,
        playerSide: 'defence',
        partnerWinRate: 0.45,
        continuationScore: 0,
        communicationValue: 0,
        ownBird: { deadline: 7, successProbability: 0.48, breakProbability: 0, confidence: 0.7, label: 'kismadar' },
        opponentBird: { deadline: 5, successProbability: 0, breakProbability: 0.93, confidence: 0.95, label: 'centrum' },
        candidateWins: true,
        candidateWinsForPartner: false,
    });
    assert.equal(result.priority, 'break-opponent-figure');
    assert.ok(result.score > 0);
    assert.equal(result.defenceUrgency, 3.5);
});
test('v1.93 uses partner control as tie-breaker instead of inventing card ownership', () => {
    const result = arbitrateStrategicObjectives({
        trickNumber: 3,
        playerSide: 'taker',
        partnerWinRate: 0.82,
        continuationScore: 0,
        communicationValue: 0,
        ownBird: { deadline: 7, successProbability: 0.65, breakProbability: 0, confidence: 0.8, label: 'kismadar' },
        opponentBird: { deadline: 7, successProbability: 0, breakProbability: 0.64, confidence: 0.8, label: 'nagymadar' },
        candidateWins: true,
        candidateWinsForPartner: true,
    });
    assert.equal(result.priority, 'partner-control');
    assert.ok(result.reasons.some(r => r.includes('partner')));
});
