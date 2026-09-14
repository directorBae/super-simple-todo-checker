const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../index');

test('mobile signs in and manages data without a PC client or pairing code', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-login-'));
  const app = createApp({ dir, token: 'test-shared-session', config: {}, loginPassword: 'independent-test-password' });
  await new Promise(r => app.server.listen(0, '127.0.0.1', r));
  t.after(async () => { await new Promise(r => app.server.close(r)); app.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + app.server.address().port;
  const signin = (password, headers = {}) => fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ password }) });
  assert.equal((await signin('incorrect')).status, 401);
  assert.equal((await signin('independent-test-password', { Origin: 'https://unrelated.example' })).status, 403);
  const session = await (await signin('independent-test-password')).json();
  assert.equal(session.token, 'test-shared-session');
  const headers = { Authorization: 'Bearer ' + session.token, 'Content-Type': 'application/json' };
  const now = Date.now();
  const synced = await (await fetch(base + '/sync', { method: 'POST', headers, body: JSON.stringify({ todos: [{ id: 'mobile-first', title: 'Written on phone', status: 'todo', origin: { type: 'app' }, updatedAt: now, createdAt: now }] }) })).json();
  assert.equal(synced.todos[0].title, 'Written on phone');
  const state = await (await fetch(base + '/integrations/state', { headers })).json();
  assert.equal(state.ok, true);
  assert.equal(JSON.stringify(state).includes('independent-test-password'), false);
  for (let i = 0; i < 10; i++) await signin('incorrect');
  assert.equal((await signin('independent-test-password')).status, 429);
});

test('generated personal password remains valid after restarting and stays in server data', async t => {
  const { createLogin } = require('../lib/login');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checker-login-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const first = createLogin(dir), password = fs.readFileSync(first.passwordFile, 'utf8').trim();
  assert.ok(password.length >= 24);
  const second = createLogin(dir);
  assert.equal((await second.verify(password, 'test-ip')).ok, true);
  assert.equal((await second.verify({}, 'test-ip')).status, 401);
});
