const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../index');
const { migrateTeams } = require('../../desktop/electron/migrate-teams.cjs');
const { mergeResponse } = require('../../desktop/electron/sync-merge.cjs');
async function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-personal-test-'));
  const app = createApp({ dir, token: 'isolated-test-token', config: {} });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => app.server.close(r)); app.store.close(); if (path.dirname(dir) === os.tmpdir() && path.basename(dir).startsWith('checker-personal-test-')) fs.rmSync(dir, { recursive: true, force: true }); });
  const url = 'http://127.0.0.1:' + app.server.address().port;
  const request = (route, body, token = 'isolated-test-token') => fetch(url + route, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body || {}) });
  return { app, request };
}
test('phone pairing is authenticated to issue, single use, origin protected and rate limited', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('/pair/create', {}, '')).status, 401);
  const invitation = await (await request('/pair/create')).json();
  assert.match(invitation.code, /^\d{6}$/);
  const phone = await (await request('/pair', { code: invitation.code }, '')).json();
  assert.equal(phone.token, 'isolated-test-token');
  assert.equal((await request('/pair', { code: invitation.code }, '')).status, 403);
  const next = await (await request('/pair/create')).json();
  for (let i=0;i<10;i++) await request('/pair', { code: 'wrong' }, '');
  assert.equal((await request('/pair', { code: next.code }, '')).status, 403);
});
test('two personal devices converge for create, stale-revision edit, reorder, team move and deletion', async t => {
  const { request } = await fixture(t), now=Date.now();
  const pc={ teams:[{id:'team',name:'Studio',updatedAt:now}], projects:[], todos:[{id:'task',title:'First draft',status:'todo',teamId:'team',origin:{type:'app'},createdAt:now,updatedAt:now}], tombstones:[] };
  const phone=await (await request('/sync',pc)).json();
  pc.todos=phone.todos.map(x=>({...x,title:'PC edit',updatedAt:now+10}));
  await request('/sync',pc);
  phone.todos[0]={...phone.todos[0],title:'Phone edit',teamId:null,sortOrder:42,status:'bucket',updatedAt:now+20};
  const result=await (await request('/sync',phone)).json();
  assert.equal(result.todos[0].title,'Phone edit'); assert.equal(result.todos[0].teamId,null); assert.equal(result.todos[0].sortOrder,42); assert.equal(result.todos[0].status,'bucket'); assert.equal(result.todos[0].clientConflict,undefined);
  const sent=structuredClone(pc); pc.todos[0].title='Typed during request'; pc.todos[0].updatedAt=now+30;
  mergeResponse(pc,sent,result); assert.equal(pc.todos[0].title,'Typed during request');
  const synced=await (await request('/sync',pc)).json(); assert.equal(synced.todos[0].title,'Typed during request');
  const deleted=await (await request('/sync',{tombstones:[{coll:'todos',id:'task',deletedAt:now+40}]})).json(); assert.equal(deleted.todos.length,0);
  const stale=await (await request('/sync',phone)).json(); assert.equal(stale.todos.length,0);
});
test('project migration preserves tasks and converges with deterministic team identities', () => {
  const original={teams:[{id:'existing',name:'Existing'}],projects:[{id:'one',name:'Standalone',updatedAt:1},{id:'two',name:'Grouped',teamId:'existing',updatedAt:1}],todos:[{id:'a',title:'A',projectId:'one'},{id:'b',title:'B',projectId:'two'}],tombstones:[]};
  const a=migrateTeams(structuredClone(original)), b=migrateTeams(structuredClone(original));
  assert.deepEqual(a.teams.map(t=>t.id),b.teams.map(t=>t.id)); assert.equal(a.todos[0].teamId,'project-team-one'); assert.equal(a.todos[1].teamId,'existing'); assert.equal(a.projects.length,0); assert.equal(a.todos.length,2);
  migrateTeams(a); assert.equal(a.teams.length,2); assert.equal(a.tombstones.length,2);
});
test('personal duplicate memory remains on server, outside tool connection state', async t => {
  const { app } = await fixture(t);
  app.store.data.duplicateMemories.push({ id:'private',reason:'private wording' });
  assert.equal(app.integrations.state().duplicateMemories,undefined);
});
test('notepad preserves overnight duration and split line order', async () => {
  const { datePatch, splitLine }=await import('../../mobile/src/notepad.js');
  assert.deepEqual(datePatch({date:'2026-09-14',endDate:'2026-09-15'},'2026-09-20'),{date:'2026-09-20',endDate:'2026-09-21'});
  const parts=splitLine('First\nSecond\nThird',{sortOrder:100},{sortOrder:200});
  assert.equal(parts.length,3); assert.ok(parts[1].sortOrder>100 && parts[2].sortOrder<200);
});
