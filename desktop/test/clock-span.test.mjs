// The clock's torus arcs and stretching an end round and round the dial (shared/clock-span.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { slice, onHalf, arcD, stretchStart, stretchMove, placeOf, gripStart, gripMove, gripAt, movedTo } from '../../shared/clock-span.js';

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

test('the hover lens finds a to-do anywhere along its arc, with its whole time range', async () => {
  const { lensItems } = await import('../../shared/clock-span.js');
  const meet = { id: 'm', title: '랩 미팅', startTime: '10:00', endTime: '15:30' };
  // Lens over 1:00 on the 오후 dial (60 min in): the meeting runs through it.
  const [pm] = lensItems([meet], 1, 60);
  assert.deepEqual([pm.startTime, pm.label], ['13:00', '10:00–15:30']);
  // Over 11:00 on the 오전 dial; and past its end it sits at its end (still the nearest point).
  assert.equal(lensItems([meet], 0, 660)[0].startTime, '11:00');
  assert.equal(lensItems([meet], 1, 400)[0].startTime, '15:29');
  assert.equal(lensItems([{ id: 'c', startTime: '08:30' }], 1, 30).length, 0, 'a start-only to-do in the morning is not on the 오후 dial');
  const part = { id: 'p', title: '학회', startTime: '00:00', endTime: '02:00', span: { n: 3, total: 3 } };
  assert.equal(lensItems([part], 0, 30)[0].label, '00:00–02:00 · 3일차');
});

test('a grip on the arc: the start dot moves the start (never past the end), the body moves the whole thing with its length kept — even into the day before; the end knob as before', () => {
  const start = new Date(2026, 10, 7, 10).getTime(), end = new Date(2026, 10, 7, 11, 30).getTime();
  let st = gripStart({ start, end }, 0, 'start');
  for (let a = 0; a <= 60; a += 10) st = gripMove(st, a); // +2 h would pass the end: it stops 5 minutes before it
  assert.equal(st.end, end); assert.equal(st.start, end - 5 * 60_000); assert.equal(gripAt(st), st.start);
  st = gripStart({ start, end }, 0, 'move', start + 30 * 60_000); // grabbed at 10:30, a third of the way along
  for (let a = 0; a >= -720; a -= 10) st = gripMove(st, ((a % 360) + 360) % 360); // two turns back: −24 h
  assert.equal(st.end - st.start, end - start, 'the length is kept');
  assert.equal(st.start, start - 24 * 3600_000);
  assert.deepEqual(placeOf(gripAt(st), '2026-11-07'), { half: 0, days: -1 }, 'the grabbed point (10:30) is on the morning of the day before');
  st = gripStart({ start, end }, 0, 'end');
  for (let a = 0; a <= 30; a += 10) st = gripMove(st, a);
  assert.equal(st.end, end + 60 * 60_000); assert.equal(st.start, start); assert.equal(gripAt(st), st.end);
});

test('a to-do dropped on the clock keeps its length (like grabbing its body); a start-only one stays so; over midnight and over days too', () => {
  assert.deepEqual(movedTo({ date: '2026-11-07', startTime: '09:00', endTime: '10:30' }, '2026-11-07', '15:00'), { date: '2026-11-07', endDate: null, startTime: '15:00', endTime: '16:30' });
  assert.deepEqual(movedTo({ date: '2026-11-07', startTime: '09:00' }, '2026-11-08', '15:00'), { date: '2026-11-08', endDate: null, startTime: '15:00', endTime: null });
  assert.deepEqual(movedTo({ date: '2026-11-07' }, '2026-11-07', '15:00'), { date: '2026-11-07', endDate: null, startTime: '15:00', endTime: null });
  assert.deepEqual(movedTo({ date: '2026-11-07', startTime: '22:00', endTime: '02:00' }, '2026-11-07', '23:30'), { date: '2026-11-07', endDate: '2026-11-08', startTime: '23:30', endTime: '03:30' });
  assert.deepEqual(movedTo({ date: '2026-11-07', endDate: '2026-11-08', startTime: '20:00', endTime: '08:00' }, '2026-11-07', '21:00'), { date: '2026-11-07', endDate: '2026-11-08', startTime: '21:00', endTime: '09:00' });
  assert.deepEqual(movedTo({ date: '2026-11-07', startTime: '23:00', endTime: '24:00' }, '2026-11-07', '23:30'), { date: '2026-11-07', endDate: '2026-11-08', startTime: '23:30', endTime: '00:30' });
});
