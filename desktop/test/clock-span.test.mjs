// The clock's torus arcs and stretching an end round and round the dial (shared/clock-span.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { slice, onHalf, arcD, stretchStart, stretchMove, placeOf } from '../../shared/clock-span.js';

test('a timed part is split over the 오전 and 오후 dials', () => {
  const s = slice({ startTime: '10:00', endTime: '15:30' });
  assert.deepEqual(s, { s: 600, e: 930 });
  assert.deepEqual(onHalf(s, 0), { a: 600, b: 720 });
  assert.deepEqual(onHalf(s, 1), { a: 0, b: 210 });
  assert.deepEqual(onHalf(slice({ startTime: '08:30' }), 0), { a: 510, b: null }, 'a start only is a dot');
  assert.equal(onHalf(slice({ startTime: '08:30' }), 1), null);
  assert.deepEqual(slice({ startTime: '22:00', endTime: '24:00' }), { s: 1320, e: 1440 });
  assert.match(arcD(140, 140, 90, 0, 720), /A90 90 0 1 1/, 'a whole dial is a full ring');
});

test('stretching: every turn adds 12 hours, past noon and on into the next days; never before the start', () => {
  const start = new Date(2026, 10, 7, 10).getTime(), end = new Date(2026, 10, 7, 11, 30).getTime();
  let st = stretchStart(end, 15); // the knob at 11:30 sits at 345°… any start angle works, only turning counts
  for (let a = 15; a <= 15 + 360; a += 10) st = stretchMove(st, a % 360, start);
  assert.equal(st.end - end, 12 * 3600_000, 'one full turn: +12 h');
  assert.deepEqual(placeOf(st.end, '2026-11-07'), { half: 1, days: 0 });
  for (let a = 15; a <= 15 + 360; a += 10) st = stretchMove(st, a % 360, start);
  assert.deepEqual(placeOf(st.end, '2026-11-07'), { half: 0, days: 1 }, 'the next morning');
  for (let a = 15 + 360; a >= 15 - 720 * 3; a -= 10) st = stretchMove(st, ((a % 360) + 360) % 360, start);
  assert.equal(st.end, start + 5 * 60_000, 'turning back stops 5 minutes after the start');
  assert.deepEqual(placeOf(new Date(2026, 10, 8, 0, 0).getTime(), '2026-11-07'), { half: 1, days: 0 }, '24:00 is still the day before');
});
