// The `integrations` Edge Function (supabase/functions/_shared), run in Node against stand-ins for
// PostgREST, Supabase Auth, Notion, Google and OpenAI.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, environment } from '../../supabase/functions/_shared/router.js';
import { diff, clean, when, fallbackPlan } from '../../supabase/functions/_shared/planner.js';
import { signState, readState, windowFor, offsetOf, hmac, truncate } from '../../supabase/functions/_shared/http.js';
import { schemaOf } from '../../supabase/functions/_shared/notion.js';

const NOW = Date.parse('2026-10-28T03:00:00Z'); // Wednesday, 12:00 in Seoul

// PostgREST in miniature: the filters the function uses (eq, in, is.null, gte/lte, ->> paths) over in-memory tables.
function fakeRest() {
  const tables = { connections: [], subscriptions: [], pet_jobs: [], todos: [], webhook_keys: [] };
  const read = (row, path) => path.split(/->>|->/).reduce((v, k, i) => (i === 0 ? row[k] : v?.[k]), null);
  const match = (row, [key, cond]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
    const v = read(row, key), [op, ...rest] = cond.split('.'), arg = decodeURIComponent(rest.join('.'));
    if (op === 'eq') return String(v) === arg;
    if (op === 'is') return v === null || v === undefined;
    if (op === 'neq') return String(v) !== arg;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(v));
    if (op === 'gte') return v >= arg;
    if (op === 'lte') return v <= arg;
    throw new Error('filter ' + op);
  };
  const rowsFor = (table, search) => {
    const filters = [...new URLSearchParams(search)];
    return tables[table].filter((row) => filters.every((f) => match(row, f)));
  };
  async function fetch(url, init = {}) {
    const u = new URL(url), table = u.pathname.split('/').pop(), method = init.method || 'GET';
    const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
    if (method === 'GET') return reply(rowsFor(table, u.search).map((r) => structuredClone(r)));
    if (method === 'POST') {
      const keys = (u.searchParams.get('on_conflict') || 'id').split(','), out = [];
      for (const row of JSON.parse(init.body)) {
        const old = tables[table].find((r) => keys.every((k) => r[k] !== undefined && r[k] === row[k]));
        if (old) Object.assign(old, row); else tables[table].push({ id: crypto.randomUUID(), meta: {}, state: 'idle', created_at: new Date().toISOString(), ...row });
        out.push(structuredClone(old || tables[table].at(-1)));
      }
      return reply(out, 201);
    }
    if (method === 'PATCH') { const rows = rowsFor(table, u.search); for (const r of rows) Object.assign(r, JSON.parse(init.body)); return reply(rows.map((r) => structuredClone(r))); }
    if (method === 'DELETE') { const gone = new Set(rowsFor(table, u.search)); tables[table] = tables[table].filter((r) => !gone.has(r)); return reply(undefined, 204); }
  }
  return { tables, fetch };
}

// Everything outside: Supabase (REST + Auth), Notion, OpenAI. `notionDb` holds the rows of one Notion database.
function world({ gpt = null } = {}) {
  const rest = fakeRest(), calls = [], notionDb = [], patches = [];
  const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  async function fetch(url, init = {}) {
    const u = new URL(url);
    calls.push({ url, init });
    if (u.hostname === 'x.supabase.co' && u.pathname.startsWith('/rest/')) return rest.fetch(url, init);
    if (u.pathname === '/auth/v1/user') return init.headers.Authorization === 'Bearer user-token' ? reply({ id: 'user-1', email: 'me@x.com' }) : reply({ msg: 'bad jwt' }, 401);
    if (u.hostname === 'api.notion.com') {
      if (u.pathname === '/v1/oauth/token') return reply({ access_token: 'ntn', workspace_id: 'ws-1', workspace_name: '내 워크스페이스', bot_id: 'b' });
      if (u.pathname === '/v1/databases/db1') return reply({ object: 'database', url: 'https://notion.so/db1', title: [{ plain_text: '주간 업무' }], properties: { 이름: { type: 'title' }, 날짜: { type: 'date' }, 완료: { type: 'checkbox' } } });
      if (u.pathname === '/v1/databases/db1/query') return reply({ results: notionDb.map((r) => ({ id: r.id, url: 'https://notion.so/' + r.id, last_edited_time: '2026-10-27T00:00:00Z', properties: { 이름: { title: [{ plain_text: r.title }] }, 날짜: { date: r.date ? { start: r.date } : null }, 완료: { type: 'checkbox', checkbox: !!r.done } } })), has_more: false });
      if (u.pathname.startsWith('/v1/pages/') && init.method === 'PATCH') { patches.push({ id: u.pathname.split('/').pop(), body: JSON.parse(init.body) }); return reply({}); }
      if (u.pathname === '/v1/search') return reply({ results: [{ object: 'database', id: 'db1', url: 'https://notion.so/db1', title: [{ plain_text: '주간 업무' }], last_edited_time: 'x' }] });
    }
    if (u.hostname === 'api.openai.com') {
      if (!gpt) return reply({ error: { message: 'no key' } }, 500);
      return reply({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify({ items: gpt(JSON.parse(init.body)) }) }] }] });
    }
    throw new Error('unexpected ' + url);
  }
  const pending = [];
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc', SUPABASE_ANON_KEY: 'pub', NOTION_CLIENT_ID: 'nid', NOTION_CLIENT_SECRET: 'nsec', OPENAI_API_KEY: gpt ? 'sk' : '', STATE_SECRET: 'state-secret', HOOK_SECRET: 'hook', TIME_ZONE: 'Asia/Seoul' })[k], { fetch, now: () => NOW, waitUntil: (p) => pending.push(p) });
  const settle = async () => { while (pending.length) await pending.shift(); };
  const request = (path, { method = 'POST', body, headers = {} } = {}) => handle(new Request('https://x.supabase.co/functions/v1/integrations' + path, { method, headers: { 'Content-Type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body) }), env);
  return { rest, calls, notionDb, patches, env, settle, request };
}
const app = { Authorization: 'Bearer user-token' };

test('helpers: the window is this week and next, offsets and states are signed, titles stay within 50 characters', async () => {
  assert.deepEqual(windowFor(NOW, 'Asia/Seoul'), { today: '2026-10-28', start: '2026-10-26', end: '2026-11-08' });
  assert.equal(offsetOf('Asia/Seoul', NOW), '+09:00');
  const state = await signState('s', { user: 'u', provider: 'notion' }, NOW);
  assert.equal((await readState('s', state, NOW)).user, 'u');
  await assert.rejects(readState('other', state, NOW), /확인하지 못했어요/);
  await assert.rejects(readState('s', state, NOW + 16 * 60_000), /만료/);
  assert.equal(Array.from(truncate('가'.repeat(80))).length, 50);
  assert.deepEqual(when({ start: '2026-10-29T10:00:00+09:00', end: '2026-10-29T11:30:00+09:00' }, 'Asia/Seoul'), { date: '2026-10-29', start_time: '10:00', end_time: '11:30' });
  assert.deepEqual(schemaOf({ properties: { T: { type: 'title' }, D: { type: 'date' }, S: { type: 'status' } } }), { titleProp: 'T', dateProp: 'D', doneProp: 'S' });
});

test('planner: GPT output is checked (ids from the source, dates in range, times well-formed); the diff keeps app edits', () => {
  const window = windowFor(NOW, 'Asia/Seoul'), ids = new Set(['a', 'b', 'c']);
  const items = clean([
    { external_id: 'a', title: '회의 준비', date: '2026-10-29', start_time: '25:00', end_time: null, done: false },
    { external_id: 'zzz', title: '지어낸 일', date: '2026-10-29', start_time: null, end_time: null, done: false },
    { external_id: 'b', title: '먼 미래', date: '2027-01-01', start_time: null, end_time: null, done: false },
    { external_id: 'c', title: '보고서', date: '2026-10-30', start_time: '09:00', end_time: '08:00', done: true },
  ], ids, window);
  assert.deepEqual(items.map((x) => [x.external_id, x.start_time, x.end_time]), [['a', null, null], ['c', '09:00', null]]);
  const existing = [
    { id: 't1', title: '내가 줄인 제목', date: '2026-10-29', origin: { id: 'a', remote: { title: '회의 준비', date: '2026-10-28', start_time: null, end_time: null, done: false } } },
    { id: 't2', title: '사라진 일', origin: { id: 'gone', remote: {} } },
  ];
  const d = diff(items, existing, ids);
  assert.deepEqual(d.create.map((x) => x.external_id), ['c']);
  assert.deepEqual(d.update[0].patch, { date: '2026-10-29' }, 'only what the source changed — the title edited in the app stays');
  assert.deepEqual(d.remove.map((t) => t.id), ['t2']);
  assert.deepEqual(fallbackPlan({ provider: 'notion', resource_type: 'page' }, [{ id: 'x', type: 'to_do', text: '할 일', checked: false }, { id: 'y', type: 'paragraph', text: '메모' }], window, 'Asia/Seoul').map((x) => x.external_id), ['x']);
});

test('notion: connect, pick a database, a webhook imports its rows through GPT as the pet narrates, and a date moved in the app goes back', async () => {
  const w = world({ gpt: (req) => {
    const text = req.input[1].content;
    assert.match(text, /주간 업무/); assert.match(req.text.format.type, /json_schema/);
    return [{ external_id: 'p1', title: '투자 미팅 자료 검토', date: '2026-10-29', start_time: '15:00', end_time: null, done: false },
      { external_id: 'p2', title: '주간 보고', date: '2026-10-30', start_time: null, end_time: null, done: false }];
  } });
  w.notionDb.push({ id: 'p1', title: '내일 오후 3시 투자 미팅 자료 최종 검토하고 팀에 공유하기 (중요)', date: '2026-10-29' }, { id: 'p2', title: '주간 보고', date: null });
  // Connect: start → the signed state comes back through the callback.
  const start = await (await w.request('/oauth/start', { body: { provider: 'notion' }, headers: app })).json();
  const state = new URL(start.url).searchParams.get('state');
  assert.match(start.url, /api\.notion\.com\/v1\/oauth\/authorize/);
  assert.equal((await w.request('/oauth/start', { body: { provider: 'notion' } })).status, 401, 'needs a login');
  const cb = await w.request(`/oauth/callback/notion?code=c1&state=${encodeURIComponent(state)}`, { method: 'GET' });
  assert.equal(cb.status, 302); const landed = new URL(cb.headers.get('location'));
  assert.deepEqual([landed.host, landed.pathname, landed.searchParams.get('title')], ['checker.baejeongwon.com', '/connected', '노션을 연결했어요']);
  assert.equal(w.rest.tables.connections[0].meta.workspace_id, 'ws1');
  // Picker and subscribe (the first import starts right away).
  assert.equal((await (await w.request('/notion/pages', { method: 'GET', headers: app })).json()).pages[0].type, 'database');
  const sub = (await (await w.request('/subscribe', { body: { resource_id: 'db1', type: 'database' }, headers: app })).json()).subscription;
  assert.deepEqual([sub.title, sub.meta.dateProp], ['주간 업무', '날짜']);
  await w.settle();
  const todos = w.rest.tables.todos;
  assert.deepEqual(todos.map((t) => [t.title, t.date, t.start_time, t.user_id, t.origin.provider, t.origin.url]).sort(), [
    ['주간 보고', '2026-10-30', null, 'user-1', 'notion', 'https://notion.so/p2'],
    ['투자 미팅 자료 검토', '2026-10-29', '15:00', 'user-1', 'notion', 'https://notion.so/p1'],
  ]);
  const job = w.rest.tables.pet_jobs.at(-1);
  assert.deepEqual([job.state, job.summary], ['done', '노션 "주간 업무"에서 2개 추가']);
  // A webhook for a row of that database (signed with the verification token) syncs again; a removed row is cleaned up.
  assert.equal((await w.request('/webhook/notion', { body: { verification_token: 'secret_v' } })).status, 200);
  w.notionDb.splice(1, 1);
  const event = JSON.stringify({ type: 'page.properties_updated', workspace_id: 'ws-1', entity: { id: 'p1', type: 'page' }, data: { parent: { id: 'db1', type: 'database' } } });
  assert.equal((await w.request('/webhook/notion', { body: event, headers: { 'X-Notion-Signature': 'sha256=forged' } })).status, 401);
  const ok = await w.request('/webhook/notion', { body: event, headers: { 'X-Notion-Signature': 'sha256=' + (await hmac('secret_v', event)) } });
  assert.equal((await ok.json()).matched, 1);
  await w.settle();
  assert.equal(todos.find((t) => t.origin.id === 'p2').deleted_at, NOW);
  // The app moves the meeting to Friday 10:00 → the Notion row's date follows.
  const meeting = todos.find((t) => t.origin.id === 'p1');
  Object.assign(meeting, { date: '2026-10-30', start_time: '10:00' });
  assert.equal((await w.request('/push-back', { body: { id: meeting.id } })).status, 401, 'only the database trigger may call it');
  const pushed = await (await w.request('/push-back', { body: { id: meeting.id }, headers: { 'X-Hook-Secret': 'hook' } })).json();
  assert.equal(pushed.result, 'pushed');
  assert.deepEqual(w.patches.at(-1), { id: 'p1', body: { properties: { 날짜: { date: { start: '2026-10-30T10:00:00+09:00', end: null } } } } });
  assert.equal((await (await w.request('/push-back', { body: { id: meeting.id }, headers: { 'X-Hook-Secret': 'hook' } })).json()).result, 'same', 'not pushed twice');
  assert.match(w.rest.tables.pet_jobs.at(-1).summary, /노션 날짜를 옮겼어요/);
});

test('without GPT the rows still come in, titles cut to 50 characters', async () => {
  const w = world();
  w.notionDb.push({ id: 'p1', title: '긴 제목 '.repeat(20), date: '2026-10-29' });
  w.rest.tables.connections.push({ id: 'c1', user_id: 'user-1', provider: 'notion', meta: { workspace_id: 'ws1' }, secret: { access_token: 'ntn' } });
  await w.request('/subscribe', { body: { resource_id: 'db1', type: 'database' }, headers: app });
  await w.settle();
  assert.equal(Array.from(w.rest.tables.todos[0].title).length, 50);
});

test('no duplicates: a row GPT matches to a hand-written to-do attaches to it, one already from another tool is skipped, and last week stays', async () => {
  const w = world({ gpt: () => [
    { external_id: 'p1', same_as: 'g1', title: '투자 미팅', date: '2026-10-29', start_time: '15:00', end_time: null, done: false },
    { external_id: 'p2', same_as: 'm1', title: '주간 보고', date: '2026-10-30', start_time: '10:00', end_time: null, done: false },
    { external_id: 'p3', same_as: 'm1', title: '주간 보고 (중복)', date: '2026-10-30', start_time: null, end_time: null, done: false },
  ] });
  w.notionDb.push({ id: 'p1', title: '투자 미팅', date: '2026-10-29' }, { id: 'p2', title: '주간 보고', date: '2026-10-30' }, { id: 'p3', title: '주간 보고', date: '2026-10-30' });
  w.rest.tables.connections.push({ id: 'c1', user_id: 'user-1', provider: 'notion', meta: { workspace_id: 'ws1' }, secret: { access_token: 'ntn' } });
  w.rest.tables.todos.push(
    { id: 'm1', user_id: 'user-1', title: '주간 보고 쓰기', date: '2026-10-30', start_time: null, status: 'todo', deleted_at: null, origin: null },
    { id: 'g1', user_id: 'user-1', title: '투자 미팅', date: '2026-10-29', start_time: '15:00', status: 'todo', deleted_at: null, origin: { provider: 'google', subscription: 'gcal' } });
  const sub = (await (await w.request('/subscribe', { body: { resource_id: 'db1', type: 'database' }, headers: app })).json()).subscription;
  await w.settle();
  const todos = w.rest.tables.todos;
  assert.equal(todos.length, 3, 'nothing new: p1 is the Google meeting, p2 and p3 are the hand-written report');
  const mine = todos.find((t) => t.id === 'm1');
  assert.deepEqual([mine.title, mine.start_time, mine.origin.provider, mine.origin.id], ['주간 보고 쓰기', '10:00', 'notion', 'p2'], 'keeps its title, takes the source schedule');
  // A to-do imported last week is not in this week's query: it stays (history), it is not treated as deleted.
  todos.push({ id: 'old', user_id: 'user-1', title: '지난주 일', date: '2026-10-21', status: 'done', deleted_at: null, origin: { provider: 'notion', subscription: sub.id, id: 'gone-row', remote: {} } });
  await w.request('/sync', { body: { id: sub.id }, headers: app });
  await w.settle();
  assert.equal(todos.find((t) => t.id === 'old').deleted_at, null);
});
