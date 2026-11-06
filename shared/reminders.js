// When to remind, shared by the web page and the phone app (the Electron app keeps its own scheduler,
// desktop/electron/scheduler.cjs, with the same rules): a to-do's start and end time, a morning count of
// today's to-dos and an evening wrap-up. Pure, so it can be unit-tested.
// Whether a to-do is on `day` and still open there: multi-day to-dos (n일차) are on every day they cover, each day
// checked on its own (doneDays).
const coversDay = (t, day) => t.date === day || (!!t.endDate && t.date <= day && day <= t.endDate);
const doneOn = (t, day) => t.status === 'done' || (t.doneDays || []).includes(day);
const pad = (n) => String(n).padStart(2, '0');
export const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const at = (date, time) => {
  const [y, m, d] = date.split('-').map(Number), [hh, mm] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm).getTime();
};
// notifyBefore: a heads-up 30 minutes before a to-do's start time.
export const BEFORE_MIN = 30;
// A to-do's reminder is named by its day and time too, so a time changed on any device (phone, web, ChatGPT, a
// calendar import) is a new reminder that goes off, while the same time still goes off only once.
export const reminderKey = (id, type, day, time) => `${id}:${type}@${day} ${time}`;
export const REMINDER_DEFAULTS = { notifyBefore: true, notifyStart: true, notifyEnd: true, dailySummary: true, dailySummaryTime: '09:00', dailyWrapup: true, dailyWrapupTime: '21:00' };

const names = (list, max) => list.slice(0, max).map((t) => t.title).join(', ') + (list.length > max ? ` 외 ${list.length - max}` : '');

// Every reminder due after `from` and up to `to` (ms), soonest first: { key, at, title, body }.
export function reminders(db, from, to) {
  const s = { ...REMINDER_DEFAULTS, ...db.settings }, out = [];
  const todos = db.todos || [];
  for (const t of todos) {
    if (t.status !== 'todo' || !t.date) continue;
    if (s.notifyBefore && t.startTime) out.push({ key: reminderKey(t.id, 'before', t.date, t.startTime), at: at(t.date, t.startTime) - BEFORE_MIN * 60_000, title: `⏰ ${BEFORE_MIN}분 뒤 시작`, body: `${t.title} (${t.startTime})` });
    if (s.notifyStart && t.startTime) out.push({ key: reminderKey(t.id, 'start', t.date, t.startTime), at: at(t.date, t.startTime), title: '▶ 시작할 시간', body: `${t.title} (${t.startTime})` });
    if (s.notifyEnd && t.endTime) out.push({ key: reminderKey(t.id, 'end', t.endDate || t.date, t.endTime), at: at(t.endDate || t.date, t.endTime), title: '✔ 마무리할 시간', body: `${t.title} (${t.endTime})` });
  }
  const first = new Date(from);
  for (let i = 0; ; i++) {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + i);
    if (day.getTime() > to) break;
    const date = localDate(day);
    const open = todos.filter((t) => t.status !== 'bucket' && coversDay(t, date) && !doneOn(t, date)), done = todos.filter((t) => t.status !== 'bucket' && coversDay(t, date) && doneOn(t, date));
    // Morning: today's count, plus what was left undone yesterday, 2 and 3 days ago (older days are left out).
    const recent = new Set([1, 2, 3].map((k) => localDate(new Date(day.getFullYear(), day.getMonth(), day.getDate() - k))));
    const overdue = todos.filter((t) => t.status === 'todo' && recent.has(t.date));
    if (s.dailySummary && (open.length || overdue.length)) {
      const body = [open.length ? `오늘 예정된 할 일이 ${open.length}건 있어요.` : '', overdue.length ? `지난 3일 동안 못 한 일 ${overdue.length}건: ${names(overdue, 3)}` : ''].filter(Boolean).join('\n');
      out.push({ key: `daily:${date}`, at: at(date, s.dailySummaryTime || '09:00'), title: '오늘 할 일', body });
    }
    // Evening: with to-dos left it asks to move them to tomorrow (tapping it opens that question in the app).
    if (s.dailyWrapup && (open.length || done.length)) {
      const body = open.length ? wrapupAsk(open) : `오늘 할 일 ${done.length}건을 모두 완료했어요 🎉`;
      out.push({ key: `wrapup:${date}`, at: at(date, s.dailyWrapupTime || '21:00'), title: '하루 마무리', body });
    }
  }
  return out.filter((r) => r.at > from && r.at <= to).sort((a, b) => a.at - b.at);
}
export const wrapupAsk = (open) => `남은 할 일 ${open.length}건을 내일로 전부 미루시겠어요?\n⏳ ${names(open, 3)}`;

// The day a tapped wrap-up reminder was about ('wrapup:2026-10-29' → '2026-10-29'), or null for any other reminder.
export const postponeDay = (key) => (/^wrapup:(\d{4}-\d{2}-\d{2})$/.exec(String(key || '')) || [])[1] || null;
// What "move today's to-dos to tomorrow" changes: every open to-do of that day moves one day on (a multi-day one keeps
// its length; a repeating one whose series is already there tomorrow stays). Returns [{ id, patch }].
export function postponePatches(todos, date) {
  const next = (d) => { const [y, m, dd] = d.split('-').map(Number); return localDate(new Date(y, m - 1, dd + 1)); };
  const all = todos || [], tomorrow = next(date);
  return all.filter((t) => t.status === 'todo' && t.date === date && !(t.seriesId && all.some((x) => x.seriesId === t.seriesId && x.id !== t.id && x.date === tomorrow)))
    .map((t) => ({ id: t.id, patch: { date: tomorrow, ...(t.endDate ? { endDate: next(t.endDate) } : {}) } }));
}
