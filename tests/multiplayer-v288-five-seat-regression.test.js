import test from 'node:test';
import assert from 'node:assert/strict';
import { LobbyService } from '../server/lobby.mjs';

test('v2.88: öt fős szobában az ötödik csatlakozó helyet is megkapja', () => {
  const lobby = new LobbyService({ store:{ loadAll(){return[]}, save(){}, remove(){}, close(){} } });
  const created = lobby.create({ displayName:'J1', playerCount:5, matchRounds:1 });
  assert.equal(created.status.playerCount, 5);
  for (let i = 2; i <= 5; i++) {
    const joined = lobby.join(created.roomId, { displayName:`J${i}` });
    assert.equal(joined.playerId, `P${i}`);
  }
  const status = lobby.status(created.roomId);
  assert.equal(status.joinedCount, 5);
  assert.equal(status.connectedCount, 1);
  assert.equal(status.ready, false);
});

test('v2.88: régi/incomplete seat metadata esetén is helyreállítható az ötödik hely', () => {
  const stored = [];
  const room = new LobbyService({ store:{
    loadAll(){ return stored; },
    save(record){ stored.push(structuredClone(record)); },
    remove(){}, close(){}
  } });
  const created = room.create({ displayName:'J1', playerCount:5, matchRounds:1 });
  const rec = stored[0];
  rec.seats.P2.joined = true;
  rec.seats.P3.joined = true;
  rec.seats.P4.joined = true;
  delete rec.seats.P5;
  const reloaded = new LobbyService({ store:{ loadAll(){return [rec];}, save(){}, remove(){}, close(){} } });
  assert.equal(reloaded.status(created.roomId).playerCount,5);
  const joined = reloaded.join(created.roomId,{displayName:'J5'});
  assert.equal(joined.playerId,'P5');
});
