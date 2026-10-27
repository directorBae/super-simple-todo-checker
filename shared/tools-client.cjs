'use strict';
/*
 * The app side of the per-person tool connections (Notion, Google Calendar). Desktop main, the web server and the
 * phone all use it with the signed-in person's token: it reads their connections, subscriptions and the pet's
 * jobs straight from the database (RLS shows only theirs) and calls the `integrations` Edge Function for the rest.
 */
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
        rows('subscriptions', 'select=id,provider,resource_type,resource_id,title,url,state,last_error,last_synced_at&order=created_at.asc'),
        rows('pet_jobs', `select=id,provider,kind,state,summary,counts,updated_at&updated_at=gte.${since}&order=updated_at.desc&limit=10`),
      ]);
      return { connections, subscriptions, jobs };
    },
    start: (provider) => fn('/oauth/start', { provider }).then((r) => r.url),
    pages: (q = '') => fn('/notion/pages?q=' + encodeURIComponent(q)).then((r) => r.pages),
    subscribe: (resourceId, type) => fn('/subscribe', { resource_id: resourceId, type }).then((r) => r.subscription),
    unsubscribe: (id) => fn('/unsubscribe', { id }),
    disconnect: (provider) => fn('/disconnect', { provider }),
    syncNow: (id) => fn('/sync', id ? { id } : {}),
  };
}

module.exports = { createToolsClient };
