import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { toolAccounts, connectionIds, stillWaiting } from '../src/tool-accounts.mjs';
const tools = createRequire(import.meta.url)('../electron/tools.cjs');

const state = {
  connections: [
    { id: 'g1', provider: 'google', account: 'me@home.com' },
    { id: 'n1', provider: 'notion', account: '스튜디오' },
    { id: 'g2', provider: 'google', account: 'me@work.com' },
  ],
  subscriptions: [
    { id: 's1', provider: 'google', connection_id: 'g2', title: '업무' },
    { id: 's2', provider: 'google', connection_id: 'g1', title: '개인' },
    { id: 's3', provider: 'google', connection_id: null, title: '옛 캘린더' },
    { id: 's4', provider: 'google', connection_id: 'gone', title: '모르는 계정' },
    { id: 's5', provider: 'notion', connection_id: 'n1', title: '주간 업무' },
  ],
};

test('accounts of a tool: in connect order, each with its own subscriptions; empty or unknown ids go under the first', () => {
  const g = toolAccounts(state, 'google');
  assert.deepEqual(g.map((a) => a.conn.id), ['g1', 'g2']);
  assert.deepEqual(g[0].subs.map((s) => s.id), ['s2', 's3', 's4']);
  assert.deepEqual(g[1].subs.map((s) => s.id), ['s1']);
  assert.deepEqual(toolAccounts(state, 'notion').map((a) => a.subs.map((s) => s.id)), [['s5']]);
  assert.deepEqual(toolAccounts({ connections: [], subscriptions: state.subscriptions }, 'google'), [], 'no account, nothing to list');
  assert.deepEqual(toolAccounts(null, 'google'), []);
  assert.deepEqual(connectionIds(state, 'google'), ['g1', 'g2']);
});

test('+ 계정 추가 waits for a NEW connection id, not any connection, and gives up after the limit', () => {
  const waiting = { google: { at: 1000, known: ['g1'] }, notion: { at: 1000, known: [] } };
  const one = { connections: [{ id: 'g1', provider: 'google' }] };
  assert.deepEqual(Object.keys(stillWaiting(waiting, one, 2000, 60_000)), ['google', 'notion'], 'the account already there does not count');
  assert.deepEqual(Object.keys(stillWaiting(waiting, state, 2000, 60_000)), [], 'g2 and n1 are new');
  assert.deepEqual(stillWaiting(waiting, one, 61_000, 60_000), {}, 'two minutes are up');
  assert.deepEqual(stillWaiting({}, state, 0, 1), {});
});

test('tools pass-through: connectionId reaches pages / subscribe, { id } disconnects one account', async () => {
  const calls = [];
  const reply = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ route: u.pathname.replace('/functions/v1/integrations', ''), search: u.searchParams, body: init.body ? JSON.parse(init.body) : undefined });
    return reply(u.pathname.endsWith('/notion/pages') ? { pages: [] } : u.pathname.endsWith('/subscribe') ? { subscription: { id: 's1' } } : { ok: true });
  };
  const c = tools.client({ url: 'https://x.supabase.co', key: 'pub', fetch }, async () => 'tok');
  assert.equal((await tools.run(c, 'pages', { q: '주간', connectionId: 'n2' })).ok, true);
  assert.equal(calls.at(-1).search.get('connection'), 'n2');
  assert.equal(calls.at(-1).search.get('q'), '주간');
  await tools.run(c, 'pages', { q: '' });
  assert.equal(calls.at(-1).search.get('connection'), null, 'no id: the first workspace');
  await tools.run(c, 'subscribe', { resourceId: 'p1', type: 'database', connectionId: 'n2' });
  assert.deepEqual(calls.at(-1).body, { resource_id: 'p1', type: 'database', connection_id: 'n2' });
  await tools.run(c, 'disconnect', { id: 'g2' });
  assert.deepEqual(calls.at(-1), { route: '/disconnect', search: calls.at(-1).search, body: { id: 'g2' } });
  await tools.run(c, 'disconnect', { provider: 'google' });
  assert.deepEqual(calls.at(-1).body, { provider: 'google' });
  assert.equal((await tools.run(c, 'disconnect', {})).ok, false, 'neither an account nor a tool');
  assert.equal((await tools.run(c, 'pages', { connectionId: 'x'.repeat(300) })).ok, false);
});
