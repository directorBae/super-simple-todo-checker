// The Monday/Thursday check-up: before the person's morning alert (or at 9:00 when it is off), every connected
// account is read again — quietly, without the pet — to catch anything a webhook missed, renew Google's
// change channels and refresh tokens. The database calls /sweep every 10 minutes; this decides who is due.
import { db, eq } from './db.js';
import { localDate, localTime } from './http.js';
import * as google from './google.js';
import { syncSubscription } from './sync.js';

const SWEEP_DAYS = new Set([1, 4]); // Monday, Thursday
const LEAD_MINUTES = 15;

const minutes = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + m; };
const weekday = (date) => new Date(date + 'T00:00:00Z').getUTCDay();

// When the check-up runs for someone: 15 minutes before their morning alert, or 9:00 without one.
export function sweepTime(prefs) {
  if (!prefs?.morning_on || !/^\d{2}:\d{2}$/.test(prefs.morning_time || '')) return '09:00';
  const t = Math.max(0, minutes(prefs.morning_time) - LEAD_MINUTES);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
// Due now: a Monday or Thursday in their time zone, past their check-up time, and not done yet today.
export function sweepDue(prefs, now, defaultZone) {
  const zone = prefs?.time_zone || defaultZone, today = localDate(now, zone);
  if (!SWEEP_DAYS.has(weekday(today)) || prefs?.last_sweep === today) return null;
  return minutes(localTime(now, zone)) >= minutes(sweepTime(prefs)) ? today : null;
}

async function sweepUser(env, store, userId, subs) {
  for (const sub of subs) {
    if (sub.provider === 'google') {
      // A fresh change channel (the old one may have lapsed or been dropped by Google).
      const [conn] = await store.select('connections', 'id=' + eq(sub.connection_id) + '&select=*');
      if (conn) {
        const { access, secret } = await google.fresh(env, conn.secret, env.now());
        if (secret) await store.update('connections', 'id=' + eq(conn.id), { secret });
        await google.stop(env, access, sub.meta.channel);
        const id = crypto.randomUUID(), channel = await google.watch(env, access, sub.resource_id, id, await env.channelToken(id), env.now()).catch(() => null);
        if (channel) await store.update('subscriptions', 'id=' + eq(sub.id), { meta: { ...sub.meta, channel } });
      }
    }
    await syncSubscription(env, sub.id, { quiet: true }).catch((e) => console.error('점검 실패', sub.id, e.message));
  }
}

export async function sweep(env) {
  const store = db(env), now = env.now();
  const subs = await store.select('subscriptions', 'select=*');
  const users = [...new Set(subs.map((s) => s.user_id))];
  if (!users.length) return { due: 0 };
  const prefs = new Map((await store.select('user_prefs', `user_id=in.(${users.join(',')})&select=*`)).map((p) => [p.user_id, p]));
  let due = 0;
  for (const user of users) {
    const today = sweepDue(prefs.get(user), now, env.TIME_ZONE);
    if (!today) continue;
    due++;
    await store.insert('user_prefs', [{ user_id: user, last_sweep: today }], { upsert: true, onConflict: 'user_id' });
    env.waitUntil(sweepUser(env, store, user, subs.filter((s) => s.user_id === user)).catch((e) => console.error('점검 실패', user, e.message)));
  }
  return { due };
}
