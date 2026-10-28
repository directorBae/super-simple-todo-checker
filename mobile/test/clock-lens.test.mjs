import test from 'node:test';
import assert from 'node:assert/strict';
import { LENS, LENS_BOX, aimAngle, lensScene, packColumn, segmentsCross, angleGap, arcPath, at, clampRect, clockLabel, compactTitle, estimatePill, inWindow, layoutPills, lensAngle, lensGlass, lensPath, lensTicks, rangeLabel, textWidth, timeAngle } from '../src/clock-lens.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const overlaps = (a, b) => Math.min(a.x + a.w, b.x + b.w) > Math.max(a.x, b.x) && Math.min(a.y + a.h, b.y + b.h) > Math.max(a.y, b.y);

test('angles wrap around 12 o\'clock', () => {
  assert.equal(angleGap(350, 10), -20);
  assert.equal(angleGap(10, 350), 20);
  assert.equal(angleGap(-30, 300), 30);
  assert.equal(timeAngle('03:00'), 90);
  assert.equal(timeAngle('15:30'), 105);
  assert.ok(inWindow(timeAngle('11:50'), timeAngle('00:20')));   // 30 minutes apart across 12
  assert.ok(!inWindow(timeAngle('11:00'), timeAngle('00:00')));
});

test('lens spreads ±35 minutes over 70°, bulging in the middle and squeezed at the ends', () => {
  close(lensAngle(100, 100), 100);
  close(lensAngle(100 + 17.5, 100), 100 + 35);
  close(lensAngle(100 - 17.5, 100), 100 - 35);
  { const u = 20 / 35; close(lensAngle(5, 355), 355 + ((1 - LENS.fisheye) * u + LENS.fisheye * Math.sin(u * Math.PI / 2)) * 35); }
  // centre slope > 2 (magnified more), edge slope < 2 (squeezed)
  const slope = (x) => (lensAngle(100 + x + 0.01, 100) - lensAngle(100 + x, 100)) / 0.01;
  assert.ok(slope(0) > 2.1 && slope(17) < 1.6);
  // monotonic across the window, flat (clamped) beyond it
  let last = -Infinity;
  for (let g = -17.5; g <= 17.5; g += 0.5) { const v = lensAngle(200 + g, 200); assert.ok(v > last); last = v; }
  close(lensAngle(200 + 30, 200), 235);
  close(lensAngle(10, 0, 0), 20); // flat: exactly 2×
});

test('finger angle: clockwise from 12, steady near the centre', () => {
  close(aimAngle(0, -50, 100), 0);
  close(aimAngle(50, 0, 100), 90);
  close(aimAngle(0, 50, 100), 180);
  close(aimAngle(-50, 0, 100), 270);
  assert.equal(aimAngle(3, 4, 100, 123), 123);   // within the dead zone the last angle is kept
  close(aimAngle(3, 4, 100), (Math.atan2(3, -4) * 180 / Math.PI + 360) % 360); // no previous: use it anyway
  close(aimAngle(140, 0, 100, 10), 90);          // past the rim the lens still follows
});

test('ruler: a tick every 5 minutes, labels every 15, in the right half', () => {
  const ticks = lensTicks(timeAngle('09:00'), 0);
  assert.equal(ticks.length, 15);
  assert.equal(ticks[0].label, '08:25');
  assert.equal(ticks.at(-1).label, '09:35');
  assert.deepEqual(ticks.filter((t) => t.major).map((t) => t.label), ['08:30', '08:45', '09:00', '09:15', '09:30']);
  assert.equal(lensTicks(0, 1)[0].label, '23:25'); // wraps below 12 o'clock in the 오후 dial
  assert.equal(clockLabel(-5, 1), '23:55');
  assert.equal(clockLabel(725, 0), '00:05');
  assert.equal(rangeLabel(timeAngle('09:00'), 0), '08:25 – 09:35');
  assert.equal(rangeLabel(timeAngle('21:00'), 1), '20:25 – 21:35');
});

test('slice outline and arcs are well-formed paths', () => {
  const d = lensPath(150, 100, 30);
  assert.match(d, /^M[\d.\- ]+A/);
  assert.ok(d.endsWith('Z'));
  assert.ok(!/NaN|Infinity/.test(d));
  const [x, y] = at(150, 100, 90, 1);
  close(x, 250); close(y, 150);
  assert.ok(!/NaN/.test(arcPath(150, 100, 30, 0.64, 4)));
  const glass = lensGlass(150, 100, 30);
  assert.ok(glass.layers.length > 8);
  assert.ok(glass.defs.some((g) => g.type === 'clip' && g.rule === 'evenodd'));
  for (const l of glass.layers) assert.ok(!/NaN/.test(l.d));
  // radial stops ascend
  const stops = glass.defs.find((g) => g.type === 'radial').stops.map((s) => s[0]);
  assert.deepEqual([...stops].sort((a, b) => a - b), stops);
  assert.ok(stops[0] > 0 && stops.at(-1) === 1);
});

test('titles stay on one line and pill sizes are sensible', () => {
  assert.equal(compactTitle('  주간   회의  '), '주간 회의');
  const long = '가'.repeat(40);
  assert.equal(Array.from(compactTitle(long)).length, 28);
  assert.ok(compactTitle(long).endsWith('…'));
  assert.ok(textWidth('회의', 10) > textWidth('ab', 10));
  const p = estimatePill('09:30', '주간 회의');
  assert.ok(p.w > 80 && p.w < 140, String(p.w));
  assert.equal(estimatePill('09:30', long, 200).w, 200);
});

test('clamping keeps a rectangle inside the bounds', () => {
  const b = { minX: 0, maxX: 100, minY: 0, maxY: 50 };
  assert.deepEqual(clampRect({ x: 90, y: -5, w: 30, h: 10 }, b), { x: 70, y: 0, w: 30, h: 10 });
  assert.deepEqual(clampRect({ x: -9, y: 45, w: 30, h: 10 }, b), { x: 0, y: 40, w: 30, h: 10 });
  assert.deepEqual(clampRect({ x: 5, y: 5, w: 300, h: 10 }, b), { x: 0, y: 5, w: 300, h: 10 }); // wider than the room: pinned left
});

test('pills never overlap each other or tangle their leads, stay on screen and (unless crowded) clear the finger', () => {
  const R = 125, c = R * 1.5, side = 70;
  const bounds = { minX: -side + 8 + (c - R), maxX: 2 * R + side - 8 + (c - R), minY: 0, maxY: 2 * c + 80 };
  for (let centre = 0; centre < 360; centre += 15) for (const reach of [0.6, 0.85]) for (const n of [1, 3, 5]) {
    // up to five to-dos crowded into the window, some only 5 minutes apart
    const items = [-30, -10, -5, 0, 20].slice(0, n).map((m, i) => ({ id: 't' + i, deg: lensAngle(centre + m / 2, centre), w: 150 + i * 10, h: 26 }));
    const finger = at(c, R, centre, reach), fingerBox = { x: finger[0] - 26, y: finger[1] - 30, w: 52, h: 96 };
    const placed = layoutPills(items, { c, R, bounds, finger: fingerBox });
    assert.equal(placed.length, items.length);
    for (const p of placed) {
      assert.ok(p.x >= bounds.minX - 1e-6 && p.x + p.w <= bounds.maxX + 1e-6, `centre ${centre}: ${p.id} off screen`);
      assert.ok(p.y >= bounds.minY - 1e-6 && p.y + p.h <= bounds.maxY + 1e-6);
      if (n <= 3) assert.ok(!overlaps(p, fingerBox), `centre ${centre}: ${p.id} under the finger`);
      // the lead line ends on the pill
      assert.ok(p.lead[0] >= p.x - 1e-6 && p.lead[0] <= p.x + p.w + 1e-6 && p.lead[1] >= p.y - 1e-6 && p.lead[1] <= p.y + p.h + 1e-6);
    }
    for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) {
      assert.ok(!overlaps(placed[i], placed[j]), `centre ${centre}: ${placed[i].id} overlaps ${placed[j].id}`);
      assert.ok(!segmentsCross(placed[i].dot, placed[i].lead, placed[j].dot, placed[j].lead), `centre ${centre}: leads of ${placed[i].id} and ${placed[j].id} cross`);
    }
  }
});

test('a lone pill hangs close to its dot, clear of the finger', () => {
  const R = 125, c = R * 1.5;
  const items = [{ id: 'a', deg: 0, w: 120, h: 26 }];
  const finger = at(c, R, 0, 0.85), fingerBox = { x: finger[0] - 26, y: finger[1] - 30, w: 52, h: 96 };
  const [p] = layoutPills(items, { c, R, finger: fingerBox });
  assert.ok(!overlaps(p, fingerBox));
  assert.ok(Math.hypot(p.lead[0] - p.dot[0], p.lead[1] - p.dot[1]) < R * 0.6);
});

test('column packing keeps order, spacing and bounds', () => {
  assert.deepEqual(packColumn([10, 12, 14], [20, 20, 20], 4), [10, 34, 58]);
  assert.deepEqual(packColumn([90, 95], [20, 20], 4, 0, 100), [56, 80]);   // pushed up from the bottom
  assert.deepEqual(packColumn([-30, 50], [20, 20], 4, 0, 100), [0, 50]);   // pushed down from the top
});

test('lens scene: window label, ruler times, empty state, and the label never under a pill', () => {
  const todos = [{ id: 'a', startTime: '09:40', title: '주간 회의 준비' }, { id: 'b', startTime: '09:55', title: '샘플 발송' }, { id: 'c', startTime: '15:00', title: '오후 일' }];
  const sizes = (t) => estimatePill(t.startTime, t.title);
  const size = 250, angle = timeAngle('09:50');
  const s = lensScene({ size, angle, half: 0, todos: todos.slice(0, 2), sizes, bounds: { minX: -62, maxX: 312, minY: -150, maxY: 500 }, finger: { x: 60, y: 90 } });
  assert.equal(s.c, (size / 2) * LENS_BOX);
  assert.equal(s.range, '09:15 – 10:25');
  assert.deepEqual(s.times.map((t) => t.label), ['09:15', '09:30', '09:45', '10:00', '10:15']);
  assert.equal(s.pills.length, 2);
  assert.equal(s.empty, false);
  for (const p of s.pills) assert.ok(!overlaps(p, s.hub));
  assert.equal(s.pills.find((p) => p.id === 'a').todo.title, '주간 회의 준비');
  const none = lensScene({ size, angle: timeAngle('03:00'), half: 0, todos: todos.slice(0, 2), sizes });
  assert.equal(none.empty, true);
  assert.equal(none.pills.length, 0);
});
