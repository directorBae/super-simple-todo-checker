const { json, schedule, fromSchedule, hash } = require('./common');
function adapter(credentials, persistCredentials, config) {
  async function token() {
    if (credentials.expiresAt > Date.now() + 60000) return credentials.accessToken;
    const d = await json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ client_id: config.googleClientId, client_secret: config.googleClientSecret, refresh_token: credentials.refreshToken, grant_type: 'refresh_token' }) });
    credentials.accessToken = d.access_token; credentials.expiresAt = Date.now() + d.expires_in * 1000; persistCredentials(credentials);
    return credentials.accessToken;
  }
  async function request(endpoint, method = 'GET', body, headers = {}) {
    return json('https://www.googleapis.com/calendar/v3/' + endpoint, { method, headers: { Authorization: `Bearer ${await token()}`, 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  const base = t => `calendars/${encodeURIComponent(t.containerId)}/events`;
  function parse(e, t) { return { externalId: e.id, version: e.etag, deleted: e.status === 'cancelled', url: e.htmlLink, appId: e.extendedProperties?.private?.todoAppId, data: e.status === 'cancelled' ? {} : { title: e.summary || '(제목 없음)', notes: e.description || '', ...fromSchedule(e.start, e.end, t.timeZone) }, raw: e, recurring: !!(e.recurrence || e.recurringEventId), writable: !e.recurrence }; }
  function payload(todo, t) { return { summary: todo.title, description: todo.notes || '', ...schedule(todo, t.defaultMinutes) }; }
  return {
    async containers() {
      let next; const out = [];
      do { const u = new URL('https://x/users/me/calendarList'); if (next) u.searchParams.set('pageToken', next); const d = await request(u.pathname.slice(1) + u.search); out.push(...(d.items || []).filter(c => !c.deleted).map(c => ({ id: c.id, label: c.summaryOverride || c.summary, timeZone: c.timeZone, writable: ['owner', 'writer'].includes(c.accessRole) }))); next = d.nextPageToken; } while (next);
      return out;
    },
    async list(t) {
      let next; const out = [];
      do { const p = new URLSearchParams({ singleEvents: 'true', showDeleted: 'true', maxResults: '2500', timeMin: new Date(Date.now() - 365 * 864e5).toISOString(), timeMax: new Date(Date.now() + 730 * 864e5).toISOString() }); if (next) p.set('pageToken', next); const d = await request(base(t) + '?' + p); out.push(...(d.items || []).map(e => parse(e, t))); next = d.nextPageToken; } while (next);
      return out;
    },
    async get(t, externalId) { try { return parse(await request(`${base(t)}/${encodeURIComponent(externalId)}`), t); } catch (e) { if ([404, 410].includes(e.status)) return null; throw e; } },
    async recover(t, todoId) { return this.get(t, 'todo' + hash(todoId)); },
    async create(t, todo) { return parse(await request(base(t), 'POST', { ...payload(todo, t), id: 'todo' + hash(todo.id), extendedProperties: { private: { todoAppId: todo.id } } }), t); },
    async update(t, todo, remote) {
      const all = payload(todo, t), patch = {};
      if (todo.title !== remote.data?.title) patch.summary = all.summary;
      if ((todo.notes || '') !== (remote.data?.notes || '')) patch.description = all.description;
      if (['date', 'endDate', 'startTime', 'endTime', 'timeZone'].some(k => (todo[k] || null) !== (remote.data?.[k] || null))) Object.assign(patch, { start: all.start, end: all.end });
      if (!Object.keys(patch).length) return remote;
      return parse(await request(`${base(t)}/${encodeURIComponent(remote.externalId)}?sendUpdates=none`, 'PATCH', patch, { 'If-Match': remote.version }), t);
    },
    async remove(t, remote) { await request(`${base(t)}/${encodeURIComponent(remote.externalId)}?sendUpdates=none`, 'DELETE', null, { 'If-Match': remote.version }); },
  };
}
module.exports = { adapter };
