// Multi-day to-dos (n일차): one to-do from `date` to `endDate` shows up on every day it covers as that day's part —
// "xxxx (2일차)", that day's share of the time, and a check of its own. Checking a day only marks that day
// (`doneDays`); the to-do itself is done once every day is. Times split per day: the first day runs from the start
// time to the end of the day, middle days are 종일, the last day runs from the start of the day to the end time.
// Pure functions, shared by the desktop/web app and the phone app.
export const MAX_SPAN_DAYS = 62;
const pad = (n) => String(n).padStart(2, '0');
const parse = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDay = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return fmt(d); };
export const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86_400_000);

export const isMultiDay = (t) => !!(t?.date && t.endDate && t.endDate > t.date);
// Every day the to-do covers (just its date when it is a one-day to-do).
export function spanDates(t) {
  if (!t?.date) return [];
  if (!isMultiDay(t)) return [t.date];
  const n = Math.min(daysBetween(t.date, t.endDate), MAX_SPAN_DAYS - 1), out = [];
  for (let i = 0; i <= n; i++) out.push(addDay(t.date, i));
  return out;
}
export const covers = (t, day) => (isMultiDay(t) ? t.date <= day && day <= t.endDate : t.date === day);

// The to-do as it shows on `day`: the same object for a one-day to-do; for a multi-day one a copy with that day's
// number, time slice and check (`span` holds what the views need; `id` stays the to-do's own).
export function onDay(t, day) {
  if (!covers(t, day)) return null;
  if (!isMultiDay(t)) return t;
  const total = Math.min(daysBetween(t.date, t.endDate) + 1, MAX_SPAN_DAYS), n = daysBetween(t.date, day) + 1;
  const first = n === 1, last = day === t.endDate;
  const timed = !!(t.startTime || t.endTime);
  // first day: start → 24:00; last day: 00:00 → end (no end time: the whole day); middle days: 종일.
  const startTime = first ? t.startTime || null : last && t.endTime ? '00:00' : null;
  const endTime = first ? (timed ? '24:00' : null) : last ? t.endTime || null : null;
  const done = t.status === 'done' || (t.doneDays || []).includes(day);
  return { ...t, startTime, endTime, status: t.status === 'bucket' ? 'bucket' : done ? 'done' : 'todo', span: { day, n, total, first, last, allDay: timed && (!first && (!last || !t.endTime)) } };
}
// All the to-dos showing on `day` (multi-day ones as that day's part).
export const todosOn = (todos, day) => todos.map((t) => onDay(t, day)).filter(Boolean);
// "xxxx (2일차)" for a day's part, the plain title otherwise.
export const dayTitle = (v) => (v?.span ? `${v.title} (${v.span.n}일차)` : v?.title || '');
// The text after the title for a middle day of a timed multi-day to-do.
export const allDayText = (v) => (v?.span?.allDay ? '종일' : '');

// Checking / unchecking a day's part: the patch for the to-do itself. A one-day to-do just flips its status.
export function toggleDayPatch(t, day) {
  if (!isMultiDay(t)) return { status: t.status === 'done' ? 'todo' : 'done' };
  const days = spanDates(t), was = t.status === 'done' ? days : (t.doneDays || []).filter((d) => days.includes(d));
  const next = was.includes(day) ? was.filter((d) => d !== day) : [...was, day].sort();
  return { doneDays: next, status: next.length === days.length ? 'done' : 'todo' };
}
// Moving a to-do to `to`: a multi-day one moves as a whole, so that the part that was dragged (`partDay`, its start
// by default) lands on `to`; its length and its checked days move with it.
export function moveToDate(t, to, partDay = t.date) {
  if (!isMultiDay(t)) return { date: to };
  const shift = daysBetween(partDay && covers(t, partDay) ? partDay : t.date, to);
  if (!shift) return {};
  return { date: addDay(t.date, shift), endDate: addDay(t.endDate, shift), ...(t.doneDays ? { doneDays: t.doneDays.map((d) => addDay(d, shift)) } : {}) };
}
// Changing the span keeps only the checks of days that are still in it.
export function spanPatch(t, { date, endDate, startTime, endTime }) {
  const patch = { date, endDate: endDate && endDate > date ? endDate : null, startTime: startTime || null, endTime: endTime || null };
  const days = spanDates({ ...t, ...patch });
  if (t.doneDays?.length) patch.doneDays = t.doneDays.filter((d) => days.includes(d));
  return patch;
}
