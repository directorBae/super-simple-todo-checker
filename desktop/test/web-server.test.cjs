const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createWebService } = require('../scripts/web-server.cjs');

test('browser service serves the app, persists changes and blocks cross-site writes', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-web-'));
  const web = createWebService({ dataDir, config: { timeZone: 'Asia/Seoul', openaiModel: 'test' } });
  await new Promise(resolve => web.core.server.listen(0, '127.0.0.1', resolve));
  await new Promise(resolve => web.server.listen(0, '127.0.0.1', resolve));
  t.after(async () => { await web.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${web.server.address().port}`;
  const post = async (method, value, origin = base) => {
    const res = await fetch(base + '/api/' + method, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: origin }, body: JSON.stringify(value) });
    return { res, data: await res.json() };
  };
  assert.equal((await fetch(base)).status, 200);
  assert.equal((await post('todo/add', { title: 'forged' }, 'https://example.com')).res.status, 403);
  const badHost = await new Promise((resolve, reject) => { const req = http.get(base + '/api/state', { headers: { Host: 'evil.example' } }, res => { res.resume(); resolve(res.statusCode); }); req.on('error', reject); });
  assert.equal(badHost, 403);
  const team = await post('team/add', { name: '팀', color: '#123456' });
  const teamId = team.data.teams[0].id;
  const added = await post('todo/add', { title: '웹에서도 저장되는 할 일 '.repeat(9), teamId });
  assert.equal(added.res.status, 200); assert.equal(added.data.todos.length, 1); assert.ok(Array.from(added.data.todos[0].title).length <= 50);
  const id = added.data.todos[0].id;
  const changed = await post('todo/update', { id, patch: { date: '2026-10-25', startTime: '15:00' } });
  assert.equal(changed.data.todos[0].startTime, '15:00');
  assert.equal((await post('team/delete', { id: teamId })).data.todos[0].teamId, null);
  await post('settings', { focusPet: { name: '구름' }, sync: { token: 'should-not-save' } });
  const state = await fetch(base + '/api/state').then(r => r.json()); assert.equal(state.settings.focusPet.name, '구름'); assert.ok(!JSON.stringify(state).includes('should-not-save'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(dataDir, 'web-settings.json'), 'utf8')).focusPet.name, '구름');
  const wallpaper = await fetch(base + '/api/wallpaper', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base }, body: JSON.stringify({ pet: { name: '구름' } }) });
  assert.equal(wallpaper.status, 200); assert.ok(wallpaper.headers.get('content-disposition').includes('attachment'));
  assert.equal((await post('todo/delete', { id })).data.todos.length, 0);
});
