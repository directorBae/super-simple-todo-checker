// Phone reminders sent by the server (supabase/functions/_shared/push.js): the same rules as the app, in the person's
// time zone, sent once each, from the to-dos as they are at that moment.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, environment } from '../../supabase/functions/_shared/router.js';
import { dueReminders, zonedMs } from '../../supabase/functions/_shared/push.js';
import { reminders } from '../../shared/reminders.js';

const SEOUL = 'Asia/Seoul';
const at = (iso) => Date.parse(iso);

// PostgREST in miniature, with on_conflict + ignore-duplicates (only really inserted rows come back).
function world(now) {
  const tables = { push_devices: [], push_sent: [], user_prefs: [], todos: [] }, pushes = [];
  const match = (row, [key, cond]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
    const v = row[key], [op, ...rest] = cond.split('.'), arg = decodeURIComponent(rest.join('.'));
    if (op === 'eq') return String(v) === arg;
    if (op === 'is') return v === null || v === undefined;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(v));
    if (op === 'gte') return v >= arg;
    if (op === 'lte') return v <= arg;
    if (op === 'lt') return v < arg;
    throw new Error('filter ' + op);
  };
  const rows = (table, search) => tables[table].filter((r) => [...new URLSearchParams(search)].every((f) => match(r, f)));
  const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)), json: async () => body });
  let dead = new Set();
  async function fetch(url, init = {}) {
    const u = new URL(url), method = init.method || 'GET';
    if (u.hostname === 'exp.host') {
      const msgs = JSON.parse(init.body); pushes.push(...msgs);
      return reply({ data: msgs.map((m) => (dead.has(m.to) ? { status: 'error', details: { error: 'DeviceNotRegistered' } } : { status: 'ok', id: 't' })) });
    }
    const table = u.pathname.split('/').pop();
    if (method === 'GET') return reply(rows(table, u.search));
    if (method === 'POST') {
      const keys = (u.searchParams.get('on_conflict') || 'id').split(','), ignore = /ignore-duplicates/.test(init.headers?.Prefer || ''), out = [];
      for (const row of JSON.parse(init.body)) {
        const old = tables[table].find((r) => keys.every((k) => r[k] === row[k]));
        if (old && ignore) continue;
        if (old) Object.assign(old, row); else tables[table].push({ sent_at: new Date(now()).toISOString(), ...row });
        out.push(old || tables[table].at(-1));
      }
      return reply(out, 201);
    }
    if (method === 'PATCH') { const r = rows(table, u.search); r.forEach((x) => Object.assign(x, JSON.parse(init.body))); return reply(r); }
    if (method === 'DELETE') { const gone = new Set(rows(table, u.search)); tables[table] = tables[table].filter((r) => !gone.has(r)); return reply(undefined, 204); }
  }
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc', SUPABASE_ANON_KEY: 'pub', STATE_SECRET: 's', HOOK_SECRET: 'hook', TIME_ZONE: SEOUL })[k], { fetch, now, waitUntil: (p) => p });
  const run = () => handle(new Request('https://x.supabase.co/functions/v1/integrations/push', { method: 'POST', headers: { 'X-Hook-Secret': 'hook' } }), env).then((r) => r.json());
  return { tables, pushes, run, killToken: (t) => dead.add(t) };
}

test('push: local times in the person\'s zone, the same reminders the app makes', () => {
  assert.equal(zonedMs('2026-10-31', '21:00', SEOUL), at('2026-10-31T12:00:00Z'));
  assert.equal(zonedMs('2026-03-08', '09:00', 'America/New_York'), at('2026-03-08T13:00:00Z'), 'after the DST change');
  const todos = [
    { id: 'a', status: 'todo', title: '회의', date: '2026-10-31', startTime: '10:00', endTime: '11:00' },
    { id: 'b', status: 'done', title: '메일', date: '2026-10-31' },
    { id: 'c', status: 'todo', title: '정리', date: '2026-10-31' },
    { id: 'd', status: 'todo', title: '밀린 일', date: '2026-10-29' },
  ];
  const from = at('2026-10-30T15:00:00Z'), to = at('2026-10-31T14:59:00Z'); // the whole of Oct 31 in Seoul
  const server = dueReminders(todos, {}, SEOUL, from, to);
  assert.deepEqual(server.map((r) => r.key), ['daily:2026-10-31', 'a:start', 'a:end', 'wrapup:2026-10-31']);
  assert.equal(server.at(-1).body, '남은 할 일 2건을 내일로 전부 미루시겠어요?\n⏳ 회의, 정리');
  // This machine is in Seoul too: the app's own rules give the same reminders at the same moments.
  if (Intl.DateTimeFormat().resolvedOptions().timeZone === SEOUL) assert.deepEqual(server, reminders({ settings: {}, todos }, from, to));
  // Settings from the account: no start/end, a 7:30 morning, wrap-up off.
  const quiet = dueReminders(todos, { notify_start: false, notify_end: false, morning_time: '07:30', wrapup_on: false }, SEOUL, from, to);
  assert.deepEqual(quiet.map((r) => [r.key, new Date(r.at).toISOString()]), [['daily:2026-10-31', '2026-10-30T22:30:00.000Z']]);
});

test('push: every minute, what fell due is sent once to each phone, written from the to-dos as they are now', async () => {
  let now = at('2026-10-31T11:59:00Z'); // 20:59 in Seoul
  const w = world(() => now);
  w.tables.push_devices.push({ user_id: 'u1', token: 'ExponentPushToken[a]', disabled_at: null }, { user_id: 'u1', token: 'ExponentPushToken[b]', disabled_at: null });
  w.tables.user_prefs.push({ user_id: 'u1', time_zone: SEOUL, wrapup_time: '21:00' });
  w.tables.todos.push({ id: 'a', user_id: 'u1', title: '보고서', date: '2026-10-31', status: 'todo', deleted_at: null }, { id: 'b', user_id: 'u1', title: '메일', date: '2026-10-31', status: 'todo', deleted_at: null });
  assert.deepEqual(await w.run(), { ok: true, users: 1, sent: 0 });
  // Done on the desktop before 21:00 — the phone never opened.
  w.tables.todos[0].status = 'done';
  now = at('2026-10-31T12:00:30Z');
  assert.equal((await w.run()).sent, 1);
  assert.deepEqual(w.pushes.map((p) => [p.to, p.title, p.body, p.data.key]), [
    ['ExponentPushToken[a]', '하루 마무리', '남은 할 일 1건을 내일로 전부 미루시겠어요?\n⏳ 메일', 'wrapup:2026-10-31'],
    ['ExponentPushToken[b]', '하루 마무리', '남은 할 일 1건을 내일로 전부 미루시겠어요?\n⏳ 메일', 'wrapup:2026-10-31'],
  ]);
  // The next minute (and a late run) does not send it again.
  now += 60_000; assert.equal((await w.run()).sent, 0); assert.equal(w.pushes.length, 2);
  // A phone that removed the app stops getting them.
  w.killToken('ExponentPushToken[b]');
  w.tables.todos.push({ id: 'c', user_id: 'u1', title: '전화', date: '2026-10-31', start_time: '21:10', status: 'todo', deleted_at: null });
  now = at('2026-10-31T12:10:10Z');
  assert.equal((await w.run()).sent, 1);
  assert.ok(w.tables.push_devices.find((d) => d.token === 'ExponentPushToken[b]').disabled_at);
  now += 60_000; w.tables.todos.push({ id: 'e', user_id: 'u1', title: '마감', date: '2026-10-31', start_time: '21:11', status: 'todo', deleted_at: null });
  await w.run();
  assert.deepEqual(w.pushes.slice(-1).map((p) => [p.to, p.body]), [['ExponentPushToken[a]', '마감 (21:11)']]);
  // Without the hook secret nothing runs.
  const bad = await handle(new Request('https://x.supabase.co/functions/v1/integrations/push', { method: 'POST' }), environment(() => 'x', {}));
  assert.equal(bad.status, 401);
});
