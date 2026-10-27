const test = require('node:test');
const assert = require('node:assert/strict');
const { syncSupabase, toRow, fromRow } = require('../../shared/supabase-sync.cjs');

// In-memory stand-in for Supabase's PostgREST: upsert merges given columns, synced_at is the server clock.
function fakeSupabase() {
  const tables = { teams: new Map(), projects: new Map(), todos: new Map() };
  let clock = 0, requests = 0;
  const serverTime = () => new Date(Date.UTC(2026, 0, 1) + ++clock).toISOString();
  async function fetch(url, init = {}) {
    requests++;
    const u = new URL(url), coll = u.pathname.split('/').pop(), table = tables[coll];
    assert.equal(init.headers.apikey, 'anon');
    lastAuth = init.headers.Authorization;
    if ((init.method || 'GET') === 'GET') {
      const since = u.searchParams.get('synced_at')?.replace(/^gt\./, '');
      const rows = [...table.values()].filter((r) => !since || r.synced_at > since).sort((a, b) => a.synced_at.localeCompare(b.synced_at) || a.id.localeCompare(b.id));
      const offset = Number(u.searchParams.get('offset') || 0), limit = Number(u.searchParams.get('limit') || 1000);
      return { ok: true, status: 200, text: async () => JSON.stringify(rows.slice(offset, offset + limit)) };
    }
    for (const row of JSON.parse(init.body)) table.set(row.id, { title: '', created_at: 0, deleted_at: null, ...table.get(row.id), ...row, synced_at: serverTime() });
    return { ok: true, status: 201, text: async () => '' }; // like Supabase with return=minimal: empty body
  }
  return { tables, fetch, requests: () => requests };
}
let lastAuth = '';
const device = () => ({ state: { teams: [], projects: [], todos: [], tombstones: [] }, meta: null });
async function sync(d, server) {
  const r = await syncSupabase(d.state, d.meta, { url: 'https://x.supabase.co', key: 'anon', fetch: server.fetch });
  assert.ok(r.ok, r.error); d.meta = r.meta; return r;
}

test('rows round-trip between app items and table columns', () => {
  const todo = { id: 't', kind: 'todo', title: '회의', notes: '', date: '2026-10-25', startTime: '09:00', endTime: null, teamId: 'a', status: 'todo', createdAt: 1, updatedAt: 2, origin: { type: 'app' }, revision: 3, syncRevision: 9 };
  const row = toRow('todos', todo);
  assert.equal(row.start_time, '09:00'); assert.deepEqual(row.extra, { revision: 3 }); assert.equal(row.deleted_at, null);
  const back = fromRow('todos', row);
  assert.equal(back.startTime, '09:00'); assert.equal(back.revision, 3); assert.equal(back.kind, 'todo'); assert.equal(back.syncRevision, undefined);
});

test('a device connecting for the first time takes the database as is and never uploads its old local data', async () => {
  const server = fakeSupabase(), a = device(), b = device();
  await sync(a, server);
  a.state.todos.push({ id: 'shared', kind: 'todo', title: 'DB에 있는 일', status: 'todo', createdAt: 5, updatedAt: 5 });
  await sync(a, server);
  b.state.todos.push({ id: 'old', kind: 'todo', title: '연결 전 로컬 일', status: 'todo', createdAt: 1, updatedAt: 1 });
  b.state.teams.push({ id: 'old-team', name: '옛 팀', createdAt: 1, updatedAt: 1 });
  b.state.tombstones.push({ coll: 'todos', id: 'shared', deletedAt: 2 });
  const first = await sync(b, server);
  assert.equal(first.changed, true); assert.equal(first.pushed, 0);
  assert.deepEqual(b.state.todos.map((t) => t.title), ['DB에 있는 일']); assert.deepEqual(b.state.teams, []);
  assert.equal(server.tables.todos.has('old'), false); assert.equal(server.tables.teams.size, 0);
  // After that first round the device is an ordinary peer: its new items go up.
  b.state.todos.push({ id: 'new', kind: 'todo', title: '새 일', status: 'todo', createdAt: 9, updatedAt: 9 });
  assert.equal((await sync(b, server)).pushed, 1);
});

test('two devices converge on creates, edits, deletes and concurrent edits', async () => {
  const server = fakeSupabase(), a = device(), b = device();
  await sync(a, server);
  a.state.teams.push({ id: 'team', name: 'Studio', color: '#bc9f85', createdAt: 1, updatedAt: 1 });
  a.state.todos.push({ id: 'x', kind: 'todo', title: '시안 정리', status: 'todo', teamId: 'team', createdAt: 1, updatedAt: 1, origin: { type: 'app' } });
  a.state.todos.push({ id: 'y', kind: 'todo', title: '버킷 아이디어', status: 'bucket', createdAt: 1, updatedAt: 1 });
  await sync(a, server);
  assert.equal(server.tables.todos.size, 2);

  assert.equal((await sync(b, server)).changed, true);
  assert.deepEqual(b.state.todos.map((t) => t.title).sort(), ['버킷 아이디어', '시안 정리']);
  assert.equal(b.state.todos.find((t) => t.id === 'y').status, 'bucket');
  assert.equal(b.state.teams[0].name, 'Studio');

  // Nothing changed: nothing is uploaded again.
  assert.equal((await sync(a, server)).pushed, 0);
  assert.equal((await sync(b, server)).pushed, 0);

  // Edit on B reaches A.
  Object.assign(b.state.todos.find((t) => t.id === 'x'), { title: '시안 정리 완료', status: 'done', updatedAt: 5 });
  await sync(b, server); await sync(a, server);
  assert.equal(a.state.todos.find((t) => t.id === 'x').status, 'done');

  // Concurrent edits: the later one wins everywhere.
  Object.assign(a.state.todos.find((t) => t.id === 'y'), { title: 'A의 수정', updatedAt: 10 });
  Object.assign(b.state.todos.find((t) => t.id === 'y'), { title: 'B의 수정', updatedAt: 20 });
  await sync(a, server); await sync(b, server); await sync(a, server);
  assert.equal(a.state.todos.find((t) => t.id === 'y').title, 'B의 수정');
  assert.equal(b.state.todos.find((t) => t.id === 'y').title, 'B의 수정');

  // Deleting on A removes it on B.
  a.state.todos = a.state.todos.filter((t) => t.id !== 'x'); a.state.tombstones.push({ coll: 'todos', id: 'x', deletedAt: 30 });
  await sync(a, server); await sync(b, server);
  assert.equal(b.state.todos.some((t) => t.id === 'x'), false);
  assert.ok(b.state.tombstones.some((t) => t.id === 'x' && t.deletedAt === 30));
  assert.equal(server.tables.todos.get('x').deleted_at, 30);
});

test('an edit made after a remote deletion brings the item back', async () => {
  const server = fakeSupabase(), a = device(), b = device();
  await sync(a, server);
  a.state.todos.push({ id: 'z', kind: 'todo', title: '살아남기', status: 'todo', createdAt: 1, updatedAt: 1 });
  await sync(a, server); await sync(b, server);
  b.state.todos = []; b.state.tombstones.push({ coll: 'todos', id: 'z', deletedAt: 30 });
  await sync(b, server);
  Object.assign(a.state.todos[0], { title: '삭제 뒤에 고침', updatedAt: 40 });
  await sync(a, server);
  assert.equal(a.state.todos[0].title, '삭제 뒤에 고침');
  assert.equal(server.tables.todos.get('z').deleted_at, null);
  await sync(b, server);
  assert.equal(b.state.todos.find((t) => t.id === 'z')?.title, '삭제 뒤에 고침');
});

test('an older remote edit does not overwrite a newer local one, and failures leave state usable', async () => {
  const server = fakeSupabase(), a = device();
  await sync(a, server);
  a.state.todos.push({ id: 'k', kind: 'todo', title: '새것', status: 'todo', createdAt: 1, updatedAt: 50 });
  server.tables.todos.set('k', { id: 'k', title: '옛것', status: 'todo', created_at: 1, updated_at: 20, deleted_at: null, extra: {}, synced_at: '2026-12-31T00:00:00.000Z' });
  await sync(a, server);
  assert.equal(a.state.todos[0].title, '새것'); assert.equal(server.tables.todos.get('k').title, '새것');
  const broken = await syncSupabase(a.state, a.meta, { url: 'https://x.supabase.co', key: 'anon', fetch: async () => ({ ok: false, status: 401, text: async () => 'Invalid API key' }) });
  assert.equal(broken.ok, false); assert.match(broken.error, /401/);
  assert.equal(a.state.todos[0].title, '새것');
});

test('signed in: the access token goes with every request, and another account on the same device starts from its own data', async () => {
  const server = fakeSupabase(), a = device();
  const r1 = await syncSupabase(a.state, a.meta, { url: 'https://x.supabase.co', key: 'anon', token: 'tok-a', userId: 'user-a', fetch: server.fetch });
  assert.ok(r1.ok); assert.equal(lastAuth, 'Bearer tok-a'); assert.equal(r1.meta.userId, 'user-a');
  a.meta = r1.meta;
  a.state.todos.push({ id: 'mine', kind: 'todo', title: 'A의 일', status: 'todo', createdAt: 5, updatedAt: 5 });
  await syncSupabase(a.state, a.meta, { url: 'https://x.supabase.co', key: 'anon', token: 'tok-a', userId: 'user-a', fetch: server.fetch }).then((r) => { a.meta = r.meta; });
  // B logs in on the same device: its first round takes B's data (here: the fake server has no per-user filter, so we only
  // check the local reset and the fresh bookmarks).
  a.state.todos.push({ id: 'local-only', kind: 'todo', title: '안 올라간 일', status: 'todo', createdAt: 1, updatedAt: 1 });
  const r2 = await syncSupabase(a.state, a.meta, { url: 'https://x.supabase.co', key: 'anon', token: 'tok-b', userId: 'user-b', fetch: server.fetch });
  assert.ok(r2.ok); assert.equal(r2.meta.userId, 'user-b'); assert.equal(r2.pushed, 0);
  assert.ok(!a.state.todos.some((t) => t.id === 'local-only'), 'the previous account\'s unsent lines are not carried over');
});

test('the integration server (secret key) writes the owner on every row', async () => {
  const server = fakeSupabase(), a = device();
  const r = await syncSupabase(a.state, a.meta, { url: 'https://x.supabase.co', key: 'anon', ownerId: 'owner-1', fetch: server.fetch });
  a.meta = r.meta; a.state.todos.push({ id: 'imp', kind: 'todo', title: '노션에서 온 일', status: 'todo', createdAt: 9, updatedAt: 9 });
  await syncSupabase(a.state, a.meta, { url: 'https://x.supabase.co', key: 'anon', ownerId: 'owner-1', fetch: server.fetch });
  assert.equal(server.tables.todos.get('imp').user_id, 'owner-1');
});
