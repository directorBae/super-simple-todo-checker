// Google Calendar (OAuth): connecting, every calendar the person owns or edits, change notifications (watch
// channels), reading this week's events and moving an event when its time changes in the app.
import { json, HttpError } from './http.js';

const API = 'https://www.googleapis.com/calendar/v3';
export const SCOPES = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly';

export function authorizeUrl(env, state) {
  const q = new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, redirect_uri: env.redirect('google'), response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'select_account consent', include_granted_scopes: 'true', state });
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + q;
}
const token = (env, params) => json(env.fetch, 'https://oauth2.googleapis.com/token', {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...params }),
});
export async function exchange(env, code, now = Date.now()) {
  const r = await token(env, { code, grant_type: 'authorization_code', redirect_uri: env.redirect('google') });
  const email = r.id_token ? JSON.parse(atob(r.id_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).email : null;
  return { account: email || 'Google Calendar', key: email || 'google', meta: {}, secret: { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: now + (r.expires_in || 3600) * 1000 } };
}
// A usable access token; returns the new secret when it had to be refreshed (the caller stores it).
export async function fresh(env, secret, now = Date.now()) {
  if (secret.access_token && secret.expires_at - now > 120_000) return { access: secret.access_token, secret: null };
  if (!secret.refresh_token) throw new HttpError('구글 연결이 끊겼어요. 다시 연결해 주세요.', 401);
  const r = await token(env, { grant_type: 'refresh_token', refresh_token: secret.refresh_token });
  const next = { ...secret, access_token: r.access_token, expires_at: now + (r.expires_in || 3600) * 1000 };
  return { access: next.access_token, secret: next };
}
const call = (env, access, path, init = {}) => json(env.fetch, API + path, { ...init, headers: { Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', ...(init.headers || {}) } });

// "Everything in my calendars": the calendars the person owns or can edit (not holidays or other people's).
export async function calendars(env, access) {
  const r = await call(env, access, '/users/me/calendarList?minAccessRole=writer&maxResults=50');
  return (r.items || []).filter((c) => !c.deleted).map((c) => ({ id: c.id, title: c.summaryOverride || c.summary, primary: !!c.primary, timeZone: c.timeZone }));
}
export async function events(env, access, calendarId, window, offset) {
  const q = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250', timeMin: `${window.start}T00:00:00${offset}`, timeMax: `${window.end}T23:59:59${offset}` });
  const r = await call(env, access, `/calendars/${encodeURIComponent(calendarId)}/events?` + q);
  return (r.items || []).filter((e) => e.status !== 'cancelled').map((e) => ({
    external_id: e.id, url: e.htmlLink, title: e.summary || '(제목 없음)',
    start: e.start?.dateTime || e.start?.date || null, end: e.end?.dateTime || e.end?.date || null, allDay: !e.start?.dateTime,
    done: false, edited: e.updated,
  }));
}
// Change notifications: Google calls the webhook whenever something in the calendar changes (max ~7 days).
export async function watch(env, access, calendarId, channelId, channelToken, now = Date.now()) {
  const r = await call(env, access, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: 'POST', body: JSON.stringify({ id: channelId, type: 'web_hook', address: env.webhook('google'), token: channelToken, expiration: now + 7 * 86400_000 }),
  });
  return { id: r.id, resourceId: r.resourceId, expiration: Number(r.expiration) };
}
export async function stop(env, access, channel) {
  if (!channel?.id) return;
  await call(env, access, '/channels/stop', { method: 'POST', body: JSON.stringify({ id: channel.id, resourceId: channel.resourceId }) }).catch(() => {});
}
// Deletes an event (it sits in Google Calendar's bin for 30 days). Already gone is fine.
export async function deleteEvent(env, access, calendarId, eventId) {
  await call(env, access, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'DELETE' })
    .catch((e) => { if (![404, 410].includes(e.status)) throw e; });
}
// Moves an event to the to-do's date/time (a to-do without a time becomes an all-day event).
export async function moveEvent(env, access, calendarId, eventId, { date, start_time, end_time }, timeZone) {
  if (!date) return;
  const next = (d) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); return x.toISOString().slice(0, 10); };
  const body = start_time
    ? { start: { dateTime: `${date}T${start_time}:00`, timeZone }, end: { dateTime: `${date}T${end_time || start_time}:00`, timeZone } }
    : { start: { date }, end: { date: next(date) } };
  if (start_time && (!end_time || end_time <= start_time)) {
    const [h, m] = start_time.split(':').map(Number), t = h * 60 + m + 60;
    body.end.dateTime = `${date}T${String(Math.min(23, Math.floor(t / 60))).padStart(2, '0')}:${String(t >= 24 * 60 ? 59 : t % 60).padStart(2, '0')}:00`;
  }
  await call(env, access, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, { method: 'PATCH', body: JSON.stringify(body) });
}
