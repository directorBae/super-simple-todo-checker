// 연결음 (shared/work-alerts.mjs ringbackWanted): the one who opened a room and called people hears the tone only
// while it makes sense — connected, alone in the room, someone still to answer, within the ring.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ringbackWanted, RINGBACK_MS } from '../../shared/work-alerts.mjs';

const NOW = Date.parse('2026-11-10T15:00:00+09:00');
const me = 'me', dive = { id: 'd1', by: me, createdAt: new Date(NOW - 5000).toISOString(), targets: ['b', 'c'], replies: [{ id: me, answer: 'join' }] };
const call = { dive: 'd1', state: 'connected', people: [{ id: me, me: true }] };

test('ringback: rings for the caller, connected and alone, while someone called has not answered', () => {
  assert.equal(ringbackWanted(call, dive, me, NOW), true);
  assert.equal(ringbackWanted({ ...call, state: 'connecting' }, dive, me, NOW), false, 'not before the call is up');
  assert.equal(ringbackWanted(null, dive, me, NOW), false);
  assert.equal(ringbackWanted(call, { ...dive, by: 'b' }, me, NOW), false, 'only the one who called');
  assert.equal(ringbackWanted(call, { ...dive, id: 'other' }, me, NOW), false, 'the dive of this call');
});

test('ringback: stops when someone comes in, when everyone called has answered, or after the ring', () => {
  assert.equal(ringbackWanted({ ...call, people: [...call.people, { id: 'b' }] }, dive, me, NOW), false, 'someone is in');
  const answered = { ...dive, replies: [...dive.replies, { id: 'b', answer: 'busy' }, { id: 'c', answer: 'kakao' }] };
  assert.equal(ringbackWanted(call, answered, me, NOW), false, 'all answered');
  const one = { ...dive, replies: [...dive.replies, { id: 'b', answer: 'busy' }] };
  assert.equal(ringbackWanted(call, one, me, NOW), true, 'c still to answer');
  assert.equal(ringbackWanted(call, dive, me, NOW - 5000 + RINGBACK_MS + 1), false, 'the ring is over');
  assert.equal(ringbackWanted(call, { ...dive, targets: [] }, me, NOW), false, 'nobody was called');
});
