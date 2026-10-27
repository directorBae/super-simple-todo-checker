'use strict';
/*
 * Supabase 동기화 엔진 — 데스크톱 main, 모바일, 서버가 같이 쓴다 (PostgREST + fetch, 의존성 없음).
 * 테이블 정의는 supabase/schema.sql.
 *
 * - 행마다 updated_at(기기 ms)으로 마지막 수정이 이긴다(LWW). 삭제는 deleted_at을 채운 행(tombstone).
 * - 가져오기는 서버 시계인 synced_at 기준이라 기기 시계가 달라도 빠뜨리지 않는다.
 * - meta.known['todos:<id>']는 서버에 있다고 알고 있는 updated_at. 그보다 새 로컬 항목만 올린다.
 * - DB가 기준이다: 한 번도 동기화한 적 없는 기기(meta.pulledAt 없음)는 로컬 할 일·팀·프로젝트를 버리고
 *   서버 내용을 그대로 받는다. 연결 전에 기기에 쌓인 옛 데이터가 DB로 올라가지 않게 하기 위해서다.
 */
const COLLECTIONS = ['teams', 'projects', 'todos'];
const COLUMNS = {
  teams: { name: 'name', color: 'color', important: 'important', sortOrder: 'sort_order' },
  projects: { name: 'name', teamId: 'team_id', term: 'term', status: 'status', notes: 'notes', important: 'important' },
  todos: { title: 'title', notes: 'notes', date: 'date', endDate: 'end_date', startTime: 'start_time', endTime: 'end_time', timeZone: 'time_zone', teamId: 'team_id', projectId: 'project_id', status: 'status', sortOrder: 'sort_order', important: 'important', channel: 'channel', completedAt: 'completed_at', origin: 'origin' },
};
// Device-local bookkeeping that should not travel.
const LOCAL_ONLY = new Set(['id', 'createdAt', 'updatedAt', 'kind', 'syncRevision', 'clientConflict']);
const stamp = (item) => Number(item.updatedAt || item.createdAt || 0);
const keyOf = (coll, id) => coll + ':' + id;

function toRow(coll, item) {
  const map = COLUMNS[coll], row = { id: item.id, created_at: Number(item.createdAt || stamp(item)), updated_at: stamp(item), deleted_at: null };
  for (const [field, column] of Object.entries(map)) row[column] = item[field] ?? null;
  if (coll === 'todos') row.extra = Object.fromEntries(Object.entries(item).filter(([k]) => !(k in map) && !LOCAL_ONLY.has(k)));
  return row;
}

function fromRow(coll, row) {
  const item = { ...(coll === 'todos' ? row.extra || {} : {}), id: row.id, createdAt: Number(row.created_at), updatedAt: Number(row.updated_at) };
  for (const [field, column] of Object.entries(COLUMNS[coll])) if (row[column] !== undefined) item[field] = row[column];
  if (coll === 'todos') item.kind = 'todo';
  return item;
}

function client({ url, key, fetch: request = globalThis.fetch }) {
  const base = String(url || '').replace(/\/+$/, '') + '/rest/v1/';
  const headers = { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' };
  return async (path, init = {}) => {
    const res = await request(base + path, { ...init, headers: { ...headers, ...(init.headers || {}) } });
    const text = await res.text();
    if (!res.ok) throw new Error('Supabase ' + res.status + ': ' + text.slice(0, 200));
    // Writes with Prefer: return=minimal answer 200/201 with an empty body.
    return text ? JSON.parse(text) : null;
  };
}

// Rows changed on the server since the last pull, oldest first.
async function pullRemote(cfg, meta, page = 1000) {
  const call = client(cfg), remote = [];
  let newest = meta.pulledAt || null;
  for (const coll of COLLECTIONS) {
    for (let offset = 0; ; offset += page) {
      const since = meta.pulledAt ? '&synced_at=gt.' + encodeURIComponent(meta.pulledAt) : '';
      const rows = await call(`${coll}?select=*&order=synced_at.asc,id.asc&limit=${page}&offset=${offset}${since}`);
      for (const row of rows) { remote.push([coll, row]); if (!newest || row.synced_at > newest) newest = row.synced_at; }
      if (rows.length < page) break;
    }
  }
  return { remote, newest };
}

// Applies remote rows to a { teams, projects, todos, tombstones } state in place. Returns true if anything changed.
function applyRemote(state, remote, meta) {
  let changed = false;
  state.tombstones ||= [];
  for (const [coll, row] of remote) {
    const list = state[coll], at = list.findIndex((x) => x.id === row.id), local = list[at];
    const tomb = state.tombstones.find((t) => t.coll === coll && t.id === row.id);
    if (row.deleted_at !== null && row.deleted_at !== undefined) {
      const deletedAt = Number(row.deleted_at);
      meta.known[keyOf(coll, row.id)] = deletedAt;
      if (local && stamp(local) > deletedAt) continue; // edited here after it was deleted elsewhere: keep it
      if (local) { list.splice(at, 1); changed = true; }
      if (!tomb) state.tombstones.push({ coll, id: row.id, deletedAt });
      else if (tomb.deletedAt < deletedAt) tomb.deletedAt = deletedAt;
      continue;
    }
    const incoming = fromRow(coll, row);
    meta.known[keyOf(coll, row.id)] = incoming.updatedAt;
    if (tomb && tomb.deletedAt >= incoming.updatedAt) continue;
    if (!local) { list.push(incoming); changed = true; }
    else if (incoming.updatedAt > stamp(local)) { list[at] = coll === 'todos' ? { ...local, ...incoming } : incoming; changed = true; }
  }
  return changed;
}

// Local items and deletions newer than what the server is known to have.
function collectPush(state, meta) {
  const push = { rows: {}, deletions: {} };
  for (const coll of COLLECTIONS) {
    push.rows[coll] = (state[coll] || []).filter((item) => stamp(item) > (meta.known[keyOf(coll, item.id)] ?? -1)).map((item) => toRow(coll, item));
    push.deletions[coll] = (state.tombstones || []).filter((t) => t.coll === coll && !t.mergedInto && t.deletedAt > (meta.known[keyOf(coll, t.id)] ?? -1)).map((t) => ({ id: t.id, updated_at: t.deletedAt, deleted_at: t.deletedAt }));
  }
  return push;
}

async function pushRemote(cfg, push, meta, batch = 500) {
  const call = client(cfg);
  let count = 0;
  for (const coll of COLLECTIONS) {
    for (const rows of [push.rows[coll], push.deletions[coll]]) {
      for (let i = 0; i < rows.length; i += batch) {
        const part = rows.slice(i, i + batch);
        await call(`${coll}?on_conflict=id`, { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(part) });
        for (const row of part) meta.known[keyOf(coll, row.id)] = Number(row.updated_at);
        count += part.length;
      }
    }
  }
  return count;
}

// First sync on a device: drop its local teams, projects and to-dos (and deletion marks) so the server's copy wins whole.
function adoptRemote(state) {
  for (const coll of COLLECTIONS) (state[coll] ||= []).splice(0);
  state.tombstones = [];
}
const firstSync = (meta) => !meta?.pulledAt;
// Watermark for a database that was still empty, so the device counts as synced from then on.
const EPOCH = new Date(0).toISOString();

function freshMeta(meta) {
  return { pulledAt: meta?.pulledAt || null, known: { ...(meta?.known || {}) } };
}

// One full round for a client that owns its state: pull → merge → push. Never throws.
async function syncSupabase(state, meta, cfg) {
  const next = freshMeta(meta);
  try {
    const { remote, newest } = await pullRemote(cfg, next);
    const first = firstSync(next);
    if (first) adoptRemote(state);
    const changed = applyRemote(state, remote, next) || first;
    const pushed = await pushRemote(cfg, collectPush(state, next), next);
    next.pulledAt = newest || EPOCH;
    return { ok: true, changed, pushed, meta: next };
  } catch (e) {
    return { ok: false, error: e.message, changed: false, meta: next };
  }
}

const configured = (cfg) => !!(cfg && cfg.url && cfg.key);

module.exports = { COLLECTIONS, COLUMNS, toRow, fromRow, pullRemote, applyRemote, adoptRemote, firstSync, EPOCH, collectPush, pushRemote, syncSupabase, freshMeta, configured };
