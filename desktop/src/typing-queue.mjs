// What the pet does on screen for an import, one change at a time (typing.jsx plays them): it writes new to-dos out,
// rewrites a changed title (erases back to where the old and new agree, then types the rest), carries a to-do to its
// new day or time, ticks one that became done, and erases + strikes out one that went away.
// A change is played when it came from a tool (origin.subscription) while a job of that tool is running or has just
// finished — never old news, and never a row you are working on yourself (your own edits just happen).
import { WORKING } from './pet-jobs.mjs';

export const TYPE_CAP = 8; // more than this just happen
export const JUST_DONE = 60_000; // the synced rows usually land a few seconds after the job says done
export const LOCAL_MS = 4000; // a row you touched this long ago is still yours
const START_SLACK = 3 * 60_000; // jobs carry no start time: the first look at one, give or take

export function createTypingWatch() {
  return { seen: null, last: null, jobs: new Map(), looked: false };
}

// Remembers the import jobs as they move. A job already finished at the very first look is old news.
export function noteJobs(watch, jobs = [], now = Date.now()) {
  for (const j of jobs) {
    if (j.kind === 'push') continue;
    const working = WORKING.includes(j.state);
    let w = watch.jobs.get(j.id);
    if (!w) {
      w = { provider: j.provider, subscription: j.subscription_id || null, start: Date.parse(j.created_at) || (Date.parse(j.updated_at) || now) - START_SLACK, live: working || watch.looked, state: j.state, doneAt: null };
      watch.jobs.set(j.id, w);
    }
    if (working) w.live = true;
    if (j.state === 'done' && w.doneAt == null) w.doneAt = now;
    w.state = j.state;
  }
  watch.looked = true;
  return watch;
}

const eligible = (w, now) => w.live && (WORKING.includes(w.state) || (w.state === 'done' && now - w.doneAt < JUST_DONE));
const matches = (w, t) => (w.subscription ? w.subscription === t.origin.subscription : w.provider === t.origin.provider);
const byScreen = (a, b) => (a.date || '').localeCompare(b.date || '') || (a.startTime || '99').localeCompare(b.startTime || '99') || (a.createdAt || 0) - (b.createdAt || 0) || String(a.id).localeCompare(String(b.id));
const onScreen = (t) => !!(t && t.title && t.status !== 'bucket' && (t.kind || 'todo') === 'todo');
// Where the pet goes first: the old row for a move or a removal, the row itself otherwise.
const firstSpot = (c) => c.before && (c.kind === 'gone' || c.kind === 'move') ? c.before : c.after;

// What changed in one imported row between two looks: 'move' (day or time), 'edit' (title), 'done', or null.
export function changeKind(b, t) {
  if (b.date !== t.date || (b.startTime || '') !== (t.startTime || '')) return 'move';
  if (b.title !== t.title) return 'edit';
  if (b.status !== 'done' && t.status === 'done') return 'done';
  return null;
}

// The changes to play from this look at the data, in screen order: { play: [change], instant: [id] }.
//   change = { id, kind: 'new'|'edit'|'move'|'done'|'gone', mode, before?, after?, tick? }
// mode 'type' writes/erases; 'flash' (reduced motion) only scrolls to the row and lights it briefly.
// `cap` is how many more may still be played (the ones already waiting count against it).
// `local` = what you are working on: { ids: Set, dates: Set, all } — those rows' changes just happen.
export function takeChanges(watch, todos = [], now = Date.now(), { cap = TYPE_CAP, reduced = false, local = {} } = {}) {
  const next = new Map(todos.map((t) => [t.id, t]));
  if (!watch.seen) { watch.seen = new Set(next.keys()); watch.last = next; return { play: [], instant: [] }; }
  const prev = watch.last;
  watch.last = next;
  const jobs = [...watch.jobs.values()].filter((w) => eligible(w, now));
  const fromJob = (t, made) => !!t.origin?.subscription && jobs.some((w) => matches(w, t) && (made ?? t.updatedAt ?? Infinity) >= w.start);
  const mine = (t) => !!(local.all || local.ids?.has(t.id) || local.dates?.has(t.date));
  const found = [];
  for (const t of todos) {
    const b = prev.get(t.id);
    if (!b) {
      if (watch.seen.has(t.id)) continue;
      watch.seen.add(t.id);
      if (onScreen(t) && fromJob(t, t.createdAt || 0) && !mine(t)) found.push({ id: t.id, kind: 'new', after: t });
      continue;
    }
    if (b === t || !onScreen(b) || !fromJob(t) || mine(b) || mine(t)) continue;
    if (!onScreen(t)) { found.push({ id: t.id, kind: 'gone', before: b }); continue; } // off the list (to the bucket)
    const kind = changeKind(b, t);
    if (kind) found.push({ id: t.id, kind, before: b, after: t, tick: kind === 'edit' && b.status !== 'done' && t.status === 'done' });
  }
  for (const [id, b] of prev) if (!next.has(id) && onScreen(b) && fromJob(b, Infinity) && !mine(b)) found.push({ id, kind: 'gone', before: b });
  found.sort((a, b) => byScreen(firstSpot(a), firstSpot(b)));
  const room = Math.max(0, cap), mode = reduced ? 'flash' : 'type';
  return { play: found.slice(0, room).map((c) => ({ ...c, mode })), instant: found.slice(room).map((c) => c.id) };
}

const typeWait = (ch, random) => (/\s/.test(ch) ? 32 : /[,.!?·…:)]/.test(ch) ? 90 : Math.round(35 + random() * 25));
// One step per character (Hangul syllables and emoji stay whole): how many are shown and how long to wait after.
export function typeSteps(text, random = Math.random) {
  return Array.from(String(text || '')).map((ch, i) => ({ n: i + 1, wait: typeWait(ch, random) }));
}
export const revealed = (text, n) => Array.from(String(text || '')).slice(0, n).join('');

// Rewriting a line like a backspace: the old tail goes a letter at a time (quicker than typing) down to what the old
// and new titles share, a short breath, then the new tail is typed. Each step = { show, wait, erase }.
export function rewriteSteps(from, to, random = Math.random) {
  const a = Array.from(String(from || '')), b = Array.from(String(to || ''));
  let k = 0;
  while (k < a.length && k < b.length && a[k] === b[k]) k++;
  const steps = [];
  for (let n = a.length - 1; n >= k; n--) steps.push({ show: a.slice(0, n).join(''), wait: Math.round(24 + random() * 14), erase: true });
  if (steps.length && b.length > k) steps.at(-1).wait += 160;
  for (let n = k + 1; n <= b.length; n++) steps.push({ show: b.slice(0, n).join(''), wait: typeWait(b[n - 1], random), erase: false });
  return steps;
}

// The little note the pet holds up when it carries a to-do: "10/29 → 10/30", or "09:00 → 10:30" on the same day.
export function moveNote(b, t) {
  const day = (x) => (x.date ? x.date.slice(5).split('-').map(Number).join('/') : '날짜 없음');
  if (b.date === t.date) return `${b.startTime || '시간 없음'} → ${t.startTime || '시간 없음'}`;
  const when = (x) => day(x) + (x.startTime && b.startTime !== t.startTime ? ' ' + x.startTime : '');
  return `${when(b)} → ${when(t)}`;
}
