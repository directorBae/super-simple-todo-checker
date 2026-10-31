// ChatGPT (MCP) talking to the person's to-dos (supabase/functions/_shared/mcp.js): a secret link made in the app,
// JSON-RPC over POST, and tools that write straight into Supabase.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, environment } from '../../supabase/functions/_shared/router.js';

const NOW = Date.parse('2026-11-01T03:00:00Z'); // Sunday, 12:00 in Seoul

function world() {
  const tables = { mcp_tokens: [], todos: [], teams: [{ id: 'team-1', user_id: 'u1', name: 'Studio', color: '#6685e8', deleted_at: null, created_at: 1 }, { id: 'team-x', user_id: 'u2', name: 'Other', deleted_at: null, created_at: 1 }], user_prefs: [{ user_id: 'u1', time_zone: 'Asia/Seoul' }] };
  const match = (row, [key, cond]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
    const v = row[key], [op, ...rest] = cond.split('.'), arg = decodeURIComponent(rest.join('.'));
    if (op === 'eq') return String(v) === arg;
    if (op === 'neq') return String(v) !== arg;
    if (op === 'is') return v === null || v === undefined;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(v));
    if (op === 'gte') return v >= arg;
    if (op === 'lte') return v <= arg;
    throw new Error('filter ' + op);
  };
  const rows = (table, search) => tables[table].filter((r) => [...new URLSearchParams(search)].every((f) => match(r, f)));
  const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  async function fetch(url, init = {}) {
    const u = new URL(url), method = init.method || 'GET';
    if (u.pathname === '/auth/v1/user') return init.headers.Authorization === 'Bearer user-token' ? reply({ id: 'u1' }) : reply({}, 401);
    const table = u.pathname.split('/').pop();
    if (method === 'GET') return reply(rows(table, u.search).map((r) => structuredClone(r)));
    if (method === 'POST') { const add = JSON.parse(init.body).map((r) => ({ id: crypto.randomUUID(), revoked_at: null, last_used_at: null, created_at: new Date(NOW).toISOString(), ...r })); tables[table].push(...add); return reply(add, 201); }
    if (method === 'PATCH') { const r = rows(table, u.search); r.forEach((x) => Object.assign(x, JSON.parse(init.body))); return reply(r.map((x) => structuredClone(x))); }
  }
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc', SUPABASE_ANON_KEY: 'pub', STATE_SECRET: 's', HOOK_SECRET: 'h', TIME_ZONE: 'Asia/Seoul' })[k], { fetch, now: () => NOW, waitUntil: (p) => p });
  const app = (path, body) => handle(new Request('https://x.supabase.co/functions/v1/integrations' + path, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: 'Bearer user-token', 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }), env).then((r) => r.json());
  const post = (url, body) => handle(new Request(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify(body) }), env);
  return { tables, app, post };
}

test('mcp: a link made in the app is shown once, stored as a hash, listed and can be cut off', async () => {
  const w = world();
  const { link } = await w.app('/mcp/link', { label: 'ChatGPT' });
  assert.match(link.url, /^https:\/\/x\.supabase\.co\/functions\/v1\/integrations\/mcp\/[A-Za-z0-9_-]{30,}$/);
  const key = link.url.split('/').pop();
  assert.equal(w.tables.mcp_tokens.length, 1); assert.notEqual(w.tables.mcp_tokens[0].token_hash, key); assert.equal(w.tables.mcp_tokens[0].token_hash.length, 64);
  assert.deepEqual((await w.app('/mcp/links')).links.map((l) => l.label), ['ChatGPT']);
  const init = await w.post(link.url, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'chatgpt' } } });
  assert.equal(init.status, 200);
  const r = await init.json();
  assert.equal(r.result.serverInfo.name, 'checker'); assert.equal(r.result.protocolVersion, '2025-06-18'); assert.ok(r.result.capabilities.tools);
  assert.equal((await w.post(link.url, { jsonrpc: '2.0', method: 'notifications/initialized' })).status, 202, 'notifications get no reply');
  await w.app('/mcp/revoke', { id: link.id });
  assert.equal((await w.post(link.url, { jsonrpc: '2.0', id: 2, method: 'tools/list' })).status, 401, 'a cut-off link stops working');
  assert.equal((await w.post('https://x.supabase.co/functions/v1/integrations/mcp/' + 'x'.repeat(32), { jsonrpc: '2.0', id: 3, method: 'tools/list' })).status, 401);
});

test('mcp: ChatGPT adds a plan, lists it, finishes, moves and deletes to-dos — all in the person\'s own data', async () => {
  const w = world();
  const { link } = await w.app('/mcp/link', {});
  let n = 10;
  const call = async (name, args) => (await (await w.post(link.url, { jsonrpc: '2.0', id: n++, method: 'tools/call', params: { name, arguments: args } })).json()).result;
  const list = (await (await w.post(link.url, { jsonrpc: '2.0', id: 1, method: 'tools/list' })).json()).result.tools.map((t) => t.name);
  assert.deepEqual(list, ['list_teams', 'list_todos', 'add_todos', 'update_todo', 'delete_todo']);
  assert.equal((await call('list_teams', {})).content[0].text, 'Studio', 'only this person\'s teams');

  const added = await call('add_todos', { todos: [
    { title: '기획서 초안 쓰기', date: '2026-11-02', start_time: '10:00', end_time: '11:30', team: 'studio' },
    { title: '운동' },
    { title: '아주 긴 제목 '.repeat(10) },
  ] });
  assert.equal(added.isError, undefined);
  assert.equal(added.structuredContent.added.length, 3);
  const plan = w.tables.todos.find((t) => t.title === '기획서 초안 쓰기');
  assert.deepEqual({ user: plan.user_id, date: plan.date, start: plan.start_time, end: plan.end_time, team: plan.team_id, status: plan.status, origin: plan.origin }, { user: 'u1', date: '2026-11-02', start: '10:00', end: '11:30', team: 'team-1', status: 'todo', origin: { type: 'app', via: 'chatgpt' } });
  assert.equal(w.tables.todos.find((t) => t.title === '운동').date, '2026-11-01', 'no date: today in Seoul');
  const long = w.tables.todos.find((t) => t.title.startsWith('아주 긴'));
  assert.ok(Array.from(long.title).length <= 50 && long.notes.startsWith('원문: 아주 긴 제목'));
  assert.ok(Number.isFinite(plan.updated_at) && plan.extra.kind === 'todo', 'a row the apps sync like any other');

  // The same plan again: nothing doubles. A team that doesn't exist is an error the model can fix.
  assert.match((await call('add_todos', { todos: [{ title: '운동' }] })).content[0].text, /건너뜀 1건/);
  const wrong = await call('add_todos', { todos: [{ title: 'x', team: '없는팀' }] });
  assert.equal(wrong.isError, true); assert.match(wrong.content[0].text, /없는팀.*Studio/);
  assert.equal((await call('add_todos', { todos: [{ title: 'x', date: '11/2' }] })).isError, true);

  const week = await call('list_todos', {});
  assert.equal(week.structuredContent.from, '2026-11-01'); assert.equal(week.structuredContent.to, '2026-11-07');
  assert.equal(week.structuredContent.todos.length, 3);
  assert.equal(week.structuredContent.todos.find((t) => t.title === '기획서 초안 쓰기').team, 'Studio');

  const done = await call('update_todo', { id: plan.id, done: true, date: '2026-11-03', start_time: null });
  assert.match(done.content[0].text, /고쳤어요/);
  assert.deepEqual({ status: plan.status, date: plan.date, start: plan.start_time, end: plan.end_time }, { status: 'done', date: '2026-11-03', start: null, end: null });
  assert.ok(plan.updated_at > NOW - 1 && plan.completed_at === NOW);
  assert.equal((await call('update_todo', { id: plan.id })).isError, true, 'nothing to change');

  await call('delete_todo', { id: plan.id });
  assert.equal(plan.deleted_at, NOW, 'deleted the way the apps sync deletions');
  assert.equal((await call('delete_todo', { id: plan.id })).isError, true);
  // Another person's to-do can't be reached.
  w.tables.todos.push({ id: 'theirs', user_id: 'u2', title: 'x', date: '2026-11-01', status: 'todo', deleted_at: null });
  assert.equal((await call('delete_todo', { id: 'theirs' })).isError, true);
  assert.equal(w.tables.todos.find((t) => t.id === 'theirs').deleted_at, null);
});
