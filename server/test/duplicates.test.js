const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../index');
const { Storage } = require('../lib/storage');
const { suggestDuplicates } = require('../lib/duplicates');
const { mergeResponse } = require('../../desktop/electron/sync-merge.cjs');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-duplicates-'));
  const remotes = new Map(), writes = [], containers = ['source-a', 'source-b', 'source-c'].map(id => ({ id, label: '업무 DB', writable: true }));
  const adapter = {
    containers: async () => containers,
    schema: async () => [{ id: 'title', type: 'title' }, { id: 'app-id', type: 'rich_text' }],
    list: async target => [...remotes.values()].filter(r => r.targetId === target.id).map(r => structuredClone(r)),
    get: async (target, externalId) => structuredClone(remotes.get(target.id + externalId)),
    update: async (target, todo, remote) => { writes.push({ targetId: target.id, externalId: remote.externalId, title: todo.title }); const next = { ...remote, data: { ...remote.data, title: todo.title }, version: remote.version + 'x' }; remotes.set(target.id + remote.externalId, next); return next; },
    remove: async (target, remote) => { writes.push({ operation: 'delete', externalId: remote.externalId }); remotes.delete(target.id + remote.externalId); },
    recover: async () => null,
    create: async () => { throw new Error('Unexpected duplicate creation'); },
  };
  const app = createApp({ dir, token: 'test', config: { timeZone: 'Asia/Seoul', openaiKey: 'test', openaiModel: 'test' }, overrides: { providers: { notion: { adapter: () => adapter } } } });
  t.after(() => { app.server.close(); app.store.close(); const resolved = path.resolve(dir); if (path.dirname(resolved) !== os.tmpdir() || !path.basename(resolved).startsWith('todo-duplicates-')) throw new Error('Unsafe cleanup'); fs.rmSync(resolved, { recursive: true, force: true }); });
  const engine = app.integrations, db = app.store.data;
  db.teams.push({ id: 'team-a', name: 'A팀' }, { id: 'team-b', name: 'B팀' });
  for (const id of ['account-a', 'account-b']) db.connections.push({ id, provider: 'notion', accountId: id, label: id, enabled: true, credentials: app.store.seal({ accessToken: id }) });
  async function target(containerId, teamId = 'team-a', connectionId = 'account-a', isDefault = false) {
    await engine.action({ action: 'save-target', connectionId, containerId, teamId, mapping: { title: 'title', appId: 'app-id' }, writeEnabled: true, autoRoute: true, isDefault });
    return db.targets.find(t => t.connectionId === connectionId && t.containerId === containerId);
  }
  function add(target, externalId, title) {
    const remote = { targetId: target.id, externalId, version: '1', writable: true, data: { title, notes: '고객사 일정', date: '2026-09-14', startTime: '14:00', status: 'todo' } };
    remotes.set(target.id + externalId, remote); engine.importRemote(target, remote);
    return db.todos.find(t => db.links.some(l => l.todoId === t.id && l.targetId === target.id && l.externalId === externalId));
  }
  function decide(a, b, action = 'merge-duplicates') { return engine.action({ action, todoId: a.id, otherTodoId: b.id, revisions: { [a.id]: a.revision, [b.id]: b.revision }, reason: '고객사 착수 회의의 서로 다른 표현' }); }
  return { ...app, dir, db, engine, target, add, decide, remotes, writes };
}

test('one organization retains multiple Notion sources/accounts and its existing default', async t => {
  const f = fixture(t), a = await f.target('source-a', 'team-a', 'account-a', true), b = await f.target('source-b', 'team-a', 'account-b'), c = await f.target('source-c', 'team-b', 'account-b', true);
  assert.equal(f.db.targets.length, 3); assert.ok(a.isDefault); assert.ok(c.isDefault); assert.ok(!b.isDefault);
  const todo = f.add(a, 'a', '업무'); f.add(b, 'b', '업무'); const other = f.add(c, 'c', '업무');
  assert.deepEqual(f.engine.candidates(todo).map(t => t.id), [a.id, b.id]);
  assert.equal(other.teamId, 'team-b');
  await assert.rejects(f.decide(todo, other), /같은 조직/);
  await assert.rejects(f.target('source-a', 'team-b', 'account-b'), /이미 연결/);
});
test('merge stores exact wording and sources, imports stay singular, edits update both originals', async t => {
  const f = fixture(t), ta = await f.target('source-a'), tb = await f.target('source-b');
  const a = f.add(ta, 'original-a', '고객사 킥오프'), b = f.add(tb, 'original-b', '프로젝트 착수 회의');
  await f.decide(a, b);
  assert.equal(f.db.todos.length, 1); assert.equal(a.title, '고객사 킥오프'); assert.equal(f.engine.decorate(a).integration.sources.length, 2);
  assert.deepEqual(f.db.duplicateMemories[0].members.map(m => m.snapshot.title), ['고객사 킥오프', '프로젝트 착수 회의']);
  assert.equal(f.db.duplicateMemories[0].members[1].sources[0].externalId, 'original-b');
  await f.engine.cycle({ pull: true }); assert.equal(f.db.todos.length, 1); assert.equal(f.writes.length, 0);
  a.title = '확정된 킥오프'; a.revision++; f.engine.changed(a); await f.engine.cycle();
  assert.deepEqual(f.writes.map(w => w.externalId).sort(), ['original-a', 'original-b']); assert.ok(f.writes.every(w => w.title === a.title));
  await f.engine.cycle({ pull: true }); assert.equal(f.db.todos.length, 1);
});
test('multiple originals in the same source keep distinct update jobs and selective deletion', async t => {
  const f = fixture(t), target = await f.target('source-a'); const a = f.add(target, 'one', '킥오프'), b = f.add(target, 'two', '착수');
  await f.decide(a, b); a.title = '회의 확정'; a.revision++; f.engine.changed(a); await f.engine.cycle();
  assert.equal(f.writes.length, 2); assert.equal(new Set(f.writes.map(w => w.externalId)).size, 2);
  await assert.rejects(f.engine.action({ action: 'delete-remote', todoId: a.id }), /원본을 선택/);
  const link = f.db.links.find(l => l.externalId === 'two'); await f.engine.action({ action: 'delete-remote', todoId: a.id, linkId: link.id }); await f.engine.cycle();
  assert.equal(f.writes.filter(w => w.operation === 'delete').length, 1); assert.ok(f.remotes.has(target.id + 'one'));
});
test('remembered source is adopted after reconnect and stays suppressed after canonical deletion', async t => {
  const f = fixture(t), target = await f.target('source-a'); const a = f.add(target, 'one', '킥오프'), b = f.add(target, 'two', '착수'); await f.decide(a, b);
  const next = { ...target, id: 'reconnected-target' }; f.db.targets.push(next);
  f.engine.importRemote(next, { externalId: 'two', version: '2', data: { title: '재연결된 착수 회의' } });
  assert.equal(f.db.todos.length, 1); assert.ok(f.db.links.some(l => l.targetId === next.id && l.todoId === a.id));
  f.db.todos = []; f.engine.importRemote({ ...next, id: 'another-connection' }, { externalId: 'two', data: { title: '다시 가져옴' } }); assert.equal(f.db.todos.length, 0);
});
test('merge aliases and memory survive restart and reject stale offline resurrection', async t => {
  const f = fixture(t), target = await f.target('source-a'); const a = f.add(target, 'one', '킥오프'), b = f.add(target, 'two', '착수'); const old = structuredClone(b); await f.decide(a, b);
  f.merge({ todos: [{ ...old, updatedAt: Date.now() + 1000 }] }); assert.equal(f.db.todos.length, 1);
  const sent = { todos: [old] }, current = { todos: [{ ...old, title: '오프라인 수정', updatedAt: Date.now() + 1000 }], tombstones: [] };
  mergeResponse(current, sent, f.snapshot()); assert.ok(!current.todos.some(t => t.id === b.id));
  const row = JSON.parse(f.store.sql.prepare('SELECT data FROM state WHERE id=1').get().data); assert.equal(row.todoAliases[b.id], a.id); assert.equal(row.duplicateMemories.length, 1);
  const reopened = new Storage(f.dir); assert.equal(reopened.data.todoAliases[b.id], a.id); assert.equal(reopened.data.duplicateMemories[0].members[1].snapshot.title, '착수'); reopened.close();
  f.merge({ todos: [{ ...old, title: '오프라인에서 추가로 수정', updatedAt: Date.now() + 2000 }] });
  assert.equal(a.clientConflict.incoming.title, '오프라인에서 추가로 수정'); assert.equal(f.db.todos.length, 1);
});
test('stale decisions and in-flight writes do not merge or create memory', async t => {
  const f = fixture(t), target = await f.target('source-a'); const a = f.add(target, 'one', '킥오프'), b = f.add(target, 'two', '착수');
  await assert.rejects(f.engine.action({ action: 'merge-duplicates', todoId: a.id, otherTodoId: b.id, revisions: {} }), /변경/);
  f.engine.busy = true; await assert.rejects(f.decide(a, b), /동기화/); f.engine.busy = false;
  f.db.jobs.push({ todoId: b.id, state: 'uncertain' }); await assert.rejects(f.decide(a, b), /전송/); assert.equal(f.db.duplicateMemories.length, 0);
});
test('duplicate suggestions use same-team personal memory and remember negative decisions', async t => {
  const f = fixture(t), target = await f.target('source-a'), otherTarget = await f.target('source-b', 'team-b');
  const a = f.add(target, 'one', '킥오프'), b = f.add(target, 'two', '착수'), c = f.add(otherTarget, 'three', '킥오프');
  await f.decide(a, b, 'different-duplicates'); let calls = 0;
  f.engine.duplicates.suggest = async (todo, candidates, memories) => { calls++; assert.ok(!candidates.some(x => x.id === c.id)); assert.equal(memories[0].decision, 'different'); return [{ todoId: b.id, confidence: 0.9, reason: '표현 차이' }, { todoId: c.id, confidence: 1, reason: 'invalid' }]; };
  assert.equal((await f.engine.duplicates.candidates(a.id)).matches.length, 0); assert.equal(calls, 0);
  b.notes = '세부 일정 변경'; b.revision++; const result = await f.engine.duplicates.candidates(a.id); assert.deepEqual(result.matches.map(x => x.todoId), [b.id]);
});
test('OpenAI duplicate schema receives confirmed wording memory without credentials and rejects invented IDs', async t => {
  const previous = global.fetch; t.after(() => { global.fetch = previous; });
  global.fetch = async (url, options) => {
    const body = JSON.parse(options.body), input = JSON.parse(body.input);
    assert.equal(body.text.format.strict, true); assert.equal(body.store, false); assert.ok(!body.input.includes('secret')); assert.equal(input.personalMemories[0].members[0].title, '착수 회의');
    return new Response(JSON.stringify({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ matches: [{ todoId: 'b', confidence: 0.9, reason: '동일 일정' }, { todoId: 'invented', confidence: 1, reason: 'bad' }] }) }] }] }));
  };
  const result = await suggestDuplicates({ id: 'a', title: '킥오프' }, [{ id: 'b', title: '착수' }], [{ decision: 'merged', members: [{ snapshot: { title: '착수 회의' } }], credentials: 'secret' }], { openaiKey: 'secret', openaiModel: 'test' });
  assert.deepEqual(result.map(x => x.todoId), ['b']);
});

test('personal memory checks a new app task before any reverse-routing create', async t => {
  const f = fixture(t), target = await f.target('source-a'); const a = f.add(target, 'one', '고객사 킥오프'), b = f.add(target, 'two', '프로젝트 착수'); await f.decide(a, b);
  const next = { ...a, id: 'new-app-task', title: '고객 프로젝트 시작 회의', revision: 1, origin: { type: 'app' }, routing: null };
  f.db.todos.push(next); f.engine.changed(next);
  f.engine.classify = async () => { throw new Error('Classification must wait for duplicate review'); };
  f.engine.duplicates.suggest = async (todo, candidates, memories) => { assert.equal(todo.id, next.id); assert.equal(memories[0].decision, 'merged'); return [{ todoId: a.id, confidence: 0.95, reason: '같은 회의의 표현 차이' }]; };
  await f.engine.cycle(); assert.equal(next.routing.state, 'needs_review'); assert.match(next.routing.reason, /중복 후보/); assert.equal(f.db.jobs.length, 0);
  await f.decide(next, a, 'different-duplicates'); assert.equal(next.routing.state, 'pending'); assert.equal(next.duplicateReview.length, 0);
});

test('Notion tokens from the same workspace remain separate and legacy reconnect preserves targets', async t => {
  const f = fixture(t);
  const first = await f.engine.addConnection('notion', { accessToken: 'token-one' }, { accountId: 'bot-one', workspaceId: 'workspace', label: '팀 연결 1' });
  const second = await f.engine.addConnection('notion', { accessToken: 'token-two' }, { accountId: 'bot-two', workspaceId: 'workspace', label: '팀 연결 2' });
  assert.notEqual(first, second);
  f.db.connections.find(c => c.id === first).accountId = 'workspace';
  assert.equal(await f.engine.addConnection('notion', { accessToken: 'token-one' }, { accountId: 'bot-one', workspaceId: 'workspace', label: '재연결' }), first);
  assert.equal(f.db.connections.find(c => c.id === second).accountId, 'bot-two');
});
