const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../index');

test('imports keep their source (Notion/Google) through the server, and a copy that lost it gets it back', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'todo-origin-'));
  const app = createApp({ dir, token: 'test', supabaseEnv: {} });
  t.after(() => { app.store.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const origin = { type: 'external', provider: 'google', subscription: 's1', id: 'ev1', url: 'https://calendar.google.com/e', remote: { title: '회의', date: '2026-10-29', start_time: '10:00', end_time: null, done: false }, junk: 'x' };
  app.merge({ todos: [{ id: 'a', title: '회의', status: 'todo', date: '2026-10-29', createdAt: 1, updatedAt: 5, origin }] });
  const kept = app.snapshot().todos[0].origin;
  assert.equal(kept.provider, 'google'); assert.equal(kept.id, 'ev1'); assert.equal(kept.remote.start_time, '10:00'); assert.equal(kept.junk, undefined);
  app.merge({ todos: [{ id: 'b', title: '그냥 할 일', status: 'todo', createdAt: 1, updatedAt: 5, origin: { type: 'app' } }] });
  assert.deepEqual(app.snapshot().todos.find(x => x.id === 'b').origin, { type: 'app' });
  // A copy saved before this fix had { type: 'legacy' }: the same row pulled again restores its source.
  app.store.data.todos.find(x => x.id === 'a').origin = { type: 'legacy' };
  app.merge({ todos: [{ id: 'a', title: '회의', status: 'todo', date: '2026-10-29', createdAt: 1, updatedAt: 5, origin }] });
  assert.equal(app.snapshot().todos.find(x => x.id === 'a').origin.provider, 'google');
  // A newer source snapshot alone (push-back recorded what the source now says) is taken too.
  app.merge({ todos: [{ id: 'a', title: '회의', status: 'todo', date: '2026-10-29', createdAt: 1, updatedAt: 9, origin: { ...origin, remote: { ...origin.remote, date: '2026-10-30' } } }] });
  assert.equal(app.snapshot().todos.find(x => x.id === 'a').origin.remote.date, '2026-10-30');
});
