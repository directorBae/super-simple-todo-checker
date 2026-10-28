// The `integrations` Edge Function: every route the app, the providers and the database call.
//   App (Authorization: Bearer <login token>)
//     POST /oauth/start {provider}          → { url } to open in the browser
//     GET  /notion/pages?q=                 → pages and databases to subscribe to
//     POST /subscribe {resource_id, type}   → subscribe to a Notion page/DB (first import starts right away)
//     POST /unsubscribe {id} · /disconnect {provider} · /sync {id}
//   Providers: GET /oauth/callback/<provider>, POST /webhook/notion, POST /webhook/google
//   Database (X-Hook-Secret): POST /push-back {id}, POST /renew, POST /sweep (Mon/Thu morning check-up)
import { HttpError, hmac, safeEqual, signState, readState } from './http.js';
import { db, eq, userOf } from './db.js';
import * as notion from './notion.js';
import * as google from './google.js';
import { syncSubscription, syncSoon, pushBack } from './sync.js';
import { sweep } from './sweep.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
const reply = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' } });
// The page people land on after connecting. Supabase serves function responses on supabase.co as plain text (no
// HTML there), so the result goes to the checker site, which shows it.
const page = (title, text, ok = true) => new Response(null, {
  status: 302,
  headers: { Location: 'https://checker.baejeongwon.com/connected?' + new URLSearchParams({ ok: ok ? '1' : '0', title, text }) },
});

const later = (env, promise) => env.waitUntil(promise.catch((e) => console.error(e)));
const channelToken = (env, id) => hmac(env.STATE_SECRET, 'channel:' + id);

async function watchCalendar(env, store, conn, sub) {
  const access = (await google.fresh(env, conn.secret, env.now())).access;
  const id = crypto.randomUUID();
  const channel = await google.watch(env, access, sub.resource_id, id, await channelToken(env, id), env.now());
  await store.update('subscriptions', 'id=' + eq(sub.id), { meta: { ...sub.meta, channel } });
  return channel;
}
// Google: every calendar the person owns or edits becomes a subscription with its own change channel.
async function subscribeCalendars(env, store, conn) {
  const { access, secret } = await google.fresh(env, conn.secret, env.now());
  if (secret) { conn.secret = secret; await store.update('connections', 'id=' + eq(conn.id), { secret }); }
  const subs = [];
  for (const cal of await google.calendars(env, access)) {
    const [sub] = await store.insert('subscriptions', [{ user_id: conn.user_id, connection_id: conn.id, provider: 'google', resource_type: 'calendar', resource_id: cal.id, title: cal.title, url: 'https://calendar.google.com/calendar/r', meta: { primary: cal.primary } }], { upsert: true, onConflict: 'connection_id,resource_id' });
    await watchCalendar(env, store, conn, sub).catch((e) => console.error('watch 실패', cal.id, e.message));
    subs.push(sub);
  }
  return subs;
}

async function oauthCallback(env, provider, url) {
  const store = db(env);
  if (url.searchParams.get('error')) return page('연결을 취소했어요', '앱에서 다시 시도할 수 있어요.', false);
  const state = await readState(env.STATE_SECRET, url.searchParams.get('state'), env.now());
  if (state.provider !== provider) throw new HttpError('연결 요청이 맞지 않아요.', 400);
  const got = await (provider === 'notion' ? notion : google).exchange(env, url.searchParams.get('code'), env.now());
  // One row per account: a second Google account (or Notion workspace) is connected next to the first.
  const [conn] = await store.insert('connections', [{ user_id: state.user, provider, account: got.account, account_key: got.key, meta: got.meta, secret: got.secret }], { upsert: true, onConflict: 'user_id,provider,account_key' });
  if (provider === 'google') {
    const subs = await subscribeCalendars(env, store, conn);
    for (const sub of subs) later(env, syncSubscription(env, sub.id));
    return page('구글 캘린더를 연결했어요', `캘린더 ${subs.length}개를 펫이 지켜볼게요. 앱으로 돌아가세요.`);
  }
  return page('노션을 연결했어요', '앱으로 돌아가서 펫이 지켜볼 페이지나 DB를 골라 주세요.');
}

async function notionWebhook(env, req) {
  const store = db(env), raw = await req.text(), body = JSON.parse(raw || '{}');
  // First contact: Notion sends a verification token; keep it (it also signs every later event) and show it in the logs.
  if (body.verification_token) {
    await store.insert('webhook_keys', [{ provider: 'notion', token: body.verification_token }], { upsert: true, onConflict: 'provider' });
    console.log('Notion webhook verification token received — paste it into the Notion integration page.');
    return reply({ ok: true });
  }
  const [key] = await store.select('webhook_keys', 'provider=eq.notion&select=token');
  const signature = req.headers.get('x-notion-signature') || '';
  if (!key || !safeEqual(signature, 'sha256=' + (await hmac(key.token, raw)))) throw new HttpError('서명이 맞지 않아요.', 401);
  const workspace = notion.plainId(body.workspace_id), ids = [body.entity?.id, body.data?.parent?.id].filter(Boolean).map(notion.plainId);
  const conns = await store.select('connections', `provider=eq.notion&meta->>workspace_id=${eq(workspace)}&select=id`);
  if (!conns.length || !ids.length) return reply({ ok: true, matched: 0 });
  const subs = await store.select('subscriptions', `connection_id=in.(${conns.map((c) => c.id).join(',')})&resource_id=in.(${ids.join(',')})&select=id`);
  for (const s of subs) later(env, syncSoon(env, s.id));
  return reply({ ok: true, matched: subs.length });
}
async function googleWebhook(env, req) {
  const id = req.headers.get('x-goog-channel-id'), state = req.headers.get('x-goog-resource-state');
  if (!id || state === 'sync') return reply({ ok: true });
  if (!safeEqual(req.headers.get('x-goog-channel-token'), await channelToken(env, id))) throw new HttpError('채널이 맞지 않아요.', 401);
  const subs = await db(env).select('subscriptions', `meta->channel->>id=${eq(id)}&select=id`);
  for (const s of subs) later(env, syncSoon(env, s.id));
  return reply({ ok: true });
}
// Google channels last a week at most: renew the ones ending within two days.
async function renew(env) {
  const store = db(env), soon = env.now() + 2 * 86400_000;
  const subs = await store.select('subscriptions', 'provider=eq.google&select=*');
  let renewed = 0;
  for (const sub of subs) {
    if ((sub.meta.channel?.expiration || 0) > soon) continue;
    const [conn] = await store.select('connections', 'id=' + eq(sub.connection_id) + '&select=*');
    if (!conn) continue;
    const { access } = await google.fresh(env, conn.secret, env.now());
    await google.stop(env, access, sub.meta.channel);
    await watchCalendar(env, store, conn, sub).then(() => renewed++, (e) => console.error('갱신 실패', sub.id, e.message));
  }
  return reply({ ok: true, renewed });
}

async function forgetSubscription(env, store, sub) {
  if (sub.provider === 'google' && sub.meta.channel) {
    const [conn] = await store.select('connections', 'id=' + eq(sub.connection_id) + '&select=*');
    if (conn) await google.stop(env, (await google.fresh(env, conn.secret, env.now())).access, sub.meta.channel).catch(() => {});
  }
  await store.remove('subscriptions', 'id=' + eq(sub.id));
}

async function appRoute(env, req, route) {
  const store = db(env), user = await userOf(env, req), body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  const mine = (table, query) => store.select(table, `user_id=${eq(user.id)}&${query}`);
  if (route === '/oauth/start') {
    if (!['notion', 'google'].includes(body.provider)) throw new HttpError('연결할 도구를 골라 주세요.');
    const state = await signState(env.STATE_SECRET, { user: user.id, provider: body.provider }, env.now());
    return reply({ url: (body.provider === 'notion' ? notion : google).authorizeUrl(env, state) });
  }
  // Which Notion workspace: the one asked for, or the first.
  const notionConn = (id) => mine('connections', 'provider=eq.notion&' + (id ? 'id=' + eq(id) + '&' : '') + 'select=*&order=created_at.asc');
  if (route === '/notion/pages') {
    const [conn] = await notionConn(new URL(req.url).searchParams.get('connection'));
    if (!conn) throw new HttpError('먼저 노션을 연결해 주세요.', 409);
    return reply({ pages: await notion.search(env, conn.secret.access_token, new URL(req.url).searchParams.get('q') || '') });
  }
  if (route === '/subscribe') {
    const [conn] = await notionConn(body.connection_id);
    if (!conn) throw new HttpError('먼저 노션을 연결해 주세요.', 409);
    const type = body.type === 'database' ? 'database' : 'page', id = notion.plainId(body.resource_id);
    const item = await notion.resource(env, conn.secret.access_token, type, id);
    const meta = type === 'database' ? notion.schemaOf(item) : {};
    const [sub] = await store.insert('subscriptions', [{ user_id: user.id, connection_id: conn.id, provider: 'notion', resource_type: type, resource_id: id, title: notion.titleOf(item), url: item.url, meta }], { upsert: true, onConflict: 'connection_id,resource_id' });
    later(env, syncSubscription(env, sub.id));
    return reply({ subscription: sub });
  }
  if (route === '/unsubscribe') {
    const [sub] = await mine('subscriptions', 'id=' + eq(body.id) + '&select=*');
    if (sub) await forgetSubscription(env, store, sub);
    return reply({ ok: true });
  }
  if (route === '/disconnect') {
    // One account (id), or every account of a tool (provider).
    for (const conn of await mine('connections', (body.id ? 'id=' + eq(body.id) : 'provider=' + eq(body.provider)) + '&select=*')) {
      for (const sub of await mine('subscriptions', 'connection_id=' + eq(conn.id) + '&select=*')) await forgetSubscription(env, store, sub);
      await store.remove('connections', 'id=' + eq(conn.id));
    }
    return reply({ ok: true });
  }
  if (route === '/sync') {
    const subs = await mine('subscriptions', (body.id ? 'id=' + eq(body.id) + '&' : '') + 'select=id');
    for (const s of subs) later(env, syncSubscription(env, s.id));
    return reply({ ok: true, started: subs.length });
  }
  throw new HttpError('요청을 찾을 수 없어요.', 404);
}

export async function handle(req, env) {
  const url = new URL(req.url), route = url.pathname.replace(/^.*\/integrations/, '') || '/';
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    const callback = /^\/oauth\/callback\/(notion|google)$/.exec(route);
    if (callback && req.method === 'GET') return await oauthCallback(env, callback[1], url);
    if (route === '/webhook/notion' && req.method === 'POST') return await notionWebhook(env, req);
    if (route === '/webhook/google' && req.method === 'POST') return await googleWebhook(env, req);
    if (route === '/push-back' || route === '/renew' || route === '/sweep') {
      if (!safeEqual(req.headers.get('x-hook-secret'), env.HOOK_SECRET)) throw new HttpError('허용되지 않은 요청이에요.', 401);
      if (route === '/renew') return await renew(env);
      if (route === '/sweep') return reply({ ok: true, ...(await sweep({ ...env, channelToken: (id) => channelToken(env, id) })) });
      const { id } = await req.json();
      return reply({ ok: true, result: await pushBack(env, id) });
    }
    return await appRoute(env, req, route);
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status >= 500) console.error(route, e);
    if (callback(route) && req.method === 'GET') return page('연결하지 못했어요', e.message, false);
    return reply({ ok: false, error: e.message }, status);
  }
}
const callback = (route) => route.startsWith('/oauth/callback/');

// The environment the handler needs, from Deno.env (Supabase) — or anything with the same names (tests).
export function environment(get, extra = {}) {
  const base = (get('SUPABASE_URL') || '').replace(/\/+$/, '') + '/functions/v1/integrations';
  return {
    SUPABASE_URL: get('SUPABASE_URL'), SERVICE_KEY: get('SB_SECRET_KEY') || get('SUPABASE_SERVICE_ROLE_KEY'), ANON_KEY: get('SUPABASE_ANON_KEY'),
    NOTION_CLIENT_ID: get('NOTION_CLIENT_ID'), NOTION_CLIENT_SECRET: get('NOTION_CLIENT_SECRET'),
    GOOGLE_CLIENT_ID: get('GOOGLE_CLIENT_ID'), GOOGLE_CLIENT_SECRET: get('GOOGLE_CLIENT_SECRET'),
    OPENAI_API_KEY: get('OPENAI_API_KEY'), OPENAI_MODEL: get('OPENAI_MODEL') || 'gpt-6.1-terra',
    STATE_SECRET: get('STATE_SECRET'), HOOK_SECRET: get('HOOK_SECRET'), TIME_ZONE: get('TIME_ZONE') || 'Asia/Seoul',
    base, redirect: (p) => `${base}/oauth/callback/${p}`, webhook: (p) => `${base}/webhook/${p}`,
    fetch: globalThis.fetch.bind(globalThis), now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), waitUntil: (p) => p, ...extra,
  };
}
