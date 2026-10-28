/* 노션 · 구글 캘린더 연결 — 로그인한 사람의 토큰으로 shared/tools-client.cjs 를 부른다.
 * Electron 메인과 웹 서버(scripts/web-server.cjs)가 같이 쓴다. 창에서 오는 값은 여기서 한 번 거른다. */
// Packaged builds carry the shared files under app/shared; in the repo they sit two levels up.
const shared = (name) => { try { return require('../shared/' + name); } catch { return require('../../shared/' + name); } };
const { createToolsClient } = shared('tools-client.cjs');

const PROVIDERS = ['notion', 'google'];
// Where an OAuth start may send the browser (the Edge Function builds these).
const AUTH_HOSTS = ['api.notion.com', 'accounts.google.com'];

// http(s) only — and for OAuth, https to the two providers only.
function safeUrl(url, hosts) {
  try {
    const u = new URL(String(url));
    if (hosts ? u.protocol !== 'https:' || !hosts.includes(u.hostname) : !['https:', 'http:'].includes(u.protocol)) return null;
    return u.toString();
  } catch { return null; }
}

const client = ({ url, key, fetch }, token) => (url && key ? createToolsClient({ url, key, fetch, token }) : null);

const provider = (p) => { if (!PROVIDERS.includes(p)) throw new Error('연결할 도구를 골라 주세요.'); return p; };
const id = (v) => { const s = String(v || ''); if (!s || s.length > 200) throw new Error('항목을 찾을 수 없어요.'); return s; };
// Several accounts per tool: an optional connection id picks the Notion workspace / the one account to drop.
const conn = (v) => (v ? id(v) : undefined);
const ACTIONS = {
  state: (c) => c.state(),
  start: async (c, p) => { const url = safeUrl(await c.start(provider(p.provider)), AUTH_HOSTS); if (!url) throw new Error('계정 연결 주소가 올바르지 않아요.'); return { url }; },
  pages: async (c, p) => ({ pages: await c.pages(String(p.q || '').slice(0, 200), conn(p.connectionId)) }),
  subscribe: async (c, p) => ({ subscription: await c.subscribe(id(p.resourceId), p.type === 'database' ? 'database' : 'page', conn(p.connectionId)) }),
  unsubscribe: (c, p) => c.unsubscribe(id(p.id)),
  // { id } drops that one account, { provider } every account of the tool.
  disconnect: (c, p) => c.disconnect(p.id ? id(p.id) : provider(p.provider)),
  sync: (c, p) => c.syncNow(p.id ? id(p.id) : undefined),
};
// Always answers { ok, ... } or { ok: false, error } — errors are already in Korean.
async function run(c, action, payload) {
  if (!Object.hasOwn(ACTIONS, action)) return { ok: false, error: '요청을 찾을 수 없어요.' };
  if (!c) return { ok: false, error: '연결 서버가 설정되지 않았어요.' };
  try { return { ok: true, ...(await ACTIONS[action](c, payload && typeof payload === 'object' ? payload : {})) }; }
  catch (e) { return { ok: false, error: e.message }; }
}

// True once per import that finished since the last look, so the new to-dos are pulled right away.
function doneWatcher() {
  let last = null;
  return (jobs = []) => {
    const newest = Math.max(0, ...jobs.filter((j) => j.state === 'done' && j.kind !== 'push').map((j) => Date.parse(j.updated_at) || 0));
    const fresh = last !== null && newest > last;
    if (last === null || newest > last) last = newest;
    return fresh;
  };
}

module.exports = { client, run, safeUrl, doneWatcher, AUTH_HOSTS };
