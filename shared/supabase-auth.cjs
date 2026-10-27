'use strict';
/*
 * 이메일 + 비밀번호 로그인 (Supabase Auth의 REST API, 의존성 없음). 데스크톱 main, 웹 서버, 휴대폰, 연동 서버가 같이 쓴다.
 * 세션 { accessToken, refreshToken, expiresAt(ms), user: { id, email } } 을 돌려준다. 동기화(supabase-sync.cjs)는
 * cfg.token(= accessToken)으로 DB에 붙고, DB 정책은 그 사람의 행(user_id = auth.uid())만 보여 준다.
 */
const MESSAGES = [
  [/invalid login credentials|invalid_credentials/i, '이메일 또는 비밀번호가 맞지 않아요.'],
  [/already registered|already been registered|user_already_exists/i, '이미 가입된 이메일이에요. 로그인해 주세요.'],
  [/email not confirmed|email_not_confirmed/i, '메일함에서 가입 확인 링크를 먼저 눌러 주세요.'],
  [/password should be at least|weak_password/i, '비밀번호는 6자 이상이어야 해요.'],
  [/unable to validate email|invalid email|email_address_invalid/i, '이메일 주소를 확인해 주세요.'],
  [/rate limit|too many|over_email_send_rate_limit/i, '잠시 후 다시 시도해 주세요.'],
  [/signups not allowed|signup_disabled|email_provider_disabled|email signups are disabled/i, '지금은 이메일로 가입할 수 없어요.'],
  [/refresh token|invalid_grant|session_not_found/i, '다시 로그인해 주세요.'],
];
const OFFLINE = '로그인하지 못했어요. 인터넷 연결을 확인해 주세요.';
// Only a request that never got an answer is a connection problem; anything else unknown shows what the server said.
const friendly = (text) => (text ? (MESSAGES.find(([re]) => re.test(text)) || [null, '로그인하지 못했어요. (' + text + ')'])[1] : OFFLINE);

class AuthError extends Error {
  constructor(message, { status = 0, signedOut = false } = {}) { super(message); this.status = status; this.signedOut = signedOut; }
}

async function call(cfg, path, body, token) {
  const request = cfg.fetch || globalThis.fetch;
  let res, text = '';
  try {
    res = await request(String(cfg.url).replace(/\/+$/, '') + '/auth/v1/' + path, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: 'Bearer ' + (token || cfg.key), 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    text = await res.text();
  } catch { throw new AuthError(OFFLINE); }
  const json = text ? (() => { try { return JSON.parse(text); } catch { return {}; } })() : {};
  if (!res.ok) {
    const raw = [json.error_code, json.code, json.msg, json.message, json.error_description, json.error].filter(Boolean).join(' ');
    throw new AuthError(friendly(raw || 'HTTP ' + res.status), { status: res.status, signedOut: path.includes('refresh_token') && res.status < 500 });
  }
  return json;
}

const toSession = (j) => ({
  accessToken: j.access_token,
  refreshToken: j.refresh_token,
  expiresAt: Date.now() + (Number(j.expires_in) || 3600) * 1000,
  user: { id: j.user?.id, email: j.user?.email },
});

// 가입. 이메일 확인이 켜져 있으면 세션 없이 { confirm: true } — 메일의 링크를 누른 뒤 로그인한다.
async function signUp(cfg, email, password) {
  const j = await call(cfg, 'signup', { email: String(email).trim(), password });
  return j.access_token ? { session: toSession(j) } : { confirm: true };
}
async function signIn(cfg, email, password) {
  return toSession(await call(cfg, 'token?grant_type=password', { email: String(email).trim(), password }));
}
async function refresh(cfg, session) {
  return toSession(await call(cfg, 'token?grant_type=refresh_token', { refresh_token: session.refreshToken }));
}
// 만료 1분 전부터는 새 토큰으로 바꿔 둔다. 바뀌지 않았으면 같은 세션을 돌려준다.
async function fresh(cfg, session, now = Date.now()) {
  if (!session?.refreshToken) throw new AuthError('다시 로그인해 주세요.', { signedOut: true });
  return session.expiresAt - now > 60_000 ? session : refresh(cfg, session);
}
async function signOut(cfg, session) {
  if (session?.accessToken) await call(cfg, 'logout', {}, session.accessToken).catch(() => {});
}
// 비밀번호를 잊었을 때: 재설정 메일을 보낸다.
async function recover(cfg, email) {
  await call(cfg, 'recover', { email: String(email).trim() });
}

// 한 기기의 로그인 상태. load/save는 세션을 그 기기 방식대로(파일, AsyncStorage 등) 읽고 쓴다(비동기여도 된다).
// current()는 만료가 가까우면 새 토큰으로 바꿔 두고, 다시 로그인해야 하면 세션을 지운 뒤 null을 준다.
function createSessionKeeper(cfg, { load, save }) {
  let session, loaded = null, renewing = null;
  const ready = () => (loaded ||= Promise.resolve().then(load).then((s) => { session = s?.refreshToken ? s : null; }).catch(() => { session = null; }));
  const keep = async (next) => { session = next; await save(next); return next; };
  return {
    async current() {
      await ready();
      if (!session) return null;
      renewing ||= fresh(cfg, session)
        .then((next) => (next === session ? next : keep(next)))
        .catch((e) => (e.signedOut ? keep(null) : session)) // offline: keep the old one and try again later
        .finally(() => { renewing = null; });
      return renewing;
    },
    async account() { await ready(); return session ? { id: session.user.id, email: session.user.email } : null; },
    async signIn(email, password) { await ready(); return keep(await signIn(cfg, email, password)); },
    async signUp(email, password) {
      await ready();
      const r = await signUp(cfg, email, password);
      if (r.session) await keep(r.session);
      return r;
    },
    async signOut() { await ready(); const old = session; await keep(null); await signOut(cfg, old); },
    recover: (email) => recover(cfg, email),
  };
}

module.exports = { signUp, signIn, refresh, fresh, signOut, recover, createSessionKeeper, AuthError, friendly };
