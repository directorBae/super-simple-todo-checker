const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWebService } = require('../scripts/web-server.cjs');

// Supabase in miniature: Auth hands out "tok-<email>" tokens, and the tables keep each person's rows apart like RLS does.
function fakeSupabase() {
  const users = new Map(), rows = new Map();
  const reply = (status, body) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  const session = (email) => ({ access_token: 'tok-' + email, refresh_token: 'rt-' + email, expires_in: 3600, user: { id: 'id-' + email, email } });
  async function fetch(url, init = {}) {
    const { pathname } = new URL(url), method = init.method || 'GET', body = init.body ? JSON.parse(init.body) : {};
    if (pathname.startsWith('/auth/v1/')) {
      const op = url.split('/auth/v1/')[1];
      if (op === 'signup') { users.set(body.email, body.password); return reply(200, session(body.email)); }
      if (op === 'token?grant_type=password') return users.get(body.email) === body.password ? reply(200, session(body.email)) : reply(400, { error_code: 'invalid_credentials' });
      if (op === 'logout') return reply(204);
      return reply(404, {});
    }
    const token = init.headers.Authorization.replace('Bearer ', '');
    if (!token.startsWith('tok-')) return reply(401, { message: 'no session' });
    const owner = 'id-' + token.slice(4), table = pathname.split('/').pop();
    if (method === 'GET') return reply(200, [...rows.values()].filter((r) => r.table === table && r.user_id === owner).map(({ table: _, ...r }) => r));
    for (const r of [].concat(body)) rows.set(table + ':' + r.id, { ...r, table, user_id: owner, synced_at: new Date().toISOString() });
    return reply(201);
  }
  return { fetch, rows };
}

test('web version: nothing shows or saves before login, each account sees only its own to-dos, sign-out leaves nothing', async (t) => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-web-auth-'));
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
  const state = () => fetch(base + '/api/state').then((r) => r.json());

  assert.deepEqual((await state()).auth, { required: true, loading: false, email: null });
  assert.equal((await post('todo/add', { title: '로그인 전' })).status, 401);

  const up = await post('auth/signup', { email: 'a@x.com', password: 'secret1' });
  assert.equal(up.data.ok, true); assert.equal(up.data.state.auth.email, 'a@x.com');
  await post('todo/add', { title: 'A의 일' });
  await web.core.supabase.sync();
  assert.ok([...supa.rows.values()].some((r) => r.title === 'A의 일' && r.user_id === 'id-a@x.com'));

  const wrong = await post('auth/signin', { email: 'a@x.com', password: 'nope!!' });
  assert.equal(wrong.data.ok, false); assert.match(wrong.data.error, /이메일 또는 비밀번호/);

  const out = await post('auth/signout', {});
  assert.equal(out.data.state.auth.email, null); assert.equal(out.data.state.todos.length, 0);
  assert.equal(web.core.snapshot().todos.length, 0, 'nothing of A stays on the server');
  assert.equal((await post('todo/undo', {})).status, 401);

  await post('auth/signup', { email: 'b@x.com', password: 'secret2' });
  assert.deepEqual((await state()).todos.map((x) => x.title), [], 'B does not see A');
  await post('auth/signout', {});
  const back = await post('auth/signin', { email: 'a@x.com', password: 'secret1' });
  assert.deepEqual(back.data.state.todos.map((x) => x.title), ['A의 일'], 'A gets their to-dos back on login');
});
