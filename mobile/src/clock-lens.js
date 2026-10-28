// Clock lens geometry for the phone (screens/ClockDrawer.js), after the desktop's focus/clock-lens.js:
// a glass torus slice reaching past the dial (a little further than desktop's 1.24: the phone dial is small) that shows ±35 minutes around the finger over its 70° of arc.
// Pure functions only (no React Native imports) so they run under `node --test` and in the look preview.
// Radii are in units of the dial radius R (1 = rim); angles are degrees clockwise from 12.

export const LENS = {
  inner: 0.42, outer: 1.32, span: 70, zoom: 2,
  track: 0.74,              // dashed time track where the to-do dots sit (far out, so dots 5 minutes apart stay apart)
  fisheye: 0.35,            // 0 = flat 2× spread; more = bigger in the middle, squeezed at the ends (convex glass)
  tickIn: 1.0, tickInMinor: 1.045, tickOut: 1.13, times: 1.225,
};
export const PILL = { pad: 7, padRight: 10, bar: 3.5, gap: 6, timeSize: 11, titleSize: 12.5, height: 26, titleChars: 28 };

const rad = (deg) => (deg * Math.PI) / 180;
const pad2 = (n) => String(n).padStart(2, '0');
const f1 = (v) => (Math.round(v * 10) / 10).toString();
const pt = (p) => `${f1(p[0])} ${f1(p[1])}`;

// Smallest signed difference between two angles in degrees, in [-180, 180).
export const angleGap = (a, b) => ((((a - b) % 360) + 540) % 360) - 180;
// Where a time ("HH:MM") sits on a 12-hour face.
export const timeAngle = (time) => ((Number(time.slice(0, 2)) % 12) * 60 + Number(time.slice(3, 5))) / 2;
export const halfOf = (time) => Math.floor(Number(time.slice(0, 2)) / 12);
// Is a dial angle inside the lens' time window (±35 minutes)?
export const inWindow = (dialDeg, centre) => Math.abs(angleGap(dialDeg, centre)) <= LENS.span / 2 / LENS.zoom;
// Dial angle → angle on the lens. 2× spread with a slight convex bulge: the middle is magnified a little more
// and the ends are squeezed, the way things look near the edge of a thick lens. Monotonic, ends stay at ±35°.
export function lensAngle(dialDeg, centre, k = LENS.fisheye) {
  const half = LENS.span / 2, u = Math.max(-1, Math.min(1, (angleGap(dialDeg, centre) * LENS.zoom) / half));
  return centre + ((1 - k) * u + k * Math.sin((u * Math.PI) / 2)) * half;
}
// Point at (deg, r) around a dial of radius R centred at (c, c + dy), in pixels.
export const at = (c, R, deg, r, dy = 0) => [c + R * r * Math.sin(rad(deg)), c + dy - R * r * Math.cos(rad(deg))];

// Outline of the slice: a piece of ring cut along the radius, corners softly rounded (as on desktop).
export function lensPath(c, R, angle, dy = 0) {
  const round = R * 0.08, ro = R * LENS.outer, ri = R * LENS.inner, a0 = angle - LENS.span / 2, a1 = angle + LENS.span / 2;
  const dOut = (round / ro) * 180 / Math.PI, dIn = (round / ri) * 180 / Math.PI, inward = round / R, p = (deg, r) => pt(at(c, R, deg, r, dy));
  return `M${p(a0 + dOut, LENS.outer)}A${f1(ro)} ${f1(ro)} 0 0 1 ${p(a1 - dOut, LENS.outer)}`
    + `Q${p(a1, LENS.outer)} ${p(a1, LENS.outer - inward)}L${p(a1, LENS.inner + inward)}Q${p(a1, LENS.inner)} ${p(a1 - dIn, LENS.inner)}`
    + `A${f1(ri)} ${f1(ri)} 0 0 0 ${p(a0 + dIn, LENS.inner)}Q${p(a0, LENS.inner)} ${p(a0, LENS.inner + inward)}`
    + `L${p(a0, LENS.outer - inward)}Q${p(a0, LENS.outer)} ${p(a0 + dOut, LENS.outer)}Z`;
}
// An arc along the slice at radius r (crest highlight, time track), `trim` degrees short at both ends.
export function arcPath(c, R, angle, r, trim = 0, from = -LENS.span / 2, to = LENS.span / 2) {
  const a0 = angle + from + trim, a1 = angle + to - trim, large = a1 - a0 > 180 ? 1 : 0;
  return `M${pt(at(c, R, a0, r))}A${f1(R * r)} ${f1(R * r)} 0 ${large} 1 ${pt(at(c, R, a1, r))}`;
}

// The angle the finger points at. Very near the centre the angle swings wildly, so the last one is kept there.
export function aimAngle(dx, dy, R, prev = null) {
  if (prev != null && Math.hypot(dx, dy) < R * 0.14) return prev;
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}
// Minutes on a 12-hour face (any integer, wraps) → "HH:MM" in the given half (0 오전, 1 오후).
export const clockLabel = (minutes, half) => { const v = ((Math.round(minutes) % 720) + 720) % 720 + half * 720; return `${pad2(Math.floor(v / 60))}:${pad2(v % 60)}`; };
// Minute ruler under the lens: one tick every 5 minutes, a time every 15.
export function lensTicks(angle, half) {
  const centre = angle * 2, w = LENS.span / LENS.zoom, first = Math.ceil((centre - w - 1e-9) / 5) * 5, out = [];
  for (let mm = first; mm <= centre + w + 1e-9; mm += 5) out.push({ mm, deg: lensAngle(mm / 2, angle), major: mm % 15 === 0, label: clockLabel(mm, half) });
  return out;
}
export const rangeLabel = (angle, half) => `${clockLabel(angle * 2 - LENS.span / LENS.zoom, half)} – ${clockLabel(angle * 2 + LENS.span / LENS.zoom, half)}`;

// Desktop's compactTitle: one line, at most `limit` characters.
export function compactTitle(value, limit = PILL.titleChars) {
  const chars = Array.from(String(value || '').replace(/\s+/g, ' ').trim());
  return chars.length <= limit ? chars.join('') : chars.slice(0, limit - 1).join('').trimEnd() + '…';
}
// Rough Pretendard advance widths, used only until the real pill has been measured on screen.
export function textWidth(text, size, bold = false) {
  let em = 0;
  for (const ch of Array.from(String(text))) {
    const c = ch.codePointAt(0);
    if ((c >= 0xac00 && c <= 0xd7a3) || (c >= 0x3130 && c <= 0x318f) || (c >= 0x4e00 && c <= 0x9fff)) em += 0.92;
    else if (c > 0x2000) em += c > 0xffff ? 1.2 : 0.9;
    else if (/[0-9]/.test(ch)) em += 0.6;
    else if (/[A-Z]/.test(ch)) em += 0.66;
    else if (/[a-z]/.test(ch)) em += 0.53;
    else if (ch === ' ') em += 0.26;
    else if (/[:.,'|!ijl]/.test(ch)) em += 0.28;
    else em += 0.5;
  }
  return em * size * (bold ? 1.04 : 1);
}
export function estimatePill(time, title, max = 240) {
  const w = PILL.bar + PILL.pad + textWidth(time, PILL.timeSize, true) + PILL.gap + textWidth(compactTitle(title), PILL.titleSize) + PILL.padRight;
  return { w: Math.ceil(Math.min(max, w)), h: PILL.height };
}

// --- Pill placement --------------------------------------------------------------------------------------
const overlap = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
const grow = (r, g) => ({ x: r.x - g, y: r.y - g, w: r.w + 2 * g, h: r.h + 2 * g });
export function clampRect(r, b) {
  const x = b ? Math.min(Math.max(r.x, b.minX), Math.max(b.minX, b.maxX - r.w)) : r.x;
  const y = b ? Math.min(Math.max(r.y, b.minY), Math.max(b.minY, b.maxY - r.h)) : r.y;
  return { ...r, x, y };
}
// Do segments ab and cd cross (touching ends do not count)?
export function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
// Does segment ab pass through the inside of rectangle r (sampled; leads are short)?
export function segmentHitsRect(a, b, r, inset = 2) {
  for (let i = 1; i < 16; i++) {
    const x = a[0] + ((b[0] - a[0]) * i) / 16, y = a[1] + ((b[1] - a[1]) * i) / 16;
    if (x > r.x + inset && x < r.x + r.w - inset && y > r.y + inset && y < r.y + r.h - inset) return true;
  }
  return false;
}
// Closest point of a rectangle to p: where a lead line from the dot meets its pill.
export const nearestOnRect = (r, p) => [Math.min(Math.max(p[0], r.x), r.x + r.w), Math.min(Math.max(p[1], r.y), r.y + r.h)];
// Stack rectangles (already in order) top to bottom near their wanted y, at least `gap` apart, inside [minY, maxY].
export function packColumn(wanted, heights, gap, minY = -Infinity, maxY = Infinity) {
  const y = wanted.map((v) => v);
  for (let i = 0; i < y.length; i++) y[i] = Math.max(y[i], i ? y[i - 1] + heights[i - 1] + gap : minY);
  for (let i = y.length - 1; i >= 0; i--) y[i] = Math.min(y[i], i < y.length - 1 ? y[i + 1] - gap - heights[i] : maxY - heights[i]);
  for (let i = 0; i < y.length; i++) y[i] = Math.max(y[i], i ? y[i - 1] + heights[i - 1] + gap : minY);
  return y;
}
function* permutations(list) {
  if (list.length <= 1) { yield list; return; }
  for (let i = 0; i < list.length; i++) for (const rest of permutations([...list.slice(0, i), ...list.slice(i + 1)])) yield [list[i], ...rest];
}
// Pills as a tidy column — beside the dots (right or left, close in or past the finger), or above or below them —
// with each lead line from a dot to its own pill. Every candidate column is scored (on screen, clear of the finger,
// the dots and each other, no lead crossing another lead or running under a pill, short leads) and the best kept.
// The pills go in the dots' top-to-bottom order; only if that tangles are other orders tried (≤ 5 pills).
// items: [{ id, deg (lens angle), w, h }]; finger: the finger and thumb; obstacles: other things to keep clear.
export function layoutPills(items, { c, R, bounds = null, obstacles = [], finger = null, gap = 4 }) {
  if (!items.length) return [];
  const list = items.map((t) => ({ ...t, dot: at(c, R, t.deg, LENS.track) })).sort((a, b) => a.dot[1] - b.dot[1] || a.deg - b.deg);
  const dots = list.map((t) => ({ x: t.dot[0] - 6, y: t.dot[1] - 6, w: 12, h: 12 }));
  const xs = list.map((t) => t.dot[0]), ys = list.map((t) => t.dot[1]);
  const right = Math.max(...xs) + 16, left = Math.min(...xs) - 16, mid = (Math.max(...xs) + Math.min(...xs)) / 2, top = Math.min(...ys) - 12, bottom = Math.max(...ys) + 12;
  const b = bounds || { minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity };
  const bands = { around: [b.minY, b.maxY], above: [b.minY, top], below: [bottom, b.maxY] };
  const columns = [];
  for (const out of [0, 24, 48]) for (const band of ['around', 'above', 'below']) {
    columns.push({ x: (w) => right + out, band }, { x: (w) => left - out - w, band });
    if (finger) columns.push({ x: (w) => Math.max(right, finger.x + finger.w + 8) + out, band }, { x: (w) => Math.min(left, finger.x - 8) - out - w, band });
  }
  columns.push({ x: (w) => mid - w / 2, band: 'above' }, { x: (w) => mid - w / 2, band: 'below' });
  const lay = (order, col) => {
    const [lo, hi] = bands[col.band], pys = packColumn(order.map((t) => t.dot[1] - t.h / 2), order.map((t) => t.h), gap, lo, hi);
    const placed = order.map((t, i) => {
      const r = clampRect({ x: col.x(t.w), y: pys[i], w: t.w, h: t.h }, b);
      return { id: t.id, x: r.x, y: r.y, w: t.w, h: t.h, dot: t.dot, lead: nearestOnRect(r, t.dot) };
    });
    let score = 0, tangles = 0;
    placed.forEach((p, i) => {
      score += obstacles.reduce((s, o) => s + overlap(p, o), 0) * 10 + (finger ? overlap(p, finger) * 20 : 0) + dots.reduce((s, d) => s + overlap(p, d), 0) * 20 + Math.hypot(p.lead[0] - p.dot[0], p.lead[1] - p.dot[1]);
      for (let j = 0; j < i; j++) {
        const q = placed[j];
        score += overlap(grow(p, gap / 2), q) * 40;
        if (segmentsCross(p.dot, p.lead, q.dot, q.lead) || segmentHitsRect(p.dot, p.lead, q) || segmentHitsRect(q.dot, q.lead, p)) tangles++;
      }
    });
    return { score: score + tangles * 2500, tangles, placed };
  };
  // Runs on every frame of a moving finger: other orders are tried only for the few most promising columns.
  // Near 12 or 6 o'clock the dots run sideways, so left-to-right (or right-to-left) order is tried as well.
  const byX = [...list].sort((p, q) => p.dot[0] - q.dot[0]), orders = [list, byX, [...byX].reverse()];
  const ranked = columns.map((col) => orders.map((o) => ({ col, ...lay(o, col) })).reduce((p, q) => (q.score < p.score ? q : p))).sort((p, q) => p.score - q.score);
  let best = ranked[0];
  if (best.tangles && list.length <= 5) for (const { col, tangles } of ranked.slice(0, 4)) {
    if (!tangles) continue;
    for (const order of permutations(list)) { const next = lay(order, col); if (next.score < best.score) best = next; }
  }
  return best.placed;
}

// Everything the lens shows besides the glass, for a dial of `size` px: the layer is a square `box` dial radii
// from the centre each way, at (-shift, -shift) in the dial's frame. `bounds` (screen room) and `finger` are in the
// dial's frame; `sizes(todo)` gives each pill's { w, h } (measured on screen, or estimatePill).
export const LENS_BOX = 1.6;
export function lensScene({ size, angle, half, todos, sizes, bounds = null, finger = null }) {
  const R = size / 2, c = R * LENS_BOX, shift = c - R;
  const ticks = lensTicks(angle, half);
  const times = ticks.filter((k) => k.major).map((k) => { const [x, y] = at(c, R, k.deg, LENS.times); return { key: k.mm, label: k.label, x: x - 26, y: y - 8, w: 52, h: 16 }; });
  const inLens = todos.filter((t) => inWindow(timeAngle(t.startTime), angle)).map((t) => ({ ...t, deg: lensAngle(timeAngle(t.startTime), angle), ...sizes(t) }));
  const box = bounds && { minX: bounds.minX + shift, maxX: bounds.maxX + shift, minY: bounds.minY + shift, maxY: bounds.maxY + shift };
  // Keep clear: the ruler's times, and the finger with the thumb below it.
  const obstacles = times.map((t) => ({ ...t, x: t.x + 10, w: t.w - 20 }));
  const fingerBox = finger && { x: finger.x + shift - 26, y: finger.y + shift - 30, w: 52, h: 96 };
  const byId = Object.fromEntries(inLens.map((t) => [t.id, t]));
  const pills = layoutPills(inLens, { c, R, bounds: box, obstacles, finger: fingerBox }).map((p) => ({ ...p, todo: byId[p.id] }));
  // The window label sits on the dial's hub (the slice never covers the centre), or just above or below it if a pill is there.
  const hubAt = (dy) => ({ x: c - 56, y: c - 14 + dy, w: 112, h: 28 });
  const hub = [0, 34, -34, 68, -68].map(hubAt).find((h) => !pills.some((p) => overlap(grow(h, 2), p))) || hubAt(0);
  return { R, c, shift, ticks, times, hub, range: rangeLabel(angle, half), pills, empty: !inLens.length };
}

// --- The glass itself, as plain shape data drawn by react-native-svg (and by the look preview) -------------
// Gradients and clips are in user space of an SVG whose dial centre is at (c, c).
export function lensGlass(c, R, angle, accent = '#6366f1', id = 'lens') {
  const shape = lensPath(c, R, angle), box = 2 * c;
  const ro = LENS.outer, s = (r) => r / ro; // radial stop for a radius
  const defs = [
    { type: 'radial', id: `${id}-body`, cx: c, cy: c, r: R * ro, stops: [
      [s(LENS.inner), '#ffffff', 0.97], [s(LENS.inner + 0.035), '#eef0ff', 0.86], [s(LENS.inner + 0.1), '#ffffff', 0.84],
      [s(0.98), '#ffffff', 0.84], [s(1.02), '#f7f8ff', 0.8], [s(ro - 0.06), '#e7eaff', 0.82], [s(ro - 0.02), '#ffffff', 0.96], [1, '#ffffff', 0.7],
    ] },
    // Light from the top left: a bright wash fading out, a faint cool shade at the far side.
    { type: 'linear', id: `${id}-light`, x1: c - R * ro, y1: c - R * ro, x2: c + R * ro, y2: c + R * ro, stops: [[0, '#ffffff', 0.55], [0.45, '#ffffff', 0.05], [1, '#312e81', 0.08]] },
    { type: 'linear', id: `${id}-rim`, x1: c - R * ro, y1: c - R * ro, x2: c + R * ro, y2: c + R * ro, stops: [[0, '#ffffff', 1], [0.45, '#ffffff', 0.4], [1, '#ffffff', 0.9]] },
    { type: 'clip', id: `${id}-in`, d: shape },
    { type: 'clip', id: `${id}-out`, d: `M0 0H${f1(box)}V${f1(box)}H0Z${shape}`, rule: 'evenodd' },
  ];
  const shadow = (dy, width, op) => ({ d: lensPath(c, R, angle, R * dy), fill: '#0b1030', fillOpacity: op, stroke: '#0b1030', strokeOpacity: op * 0.7, strokeWidth: R * width, strokeLinejoin: 'round', clip: `${id}-out` });
  const layers = [
    // Soft drop shadow below the glass, only outside it (the glass is translucent).
    shadow(0.1, 0.2, 0.025), shadow(0.07, 0.11, 0.04), shadow(0.04, 0.05, 0.06),
    { d: shape, fill: `url(#${id}-body)` },
    { d: shape, fill: `url(#${id}-light)` },
    // Thick-glass edge: a bright inner glow that fades inward.
    { d: shape, fill: 'none', stroke: '#ffffff', strokeOpacity: 0.16, strokeWidth: R * 0.16, clip: `${id}-in` },
    { d: shape, fill: 'none', stroke: '#ffffff', strokeOpacity: 0.24, strokeWidth: R * 0.08, clip: `${id}-in` },
    { d: shape, fill: 'none', stroke: '#ffffff', strokeOpacity: 0.6, strokeWidth: R * 0.028, clip: `${id}-in` },
    // Refraction bands just inside the outer and inner rims, tinted with the accent.
    { d: arcPath(c, R, angle, ro - 0.045, 3), fill: 'none', stroke: accent, strokeOpacity: 0.12, strokeWidth: R * 0.03, clip: `${id}-in` },
    { d: arcPath(c, R, angle, LENS.inner + 0.035, 5), fill: 'none', stroke: accent, strokeOpacity: 0.09, strokeWidth: R * 0.022, clip: `${id}-in` },
    // Edge: a dark hairline outside, a light-catching rim on top.
    { d: shape, fill: 'none', stroke: '#1b2140', strokeOpacity: 0.16, strokeWidth: 2.2 },
    { d: shape, fill: 'none', stroke: `url(#${id}-rim)`, strokeWidth: 1.4 },
    // Specular crest along the outer arc (strongest toward the lit end) and a faint one on the inner arc.
    { d: arcPath(c, R, angle, ro - 0.075, 9), fill: 'none', stroke: '#ffffff', strokeOpacity: 0.32, strokeWidth: R * 0.05, strokeLinecap: 'round' },
    { d: arcPath(c, R, angle, ro - 0.075, 9), fill: 'none', stroke: '#ffffff', strokeOpacity: 0.95, strokeWidth: 1.8, strokeLinecap: 'round' },
    { d: arcPath(c, R, angle, LENS.inner + 0.05, 12), fill: 'none', stroke: '#ffffff', strokeOpacity: 0.7, strokeWidth: 1.1, strokeLinecap: 'round' },
    // Dashed time track the to-do dots sit on.
    { d: arcPath(c, R, angle, LENS.track, 4), fill: 'none', stroke: accent, strokeOpacity: 0.28, strokeWidth: 2, strokeDasharray: '2 5', strokeLinecap: 'round' },
  ];
  return { defs, layers };
}
