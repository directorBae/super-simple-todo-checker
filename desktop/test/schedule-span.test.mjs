// The schedule card's math: a to-do's span as instants and back, the banner's ticks/snap, and the zoom-in on wobble.
import test from 'node:test';
import assert from 'node:assert/strict';
import { toRange, fromRange, tickStep, snapStep, snap, wobble, HOUR, MIN, DAY } from '../../shared/schedule-span.js';

test('spans round-trip through instants; an end at midnight belongs to the day before', () => {
  const multi = { date: '2026-11-03', endDate: '2026-11-05', startTime: '22:00', endTime: '02:00' };
  assert.deepEqual(fromRange(toRange(multi)), multi);
  const untimed = { date: '2026-11-03', endDate: '2026-11-04', startTime: null, endTime: null };
  assert.deepEqual(fromRange(toRange(untimed)), untimed);
  // One old-style day 22:00–02:00 means into the next morning.
  assert.deepEqual(fromRange(toRange({ date: '2026-11-03', startTime: '22:00', endTime: '02:00' })), { date: '2026-11-03', endDate: '2026-11-04', startTime: '22:00', endTime: '02:00' });
  const r = toRange({ date: '2026-11-03', startTime: '22:00', endTime: '23:00' });
  assert.deepEqual(fromRange({ ...r, end: r.start + 2 * HOUR }), { date: '2026-11-03', endDate: null, startTime: '22:00', endTime: '24:00' });
  assert.deepEqual(fromRange(toRange({ date: '2026-11-03', startTime: '09:00' })), { date: '2026-11-03', endDate: null, startTime: '09:00', endTime: '10:00' });
});

test('the banner: coarser ticks and snapping as it zooms out; quick back-and-forth asks to zoom in', () => {
  assert.deepEqual(tickStep(MIN / 4), { tick: 5 * MIN, label: 30 * MIN });
  assert.equal(tickStep(10 * MIN).label, DAY);
  assert.equal(snapStep(MIN / 2), 5 * MIN);
  assert.equal(snapStep(20 * MIN), 3 * HOUR);
  assert.equal(snapStep(MIN, false), DAY);
  const t = new Date(2026, 10, 3, 10, 7).getTime();
  assert.equal(new Date(snap(t, 15 * MIN)).getMinutes(), 0);
  assert.equal(new Date(snap(new Date(2026, 10, 3, 14).getTime(), DAY)).getDate(), 4);
  let w = { x: 0 };
  w = wobble(w, 10, 0); w = wobble(w, 20, 50); w = wobble(w, 12, 100); assert.equal(w.zoomIn, false, 'one turn is just a correction');
  w = wobble(w, 25, 300); assert.equal(w.zoomIn, true, 'a second quick turn zooms in');
  w = wobble(w, 30, 350); w = wobble(w, 20, 2000); assert.equal(w.zoomIn, false, 'slow turns do not');
});
