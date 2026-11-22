// The tools client (shared/tools-client.cjs): a token the server refuses is renewed and the call tried once more.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createToolsClient } = require('../../shared/tools-client.cjs');

const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });

test('a stale sign-in: the server says 로그인해 주세요 (401), the token is renewed and the call goes through', async () => {
  const seen = [], asked = [];
  let current = 'stale';
  const fetch = async (url, init) => { seen.push(init.headers.Authorization); return init.headers.Authorization === 'Bearer fresh' ? reply(200, { ok: true, me: { id: 'u1' } }) : reply(401, { ok: false, error: '로그인해 주세요.' }); };
  const token = async (opts) => { asked.push(opts || null); if (opts?.force) current = 'fresh'; return current; };
  const c = createToolsClient({ url: 'https://x.supabase.co/', key: 'pub', fetch, token });
  assert.deepEqual(await c.work('/state', {}), { ok: true, me: { id: 'u1' } });
  assert.deepEqual(seen, ['Bearer stale', 'Bearer fresh']);
  assert.deepEqual(asked, [null, { force: true }]);
});

test('no new token (offline) or no token at all: a clear message, no endless retries', async () => {
  let calls = 0;
  const fetch = async () => { calls++; return reply(401, { ok: false, error: '로그인해 주세요.' }); };
  const same = createToolsClient({ url: 'https://x.supabase.co', key: 'pub', fetch, token: async () => 'stale' });
  await assert.rejects(same.work('/state'), /로그인 상태를 새로 받지 못했어요/);
  assert.equal(calls, 1, 'the same token is not sent twice');
  const dead = createToolsClient({ url: 'https://x.supabase.co', key: 'pub', fetch, token: async (opts) => (opts?.force ? null : 'stale') });
  await assert.rejects(dead.work('/state'), /^Error: 로그인해 주세요\.$/);
  const out = createToolsClient({ url: 'https://x.supabase.co', key: 'pub', fetch, token: async () => null });
  await assert.rejects(out.work('/state'), /로그인해 주세요/);
  assert.equal(calls, 2);
});

test('other errors come back as the server said them; a good answer needs no renewal', async () => {
  const asked = [];
  const fetch = async (url) => (url.endsWith('/work/team') ? reply(403, { ok: false, error: '팀을 만든 사람만 초대할 수 있어요.' }) : reply(200, { ok: true }));
  const c = createToolsClient({ url: 'https://x.supabase.co', key: 'pub', fetch, token: async (opts) => { asked.push(opts || null); return 'ok'; } });
  await assert.rejects(c.work('/team', { name: 'x' }), /팀을 만든 사람만/);
  assert.deepEqual(await c.work('/state'), { ok: true });
  assert.deepEqual(asked, [null, null]);
});
