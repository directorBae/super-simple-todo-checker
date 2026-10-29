'use strict';
/*
 * Repeating to-dos, shared by the desktop app, the web server and the phone.
 *
 * A repeating to-do carries `repeat: { every, unit, start, at }` (every n days / weeks / months / years from `start`,
 * set at time `at`) and a `seriesId`. Each later occurrence is an ordinary to-do in the same series, made ahead of
 * time by plan(). Its id (`<seriesId>@<date>`) and its timestamps (`at`) come from the rule alone, so every device
 * that makes it makes the same row — two devices never double it, and any real edit (newer than `at`) wins.
 * A deleted occurrence leaves a tombstone, so it is not made again.
 *
 * Turning repeat off (or changing it) on one occurrence deletes the occurrences after it that are not done yet and
 * clears the rule on the ones before it; a changed rule starts a new series from that day.
 */
const UNITS = ['day', 'week', 'month', 'year'];
const UNIT_LABELS = { day: '일', week: '주', month: '개월', year: '년' };
// How far ahead occurrences are made (at least the next one is always there, however far).
const HORIZON_DAYS = 62;
const MAX_PER_SERIES = 120;

const pad = (n) => String(n).padStart(2, '0');
const parse = (date) => { const [y, m, d] = date.split('-').map(Number); return { y, m, d }; };
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
function addDays(date, n) {
  const { y, m, d } = parse(date), t = new Date(Date.UTC(y, m - 1, d + n));
  return iso(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}
const daysBetween = (a, b) => { const p = parse(a), q = parse(b); return Math.round((Date.UTC(q.y, q.m - 1, q.d) - Date.UTC(p.y, p.m - 1, p.d)) / 86400000); };

function cleanRule(rule) {
  if (!rule || typeof rule !== 'object') return null;
  const every = Math.floor(Number(rule.every));
  if (!UNITS.includes(rule.unit) || !(every >= 1 && every <= 999)) return null;
  return { every, unit: rule.unit };
}
const active = (t) => !!(t && t.repeat && cleanRule(t.repeat) && /^\d{4}-\d{2}-\d{2}$/.test(t.repeat.start || '') && t.seriesId);

// The k-th date of a rule (k = 0 is the start). Months and years keep the start's day, or the month's last day.
function occurrence(rule, k) {
  const n = k * rule.every;
  if (rule.unit === 'day') return addDays(rule.start, n);
  if (rule.unit === 'week') return addDays(rule.start, 7 * n);
  const { y, m, d } = parse(rule.start);
  const months = rule.unit === 'month' ? n : 12 * n, total = (m - 1) + months, ny = y + Math.floor(total / 12), nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysIn(ny, nm)));
}
// A safe number of steps to skip to get near today without walking every one (never past it: months count as 31 days).
function stepsBefore(rule, days) {
  const per = { day: 1, week: 7, month: 31, year: 366 }[rule.unit] * rule.every;
  return Math.max(0, Math.floor(days / per) - 1);
}

// "매 2주", "매일", "매년" …
function describe(rule) {
  const r = cleanRule(rule);
  if (!r) return '';
  if (r.every === 1) return { day: '매일', week: '매주', month: '매달', year: '매년' }[r.unit];
  return `${r.every}${UNIT_LABELS[r.unit]}마다`;
}

/* The occurrences still to make, as new to-dos. `today` is 'YYYY-MM-DD'; tombstones are { coll, id }. */
function plan(todos, tombstones = [], today) {
  const have = new Set(todos.map((t) => t.id));
  const gone = new Set((tombstones || []).filter((t) => t.coll === 'todos').map((t) => t.id));
  const series = new Map();
  for (const t of todos) {
    if (!active(t)) continue;
    const s = series.get(t.seriesId);
    // The member whose rule was set last speaks for the series (normally they all agree).
    if (!s || t.repeat.at > s.repeat.at || (t.repeat.at === s.repeat.at && t.date === t.repeat.start)) series.set(t.seriesId, t);
  }
  const horizon = addDays(today, HORIZON_DAYS), out = [];
  for (const [seriesId, model] of series) {
    const rule = { ...cleanRule(model.repeat), start: model.repeat.start }, at = Number(model.repeat.at) || 0;
    const from = rule.start > today ? rule.start : today;
    let k = stepsBefore(rule, daysBetween(rule.start, from)), made = 0, future = false;
    for (let guard = 0; guard < 5000 && made < MAX_PER_SERIES; guard++, k++) {
      const date = occurrence(rule, k);
      if (date < from || date === rule.start) continue;
      if (date > horizon && future) break;
      if (date > today) future = true;
      const id = `${seriesId}@${date}`;
      if (have.has(id) || gone.has(id)) continue;
      const span = model.endDate && model.date ? daysBetween(model.date, model.endDate) : null;
      out.push({
        id, kind: 'todo', origin: { type: 'app' }, seriesId, repeat: { ...model.repeat },
        title: model.title, notes: model.notes || '', date, endDate: span ? addDays(date, span) : null,
        startTime: model.startTime || null, endTime: model.endTime || null, timeZone: model.timeZone || null,
        teamId: model.teamId || null, projectId: model.projectId || null, important: model.important || false,
        status: 'todo', completedAt: null, createdAt: at, updatedAt: at,
      });
      have.add(id); made++;
    }
  }
  return out;
}

/*
 * Turn repeat on (rule) or off (null) for one to-do. Returns { changed, removed }: the to-dos to save (new copies,
 * stamped `now`) and the ids to delete. The to-do must have a date.
 */
function setRepeat(todos, id, rule, now = Date.now()) {
  const t = todos.find((x) => x.id === id);
  const r = rule === null ? null : cleanRule(rule);
  if (!t || !t.date || (rule !== null && !r)) return { changed: [], removed: [] };
  const members = t.seriesId ? todos.filter((x) => x.seriesId === t.seriesId && x.id !== t.id) : [];
  const removed = members.filter((x) => x.date > t.date && x.status !== 'done').map((x) => x.id);
  const changed = members.filter((x) => !removed.includes(x.id) && x.repeat).map((x) => ({ ...x, repeat: null, updatedAt: now }));
  const seriesId = r ? `${t.id.split('@')[0]}.${now.toString(36)}` : t.seriesId || null;
  changed.push({ ...t, repeat: r ? { ...r, start: t.date, at: now } : null, seriesId, updatedAt: now });
  return { changed, removed };
}

module.exports = { UNITS, UNIT_LABELS, HORIZON_DAYS, cleanRule, occurrence, describe, plan, setRepeat, addDays };
