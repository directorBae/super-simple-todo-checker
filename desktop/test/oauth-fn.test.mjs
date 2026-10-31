// 체커's own OAuth 2.1 server for the public ChatGPT plugin (supabase/functions/_shared/oauth.js), walked through the
// way ChatGPT does it: discovery → 401 challenge → registration → consent → code + PKCE → tokens → MCP → refresh → revoke.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { handle, environment } from '../../supabase/functions/_shared/router.js';

const NOW = Date.parse('2026-11-01T03:00:00Z');
const BASE = 'https://checker.baejeongwon.com', RESOURCE = BASE + '/mcp', REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const b64url = (buf) => buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

function world() {
  let now = NOW;
  const tables = { pet_jobs: [], oauth_clients: [], oauth_grants: [], oauth_codes: [], oauth_tokens: [], todos: [], teams: [], user_prefs: [{ user_id: 'u1', time_zone: 'Asia/Seoul' }], mcp_tokens: [] };
  const match = (row, [key, cond]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
    const v = row[key], [op, ...rest] = cond.split('.'), arg = decodeURIComponent(rest.join('.'));
    if (op === 'eq') return String(v) === arg;
    if (op === 'neq') return String(v) !== arg;
    if (op === 'is') return v === null || v === undefined;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(v));
    if (op === 'gte') return v >= arg;
    if (op === 'lte') return v <= arg;
    throw new Error('filter ' + op);
  };
  const rows = (table, search) => tables[table].filter((r) => [...new URLSearchParams(search)].every((f) => match(r, f)));
  const reply = (body, status = 200) => ({ ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  async function fetch(url, init = {}) {
    const u = new URL(url), method = init.method || 'GET';
    if (u.pathname === '/auth/v1/user') return init.headers.Authorization === 'Bearer user-token' ? reply({ id: 'u1' }) : reply({}, 401);
    const table = u.pathname.split('/').pop();
    if (method === 'GET') return reply(rows(table, u.search).map((r) => structuredClone(r)));
    if (method === 'POST') { const add = JSON.parse(init.body).map((r) => ({ id: crypto.randomUUID(), created_at: new Date(now).toISOString(), revoked_at: null, used_at: null, last_used_at: null, ...r })); tables[table].push(...add); return reply(add, 201); }
    if (method === 'PATCH') { const r = rows(table, u.search); r.forEach((x) => Object.assign(x, JSON.parse(init.body))); return reply(r.map((x) => structuredClone(x))); }
  }
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc', SUPABASE_ANON_KEY: 'pub', STATE_SECRET: 's', HOOK_SECRET: 'h', TIME_ZONE: 'Asia/Seoul' })[k], { fetch, now: () => now, waitUntil: (p) => p });
  const at = (path) => 'https://x.supabase.co/functions/v1/integrations' + path;
  const call = (path, { method = 'POST', json, form, headers = {} } = {}) => handle(new Request(at(path), {
    method, headers: { ...(json ? { 'Content-Type': 'application/json' } : form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...headers },
    body: json ? JSON.stringify(json) : form ? new URLSearchParams(form).toString() : undefined,
  }), env);
  return { tables, call, tick: (ms) => { now += ms; } };
}

test('oauth: discovery, the 401 challenge, registration and consent', async () => {
  const w = world();
  const meta = await (await w.call('/.well-known/oauth-authorization-server', { method: 'GET' })).json();
  assert.equal(meta.issuer, BASE); assert.equal(meta.authorization_endpoint, BASE + '/oauth/authorize'); assert.equal(meta.token_endpoint, BASE + '/oauth/token');
  assert.equal(meta.registration_endpoint, BASE + '/oauth/register'); assert.deepEqual(meta.code_challenge_methods_supported, ['S256']);
  assert.equal(meta.authorization_response_iss_parameter_supported, true);
  const resource = await (await w.call('/.well-known/oauth-protected-resource', { method: 'GET' })).json();
  assert.deepEqual({ resource: resource.resource, servers: resource.authorization_servers }, { resource: RESOURCE, servers: [BASE] });
  const locked = await w.call('/mcp', { json: { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} } });
  assert.equal(locked.status, 401);
  assert.match(locked.headers.get('www-authenticate'), /^Bearer resource_metadata="https:\/\/checker\.baejeongwon\.com\/\.well-known\/oauth-protected-resource", scope="todos"$/);

  assert.equal((await w.call('/oauth/register', { json: { redirect_uris: ['http://evil.example/cb'] } })).status, 400);
  assert.equal((await w.call('/oauth/register', { json: { redirect_uris: [REDIRECT], token_endpoint_auth_method: 'client_secret_basic' } })).status, 400);
  const reg = await w.call('/oauth/register', { json: { redirect_uris: [REDIRECT], client_name: 'ChatGPT', token_endpoint_auth_method: 'none' } });
  assert.equal(reg.status, 201);
  const client = await reg.json();
  assert.match(client.client_id, /^c_/); assert.equal(client.token_endpoint_auth_method, 'none');

  const ask = { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: 'x'.repeat(43), code_challenge_method: 'S256', state: 'st', resource: RESOURCE };
  assert.deepEqual(await (await w.call('/oauth/check', { json: ask })).json(), { client_name: 'ChatGPT', redirect_host: 'chatgpt.com', scope: 'todos' });
  for (const bad of [{ redirect_uri: 'https://evil.example/cb' }, { code_challenge_method: 'plain' }, { client_id: 'nope' }, { resource: 'https://other.example/mcp' }]) {
    assert.equal((await w.call('/oauth/check', { json: { ...ask, ...bad } })).status, 400, JSON.stringify(bad));
  }
  assert.equal((await w.call('/oauth/approve', { json: ask })).status, 401, 'only a signed-in person can allow');
  const denied = new URL((await (await w.call('/oauth/deny', { json: ask })).json()).redirect);
  assert.deepEqual([denied.origin + denied.pathname, denied.searchParams.get('error'), denied.searchParams.get('state'), denied.searchParams.get('iss')], [REDIRECT, 'access_denied', 'st', BASE]);
});

test('oauth: code + PKCE → tokens → the MCP tools as that person → refresh rotates → cut off in the app', async () => {
  const w = world();
  const client = await (await w.call('/oauth/register', { json: { redirect_uris: [REDIRECT], client_name: 'ChatGPT' } })).json();
  const verifier = 'v'.repeat(64), challenge = b64url(createHash('sha256').update(verifier).digest());
  const ask = { response_type: 'code', client_id: client.client_id, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: 'S256', state: 'st', resource: RESOURCE };
  const allow = async () => new URL((await (await w.call('/oauth/approve', { json: ask, headers: { Authorization: 'Bearer user-token' } })).json()).redirect);
  const back = await allow();
  assert.equal(back.searchParams.get('state'), 'st'); assert.equal(back.searchParams.get('iss'), BASE);
  const code = back.searchParams.get('code');
  assert.ok(code.length > 40); assert.ok(!w.tables.oauth_codes.some((c) => c.code_hash === code), 'only the hash is stored');

  const exchange = (form) => w.call('/oauth/token', { form: { grant_type: 'authorization_code', client_id: client.client_id, redirect_uri: REDIRECT, resource: RESOURCE, ...form } });
  const wrong = await exchange({ code: (await allow()).searchParams.get('code'), code_verifier: 'w'.repeat(64) });
  assert.equal(wrong.status, 400); assert.equal((await wrong.json()).error, 'invalid_grant');
  const ok = await exchange({ code, code_verifier: verifier });
  assert.equal(ok.status, 200); assert.equal(ok.headers.get('cache-control'), 'no-store');
  const tokens = await ok.json();
  assert.equal(tokens.token_type, 'Bearer'); assert.equal(tokens.expires_in, 3600); assert.ok(tokens.refresh_token);
  assert.equal((await exchange({ code, code_verifier: verifier })).status, 400, 'a code works once');
  assert.equal(w.tables.oauth_grants.length, 1, 'allowing again reuses the same connection');

  const mcp = (token, msg) => w.call('/mcp', { json: { jsonrpc: '2.0', id: 1, ...msg }, headers: { Authorization: 'Bearer ' + token } });
  const tools = (await (await mcp(tokens.access_token, { method: 'tools/list' })).json()).result.tools;
  assert.deepEqual(tools[0].securitySchemes, [{ type: 'oauth2', scopes: ['todos'] }]);
  assert.ok(tools.every((t) => ['readOnlyHint', 'destructiveHint', 'openWorldHint'].every((k) => typeof t.annotations[k] === 'boolean')), 'every hint explicit');
  assert.deepEqual(tools.filter((t) => t.annotations.destructiveHint).map((t) => t.name), ['update_todo', 'delete_todo']);
  const added = (await (await mcp(tokens.access_token, { method: 'tools/call', params: { name: 'add_todos', arguments: { todos: [{ title: '공개 플러그인으로 넣은 일' }] } } })).json()).result;
  assert.equal(added.structuredContent.added.length, 1); assert.equal(w.tables.todos[0].user_id, 'u1');
  assert.ok(w.tables.oauth_grants[0].last_used_at);

  // An hour later the access token is gone; the refresh token brings a new pair once.
  w.tick(3601_000);
  assert.equal((await mcp(tokens.access_token, { method: 'tools/list' })).status, 401);
  const refresh = (rt) => w.call('/oauth/token', { form: { grant_type: 'refresh_token', client_id: client.client_id, refresh_token: rt } });
  const fresh = await (await refresh(tokens.refresh_token)).json();
  assert.ok(fresh.access_token && fresh.refresh_token !== tokens.refresh_token);
  assert.equal((await refresh(tokens.refresh_token)).status, 400, 'an old refresh token is spent');
  assert.equal((await mcp(fresh.access_token, { method: 'tools/list' })).status, 200);

  // The app lists the connection; cutting it off stops ChatGPT at once.
  const app = (path, json) => w.call(path, { method: json ? 'POST' : 'GET', json, headers: { Authorization: 'Bearer user-token' } });
  const { grants } = await (await app('/oauth/grants')).json();
  assert.deepEqual(grants.map((g) => g.client_name), ['ChatGPT']);
  await app('/oauth/grants/revoke', { id: grants[0].id });
  const after = await mcp(fresh.access_token, { method: 'tools/list' });
  assert.equal(after.status, 401); assert.match(after.headers.get('www-authenticate'), /error="invalid_token"/);
  assert.equal((await refresh(fresh.refresh_token)).status, 400);
  assert.deepEqual((await (await app('/oauth/grants')).json()).grants, []);
});
