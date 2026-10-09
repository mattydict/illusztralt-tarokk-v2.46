import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { deriveDeclarationFlowView, publicPartnerId, publicPartnerIdFromState } from '../src/engine/partnershipVisibility.js';
import { createDeclarationWindow, declarationOrderFromTaker, legalDeclarationActions } from '../src/engine/declarationWindow.js';

function game({ takerId = 'A', partnerId = 'B', defenders = [], declarations = [], gameContra = [], publicPartnerId: known } = {}) {
  return {
    takerId,
    partnerId,
    players: ['A', 'B', 'C', 'D'].map(id => ({ id, active: true })),
    declarations: { declarations },
    completedTricks: [],
    trick: null,
    gameContraState: { records: gameContra },
    ...(known ? { publicPartnerId: known } : {}),
    ...(defenders.length ? { _testDefenders: defenders } : {}),
  };
}

function defenceGame(takerId, partnerId, defenderId) {
  return game({
    takerId,
    partnerId,
    gameContra: [{ byPlayer: defenderId, side: 'defence', level: 'kontra' }],
  });
}

test('first non-taker figure or 8/9 tarokk identifies the partner when no defender has signalled', () => {
  for (const takerId of ['A', 'B', 'C', 'D']) {
    const order = declarationOrderFromTaker(['A', 'B', 'C', 'D'], takerId);
    const candidate = order[1];
    const actualPartner = candidate;
    const g = game({ takerId, partnerId: actualPartner });
    const window = {
      order,
      currentIndex: 1,
      records: [{ type: 'tarokkCount', playerId: candidate, count: 8 }],
    };
    assert.equal(publicPartnerId(g, {}, window), candidate, `rotated order ${order.join('-')}`);
  }
});

test('after one defender contra, a second non-taker declaration identifies that speaker as the other defender', () => {
  const g = defenceGame('A', 'D', 'B');
  g.declarations.declarations.push({ id: 'decl-C', ownerId: 'C', type: 'fourKings', contra: { records: [], level: 'none' } });
  const window = {
    order: ['A', 'B', 'C', 'D'],
    currentIndex: 2,
    records: [
      { type: 'contraSignal', playerId: 'B', target: 'game' },
      { type: 'declare', playerId: 'C', declaration: 'fourKings' },
    ],
  };
  assert.equal(publicPartnerId(g, {}, window), 'D');
  assert.equal(publicPartnerIdFromState(g), 'D');
});

test('while pairs remain unknown, the next speaker is explicitly told whom the declaration addresses', () => {
  const g = defenceGame('A', 'D', 'B');
  const window = {
    order: ['A', 'B', 'C', 'D'],
    currentIndex: 3,
    turnHadContra: false,
    records: [
      { type: 'contraSignal', playerId: 'B', target: 'game' },
      { type: 'pass', playerId: 'B' },
      { type: 'pass', playerId: 'C' },
    ],
  };
  const viewerSnapshot = deriveDeclarationFlowView(g, {}, window, 'D');
  assert.equal(viewerSnapshot.pairsKnown, false);
  assert.equal(viewerSnapshot.recipientId, 'B');
  assert.equal(viewerSnapshot.currentSpeakerRequirement, 'recontra');
  assert.match(viewerSnapshot.currentSpeakerGuidance, /rekontráznod kell/i);

  const otherPlayerSnapshot = deriveDeclarationFlowView(g, {}, window, 'A');
  assert.equal(otherPlayerSnapshot.recipientId, 'B');
  assert.equal('currentSpeakerGuidance' in otherPlayerSnapshot, false, 'private role-specific guidance must not leak to other players');
  assert.equal('currentSpeakerRequirement' in otherPlayerSnapshot, false);
});

test('an opponent who declares after a defence contra resolves the remaining partner, and targets the opposing pair', () => {
  const g = defenceGame('A', 'D', 'B');
  g.declarations.declarations.push({ id: 'decl-C', ownerId: 'C', type: 'fourKings', contra: { records: [], level: 'none' } });
  const window = {
    order: ['A', 'B', 'C', 'D'],
    currentIndex: 2,
    records: [
      { type: 'contraSignal', playerId: 'B', target: 'game' },
      { type: 'declare', playerId: 'C', declaration: 'fourKings' },
    ],
  };
  const flow = deriveDeclarationFlowView(g, {}, window, 'A');
  assert.equal(flow.pairsKnown, true);
  assert.equal(flow.partnerId, 'D');
  assert.deepEqual(flow.recipientPlayerIds, ['A', 'D']);
  assert.equal(flow.recipientKind, 'opposing-pair');
});

test('a recontra visibly identifies the taker partner and then shows the opposing pair as recipient', () => {
  const g = game({
    takerId: 'A', partnerId: 'D',
    gameContra: [
      { byPlayer: 'B', side: 'defence', level: 'kontra' },
      { byPlayer: 'D', side: 'taker', level: 'rekontra' },
    ],
  });
  g.gameContraState.level = 'rekontra';
  const window = {
    order: ['A', 'B', 'C', 'D'],
    currentIndex: 3,
    turnHadContra: true,
    records: [
      { type: 'contraSignal', playerId: 'B', target: 'game' },
      { type: 'pass', playerId: 'B' },
      { type: 'pass', playerId: 'C' },
      { type: 'contraSignal', playerId: 'D', target: 'game' },
    ],
  };
  const flow = deriveDeclarationFlowView(g, {}, window, 'D');
  assert.equal(flow.pairsKnown, true);
  assert.equal(flow.partnerId, 'D');
  assert.equal(flow.lastContraLevel, 'rekontra');
  assert.deepEqual(flow.recipientPlayerIds, ['B', 'C']);
});

test('declaration UI consumes the same recipient/guidance fields in multiplayer and single-player', () => {
  const multiplayer = fs.readFileSync(new URL('../src/ui/multiplayer.js', import.meta.url), 'utf8');
  const singlePlayer = fs.readFileSync(new URL('../src/ui/main.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../src/server/authoritativeRoom.js', import.meta.url), 'utf8');
  const serverTypeScript = fs.readFileSync(new URL('../src/server/authoritativeRoom.ts', import.meta.url), 'utf8');
  const protocolTypes = fs.readFileSync(new URL('../src/server/protocol.ts', import.meta.url), 'utf8');
  assert.match(multiplayer, /flow\.recipientId/);
  assert.match(multiplayer, /flow\.currentSpeakerGuidance/);
  assert.match(singlePlayer, /declarationFlowView\.recipientId/);
  assert.match(singlePlayer, /declarationFlowView\.currentSpeakerGuidance/);
  assert.match(server, /deriveDeclarationFlowView\(this\.game, this\.round, this\.declarationWindow, playerId\)/);
  assert.match(serverTypeScript, /deriveDeclarationFlowView\(this\.game, this\.round, this\.declarationWindow, playerId\)/);
  assert.match(serverTypeScript, /\.\.\.\(declarationFlow \? \{ declarationFlow \} : \{\}\)/);
  assert.match(protocolTypes, /declarationFlow\?: DeclarationFlowView/);
});

test('an 8/9-tarokk disclosure by the second non-taker after a defence contra also reveals the remaining partner to observers', () => {
  const g = defenceGame('A', 'D', 'B');
  g.announcedTarokkCounts = { C: 8 };
  assert.equal(publicPartnerIdFromState(g), 'D');
});

test('the same direction model works when the taker occupies each of the four seats', () => {
  const ids = ['A', 'B', 'C', 'D'];
  for (let seat = 0; seat < 4; seat += 1) {
    const order = ids.map((_, i) => ids[(seat + i) % ids.length]);
    const takerId = order[0];
    const defenderId = order[1];
    const nextSpeakerId = order[2];
    const partnerId = order[3];
    const g = defenceGame(takerId, partnerId, defenderId);
    g.declarations.declarations.push({ id: `decl-${nextSpeakerId}`, ownerId: nextSpeakerId, type: 'fourKings', contra: { records: [], level: 'none' } });
    const window = {
      order,
      currentIndex: 2,
      records: [
        { type: 'contraSignal', playerId: defenderId, target: 'game' },
        { type: 'declare', playerId: nextSpeakerId, declaration: 'fourKings' },
      ],
    };
    assert.equal(publicPartnerId(g, {}, window), partnerId, `seat rotation ${order.join('-')}`);
    const view = deriveDeclarationFlowView(g, {}, window, order[0]);
    assert.equal(view.pairsKnown, true, `pairs must be clear for ${order.join('-')}`);
    assert.ok(view.recipientPlayerIds.includes(takerId), `taker should be in opposing recipients for ${order.join('-')}`);
    assert.ok(view.recipientPlayerIds.includes(partnerId), `partner should be in opposing recipients for ${order.join('-')}`);
  }
});

test('actual legal declaration actions enforce kontra/re-kontra prerequisites in every seat rotation', () => {
  const ids = ['A', 'B', 'C', 'D'];
  const eightTarokks = Array.from({ length: 8 }, (_, i) => ({ id: `T${i + 10}`, kind: 'tarokk', rank: i + 10, points: 1 }));
  for (let seat = 0; seat < 4; seat += 1) {
    const order = ids.map((_, i) => ids[(seat + i) % ids.length]);
    const [takerId, firstDefenderId, nextSpeakerId, hiddenPartnerId] = order;
    const baseWindow = createDeclarationWindow(order, true);
    const fresh = { ...baseWindow, currentIndex: 1 };
    const beforeContra = legalDeclarationActions(fresh, firstDefenderId, eightTarokks, {
      speakerIsDefence: true,
      speakerIsPartner: false,
      speakerRolePubliclyKnown: false,
      hasPublicDefenceSignal: false,
    });
    assert.deepEqual(beforeContra.map(a => a.type), ['pass'], `defender must contra first: ${order.join('-')}`);

    const afterContra = { ...fresh, currentIndex: 2, records: [{ type: 'contraSignal', playerId: firstDefenderId, target: 'game' }] };
    const secondDefenderActions = legalDeclarationActions(afterContra, nextSpeakerId, eightTarokks, {
      speakerIsDefence: true,
      speakerIsPartner: false,
      speakerRolePubliclyKnown: false,
      hasPublicDefenceSignal: true,
    });
    assert.ok(secondDefenderActions.some(a => a.type === 'tarokkCount' && a.count === 8), `second defender can make 8-tarokk announcement: ${order.join('-')}`);

    const hiddenPartnerActions = legalDeclarationActions({ ...afterContra, currentIndex: 3, turnHadContra: false }, hiddenPartnerId, eightTarokks, {
      speakerIsDefence: false,
      speakerIsPartner: true,
      speakerRolePubliclyKnown: false,
      hasPublicDefenceSignal: true,
      turnHadContra: false,
    });
    assert.deepEqual(hiddenPartnerActions.map(a => a.type), ['pass'], `hidden partner must recontra before declaring: ${order.join('-')}`);

    const partnerBeforeContra = legalDeclarationActions(fresh, firstDefenderId, eightTarokks, {
      speakerIsDefence: false,
      speakerIsPartner: true,
      speakerRolePubliclyKnown: false,
      hasPublicDefenceSignal: false,
    });
    assert.ok(partnerBeforeContra.some(a => a.type === 'tarokkCount' && a.count === 8), `partner may directly declare before any defence signal: ${order.join('-')}`);
  }
});

test('after C passes following B kontra, D receives a private recontra requirement without leaking it to others', () => {
  const g = defenceGame('A', 'D', 'B');
  const window = {
    order: ['A', 'B', 'C', 'D'], currentIndex: 3, turnHadContra: false,
    records: [
      { type: 'contraSignal', playerId: 'B', target: 'game' },
      { type: 'pass', playerId: 'B' },
      { type: 'pass', playerId: 'C' },
    ],
  };
  const forD = deriveDeclarationFlowView(g, {}, window, 'D');
  assert.equal(forD.recipientId, 'B');
  assert.equal(forD.currentSpeakerRequirement, 'recontra');
  const forC = deriveDeclarationFlowView(g, {}, window, 'C');
  assert.equal(forC.recipientId, 'B');
  assert.equal(forC.currentSpeakerRequirement, undefined);
  assert.equal(forC.currentSpeakerGuidance, undefined);
});
