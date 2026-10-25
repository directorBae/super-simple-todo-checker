const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Storage } = require('../lib/storage');
const { Integrations } = require('../lib/integrations');
const { schedule, fromSchedule, content, ApiError } = require('../lib/common');
const { createApp } = require('../index');
const { mergeResponse } = require('../../desktop/electron/sync-merge.cjs');

const tempDirs = [];
test.after(() => { for (const dir of tempDirs) { if (path.dirname(dir) !== os.tmpdir() || !path.basename(dir).startsWith('todo-integration-test-')) throw new Error('Unsafe test cleanup'); fs.rmSync(dir, { recursive: true, force: true }); } });
function temporary(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-integration-test-'));
  tempDirs.push(dir);
  return dir;
}
function fixture(t, provider = 'google') {
  const dir = temporary(t), store = new Storage(dir), remote = new Map();
  t.after(() => store.close());
  let creates = 0, updates = 0;
  const adapter = {
    containers: async () => [{ id: 'calendar', label: '일정', writable: true }],
    list: async () => [...remote.values()].map(x => structuredClone(x)),
    get: async (_, key) => structuredClone(remote.get(key) || null),
    recover: async (_, todoId) => structuredClone([...remote.values()].find(r => r.appId === todoId) || null),
    create: async (_, todo) => { creates++; const r = { externalId: 'remote-' + todo.id, version: String(creates), appId: todo.id, data: content(todo), writable: true }; remote.set(r.externalId, r); return structuredClone(r); },
    update: async (_, todo, r) => { updates++; const next = { ...r, data: content(todo), version: String(updates + 10) }; remote.set(r.externalId, next); return structuredClone(next); },
    remove: async (_, r) => { remote.delete(r.externalId); },
  };
  const config = { timeZone: 'Asia/Seoul', openaiModel: 'test', openaiKey: 'test-secret', publicUrl: 'http://localhost:8787', googleClientId: 'client', googleClientSecret: 'secret' };
  const integration = new Integrations(store, config, { providers: { [provider]: { adapter: () => adapter } }, classify: async todo => ({ taskType: 'meeting', teamId: todo.teamId, targetId: 'target', needsReview: false, reason: '미팅' }) });
  store.data.teams.push({ id: 'team', name: '팀' });
  store.data.connections.push({ id: 'connection', provider, accountId: 'account', label: '계정', enabled: true, credentials: store.seal({ accessToken: 'secret-token' }) });
  store.data.targets.push({ id: 'target', connectionId: 'connection', provider, containerId: 'calendar', label: '일정', teamId: 'team', timeZone: 'Asia/Seoul', defaultMinutes: 60, readEnabled: true, writeEnabled: true, autoRoute: true, taskTypes: ['meeting'], mapping: { appId: 'app-id' } });
  const todo = { id: 'todo', title: '내일 미팅', notes: '', date: '2026-09-14', startTime: null, endTime: null, teamId: 'team', kind: 'todo', status: 'todo', createdAt: Date.now(), updatedAt: Date.now(), revision: 1, origin: { type: 'app' } };
  store.data.todos.push(todo);
  return { store, integration, adapter, todo, remote, target: store.data.targets[0], counts: () => ({ creates, updates }), config, dir };
}

test('all-day dates are exclusive remotely and inclusive locally', () => {
  const result = schedule({ date: '2026-09-14', endDate: '2026-09-16' });
  assert.deepEqual(result, { start: { date: '2026-09-14' }, end: { date: '2026-09-17' } });
  assert.equal(fromSchedule(result.start, result.end).endDate, '2026-09-16');
});
test('missing date, invalid date and backwards time are not invented', () => {
  assert.throws(() => schedule({}), /날짜/);
  assert.throws(() => schedule({ date: '2026-02-30' }), /날짜/);
  assert.throws(() => schedule({ date: '2026-09-14', startTime: '14:00', endTime: '13:00' }), /종료/);
  assert.throws(() => schedule({ date: '2026-03-08', startTime: '02:30', timeZone: 'America/New_York' }), /시간/);
});
test('timed schedule preserves timezone and explicit overnight end date', () => {
  const r = schedule({ date: '2026-09-14', endDate: '2026-09-15', startTime: '23:30', endTime: '00:30', timeZone: 'Asia/Seoul' });
  assert.match(r.start.dateTime, /23:30:00.*\+09:00/);
  assert.equal(fromSchedule(r.start, r.end).endDate, '2026-09-15');
  assert.equal(schedule({ date: '2026-09-14', startTime: '14:00' }, 45).end.dateTime.slice(11, 16), '14:45');
});
test('route creates once, then wording update changes the original', async t => {
  const f = fixture(t); f.integration.changed(f.todo);
  await f.integration.cycle(); await f.integration.cycle({ pull: true });
  assert.equal(f.counts().creates, 1); assert.equal(f.store.data.links.length, 1); assert.equal(f.store.data.todos.length, 1);
  f.todo.title = '수정한 미팅'; f.todo.revision++; f.integration.changed(f.todo);
  await f.integration.cycle();
  assert.deepEqual(f.counts(), { creates: 1, updates: 1 });
  assert.equal(f.remote.get('remote-todo').data.title, '수정한 미팅');
});
test('repeated imports retain a single TODO and never start a create pipeline', async t => {
  const f = fixture(t); f.store.data.todos = [];
  const r = { externalId: 'notion-page', version: '1', data: { title: '원본 업무' } };
  f.integration.importRemote(f.target, r); f.integration.importRemote(f.target, r);
  assert.equal(f.store.data.todos.length, 1); assert.equal(f.store.data.todos[0].origin.type, 'external');
  await f.integration.cycle(); assert.equal(f.counts().creates, 0);
});
test('imported titles are trimmed to 50 characters without writing back to the source', async t => {
  const f = fixture(t); f.store.data.todos = [];
  const long = '다음 분기 제품 로드맵 초안을 정리하고 디자인팀·개발팀과 일정 및 우선순위를 맞춘 뒤 리뷰 회의 안건으로 올리기';
  const r = { externalId: 'notion-long', version: '1', data: { title: long, notes: '' } };
  f.integration.importRemote(f.target, r); f.integration.importRemote(f.target, r);
  const todo = f.store.data.todos[0];
  assert.equal(Array.from(todo.title).length, 50); assert.ok(todo.title.endsWith('…'));
  assert.ok(todo.notes.includes('원문: ' + long));
  await f.integration.cycle(); assert.deepEqual(f.counts(), { creates: 0, updates: 0 });
});
test('lost create response is recovered by stable identity, never title', async t => {
  const f = fixture(t); const create = f.adapter.create;
  f.adapter.create = async (...args) => { await create(...args); throw new Error('connection lost'); };
  f.integration.changed(f.todo); await f.integration.cycle();
  assert.equal(f.store.data.jobs[0].state, 'uncertain');
  f.store.data.jobs[0].nextAttemptAt = 0; await f.integration.cycle();
  assert.equal(f.counts().creates, 1); assert.equal(f.store.data.jobs[0].state, 'done');
});
test('uncertain Notion create never blindly creates again if lookup is empty', async t => {
  const f = fixture(t, 'notion'); let attempts = 0;
  f.adapter.create = async () => { attempts++; throw new Error('timeout'); };
  f.integration.changed(f.todo); await f.integration.cycle();
  f.store.data.jobs[0].nextAttemptAt = 0; await f.integration.cycle();
  assert.equal(attempts, 1); assert.equal(f.store.data.jobs[0].state, 'uncertain');
});
test('two-sided edits block update until explicitly resolved', async t => {
  const f = fixture(t); f.integration.changed(f.todo); await f.integration.cycle();
  f.todo.title = '앱 수정'; f.todo.revision++; f.integration.changed(f.todo);
  f.remote.get('remote-todo').data.title = '원본 수정';
  await f.integration.cycle({ pull: true });
  assert.ok(f.store.data.links[0].conflict); assert.equal(f.counts().updates, 0);
  await f.integration.action({ action: 'resolve', todoId: f.todo.id, choice: 'local' });
  await f.integration.cycle(); assert.equal(f.remote.get('remote-todo').data.title, '앱 수정');
});
test('local deletion prevents an imported original from reappearing', async t => {
  const f = fixture(t); f.integration.changed(f.todo); await f.integration.cycle();
  f.store.data.todos = []; await f.integration.cycle({ pull: true });
  assert.equal(f.store.data.todos.length, 0); assert.equal(f.store.data.links.length, 1);
});
test('remote deletion never creates a replacement', async t => {
  const f = fixture(t); f.integration.changed(f.todo); await f.integration.cycle(); f.remote.clear();
  await f.integration.cycle({ pull: true });
  f.todo.title = '삭제 후 수정'; f.todo.revision++; f.integration.changed(f.todo); await f.integration.cycle();
  assert.equal(f.counts().creates, 1); assert.ok(f.store.data.links[0].deleted);
});
test('edit while create is running is sent in a subsequent update', async t => {
  const f = fixture(t), create = f.adapter.create;
  f.adapter.create = async (...args) => { const result = await create(...args); f.todo.title = '더 최근 수정'; f.todo.revision++; f.integration.changed(f.todo); return result; };
  f.integration.changed(f.todo); await f.integration.cycle(); await f.integration.cycle();
  assert.equal(f.remote.get('remote-todo').data.title, '더 최근 수정'); assert.equal(f.counts().creates, 1);
});
test('AI cannot send a task to another organization or read-only target', async t => {
  const f = fixture(t); f.target.teamId = 'other-team'; f.integration.changed(f.todo); await f.integration.cycle();
  assert.equal(f.counts().creates, 0); assert.equal(f.todo.routing.state, 'needs_review');
  f.target.teamId = 'team'; f.target.writeEnabled = false;
  await assert.rejects(f.integration.action({ action: 'route', todoId: f.todo.id, targetId: f.target.id }), /조직/);
});
test('public integration status does not contain provider credentials', t => {
  const f = fixture(t); assert.ok(!JSON.stringify(f.integration.state()).includes('secret-token')); assert.ok(!JSON.stringify(f.integration.state()).includes('test-secret'));
  assert.equal(f.store.unseal(f.store.data.connections[0].credentials).accessToken, 'secret-token');
});
test('local SQLite restart preserves links and marks running jobs uncertain', t => {
  const dir = temporary(t); const first = new Storage(dir);
  first.data.jobs.push({ id: 'job', state: 'running' }); first.data.links.push({ todoId: 'a', externalId: 'original' }); first.save(); first.close();
  const second = new Storage(dir); assert.equal(second.data.jobs[0].state, 'uncertain'); assert.equal(second.data.links[0].externalId, 'original'); second.close();
});
test('JSON migration preserves content items as ordinary legacy TODOs', t => {
  const dir = temporary(t); fs.writeFileSync(path.join(dir, 'db.json'), JSON.stringify({ todos: [{ id: 'old', title: '보존', kind: 'content' }] }));
  const store = new Storage(dir); assert.equal(store.data.todos[0].kind, 'todo'); assert.equal(store.data.todos[0].origin.type, 'legacy'); store.close();
});
test('sync response preserves local edits and deletions made during fetch', () => {
  const sent = { teams: [], projects: [], todos: [{ id: '1', title: 'before', updatedAt: 1 }, { id: '2', title: 'delete', updatedAt: 1 }], tombstones: [] };
  const current = structuredClone(sent); current.todos[0].title = 'after'; current.todos[0].updatedAt = 3; current.todos.pop(); current.tombstones.push({ coll: 'todos', id: '2', deletedAt: 4 });
  mergeResponse(current, sent, { ...sent, todos: sent.todos.map(t => ({ ...t, syncRevision: 2, origin: { type: 'external' } })) });
  assert.equal(current.todos.length, 1); assert.equal(current.todos[0].title, 'after'); assert.equal(current.todos[0].syncRevision, 2);
});
test('server ignores forged provenance and rejects stale revision edits', t => {
  const app = createApp({ dir: temporary(t), token: 'test', config: { multiUser: true } }); t.after(() => { app.server.close(); app.store.close(); });
  const now = Date.now();
  app.merge({ todos: [{ id: 't', title: 'old', status: 'todo', updatedAt: now, createdAt: now, origin: { type: 'legacy' } }] });
  app.merge({ todos: [{ id: 't', title: 'new', status: 'todo', updatedAt: now + 1, syncRevision: 1, origin: { type: 'app' }, integration: { externalId: 'forged' } }] });
  assert.equal(app.store.data.todos[0].origin.type, 'legacy'); assert.equal(app.snapshot().todos[0].integration.externalId, null);
  app.merge({ todos: [{ id: 't', title: 'stale', status: 'todo', updatedAt: now + 2, syncRevision: 1 }] });
  assert.equal(app.store.data.todos[0].title, 'new'); assert.ok(app.store.data.todos[0].clientConflict);
});
test('HTTP state and actions require token, health is public', async t => {
  const app = createApp({ dir: temporary(t), token: 'test-token' });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await new Promise(resolve => app.server.close(resolve)); app.store.close(); });
  const url = 'http://127.0.0.1:' + app.server.address().port;
  assert.equal((await fetch(url + '/health')).status, 200);
  assert.equal((await fetch(url + '/integrations/state')).status, 401);
  assert.equal((await fetch(url + '/integrations/state', { headers: { Authorization: 'Bearer test-token' } })).status, 200);
  assert.equal((await fetch(url + '/integrations/action', { method: 'POST', headers: { Authorization: 'Bearer test-token' }, body: JSON.stringify({ action: 'oauth-start', provider: 'unknown' }) })).status, 400);
});

test('assignee scope excludes existing imports, retains other sources and restores the same identity', async t=>{
  const f=fixture(t,'notion'); f.store.data.todos=[];
  const remote={externalId:'assigned-page',version:'1',data:{title:'My assignment'}};
  f.remote.set(remote.externalId,remote);await f.integration.pull(f.target);
  const original=f.store.data.todos[0],link=f.store.data.links[0];
  f.remote.set(remote.externalId,{...remote,inScope:false}); f.adapter.list=async()=>[];
  await f.integration.pull(f.target);assert.equal(f.integration.excluded(original.id),true);assert.equal(link.deleted,false);
  f.store.data.links.push({id:'calendar-link',todoId:original.id,targetId:'another',externalId:'event'});
  assert.equal(f.integration.excluded(original.id),false);f.store.data.links.pop();
  f.remote.set(remote.externalId,remote);await f.integration.pull(f.target);
  assert.equal(f.integration.excluded(original.id),false);assert.equal(f.store.data.todos.length,1);assert.equal(f.store.data.todos[0].id,original.id);
});
test('reassignment immediately before an outgoing write prevents modifying another assignee task',async t=>{
  const f=fixture(t,'notion'); const remote={externalId:'page',version:'1',data:content(f.todo)};
  f.integration.linkRemote(f.todo,f.target,remote);f.remote.set('page',{...remote,inScope:false});
  f.todo.title='Local edit';f.todo.revision++;f.integration.changed(f.todo);
  await f.integration.cycle();assert.equal(f.counts().updates,0);assert.equal(f.store.data.jobs[0].state,'superseded');assert.equal(f.integration.excluded(f.todo.id),true);
});
test('filtered sync excludes in-flight edits without creating deletion tombstones and can restore',()=>{
  const original={id:'filtered',title:'before',updatedAt:1},current={todos:[{...original,title:'edit',updatedAt:2}],tombstones:[]};
  mergeResponse(current,{todos:[original]}, {todos:[],excludedTodoIds:['filtered'],tombstones:[]});
  assert.equal(current.todos.length,0);assert.equal(current.tombstones.length,0);
  mergeResponse(current,{todos:[]},{todos:[original],excludedTodoIds:[],tombstones:[]});assert.equal(current.todos[0].id,'filtered');
});
test('Notion target validates people property and account and preserves filter for older clients',async t=>{
  const f=fixture(t,'notion'),userId='11111111-1111-4111-8111-111111111111';
  f.adapter.schema=async()=>[{id:'title',type:'title'},{id:'owner',type:'people'},{id:'app-id',type:'rich_text'}];
  f.adapter.user=async id=>({id,label:'Me'});
  const p={connectionId:'connection',containerId:'calendar',teamId:'team',mapping:{title:'title',appId:'app-id'},writeEnabled:true,assigneeFilter:{propertyId:'title',userId}};
  await assert.rejects(f.integration.saveTarget(p),/담당자/);
  p.assigneeFilter.propertyId='owner';await f.integration.saveTarget(p);assert.equal(f.target.assigneeFilter.userName,'Me');
  delete p.assigneeFilter;await f.integration.saveTarget(p);assert.equal(f.target.assigneeFilter.userId,userId);
  p.assigneeFilter=null;await f.integration.saveTarget(p);assert.equal(f.target.assigneeFilter,null);
});
test('server snapshots hide reassigned tasks while retaining offline edits and identity for restoration',t=>{
  const app=createApp({dir:temporary(t),token:'test-token',config:{},loginPassword:'test-password-for-scope'});
  t.after(()=>{app.server.emit('close');app.store.close();});
  const now=Date.now();
  app.store.data.todos=[{id:'scoped',title:'Old title',status:'todo',origin:{type:'external'},revision:1,createdAt:now-1000,updatedAt:now-1000}];
  app.store.data.links=[{id:'link',todoId:'scoped',targetId:'notion-source',externalId:'page',excluded:true}];
  app.merge({todos:[{id:'scoped',title:'Offline edit',status:'todo',createdAt:now-1000,updatedAt:now}]});
  assert.equal(app.snapshot().todos.length,0);assert.deepEqual(app.snapshot().excludedTodoIds,['scoped']);
  assert.equal(app.store.data.todos[0].title,'Offline edit');assert.equal(app.store.data.tombstones.length,0);
  app.store.data.links[0].excluded=false;
  assert.equal(app.snapshot().todos[0].id,'scoped');assert.equal(app.snapshot().todos[0].title,'Offline edit');
});
