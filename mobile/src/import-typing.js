// The phone's stand-in for the desktop pet that "writes": what a Notion / Google Calendar job just did to the to-dos is
// played in the day list one change at a time (new lines typed out, changed titles erased back and retyped, moved lines
// leaving their old day for the new one, removed lines erased and folded away, done states ticked), and a rainbow edge
// glows round the screen while the job runs.
// The data is already there; this only decides what to play, in what order, and when. Pure, so node --test can run it.
import { isActive } from './tool-jobs.js';

export const CHAR_MS = 40;        // one character every 40 ms
export const MAX_ANIMATED = 8;    // at most this many lines are typed in one go; the rest simply appear
export const GRACE_MS = 90_000;   // after a job ends, its to-dos may still be on their way in (the next sync round)
export const SLACK_MS = 60_000;   // server clock vs. the job's first look
export const QUICK_MS = 120_000;  // a job that started and ended between two looks: how far back its to-dos may go
const FINISHED = ['done', 'error'];

// Jobs being watched for the to-dos they write. `watch` is kept between polls:
// { first, known: { [jobId]: state }, jobs: { [jobId]: { provider, subscription, from, until } } }
//   from  — server time (ms) before which a to-do cannot be this job's (it was there before the job began)
//   until — local time (ms) after which the job's to-dos are not news any more (Infinity while it runs)
export const newWatch = () => ({ first: true, known: {}, jobs: {} });
export function watchJobs(watch = newWatch(), list = [], now = Date.now()) {
  const known = {}, jobs = { ...watch.jobs }, listed = new Set();
  for (const job of list) {
    known[job.id] = job.state;
    if (job.kind === 'push') continue;
    listed.add(job.id);
    const at = Date.parse(job.updated_at || '') || now, mine = jobs[job.id];
    if (isActive(job, now)) jobs[job.id] = mine ? { ...mine, from: Math.min(mine.from, at - SLACK_MS) } : { provider: job.provider, subscription: job.subscription_id || null, from: at - SLACK_MS, until: Infinity };
    else if (FINISHED.includes(job.state)) {
      if (mine) { if (mine.until === Infinity) jobs[job.id] = { ...mine, until: now + GRACE_MS }; }
      // Started and finished between two looks (not on the very first look: that is old news).
      else if (!watch.first && watch.known[job.id] !== job.state) jobs[job.id] = { provider: job.provider, subscription: job.subscription_id || null, from: at - QUICK_MS, until: now + GRACE_MS };
    }
  }
  for (const [id, job] of Object.entries(jobs)) {
    if (!listed.has(id) && job.until === Infinity) jobs[id] = { ...job, until: now + GRACE_MS }; // dropped off the list
    if (jobs[id].until < now) delete jobs[id];
  }
  return { first: false, known, jobs };
}

const external = (t) => t?.origin?.type === 'external' && !!t.origin.provider;
const jobOf = (watch, t) => Object.values(watch.jobs).find((j) => j.provider === t.origin.provider && (!j.subscription || !t.origin.subscription || j.subscription === t.origin.subscription) && Number(t.createdAt || 0) >= j.from);
const dayOrder = (a, b) => String(a.date).localeCompare(String(b.date)) || String(a.startTime || '~').localeCompare(String(b.startTime || '~')) || (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0);

// The to-dos that just came in from a watched job, in the order the day list shows them. `seen` (a Set of ids, kept
// for the app session) is updated here: every line is looked at once, except a fresh imported one that no watched
// job explains yet (its job may only show up on the next poll).
export function arrivals(watch, seen, todos = [], sessionStart = 0) {
  const fresh = [];
  for (const t of todos) {
    if (!t?.id || seen.has(t.id)) continue;
    if (!external(t) || !t.date || t.status === 'bucket' || Number(t.createdAt || 0) < sessionStart - SLACK_MS) { seen.add(t.id); continue; }
    if (jobOf(watch, t)) { seen.add(t.id); fresh.push(t); }
  }
  return fresh.sort(dayOrder);
}

// What happened to one imported to-do between two looks at the data, as the day list would show it (null: nothing
// visible). 'add' — it came onto a day; 'remove' — it left the days (deleted, put in the bucket); 'move' — another day;
// 'edit' — same day, new title / time / done state.
const onDay = (t) => !!t && !!t.date && t.status !== 'bucket';
const isDone = (t) => t?.status === 'done';
const timeOf = (t) => `${t?.startTime || ''}~${t?.endTime || ''}`;
export function classify(before, after) {
  const was = onDay(before), is = onDay(after);
  if (!was) return is ? 'add' : null;
  if (!is) return 'remove';
  if (before.date !== after.date) return 'move';
  return before.title !== after.title || timeOf(before) !== timeOf(after) || isDone(before) !== isDone(after) ? 'edit' : null;
}

// Changes to imported to-dos between two snapshots of db.todos (lines that only now appear are arrivals()' business).
// A line the person is editing or just changed on this phone (`touched(id)`) is theirs, not the AI's: left alone.
// An empty `next` after a full list is the phone being wiped (signing out), not a job deleting everything.
export function changes(prev = [], next = [], touched = () => false) {
  if (!prev?.length || !next?.length) return [];
  const now = new Map(next.map((t) => [t.id, t])), out = [];
  for (const before of prev) {
    const after = now.get(before.id) || null, t = after || before;
    if (!external(t) || touched(t.id)) continue;
    const kind = classify(before, after);
    if (kind) out.push({ id: t.id, kind, before, after, origin: t.origin });
  }
  return out;
}
// Whether a running (or just finished) job explains a change: same tool, and the same page / calendar when known.
export const explains = (watch, c) => Object.values(watch.jobs).some((j) => j.provider === c.origin?.provider && (!j.subscription || !c.origin.subscription || j.subscription === c.origin.subscription));
// Changes in the order the day list shows them: where each one starts playing (a removed or moved line at its old place).
const spot = (c) => (c.kind === 'remove' || c.kind === 'move' ? c.before : c.after || c.before);
export const inScreenOrder = (list = []) => [...list].sort((a, b) => dayOrder(spot(a), spot(b)));
// A new line from arrivals() as a change.
export const arrival = (t) => ({ id: t.id, kind: 'add', before: null, after: t, origin: t.origin });

// The queue of changes to play: { queue: [{ key, id, kind, before, after, at }], played } — `played` counts the ones
// played since it was last empty. The first item is the one playing. A later change to a line still waiting its turn is
// folded into that item (from what the screen shows to the newest data); a line that went back to how it was drops out.
// Beyond MAX_ANIMATED a change simply shows (the data is already there). Plain to-dos ({ id, ... }) count as arrivals.
export const EMPTY = { queue: [], played: 0 };
const lastIndex = (list, fn) => { for (let i = list.length - 1; i >= 0; i--) if (fn(list[i])) return i; return -1; };
export function enqueue(q = EMPTY, list = [], now = Date.now()) {
  let queue = q.queue, added = 0;
  const room = Math.max(0, MAX_ANIMATED - q.played - q.queue.length);
  for (const raw of list) {
    const c = raw.kind ? raw : arrival(raw);
    const i = lastIndex(queue, (x) => x.id === c.id);
    if (i > 0) {
      const x = queue[i];
      if (x.kind === 'add') queue = c.kind === 'remove' ? queue.filter((_, k) => k !== i) : queue.map((y, k) => (k === i ? { ...y, after: c.after || y.after } : y));
      else {
        const kind = classify(x.before, c.after);
        queue = kind ? queue.map((y, k) => (k === i ? { ...y, kind, after: c.after } : y)) : queue.filter((_, k) => k !== i);
      }
      continue;
    }
    if (i === 0 && c.kind === 'add') continue; // already being typed
    if (added >= room) continue;
    const n = q.played + queue.length;
    queue = [...queue, { key: queue.some((x) => x.id === c.id) ? `${c.id}·${n}` : c.id, id: c.id, kind: c.kind, before: c.before || null, after: c.after || null, at: now }];
    added += 1;
  }
  return queue === q.queue ? q : queue.length ? { ...q, queue } : EMPTY;
}
export function finishOne(q = EMPTY, key) {
  if (!q.queue.some((x) => x.key === key)) return q;
  const queue = q.queue.filter((x) => x.key !== key);
  return queue.length ? { queue, played: q.played + 1 } : EMPTY;
}
export const finishAll = () => EMPTY;
export const current = (q) => q.queue[0]?.id || null;
export const head = (q) => q.queue[0] || null;

// How a waiting line looks until its turn: a new (or moved-in) line is still blank; an edited one shows what it was.
const face = (t) => ({ title: t.title, status: t.status, startTime: t.startTime || null, endTime: t.endTime || null });
export function lookOf(queue = [], id, reduced = false) {
  const x = queue.find((y) => y.id === id);
  if (!x || x.kind === 'remove') return null;
  if (x.kind === 'add' || x.kind === 'move') return reduced ? null : { mode: 'wait' };
  return { mode: 'hold', look: face(x.before) };
}
// Lines no longer in the data that still show until their turn has played: removed lines, and moved lines at their old
// place (until `left` — the key whose line has already left its old place). With Reduce Motion a move simply shows at
// its new place, so only removed lines stay (they fade).
export function ghostsOf(queue = [], { left = null, reduced = false } = {}) {
  return queue.filter((x) => (x.kind === 'remove' || (x.kind === 'move' && !reduced)) && x.key !== left && onDay(x.before))
    .map((x) => ({ ...x.before, id: 'ghost:' + x.key, ghost: x.key }));
}

// "10/29 → 10/30", "9:00 → 10:00", "10/29 9:00 → 10/30 10:00": the little chip by a line whose day or time changed.
const md = (date) => { const [, m, d] = String(date).split('-'); return `${Number(m)}/${Number(d)}`; };
const hm = (t) => (t.startTime ? String(t.startTime).replace(/^0(?=\d:)/, '') : '시간 없음');
export function chipOf(before, after) {
  if (!onDay(before) || !onDay(after)) return null;
  const dates = before.date !== after.date, times = (before.startTime || null) !== (after.startTime || null);
  if (!dates && !times) return null;
  const side = (t) => [dates && md(t.date), times && hm(t)].filter(Boolean).join(' ');
  return `${side(before)} → ${side(after)}`;
}

// What playing one change means, step by step. `at` is where the list scrolls to: the line itself ('row') or the copy
// left at its old place ('ghost'); `show` is what that line does:
//   write  — erase back to what the old and new titles share, then type the rest (from '' = a new line typed out);
//            `tick` — the checkbox then ticks (or unticks) with a little flourish; `chip` — the day/time chip shows
//   leave  — the old line is erased backwards, (struck through,) and folds away
//   glow / fade — Reduce Motion: the line lights up a moment / the old line fades out
export function stepsOf(x, reduced = false) {
  const b = x.before, a = x.after, chip = chipOf(b, a);
  if (x.kind === 'remove') return [{ at: 'ghost', date: b.date, show: reduced ? { mode: 'fade' } : { mode: 'leave', from: b.title, strike: true } }];
  if (x.kind === 'add') return [{ at: 'row', date: a.date, show: reduced ? { mode: 'glow' } : { mode: 'write', from: '', to: a.title } }];
  if (x.kind === 'move') {
    const into = { at: 'row', date: a.date, show: reduced ? { mode: 'glow', chip } : { mode: 'write', from: '', to: a.title, chip } };
    return reduced ? [into] : [{ at: 'ghost', date: b.date, show: { mode: 'leave', from: b.title } }, into];
  }
  const tick = isDone(b) !== isDone(a) || null;
  return [{ at: 'row', date: a.date, show: reduced ? { mode: 'glow', chip } : { mode: 'write', from: b.title, to: a.title, chip, tick, look: face(b) } }];
}
// How long a step takes (the day list moves on after this even if the line never says it is done).
export const TICK_MS = 700, CHIP_MS = 1200, CARET_MS = 820, STRIKE_MS = 260, FOLD_MS = 300;
export function stepMs(show = {}) {
  if (show.mode === 'glow') return show.chip ? 1600 : 1000;
  if (show.mode === 'fade') return 360;
  if (show.mode === 'leave') return rewriteMs(show.from, '') + (show.strike ? STRIKE_MS : 0) + FOLD_MS + 200;
  return rewriteMs(show.from, show.to) + (show.tick ? TICK_MS : 0) + (show.chip ? CHIP_MS : 0) + CARET_MS;
}

// The typewriter: the characters (Korean syllables and emoji count as one), and how much shows after `elapsed` ms.
export const chars = (title) => Array.from(String(title || ''));
export const typingMs = (title, perChar = CHAR_MS) => chars(title).length * perChar;
export const typedAt = (title, elapsed, perChar = CHAR_MS) => { const c = chars(title); return c.slice(0, Math.max(0, Math.min(c.length, Math.floor(elapsed / perChar) + 1))).join(''); };
// Rewriting a line: erase back to the characters the old and new titles start with alike, then type the rest.
export const ERASE_MS = 28;
const shared = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
export const commonPrefix = (from, to) => shared(chars(from), chars(to));
export const rewriteMs = (from, to, erase = ERASE_MS, perChar = CHAR_MS) => { const a = chars(from), b = chars(to), p = shared(a, b); return (a.length - p) * erase + (b.length - p) * perChar; };
export function rewriteAt(from, to, elapsed, erase = ERASE_MS, perChar = CHAR_MS) {
  const a = chars(from), b = chars(to), p = shared(a, b), out = a.length - p, add = b.length - p;
  if (out > 0 && elapsed < out * erase) return { text: a.slice(0, a.length - Math.min(out, Math.floor(elapsed / erase) + 1)).join(''), erasing: true, done: false };
  const k = add ? Math.min(add, Math.floor((elapsed - out * erase) / perChar) + 1) : 0;
  return { text: b.slice(0, p + k).join(''), erasing: false, done: k >= add };
}

// The rainbow edge is on while the AI is in session: a job reading / thinking / writing, or changes still being played.
export const inSession = (jobs = [], q = EMPTY, now = Date.now()) => q.queue.length > 0 || jobs.some((j) => isActive(j, now));

// Rainbow colours round the edge (#rrggbb, first = last so the band closes), turned by `hue` degrees.
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}
export const rainbow = (hue = 0, n = 7, s = 92, l = 66) => Array.from({ length: n }, (_, i) => hsl(hue + (i * 360) / (n - 1), s, l));

// Roughly how round the screen's corners are, so the edge follows them: iPhones with Face ID ~44, iPad ~18,
// iPhones with a home button and the web square; most Android phones a little round.
export function screenCorner(os, { width = 0, height = 0 } = {}) {
  const long = Math.max(width, height), short = Math.min(width, height);
  if (os === 'ios') return short >= 700 ? 18 : long >= 800 ? 44 : 0;
  if (os === 'android') return 20;
  return 0;
}
