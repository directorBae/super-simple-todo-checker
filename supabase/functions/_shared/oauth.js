// 체커's own OAuth 2.1 server, for the public ChatGPT plugin: people sign in with their 체커 account (the same Supabase
// login as the apps) on checker.baejeongwon.com/oauth/authorize and allow ChatGPT; ChatGPT then calls the MCP server
// (checker.baejeongwon.com/mcp → /mcp here) with our own bearer token. The site forwards these paths to this function.
//   Discovery: /.well-known/oauth-authorization-server (RFC 8414), /.well-known/oauth-protected-resource (RFC 9728)
//   Registration: POST /oauth/register (RFC 7591, public clients) · Token: POST /oauth/token · Revocation: POST /oauth/revoke
//   Consent page: POST /oauth/check (is this request valid?), /oauth/approve (with the person's session), /oauth/deny
// Authorization code + PKCE (S256 only), one-time codes for 10 minutes, access tokens for an hour, refresh tokens for
// 60 days that change on every use. Codes and tokens are stored only as SHA-256; people see and cut off what they
// allowed in the app (설정 → 도구 연결 → ChatGPT).
import { db, eq, userOf } from './db.js';
import { HttpError } from './http.js';
import { mcpReply, sha256, newKey } from './mcp.js';

export const SCOPE = 'todos';
const CODE_MS = 10 * 60_000, ACCESS_MS = 60 * 60_000, REFRESH_MS = 60 * 86_400_000;
export const issuerOf = (env) => (env.OAUTH_ISSUER || 'https://checker.baejeongwon.com').replace(/\/+$/, '');
export const resourceOf = (env) => issuerOf(env) + '/mcp';

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...headers } });
class OAuthError extends Error { constructor(error, description, status = 400) { super(description); this.error = error; this.status = status; } }
export const oauthReply = (e) => json({ error: e.error, error_description: e.message }, e.status);
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const pkce = async (verifier) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
const iso = (ms) => new Date(ms).toISOString();

export const serverMetadata = (env) => ({
  issuer: issuerOf(env),
  authorization_endpoint: issuerOf(env) + '/oauth/authorize',
  token_endpoint: issuerOf(env) + '/oauth/token',
  registration_endpoint: issuerOf(env) + '/oauth/register',
  revocation_endpoint: issuerOf(env) + '/oauth/revoke',
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: [SCOPE],
  authorization_response_iss_parameter_supported: true,
  client_id_metadata_document_supported: false,
  service_documentation: issuerOf(env),
});
export const resourceMetadata = (env) => ({
  resource: resourceOf(env),
  authorization_servers: [issuerOf(env)],
  scopes_supported: [SCOPE],
  bearer_methods_supported: ['header'],
  resource_name: '체커',
  resource_documentation: issuerOf(env),
});

// ---- registration (RFC 7591): public clients with exact https redirect URIs ----
const okRedirect = (u) => {
  try {
    const url = new URL(u);
    if (url.hash) return false;
    return url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname));
  } catch { return false; }
};
export async function register(env, body) {
  const uris = Array.isArray(body?.redirect_uris) ? body.redirect_uris.map(String) : [];
  if (!uris.length || uris.length > 10 || !uris.every(okRedirect)) throw new OAuthError('invalid_redirect_uri', 'redirect_uris must be https URLs.');
  if (body.token_endpoint_auth_method && body.token_endpoint_auth_method !== 'none') throw new OAuthError('invalid_client_metadata', 'Only public clients (token_endpoint_auth_method "none") are supported.');
  const client = { client_id: 'c_' + newKey(), client_name: String(body.client_name || 'MCP client').slice(0, 80), redirect_uris: uris };
  await db(env).insert('oauth_clients', [client]);
  return json({ ...client, client_id_issued_at: Math.floor(env.now() / 1000), grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: SCOPE }, 201);
}

// ---- the consent page (checker.baejeongwon.com/oauth/authorize) ----
// A request that can't be trusted is shown as an error on the page; it is never sent anywhere.
async function checked(env, p) {
  if (p.response_type !== 'code') throw new HttpError('지원하지 않는 요청이에요 (response_type).', 400);
  const [client] = p.client_id ? await db(env).select('oauth_clients', `client_id=${eq(String(p.client_id))}&select=*`) : [];
  if (!client) throw new HttpError('등록되지 않은 앱이에요.', 400);
  if (!client.redirect_uris.includes(p.redirect_uri)) throw new HttpError('돌아갈 주소가 등록된 것과 달라요.', 400);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(p.code_challenge || '') || p.code_challenge_method !== 'S256') throw new HttpError('보안 확인값(PKCE S256)이 없어요.', 400);
  if (p.resource && p.resource !== resourceOf(env)) throw new HttpError('다른 서비스를 위한 요청이에요.', 400);
  return client;
}
export async function check(env, p) {
  const client = await checked(env, p);
  return { client_name: client.client_name, redirect_host: new URL(p.redirect_uri).host, scope: SCOPE };
}
const backTo = (env, p, params) => {
  const url = new URL(p.redirect_uri);
  for (const [k, v] of Object.entries({ ...params, state: p.state, iss: issuerOf(env) })) if (v) url.searchParams.set(k, v);
  return url.toString();
};
// Allowed by the signed-in person (their app session in the Authorization header): a one-time code goes back.
export async function approve(env, req, p) {
  const user = await userOf(env, req), client = await checked(env, p), store = db(env), now = env.now();
  const [kept] = await store.select('oauth_grants', `user_id=${eq(user.id)}&client_id=${eq(client.client_id)}&revoked_at=is.null&select=id&order=created_at.desc&limit=1`);
  const grant = kept || (await store.insert('oauth_grants', [{ user_id: user.id, client_id: client.client_id, client_name: client.client_name, scope: SCOPE }]))[0];
  const code = newKey() + newKey();
  await store.insert('oauth_codes', [{ code_hash: await sha256(code), grant_id: grant.id, redirect_uri: p.redirect_uri, code_challenge: p.code_challenge, resource: p.resource || null, expires_at: iso(now + CODE_MS) }]);
  return { redirect: backTo(env, p, { code }) };
}
export async function deny(env, p) {
  await checked(env, p);
  return { redirect: backTo(env, p, { error: 'access_denied', error_description: '사용자가 허락하지 않았어요.' }) };
}

// ---- tokens ----
async function issue(env, store, grant, resource) {
  const access = newKey() + newKey(), refresh = newKey() + newKey(), now = env.now();
  await store.insert('oauth_tokens', [
    { token_hash: await sha256(access), grant_id: grant.id, kind: 'access', resource, expires_at: iso(now + ACCESS_MS) },
    { token_hash: await sha256(refresh), grant_id: grant.id, kind: 'refresh', resource, expires_at: iso(now + REFRESH_MS) },
  ]);
  return json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_MS / 1000, refresh_token: refresh, scope: SCOPE });
}
const activeGrant = async (store, id) => (await store.select('oauth_grants', `id=${eq(id)}&revoked_at=is.null&select=*`))[0];
const formOf = async (req) => {
  const type = req.headers.get('content-type') || '';
  if (type.includes('application/json')) return (await req.json().catch(() => ({}))) || {};
  return Object.fromEntries(new URLSearchParams(await req.text()));
};
export async function token(env, req) {
  const p = await formOf(req), store = db(env), now = env.now();
  if (!p.client_id) throw new OAuthError('invalid_client', 'client_id is required.', 401);
  if (p.resource && p.resource !== resourceOf(env)) throw new OAuthError('invalid_target', 'Unknown resource.');
  if (p.grant_type === 'authorization_code') {
    const [code] = p.code ? await store.select('oauth_codes', `code_hash=${eq(await sha256(p.code))}&select=*`) : [];
    if (!code || code.used_at || Date.parse(code.expires_at) < now) throw new OAuthError('invalid_grant', 'The code is invalid or expired.');
    // Single use: only the request that marks it used goes on.
    const used = await store.update('oauth_codes', `code_hash=${eq(code.code_hash)}&used_at=is.null`, { used_at: iso(now) });
    if (!used.length) throw new OAuthError('invalid_grant', 'The code was already used.');
    const grant = await activeGrant(store, code.grant_id);
    if (!grant || grant.client_id !== p.client_id || code.redirect_uri !== p.redirect_uri) throw new OAuthError('invalid_grant', 'The code does not match this client.');
    if (!p.code_verifier || (await pkce(p.code_verifier)) !== code.code_challenge) throw new OAuthError('invalid_grant', 'PKCE verification failed.');
    if (p.resource && code.resource && p.resource !== code.resource) throw new OAuthError('invalid_target', 'Resource does not match.');
    return issue(env, store, grant, code.resource || p.resource || resourceOf(env));
  }
  if (p.grant_type === 'refresh_token') {
    const [old] = p.refresh_token ? await store.select('oauth_tokens', `token_hash=${eq(await sha256(p.refresh_token))}&kind=eq.refresh&select=*`) : [];
    if (!old || old.revoked_at || Date.parse(old.expires_at) < now) throw new OAuthError('invalid_grant', 'The refresh token is invalid or expired.');
    const grant = await activeGrant(store, old.grant_id);
    if (!grant || grant.client_id !== p.client_id) throw new OAuthError('invalid_grant', 'The refresh token does not match this client.');
    const revoked = await store.update('oauth_tokens', `token_hash=${eq(old.token_hash)}&revoked_at=is.null`, { revoked_at: iso(now) });
    if (!revoked.length) throw new OAuthError('invalid_grant', 'The refresh token was already used.');
    return issue(env, store, grant, old.resource);
  }
  throw new OAuthError('unsupported_grant_type', 'Use authorization_code or refresh_token.');
}
// RFC 7009: always 200. A refresh token takes the whole connection with it.
export async function revoke(env, req) {
  const p = await formOf(req), store = db(env);
  if (p.token) {
    const [t] = await store.select('oauth_tokens', `token_hash=${eq(await sha256(p.token))}&select=*`);
    if (t && t.kind === 'refresh') await cutGrant(env, store, t.grant_id);
    else if (t) await store.update('oauth_tokens', `token_hash=${eq(t.token_hash)}`, { revoked_at: iso(env.now()) });
  }
  return json({});
}
async function cutGrant(env, store, grantId) {
  const at = iso(env.now());
  await store.update('oauth_grants', `id=${eq(grantId)}`, { revoked_at: at });
  await store.update('oauth_tokens', `grant_id=${eq(grantId)}&revoked_at=is.null`, { revoked_at: at });
}

// ---- the protected MCP resource (/mcp) ----
const challenge = (env, error) => json({ error: error || 'unauthorized', error_description: '체커에 로그인해 주세요.' }, 401, {
  'WWW-Authenticate': `Bearer resource_metadata="${issuerOf(env)}/.well-known/oauth-protected-resource", scope="${SCOPE}"` + (error ? `, error="${error}"` : ''),
});
export async function mcpWithToken(env, req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.get('authorization') || '');
  if (!m) return challenge(env);
  const store = db(env), now = env.now();
  const [t] = await store.select('oauth_tokens', `token_hash=${eq(await sha256(m[1]))}&kind=eq.access&select=*`);
  if (!t || t.revoked_at || Date.parse(t.expires_at) < now || (t.resource && t.resource !== resourceOf(env))) return challenge(env, 'invalid_token');
  const grant = await activeGrant(store, t.grant_id);
  if (!grant) return challenge(env, 'invalid_token');
  if (!grant.last_used_at || now - Date.parse(grant.last_used_at) > 60_000) await store.update('oauth_grants', `id=${eq(grant.id)}`, { last_used_at: iso(now) }).catch(() => {});
  return mcpReply(env, req, grant.user_id, { oauth: true });
}

// ---- the app: what the person allowed, and cutting it off ----
export const listGrants = (env, userId) => db(env).select('oauth_grants', `user_id=${eq(userId)}&revoked_at=is.null&select=id,client_name,created_at,last_used_at&order=created_at.desc`);
export async function revokeGrant(env, userId, id) {
  const store = db(env), [g] = await store.select('oauth_grants', `id=${eq(id)}&user_id=${eq(userId)}&select=id`);
  if (g) await cutGrant(env, store, g.id);
}
export { OAuthError };
