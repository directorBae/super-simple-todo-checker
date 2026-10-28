/* 서버도 Supabase에 붙는 한 기기처럼 동작한다: 가져온 행은 기존 merge(검증·도구 연동 훅)를 거치고,
 * 서버에서 바뀐 항목(도구에서 가져온 할 일 등)은 다시 올린다.
 * 두 가지 방식:
 *   · auth() 를 주면(웹 버전) 그때 로그인한 사람의 토큰으로 붙는다 — 그 사람의 행만 오가고, 다른 계정이 로그인하면
 *     reset() 으로 이 서버의 할 일·팀을 비운 뒤 그 계정의 데이터로 채운다. 키: SUPABASE_ANON_KEY(publishable).
 *   · 아니면(도구 연결 서버) SUPABASE_KEY(secret)로 붙고, 새로 올리는 행의 주인은 SUPABASE_OWNER_ID 로 적는다. */
const fs = require('node:fs');
const path = require('node:path');
const engine = (() => { try { return require('../../shared/supabase-sync.cjs'); } catch { return null; } })();

function createSupabaseSync({ dir, env = process.env, merge, snapshot, fetch, auth = null, reset = null }) {
  const cfg = auth
    ? { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY, fetch } // never the secret key: that would skip the per-person rules
    : { url: env.SUPABASE_URL, key: env.SUPABASE_KEY || env.SUPABASE_ANON_KEY, ownerId: env.SUPABASE_OWNER_ID || undefined, fetch };
  if (!engine || !engine.configured(cfg)) return null;
  const metaFile = path.join(dir, 'supabase-meta.json');
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
  async function round() {
    if (auth) {
      const who = await auth();
      if (!who) return; // nobody logged in: nothing to sync
      cfg.token = who.token; cfg.userId = who.userId;
      if (meta?.userId !== who.userId) reset?.(); // another account: start from that account's data only
    }
    const next = engine.freshMeta(meta, cfg.userId);
    const { remote, newest } = await engine.pullRemote(cfg, next);
    const updates = { teams: [], projects: [], todos: [], tombstones: [] };
    for (const [coll, row] of remote) {
      if (row.deleted_at !== null && row.deleted_at !== undefined) {
        next.known[coll + ':' + row.id] = Number(row.deleted_at);
        updates.tombstones.push({ coll, id: row.id, deletedAt: Number(row.deleted_at) });
      } else {
        const item = engine.fromRow(coll, row);
        // Times stay as the database has them, even ahead of this computer's clock (merge trusts them): an edit made here
        // is stamped after the version it edits, so every device agrees it is the newer one.
        next.known[coll + ':' + row.id] = item.updatedAt;
        updates[coll].push(item);
      }
    }
    if (remote.length) merge(updates, { trusted: true });
    await engine.pushRemote(cfg, engine.collectPush(snapshot(), next), next);
    next.pulledAt = newest || engine.EPOCH;
    meta = next;
    fs.writeFileSync(metaFile + '.tmp', JSON.stringify(meta)); fs.renameSync(metaFile + '.tmp', metaFile);
  }
  let running = null;
  return {
    sync() {
      if (!running) running = round().catch((e) => console.error('Supabase 동기화 실패:', e.message)).finally(() => { running = null; });
      return running;
    },
  };
}
module.exports = { createSupabaseSync };
