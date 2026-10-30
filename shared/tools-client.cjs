'use strict';
/*
 * The app side of the per-person tool connections (Notion, Google Calendar). Desktop main, the web server and the
 * phone all use it with the signed-in person's token: it reads their connections, subscriptions and the pet's
 * jobs straight from the database (RLS shows only theirs) and calls the `integrations` Edge Function for the rest.
 */
// What the server needs from the reminder settings (names shared by every device: shared/reminders.js).
// Phone reminders are sent by the server (Edge Function /push), so it needs every reminder setting, not only the morning.
const hhmm = (v, fallback) => (/^\d{2}:\d{2}$/.test(v || '') ? v : fallback);
function prefsOf(settings = {}, timeZone) {
  return {
    morning_on: settings.dailySummary !== false, morning_time: hhmm(settings.dailySummaryTime, '09:00'),
    notify_start: settings.notifyStart !== false, notify_end: settings.notifyEnd !== false,
    wrapup_on: settings.dailyWrapup !== false, wrapup_time: hhmm(settings.dailyWrapupTime, '21:00'),
    time_zone: timeZone || null, updated_at: new Date().toISOString(),
  };
}

// What a playlist entry may hold (YouTube links only, at most 200 entries).
function cleanPlaylist(list) {
  const text = (v, max) => (typeof v === 'string' ? v.slice(0, max) : null);
  return (Array.isArray(list) ? list : []).filter((x) => x && /^https:\/\/(www\.|m\.|music\.)?(youtube\.com|youtu\.be)\//.test(x.url || '')).slice(0, 200)
    .map((x) => ({ id: text(x.id, 64) || String(Math.random()).slice(2), url: text(x.url, 500), videoId: text(x.videoId, 20), listId: text(x.listId, 64), title: text(x.title, 200) }));
}

function createToolsClient({ url, key, fetch: request = globalThis.fetch, token }) {
  const base = String(url || '').replace(/\/+$/, '');
  async function call(path, init = {}) {
    const access = await token();
    if (!access) throw new Error('로그인해 주세요.');
    const res = await request(base + path, { ...init, headers: { apikey: key, Authorization: 'Bearer ' + access, 'Content-Type': 'application/json', ...(init.headers || {}) } });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(body?.error || body?.message || '연결 서버에 닿지 못했어요.');
    return body;
  }
  const fn = (path, body) => call('/functions/v1/integrations' + path, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) });
  const rows = (table, query) => call(`/rest/v1/${table}?${query}`).then((r) => r || []);
  return {
    // Everything the settings screen and the pet need, in one go.
    async state(now = Date.now()) {
      const since = new Date(now - 10 * 60_000).toISOString();
      const [connections, subscriptions, jobs] = await Promise.all([
        rows('connections', 'select=id,provider,account,created_at&order=created_at.asc'),
        rows('subscriptions', 'select=id,connection_id,provider,resource_type,resource_id,title,url,state,last_error,last_synced_at&order=created_at.asc'),
        rows('pet_jobs', `select=id,subscription_id,provider,kind,state,summary,counts,created_at,updated_at&updated_at=gte.${since}&order=updated_at.desc&limit=10`),
      ]);
      return { connections, subscriptions, jobs };
    },
    start: (provider) => fn('/oauth/start', { provider }).then((r) => r.url),
    // Several accounts per tool: `connectionId` picks the Notion workspace (default: the first one connected).
    pages: (q = '', connectionId) => fn('/notion/pages?q=' + encodeURIComponent(q) + (connectionId ? '&connection=' + encodeURIComponent(connectionId) : '')).then((r) => r.pages),
    subscribe: (resourceId, type, connectionId) => fn('/subscribe', { resource_id: resourceId, type, connection_id: connectionId }).then((r) => r.subscription),
    unsubscribe: (id) => fn('/unsubscribe', { id }),
    // One account by its connection id, or every account of a tool by 'notion' / 'google'.
    disconnect: (idOrProvider) => fn('/disconnect', ['notion', 'google'].includes(idOrProvider) ? { provider: idOrProvider } : { id: idOrProvider }),
    syncNow: (id) => fn('/sync', id ? { id } : {}),
    // The music playlist (one per person, the same on every device).
    playlist: () => rows('user_prefs', 'select=playlist').then((r) => (Array.isArray(r[0]?.playlist) ? r[0].playlist : [])),
    savePlaylist: (list) => call('/rest/v1/user_prefs?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ playlist: cleanPlaylist(list), updated_at: new Date().toISOString() }),
    }),
    // This phone's push address (Expo push token): the server sends the reminders there. Removed when signing out.
    registerPush: (token, platform) => call('/rest/v1/push_devices?on_conflict=user_id,token', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ token, platform, disabled_at: null, updated_at: new Date().toISOString() }),
    }),
    unregisterPush: (token) => call('/rest/v1/push_devices?token=eq.' + encodeURIComponent(token), { method: 'DELETE', headers: { Prefer: 'return=minimal' } }),
    // The morning alert time, so the Monday/Thursday check-up runs just before it (or at 9:00 when it is off).
    savePrefs: (settings, timeZone) => call('/rest/v1/user_prefs?on_conflict=user_id', {
      method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(prefsOf(settings, timeZone)),
    }),
  };
}

module.exports = { createToolsClient, prefsOf, cleanPlaylist };
