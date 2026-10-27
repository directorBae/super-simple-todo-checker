const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWebService } = require('../scripts/web-server.cjs');
const tools = require('../electron/tools.cjs');

// Supabase in miniature: Auth hands out "tok-<email>", the tool tables answer per person, the Edge Function records its calls.
function fakeSupabase() {
  const calls = [];
  const reply = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const session = (email) => ({ access_token: 'tok-' + email, refresh_token: 'rt-' + email, expires_in: 3600, user: { id: 'id-' + email, email } });
  async function fetch(url, init = {}) {
    const { pathname, search } = new URL(url), body = init.body ? JSON.parse(init.body) : {};
    if (pathname.startsWith('/auth/v1/')) {
      const op = url.split('/auth/v1/')[1];
      if (op === 'signup' || op === 'token?grant_type=password') return reply(200, session(body.email));
      if (op === 'logout') return reply(204);
      return reply(404, {});
    }
    const token = (init.headers?.Authorization || '').replace('Bearer ', '');
    if (!token.startsWith('tok-')) return reply(401, { message: 'no session' });
    if (pathname.startsWith('/functions/v1/integrations/')) {
      const route = pathname.slice('/functions/v1/integrations'.length);
      calls.push({ route, search, body, token, apikey: init.headers.apikey });
      if (route === '/oauth/start') return reply(200, { url: body.provider === 'notion' ? 'https://api.notion.com/v1/oauth/authorize?state=s' : 'https://evil.example.com/' });
      if (route === '/notion/pages') return reply(200, { pages: [{ id: 'p1', type: 'database', title: '주간 업무', url: 'https://www.notion.so/p1', icon: '📋' }] });
      if (route === '/subscribe') return reply(200, { subscription: { id: 's1', resource_id: body.resource_id, resource_type: body.type, title: '주간 업무', state: 'idle' } });
      return reply(200, { ok: true });
    }
    const table = pathname.split('/').pop();
    if (table === 'connections') return reply(200, [{ id: 'c1', provider: 'notion', account: '스튜디오' }]);
    if (table === 'subscriptions') return reply(200, []);
    if (table === 'pet_jobs') return reply(200, [{ id: 'j1', provider: 'notion', kind: 'import', state: 'thinking', summary: '노션 "주간 업무" 읽는 중', updated_at: new Date().toISOString() }]);
    return reply(200, []);
  }
  return { fetch, calls };
}

test('web version: tool connections need a login, then pass the person\'s token through to the Edge Function', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-web-tools-'));
  const supa = fakeSupabase();
  const web = createWebService({ dataDir, config: { timeZone: 'Asia/Seoul', openaiModel: 'test' }, env: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'pub' }, authFetch: supa.fetch });
  await new Promise((resolve) => web.core.server.listen(0, '127.0.0.1', resolve));
  await new Promise((resolve) => web.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await web.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${web.server.address().port}`;
  const post = async (method, value) => {
    const res = await fetch(base + '/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify(value) });
    return { status: res.status, data: await res.json() };
  };

  const before = await post('tools', { action: 'state' });
  assert.equal(before.status, 401, 'nothing about anyone\'s tools before login');
  assert.equal(supa.calls.length, 0);

  await post('auth/signup', { email: 'a@x.com', password: 'secret1' });
  const state = await post('tools', { action: 'state' });
  assert.equal(state.data.ok, true);
  assert.equal(state.data.connections[0].account, '스튜디오');
  assert.equal(state.data.jobs[0].state, 'thinking');

  const start = await post('tools', { action: 'start', provider: 'notion' });
  assert.equal(start.data.ok, true);
  assert.match(start.data.url, /^https:\/\/api\.notion\.com\/v1\/oauth\/authorize/);
  assert.deepEqual(supa.calls.at(-1), { route: '/oauth/start', search: '', body: { provider: 'notion' }, token: 'tok-a@x.com', apikey: 'pub' });
  const odd = await post('tools', { action: 'start', provider: 'google' });
  assert.equal(odd.data.ok, false, 'an OAuth address off the two providers is refused');
  assert.equal((await post('tools', { action: 'start', provider: 'slack' })).data.ok, false);

  const pages = await post('tools', { action: 'pages', q: '주간' });
  assert.equal(pages.data.pages[0].title, '주간 업무');
  assert.equal(decodeURIComponent(supa.calls.at(-1).search), '?q=주간');

  const sub = await post('tools', { action: 'subscribe', resourceId: 'p1', type: 'database' });
  assert.equal(sub.data.ok, true);
  assert.deepEqual(supa.calls.at(-1).body, { resource_id: 'p1', type: 'database' });
  assert.equal(sub.data.subscription.id, 's1');

  await post('tools', { action: 'sync', id: 's1' });
  assert.deepEqual(supa.calls.at(-1), { route: '/sync', search: '', body: { id: 's1' }, token: 'tok-a@x.com', apikey: 'pub' });
  await post('tools', { action: 'unsubscribe', id: 's1' });
  assert.deepEqual(supa.calls.at(-1).body, { id: 's1' });
  await post('tools', { action: 'disconnect', provider: 'notion' });
  assert.deepEqual(supa.calls.at(-1), { route: '/disconnect', search: '', body: { provider: 'notion' }, token: 'tok-a@x.com', apikey: 'pub' });
  assert.equal((await post('tools', { action: 'nope' })).data.ok, false);

  await post('auth/signout', {});
  assert.equal((await post('tools', { action: 'state' })).status, 401);
});

test('tools helper: safe links, unconfigured servers and the "an import just finished" watch', async () => {
  assert.equal(tools.safeUrl('https://www.notion.so/x'), 'https://www.notion.so/x');
  assert.equal(tools.safeUrl('javascript:alert(1)'), null);
  assert.equal(tools.safeUrl('file:///C:/x'), null);
  assert.equal(tools.safeUrl('https://accounts.google.com/o/oauth2/v2/auth', tools.AUTH_HOSTS), 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(tools.safeUrl('http://accounts.google.com/', tools.AUTH_HOSTS), null);
  assert.deepEqual(await tools.run(null, 'state'), { ok: false, error: '연결 서버가 설정되지 않았어요.' });
  const fresh = tools.doneWatcher(), at = (s) => new Date(Date.UTC(2026, 9, 28, 0, 0, s)).toISOString();
  assert.equal(fresh([{ state: 'done', updated_at: at(1) }]), false, 'what was already done at start is not news');
  assert.equal(fresh([{ state: 'writing', updated_at: at(2) }, { state: 'done', updated_at: at(1) }]), false);
  assert.equal(fresh([{ state: 'done', updated_at: at(3) }]), true);
  assert.equal(fresh([{ state: 'done', updated_at: at(3) }]), false);
  assert.equal(fresh([{ state: 'done', kind: 'push', updated_at: at(4) }]), false, 'a push back to the source brings no new to-dos');
});
