// Phone reminders sent by the server (Expo push) at the moment they are due, written from the to-dos as they are then —
// so a change made on the desktop, with the phone never opened, is still what the phone says. The database calls /push
// every minute. The rules are the app's (shared/reminders.js): a to-do's start and end time, the morning count and the
// evening wrap-up that asks to move what is left to tomorrow — here in the person's own time zone.
import { db, eq } from './db.js';
import { localDate, offsetOf, addDays } from './http.js';

const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';
// A run that came late still sends what fell due since; each reminder goes out once (push_sent).
export const LOOKBACK_MS = 3 * 60_000;
const DEFAULTS = { notify_start: true, notify_end: true, morning_on: true, morning_time: '09:00', wrapup_on: true, wrapup_time: '21:00' };

// The moment a local date and time happen in a zone.
export function zonedMs(date, time, zone) {
  const guess = Date.parse(`${date}T${time}:00Z`), off = offsetOf(zone, guess);
  const [h, m] = off.slice(1).split(':').map(Number);
  return guess - (off[0] === '-' ? -1 : 1) * (h * 60 + m) * 60_000;
}
const names = (list, max) => list.slice(0, max).map((t) => t.title).join(', ') + (list.length > max ? ` 외 ${list.length - max}` : '');

// Every reminder due after `from` and up to `to`: { key, at, title, body } (keys as on the phone: '<id>:start', 'wrapup:<day>' …).
export function dueReminders(todos, prefs, zone, from, to) {
  const s = { ...DEFAULTS, ...Object.fromEntries(Object.entries(prefs || {}).filter(([, v]) => v !== null && v !== undefined)) }, out = [];
  const at = (date, time) => zonedMs(date, time, zone);
  for (const t of todos) {
    if (t.status !== 'todo' || !t.date) continue;
    if (s.notify_start && t.startTime) out.push({ key: `${t.id}:start`, at: at(t.date, t.startTime), title: '▶ 시작할 시간', body: `${t.title} (${t.startTime})` });
    if (s.notify_end && t.endTime) out.push({ key: `${t.id}:end`, at: at(t.endDate || t.date, t.endTime), title: '✔ 마무리할 시간', body: `${t.title} (${t.endTime})` });
  }
  for (let day = localDate(from, zone); at(day, '00:00') <= to; day = addDays(day, 1)) {
    const open = todos.filter((t) => t.status === 'todo' && t.date === day), done = todos.filter((t) => t.status === 'done' && t.date === day);
    const recent = new Set([1, 2, 3].map((k) => addDays(day, -k)));
    const overdue = todos.filter((t) => t.status === 'todo' && recent.has(t.date));
    if (s.morning_on && (open.length || overdue.length)) {
      const body = [open.length ? `오늘 예정된 할 일이 ${open.length}건 있어요.` : '', overdue.length ? `지난 3일 동안 못 한 일 ${overdue.length}건: ${names(overdue, 3)}` : ''].filter(Boolean).join('\n');
      out.push({ key: `daily:${day}`, at: at(day, s.morning_time), title: '오늘 할 일', body });
    }
    if (s.wrapup_on && (open.length || done.length)) {
      const body = open.length ? `남은 할 일 ${open.length}건을 내일로 전부 미루시겠어요?\n⏳ ${names(open, 3)}` : `오늘 할 일 ${done.length}건을 모두 완료했어요 🎉`;
      out.push({ key: `wrapup:${day}`, at: at(day, s.wrapup_time), title: '하루 마무리', body });
    }
  }
  return out.filter((r) => r.at > from && r.at <= to).sort((a, b) => a.at - b.at);
}

const fromRow = (r) => ({ id: r.id, title: r.title, date: r.date, endDate: r.end_date, startTime: r.start_time, endTime: r.end_time, status: r.status });

export async function sendDue(env) {
  const store = db(env), now = env.now();
  const devices = await store.select('push_devices', 'disabled_at=is.null&select=user_id,token');
  const users = [...new Set(devices.map((d) => d.user_id))];
  if (!users.length) return { users: 0, sent: 0 };
  const prefs = new Map((await store.select('user_prefs', `user_id=in.(${users.join(',')})&select=*`)).map((p) => [p.user_id, p]));
  let sent = 0;
  for (const user of users) {
    const p = prefs.get(user), zone = p?.time_zone || env.TIME_ZONE || 'Asia/Seoul', today = localDate(now, zone);
    // Yesterday's late reminders, today's, and the 3 days before for the morning's "못 한 일".
    const rows = await store.select('todos', `user_id=${eq(user)}&deleted_at=is.null&date=gte.${addDays(today, -4)}&date=lte.${addDays(today, 1)}&select=id,title,date,end_date,start_time,end_time,status`);
    const due = dueReminders(rows.map(fromRow), p, zone, now - LOOKBACK_MS, now);
    for (const r of due) {
      // Claim it first: only the run that wrote the row sends it.
      const claimed = await store.insert('push_sent', [{ user_id: user, key: r.key }], { ignore: true, onConflict: 'user_id,key' });
      if (!claimed.length) continue;
      const tokens = devices.filter((d) => d.user_id === user).map((d) => d.token);
      const res = await env.fetch(EXPO_PUSH, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(tokens.map((to) => ({ to, title: r.title, body: r.body, data: { key: r.key }, sound: 'default' }))),
      });
      const tickets = (await res.json().catch(() => ({})))?.data || [];
      sent++;
      // A phone that dropped the app (or its token) stops being sent to.
      for (const [i, t] of tickets.entries()) {
        if (t?.status === 'error' && t.details?.error === 'DeviceNotRegistered') await store.update('push_devices', `user_id=${eq(user)}&token=${eq(tokens[i])}`, { disabled_at: new Date(now).toISOString() });
      }
    }
  }
  // The sent list only needs the last few days.
  await store.remove('push_sent', `sent_at=lt.${new Date(now - 7 * 86_400_000).toISOString()}`).catch(() => {});
  return { users: users.length, sent };
}
