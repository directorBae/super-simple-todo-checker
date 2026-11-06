// The schedule card's math (desktop/web and phone): a to-do's span as two instants, back to its fields, and the
// timeline banner's scale — which ticks to draw and how finely a handle snaps at a given zoom. Pure and tested.
export const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const pad = (n) => String(n).padStart(2, '0');
const parseDay = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
export const dayOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const timeOf = (ms) => { const d = new Date(ms); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const at = (day, hhmm) => { const [h, m] = (hhmm || '00:00').split(':').map(Number); return parseDay(day) + h * HOUR + m * MIN; };

// The span as instants. Untimed: whole days (start of the first day → end of the last). Timed without an end: an hour.
export function toRange(t, fallbackDay) {
  const day = t.date || fallbackDay, last = t.endDate && t.endDate > day ? t.endDate : day;
  const timed = !!(t.startTime || t.endTime);
  if (!timed) return { start: parseDay(day), end: parseDay(last) + DAY, timed: false };
  const start = at(day, t.startTime || '09:00');
  let end = t.endTime ? at(last, t.endTime) : start + HOUR;
  if (end <= start) end = last > day ? end : end + DAY; // 22:00–02:00 on one day: the next day's 02:00
  return { start, end, timed: true };
}
// Back to fields. An end exactly at midnight belongs to the day before (…–24:00), so no empty part is left over.
export function fromRange({ start, end, timed }) {
  if (!timed) {
    const date = dayOf(start), last = dayOf(Math.max(start, end - 1));
    return { date, endDate: last > date ? last : null, startTime: null, endTime: null };
  }
  const date = dayOf(start), midnight = timeOf(end) === '00:00' && end > start;
  const last = midnight ? dayOf(end - 1) : dayOf(end);
  return { date, endDate: last > date ? last : null, startTime: timeOf(start), endTime: midnight ? '24:00' : timeOf(end) };
}

// Ticks for a zoom (ms per pixel): the step between ticks and between labels, so labels stay ~70px+ apart.
const STEPS = [5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY];
export function tickStep(msPerPx) {
  const tick = STEPS.find((s) => s / msPerPx >= 14) || STEPS.at(-1);
  const label = STEPS.find((s) => s >= tick && s / msPerPx >= 70) || STEPS.at(-1);
  return { tick, label };
}
// How finely a dragged handle snaps: a few pixels' worth, rounded to a sensible step (5 min … a day).
export function snapStep(msPerPx, timed = true) {
  if (!timed) return DAY;
  return [5 * MIN, 15 * MIN, 30 * MIN, HOUR, 3 * HOUR, DAY].find((s) => s / msPerPx >= 6) || DAY;
}
// Rounds to a step in local time (days start at local midnight).
export function snap(ms, step) {
  if (step >= DAY) { const d = new Date(ms + 12 * HOUR); d.setHours(0, 0, 0, 0); return d.getTime(); }
  const d = new Date(ms), base = new Date(d); base.setHours(0, 0, 0, 0);
  return base.getTime() + Math.round((ms - base.getTime()) / step) * step;
}
// The zoom that shows the whole range on `width` px with some room on both sides.
export const fitZoom = (range, width) => Math.max(MIN / 4, (range.end - range.start) / Math.max(80, width * 0.62));
export const ZOOM_MIN = MIN / 6, ZOOM_MAX = 2 * DAY / 100;
export const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
// A tick's label: the date at midnight, the time otherwise.
export function tickLabel(ms) {
  const d = new Date(ms);
  return d.getHours() === 0 && d.getMinutes() === 0 ? `${d.getMonth() + 1}/${d.getDate()}` : timeOf(ms);
}
// The handle being dragged back and forth quickly means "let me find this exactly": each quick turn zooms in.
export function wobble(state, x, now) {
  const dir = Math.sign(x - (state.x ?? x));
  let turns = state.turns || 0, zoomIn = false;
  if (dir && state.dir && dir !== state.dir) {
    turns = now - (state.lastTurn || 0) < 700 ? turns + 1 : 1;
    zoomIn = turns >= 2;
    return { x, dir, turns: zoomIn ? 0 : turns, lastTurn: now, zoomIn };
  }
  return { ...state, x, dir: dir || state.dir, zoomIn: false };
}
