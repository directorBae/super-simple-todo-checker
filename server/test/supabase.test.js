const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../index');
const { syncSupabase } = require('../../shared/supabase-sync.cjs');

// Minimal PostgREST stand-in: upsert merges given columns, synced_at is the server clock.
function fakeSupabase() {
  const tables = { teams: new Map(), projects: new Map(), todos: new Map() };
  let clock = 0;
  async function fetch(url, init = {}) {
    const u = new URL(url), table = tables[u.pathname.split('/').pop()];
    if ((init.method || 'GET') === 'GET') {
      const since = u.searchParams.get('synced_at')?.replace(/^gt\./, '');
      const rows = [...table.values()].filter((r) => !since || r.synced_at > since).sort((a, b) => a.synced_at.localeCompare(b.synced_at));
      const offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit'));
      return { ok: true, status: 200, text: async () => JSON.stringify(rows.slice(offset, offset + limit)) };
    }
    for (const row of JSON.parse(init.body)) table.set(row.id, { title: '', created_at: 0, deleted_at: null, ...table.get(row.id), ...row, synced_at: new Date(Date.UTC(2026, 0, 1) + ++clock).toISOString() });
    return { ok: true, status: 201, text: async () => '' }; // like Supabase with return=minimal: empty body
  }
  return { tables, fetch };
}

test('the integration server exchanges changes with Supabase like any other device', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-supabase-'));
  const remote = fakeSupabase();
  const app = createApp({ dir, token: 'test', supabaseEnv: { SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'service' }, supabaseFetch: remote.fetch });
  t.after(() => { app.server.close(); app.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.ok(app.supabase);

  // A phone writes straight to Supabase; the server picks it up.
  const phone = { state: { teams: [], projects: [], todos: [], tombstones: [] }, meta: null };
  phone.meta = (await syncSupabase(phone.state, phone.meta, { url: 'https://x.supabase.co', key: 'anon', fetch: remote.fetch })).meta; // connects first
  const now = Date.now();
  phone.state.todos.push({ id: 'p1', kind: 'todo', title: '폰에서 만든 일', status: 'todo', date: null, createdAt: now, updatedAt: now, origin: { type: 'app' } });
  const pushed = await syncSupabase(phone.state, phone.meta, { url: 'https://x.supabase.co', key: 'anon', fetch: remote.fetch });
  phone.meta = pushed.meta;
  await app.supabase.sync();
  assert.equal(app.snapshot().todos.find((x) => x.id === 'p1')?.title, '폰에서 만든 일');

  // Something that reaches the server another way (desktop /sync, an integration) goes up to Supabase and on to the phone.
  app.merge({ todos: [{ id: 's1', kind: 'todo', title: '서버로 들어온 일', status: 'todo', date: null, createdAt: now + 1, updatedAt: now + 1, origin: { type: 'app' } }] });
  await app.supabase.sync();
  assert.equal(remote.tables.todos.get('s1')?.title, '서버로 들어온 일');
  const back = await syncSupabase(phone.state, phone.meta, { url: 'https://x.supabase.co', key: 'anon', fetch: remote.fetch });
  assert.ok(back.changed);
  assert.equal(phone.state.todos.find((x) => x.id === 's1')?.title, '서버로 들어온 일');

  // Deletions travel too.
  phone.state.todos = phone.state.todos.filter((x) => x.id !== 'p1'); phone.state.tombstones.push({ coll: 'todos', id: 'p1', deletedAt: now + 5 });
  await syncSupabase(phone.state, back.meta, { url: 'https://x.supabase.co', key: 'anon', fetch: remote.fetch });
  await app.supabase.sync();
  assert.equal(app.snapshot().todos.some((x) => x.id === 'p1'), false);
});

test('without Supabase settings the server runs as before', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-supabase-off-'));
  const app = createApp({ dir, token: 'test', supabaseEnv: {} });
  t.after(() => { app.server.close(); app.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.equal(app.supabase, null);
});
