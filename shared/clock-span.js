// The clock's torus arcs (desktop/web ClockWindow and the phone's ClockDrawer): a timed to-do's slice of the day as
// minutes, its pieces on the 오전 (0–720) and 오후 (720–1440) dials, the SVG path of a ring arc, and the drag that
// stretches its end round and round the dial — every full turn is 12 hours, so circling on keeps adding time, into the
// afternoon and on into the next days. Pure and tested.
export const HALF_MIN = 720, DAY_MIN = 1440, STEP_MIN = 5;
export const toMin = (hhmm) => { if (!hhmm) return null; const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

// The part of a to-do shown on a day (multi-day parts come in already sliced): start and end in minutes, end null when
// it only has a start time.
export function slice(v) {
  const s = toMin(v.startTime), e = toMin(v.endTime);
  if (s == null && e == null) return null;
  return { s: s ?? 0, e: e == null ? null : e <= (s ?? 0) && v.endTime !== '24:00' ? DAY_MIN : e };
}
// The piece of [s, e] on one dial (half 0 = 오전, 1 = 오후), in that dial's 0–720 minutes; null if none.
export function onHalf({ s, e }, half) {
  const lo = half * HALF_MIN, hi = lo + HALF_MIN;
  if (e == null) return s >= lo && s < hi ? { a: s - lo, b: null } : null;
  const a = Math.max(s, lo), b = Math.min(e, hi);
  return b > a ? { a: a - lo, b: b - lo } : null;
}
// Minutes on a dial → degrees clockwise from 12 o'clock.
export const degOf = (minutes) => (minutes / HALF_MIN) * 360;
export const pointAt = (cx, cy, r, minutes) => { const a = (degOf(minutes) * Math.PI) / 180; return [cx + Math.sin(a) * r, cy - Math.cos(a) * r]; };
// A ring arc from minute a to minute b on a dial of centre (cx, cy), radius r.
export function arcD(cx, cy, r, a, b) {
  if (b - a >= HALF_MIN - 0.01) { const [x0, y0] = pointAt(cx, cy, r, 0), [x1, y1] = pointAt(cx, cy, r, HALF_MIN / 2); return `M${x0} ${y0} A${r} ${r} 0 1 1 ${x1} ${y1} A${r} ${r} 0 1 1 ${x0} ${y0}`; }
  const [x0, y0] = pointAt(cx, cy, r, a), [x1, y1] = pointAt(cx, cy, r, b);
  return `M${x0} ${y0} A${r} ${r} 0 ${b - a > HALF_MIN / 2 ? 1 : 0} 1 ${x1} ${y1}`;
}
// The pointer's angle around a dial's centre, in degrees clockwise from 12.
export const angleAt = (x, y, cx, cy) => ((Math.atan2(x - cx, -(y - cy)) * 180) / Math.PI + 360) % 360;
// Stretching: start with the to-do's end instant and the pointer's angle; each move adds the turned angle (unwrapped,
// so going past 12 keeps counting), 2 minutes per degree, snapped to 5 minutes and never before start + 5 min.
export function stretchStart(endMs, angle) { return { endMs, last: angle, turned: 0 }; }
export function stretchMove(st, angle, startMs) {
  let delta = angle - st.last;
  if (delta > 180) delta -= 360; else if (delta < -180) delta += 360;
  const turned = st.turned + delta, step = STEP_MIN * 60_000;
  const end = Math.max(startMs + step, Math.round((st.endMs + turned * 2 * 60_000) / step) * step);
  return { ...st, last: angle, turned, end };
}
// Where an instant falls for the highlights: which dial (0 오전 / 1 오후) and how many days after `day` (local).
export function placeOf(ms, day) {
  const d = new Date(ms), [y, m, dd] = day.split('-').map(Number), base = new Date(y, m - 1, dd);
  const midnight = d.getHours() === 0 && d.getMinutes() === 0;
  const local = midnight ? new Date(ms - 1) : d; // 24:00 still belongs to the day before, on the 오후 dial
  const days = Math.round((new Date(local.getFullYear(), local.getMonth(), local.getDate()) - base) / 86_400_000);
  return { half: local.getHours() >= 12 ? 1 : 0, days };
}

// The hover lens shows every to-do whose arc runs through it, not only those starting there: each at the point of its
// arc nearest the lens' centre (`centre`: minutes on that dial), labelled with its whole time range.
const hhmm = (m) => { const v = Math.floor(m); return `${String(Math.floor(v / 60) % 24).padStart(2, '0')}:${String(v % 60).padStart(2, '0')}`; };
export function lensItems(parts, half, centre, sliceOf = slice) {
  return parts.map((t) => {
    const sl = sliceOf(t), p = sl && onHalf(sl, half);
    if (!p) return null;
    const anchor = p.b == null ? p.a : Math.min(p.b - 0.5, Math.max(p.a, centre));
    const range = t.span?.allDay ? '종일' : t.endTime ? `${t.startTime || '00:00'}–${t.endTime}` : t.startTime;
    return { ...t, startTime: hhmm(anchor + half * HALF_MIN), label: range + (t.span ? ` · ${t.span.n}일차` : '') };
  }).filter(Boolean);
}
