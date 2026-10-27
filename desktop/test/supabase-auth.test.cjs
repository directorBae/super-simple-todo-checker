const test = require('node:test');
const assert = require('node:assert/strict');
const auth = require('../../shared/supabase-auth.cjs');

// A stand-in for Supabase Auth's REST endpoints.
function fakeAuth({ confirm = false } = {}) {
  const users = new Map(), calls = [];
  const reply = (status, body) => ({ ok: status < 400, status, text: async () => JSON.stringify(body) });
  const session = (email) => ({ access_token: 'at-' + email + '-' + calls.length, refresh_token: 'rt-' + email, expires_in: 3600, user: { id: 'id-' + email, email } });
  async function fetch(url, init) {
    const path = url.split('/auth/v1/')[1], body = JSON.parse(init.body || '{}');
    calls.push({ path, auth: init.headers.Authorization });
    if (path === 'signup') {
      if (users.has(body.email)) return reply(422, { code: 'user_already_exists', msg: 'User already registered' });
      if (String(body.password).length < 6) return reply(422, { code: 'weak_password', msg: 'Password should be at least 6 characters.' });
      users.set(body.email, body.password);
      return reply(200, confirm ? { id: 'id-' + body.email, email: body.email } : session(body.email));
    }
    if (path === 'token?grant_type=password') return users.get(body.email) === body.password ? reply(200, session(body.email)) : reply(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    if (path === 'token?grant_type=refresh_token') return body.refresh_token?.startsWith('rt-') ? reply(200, session(body.refresh_token.slice(3))) : reply(400, { error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token' });
    if (path === 'logout') return reply(204, {});
    return reply(404, {});
  }
  return { fetch, calls };
}
const cfg = (f) => ({ url: 'https://x.supabase.co', key: 'pub', fetch: f.fetch });

test('sign up, sign in and refresh give a session; errors come back in Korean', async () => {
  const f = fakeAuth();
  const up = await auth.signUp(cfg(f), ' me@a.com ', 'secret1');
  assert.equal(up.session.user.email, 'me@a.com'); assert.ok(up.session.expiresAt > Date.now());
  await assert.rejects(auth.signUp(cfg(f), 'me@a.com', 'secret1'), /이미 가입된 이메일/);
  await assert.rejects(auth.signUp(cfg(f), 'x@a.com', '123'), /6자 이상/);
  await assert.rejects(auth.signIn(cfg(f), 'me@a.com', 'wrong!'), /이메일 또는 비밀번호가 맞지 않아요/);
  const s = await auth.signIn(cfg(f), 'me@a.com', 'secret1');
  assert.equal(s.user.id, 'id-me@a.com');
  assert.equal(await auth.fresh(cfg(f), s), s, 'a session that is still good is kept');
  const renewed = await auth.fresh(cfg(f), { ...s, expiresAt: Date.now() + 10_000 });
  assert.notEqual(renewed.accessToken, s.accessToken);
  await assert.rejects(auth.fresh(cfg(f), { ...s, refreshToken: 'gone', expiresAt: 0 }), (e) => e.signedOut === true && /다시 로그인/.test(e.message));
});

test('with email confirmation on, sign-up asks to confirm instead of logging in', async () => {
  const f = fakeAuth({ confirm: true });
  assert.deepEqual(await auth.signUp(cfg(f), 'new@a.com', 'secret1'), { confirm: true });
});

test('the session keeper remembers the login, renews it and forgets it on sign-out or a dead refresh token', async () => {
  const f = fakeAuth(); let saved = null;
  await auth.signUp(cfg(f), 'me@a.com', 'secret1');
  const keeper = auth.createSessionKeeper(cfg(f), { load: () => saved, save: (s) => { saved = s; } });
  assert.equal(await keeper.current(), null);
  await keeper.signIn('me@a.com', 'secret1');
  assert.deepEqual(await keeper.account(), { id: 'id-me@a.com', email: 'me@a.com' });
  saved = { ...saved, expiresAt: 0 };
  const again = auth.createSessionKeeper(cfg(f), { load: () => saved, save: (s) => { saved = s; } });
  const renewed = await again.current();
  assert.ok(renewed.expiresAt > Date.now() && saved === renewed, 'renewed and stored');
  saved = { ...saved, refreshToken: 'gone', expiresAt: 0 };
  const dead = auth.createSessionKeeper(cfg(f), { load: () => saved, save: (s) => { saved = s; } });
  assert.equal(await dead.current(), null); assert.equal(saved, null);
  await again.signOut(); assert.equal(await again.account(), null);
});
