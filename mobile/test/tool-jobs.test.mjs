import test from 'node:test';
import assert from 'node:assert/strict';
import { toastOf, followJobs, subscriptionLine, ago } from '../src/tool-jobs.js';

const now = Date.parse('2026-10-28T09:00:00Z');
const at = (ms) => new Date(now - ms).toISOString();
const job = (o) => ({ id: 'j1', provider: 'notion', kind: 'import', state: 'reading', summary: '노션 "주간 업무" 읽는 중', updated_at: at(1000), ...o });

test('running jobs show their step with the right icon', () => {
  assert.deepEqual(toastOf(job()), { icon: '📄', text: '노션 "주간 업무" 읽는 중…', active: true });
  assert.equal(toastOf(job({ state: 'thinking' })).text, '노션 "주간 업무" 생각하는 중…');
  assert.equal(toastOf(job({ state: 'writing' })).icon, '✏️');
  assert.equal(toastOf(job({ state: 'writing', summary: '' })).text, '노션 적는 중…');
});

test('finished jobs show the summary for a while', () => {
  assert.deepEqual(toastOf(job({ state: 'done', summary: '노션 "주간 업무"에서 2개 추가' })), { icon: '✅', text: '노션 "주간 업무"에서 2개 추가', ms: 5000 });
  assert.equal(toastOf(job({ state: 'error', summary: '읽지 못했어요' })).icon, '⚠️');
  assert.equal(toastOf(job({ kind: 'push', state: 'done', summary: '"회의" — 노션 날짜를 옮겼어요' })).ms, 3000);
});

test('only jobs that finish after the first look are news', () => {
  const first = followJobs(null, [job({ id: 'old', state: 'done' }), job({ id: 'run' })], now);
  assert.equal(first.finished.length, 0);
  assert.equal(first.active.id, 'run');
  const second = followJobs(first.known, [job({ id: 'run', state: 'done' }), job({ id: 'old', state: 'done' }), job({ id: 'push', kind: 'push', state: 'done' })], now);
  assert.deepEqual(second.finished.map((j) => j.id), ['run', 'push']);
  assert.equal(second.active, null);
  assert.equal(followJobs(second.known, [job({ id: 'run', state: 'done' })], now).finished.length, 0);
});

test('a job stuck for minutes is not shown as running', () => {
  assert.equal(followJobs(null, [job({ updated_at: at(10 * 60_000) })], now).active, null);
});

test('subscription status line', () => {
  assert.equal(subscriptionLine({ state: 'idle', last_synced_at: at(5 * 60_000) }, now).text, '지켜보는 중 · 5분 전 읽음');
  assert.equal(subscriptionLine({ state: 'syncing' }, now).text, '읽는 중…');
  assert.deepEqual(subscriptionLine({ state: 'error', last_error: '권한 없음' }, now), { text: '오류: 권한 없음', error: true });
  assert.equal(ago(at(10_000), now), '방금');
  assert.equal(ago(at(3 * 3600_000), now), '3시간 전');
});

test('accounts group their watched items; unknown connections go with the first account', async () => {
  const { accountsOf, newConnection } = await import('../src/tool-jobs.js');
  const state = {
    connections: [{ id: 'g1', provider: 'google', account: 'me@gmail.com' }, { id: 'n1', provider: 'notion', account: '개인' }, { id: 'n2', provider: 'notion', account: '회사' }],
    subscriptions: [{ id: 's1', provider: 'notion', connection_id: 'n2' }, { id: 's2', provider: 'notion', connection_id: null }, { id: 's3', provider: 'google', connection_id: 'g1' }, { id: 's4', provider: 'notion', connection_id: 'n1' }],
  };
  const notion = accountsOf(state, 'notion');
  assert.deepEqual(notion.map((a) => [a.conn.id, a.subs.map((s) => s.id)]), [['n1', ['s2', 's4']], ['n2', ['s1']]]);
  assert.deepEqual(accountsOf(state, 'google').map((a) => a.subs.length), [1]);
  assert.deepEqual(accountsOf({ connections: [], subscriptions: [{ id: 'x', provider: 'google' }] }, 'google'), []);
  assert.deepEqual(accountsOf(null, 'notion'), []);
  assert.equal(newConnection(state.connections, 'notion', ['n1', 'n2']), false);
  assert.equal(newConnection(state.connections, 'notion', ['n1']), true);
  assert.equal(newConnection(state.connections, 'google', []), true);
  assert.equal(newConnection([], 'google', []), false);
});
