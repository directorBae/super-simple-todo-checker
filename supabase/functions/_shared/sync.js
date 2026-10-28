// One subscription, start to finish, narrated through a pet job so the app can show the pet at work:
// reading (fetch the whole source) → thinking (GPT) → writing (to-dos) → done (or error).
// And the way back: a to-do from a source whose date/time changed in the app moves the source item too.
import { db, eq } from './db.js';
import { windowFor, offsetOf, localDate } from './http.js';
import * as notion from './notion.js';
import * as google from './google.js';
import { plan, diff } from './planner.js';

const NAMES = { notion: '노션', google: '구글 캘린더' };
const remoteOf = (d) => ({ title: d.title, date: d.date, start_time: d.start_time, end_time: d.end_time, done: !!d.done });

// A Google access token for a connection, refreshed and stored when needed.
async function googleAccess(env, store, conn) {
  const { access, secret } = await google.fresh(env, conn.secret, env.now());
  if (secret) { conn.secret = secret; await store.update('connections', 'id=' + eq(conn.id), { secret }); }
  return access;
}
async function readSource(env, store, sub, conn, window) {
  if (sub.provider === 'notion') {
    const token = conn.secret.access_token;
    return sub.resource_type === 'database' ? notion.readDatabase(env, token, sub, window) : notion.readPage(env, token, sub.resource_id);
  }
  return google.events(env, await googleAccess(env, store, conn), sub.resource_id, window, offsetOf(env.TIME_ZONE, env.now()));
}

function newRow(env, sub, d, now) {
  return {
    id: crypto.randomUUID(), user_id: sub.user_id, title: d.title, notes: '', date: d.date, end_date: null, start_time: d.start_time, end_time: d.end_time,
    time_zone: env.TIME_ZONE, team_id: null, project_id: null, status: d.done ? 'done' : 'todo', sort_order: null, important: false, channel: null,
    completed_at: d.done ? now : null, created_at: now, updated_at: now, deleted_at: null, extra: { kind: 'todo' },
    origin: { type: 'external', provider: sub.provider, subscription: sub.id, id: d.external_id, url: d.url || null, remote: remoteOf(d) },
  };
}
const summaryOf = (sub, c) => {
  const parts = [c.created && `${c.created}개 추가`, c.updated && `${c.updated}개 수정`, c.deleted && `${c.deleted}개 정리`].filter(Boolean);
  return `${NAMES[sub.provider]} "${sub.title}"` + (parts.length ? `에서 ${parts.join(', ')}` : ' — 바뀐 할 일 없음');
};

// Webhooks: one edit often comes as two or three notices within a moment. Each notice only marks the subscription
// pending; after a short settle the first call reads the final state once, and the later ones find nothing left to do.
export const SETTLE_MS = 3000;
export async function syncSoon(env, subId) {
  await db(env).update('subscriptions', 'id=' + eq(subId), { pending: true });
  await env.sleep(SETTLE_MS);
  return syncSubscription(env, subId, { onlyIfPending: true });
}

// quiet: the Monday/Thursday check-up — no pet job, so nothing shows; the to-dos just come out right.
// onlyIfPending: a settled webhook call — it runs only if no other run has already picked the notices up.
export async function syncSubscription(env, subId, { quiet = false, onlyIfPending = false } = {}) {
  const store = db(env), now = env.now();
  // One run at a time per subscription, claimed in a single conditional update (two webhooks arriving together can't
  // both start). A run stuck for 2 minutes counts as gone. Whoever finds it taken leaves `pending`, in its own column,
  // so the run in progress goes once more when it finishes — nothing a webhook reports gets lost.
  const stale = new Date(now - 120_000).toISOString();
  const [sub] = await store.update('subscriptions', `id=${eq(subId)}${onlyIfPending ? '&pending=is.true' : ''}&or=(state.neq.syncing,syncing_since.is.null,syncing_since.lt.${stale})`,
    { state: 'syncing', syncing_since: new Date(now).toISOString(), pending: false });
  if (!sub) {
    if (!onlyIfPending) await store.update('subscriptions', 'id=' + eq(subId), { pending: true });
    return null;
  }
  const [conn] = await store.select('connections', 'id=' + eq(sub.connection_id) + '&select=*');
  const [job] = quiet ? [] : await store.insert('pet_jobs', [{ user_id: sub.user_id, subscription_id: sub.id, provider: sub.provider, state: 'reading', summary: `${NAMES[sub.provider]} "${sub.title}" 읽는 중` }]);
  const step = (state, extra = {}) => (job ? store.update('pet_jobs', 'id=' + eq(job.id), { state, updated_at: new Date(env.now()).toISOString(), ...extra }) : Promise.resolve());
  const counts = { created: 0, updated: 0, deleted: 0 };
  try {
    if (!conn) throw new Error('연결이 끊겼어요. 다시 연결해 주세요.');
    const window = windowFor(now, env.TIME_ZONE);
    const raw = await readSource(env, store, sub, conn, window);
    const urls = new Map(raw.map((x) => [x.external_id || x.id, x.url]));
    // Only this week on: older imports stay as they are (they are history, not something the source dropped).
    const existing = await store.select('todos', `user_id=${eq(sub.user_id)}&deleted_at=is.null&origin->>subscription=${eq(sub.id)}&date=gte.${window.start}&select=id,title,date,start_time,end_time,status,origin,updated_at`);
    const week = await store.select('todos', `user_id=${eq(sub.user_id)}&deleted_at=is.null&status=neq.bucket&date=gte.${window.start}&date=lte.${window.end}&select=id,title,date,start_time,origin&order=date.asc&limit=200`);
    await step('thinking');
    const desired = (await plan(env, { sub, raw, existing, week, window })).map((d) => ({ ...d, url: urls.get(d.external_id) || (sub.resource_type === 'page' ? sub.url : null) }));
    const ids = new Set(raw.map((x) => x.external_id || x.id));
    // Deleted in the app a moment ago and not yet gone at the source: don't bring it back meanwhile.
    const justDeleted = new Set((await store.select('todos', `user_id=${eq(sub.user_id)}&origin->>subscription=${eq(sub.id)}&deleted_at=gte.${now - 10 * 60_000}&select=origin`)).map((t) => t.origin?.id));
    const { create, update, remove, adopt } = diff(desired.filter((d) => !justDeleted.has(d.external_id)), existing, ids, week);
    await step('writing');
    const stamp = env.now();
    if (create.length) await store.insert('todos', create.map((d) => newRow(env, sub, d, stamp)));
    for (const { todo, patch, remote } of update) {
      const row = { updated_at: stamp, origin: { ...todo.origin, remote, url: urls.get(todo.origin.id) || todo.origin.url } };
      for (const f of ['title', 'date', 'start_time', 'end_time']) if (f in patch) row[f] = patch[f];
      if ('done' in patch) { row.status = patch.done ? 'done' : 'todo'; row.completed_at = patch.done ? stamp : null; }
      await store.update('todos', 'id=' + eq(todo.id), row);
    }
    for (const t of remove) await store.update('todos', 'id=' + eq(t.id), { deleted_at: stamp, updated_at: stamp, origin: { ...t.origin, remote: { ...(t.origin.remote || {}), deleted: true } } });
    // The same work the person already wrote down: it gets the source attached and follows the source's schedule.
    for (const { todo, d } of adopt) {
      const row = { updated_at: stamp, origin: { type: 'external', provider: sub.provider, subscription: sub.id, id: d.external_id, url: d.url || null, remote: remoteOf(d) } };
      if (sub.resource_type !== 'page') Object.assign(row, { date: d.date, start_time: d.start_time, end_time: d.end_time });
      await store.update('todos', 'id=' + eq(todo.id), row);
    }
    Object.assign(counts, { created: create.length, updated: update.length + adopt.length, deleted: remove.length });
    // Nothing changed (a second notice for the same edit): the job just goes away instead of saying so.
    if (job && !create.length && !update.length && !remove.length && !adopt.length) await store.remove('pet_jobs', 'id=' + eq(job.id));
    else await step('done', { counts, summary: summaryOf(sub, counts) });
    await store.update('subscriptions', 'id=' + eq(sub.id), { state: 'idle', syncing_since: null, last_error: null, last_synced_at: new Date(env.now()).toISOString() });
  } catch (e) {
    console.error('동기화 실패', sub.id, e.message);
    await step('error', { summary: `${NAMES[sub.provider]} "${sub.title}"을 읽지 못했어요: ${e.message}` }).catch(() => {});
    await store.update('subscriptions', 'id=' + eq(sub.id), { state: 'error', syncing_since: null, last_error: e.message }).catch(() => {});
  }
  // Changes arrived while this ran: once more.
  const [after] = await store.select('subscriptions', 'id=' + eq(sub.id) + '&select=pending').catch(() => []);
  if (after?.pending) return syncSubscription(env, sub.id, { quiet });
  return counts;
}

// Deleted in the app → deleted at the source too (Google: the event, into Google's bin; Notion: the row's page to
// the trash, or the to-do line from the page).
async function deleteBack(env, store, t) {
  const o = t.origin;
  const [sub] = await store.select('subscriptions', 'id=' + eq(o.subscription) + '&select=*');
  const [conn] = sub ? await store.select('connections', 'id=' + eq(sub.connection_id) + '&select=*') : [];
  if (!sub || !conn) return 'skip';
  if (sub.provider === 'google') await google.deleteEvent(env, await googleAccess(env, store, conn), sub.resource_id, o.id);
  else if (sub.resource_type === 'database') await notion.trashPage(env, conn.secret.access_token, o.id);
  else await notion.deleteBlock(env, conn.secret.access_token, o.id);
  await store.update('todos', 'id=' + eq(t.id), { origin: { ...o, remote: { ...(o.remote || {}), deleted: true } } });
  await store.insert('pet_jobs', [{ user_id: t.user_id, subscription_id: sub.id, provider: sub.provider, kind: 'push', state: 'done', summary: `"${t.title}" — ${sub.provider === 'google' ? '구글 캘린더에서 지웠어요' : '노션에서 지웠어요'}` }]);
  return 'deleted';
}

// App → source: the date/time (and a page to-do's check box) of an imported to-do.
export async function pushBack(env, todoId) {
  const store = db(env);
  const [t] = await store.select('todos', 'id=' + eq(todoId) + '&select=*');
  const o = t?.origin;
  if (!t || !o?.provider || !o.subscription) return 'skip';
  const remote = o.remote || {}, now = { date: t.date, start_time: t.start_time, end_time: t.end_time, done: t.status === 'done' };
  // Brought back (Ctrl+Z) after its source item was deleted: it stays in the app as an ordinary to-do.
  if (!t.deleted_at && remote.deleted) { await store.update('todos', 'id=' + eq(t.id), { origin: null, updated_at: env.now() }); return 'detached'; }
  if (t.deleted_at) return remote.deleted ? 'same' : deleteBack(env, store, t);
  const moved = ['date', 'start_time', 'end_time'].some((f) => (now[f] ?? null) !== (remote[f] ?? null)), checked = now.done !== !!remote.done;
  if (!moved && !checked) return 'same';
  const [sub] = await store.select('subscriptions', 'id=' + eq(o.subscription) + '&select=*');
  const [conn] = sub ? await store.select('connections', 'id=' + eq(sub.connection_id) + '&select=*') : [];
  if (!sub || !conn) return 'skip';
  let what = null;
  if (sub.provider === 'google' && moved) {
    await google.moveEvent(env, await googleAccess(env, store, conn), sub.resource_id, o.id, now, env.TIME_ZONE);
    what = '구글 캘린더 일정 시간을 옮겼어요';
  } else if (sub.provider === 'notion' && sub.resource_type === 'database' && moved && sub.meta.dateProp) {
    await notion.writeDate(env, conn.secret.access_token, o.id, sub.meta.dateProp, now, offsetOf(env.TIME_ZONE, Date.parse(`${now.date || localDate(env.now(), env.TIME_ZONE)}T12:00:00Z`)));
    what = '노션 날짜를 옮겼어요';
  } else if (sub.provider === 'notion' && sub.resource_type === 'page' && checked) {
    await notion.writeChecked(env, conn.secret.access_token, o.id, now.done).catch(() => {}); // only to-do blocks have a box
    what = now.done ? '노션에 완료 표시를 했어요' : '노션 완료 표시를 풀었어요';
  }
  // Remember what the source now says, so this change doesn't come back as a source edit.
  await store.update('todos', 'id=' + eq(t.id), { origin: { ...o, remote: { ...remote, ...now, title: remote.title ?? t.title } } });
  if (what) await store.insert('pet_jobs', [{ user_id: t.user_id, subscription_id: sub.id, provider: sub.provider, kind: 'push', state: 'done', summary: `"${t.title}" — ${what}` }]);
  return what ? 'pushed' : 'noted';
}
