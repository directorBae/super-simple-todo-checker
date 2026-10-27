/* 서버도 Supabase에 붙는 한 기기처럼 동작한다: 가져온 행은 기존 merge(검증·도구 연동 훅)를 거치고,
 * 서버에서 바뀐 항목(도구에서 가져온 할 일 등)은 다시 올린다. 설정: SUPABASE_URL + SUPABASE_KEY(또는 SUPABASE_ANON_KEY). */
const fs = require('node:fs');
const path = require('node:path');
const engine = (() => { try { return require('../../shared/supabase-sync.cjs'); } catch { return null; } })();

function createSupabaseSync({ dir, env = process.env, merge, snapshot, fetch }) {
  const cfg = { url: env.SUPABASE_URL, key: env.SUPABASE_KEY || env.SUPABASE_ANON_KEY, fetch };
  if (!engine || !engine.configured(cfg)) return null;
  const metaFile = path.join(dir, 'supabase-meta.json');
  let meta = null;
  try { meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')); } catch {}
  async function round() {
    const next = engine.freshMeta(meta);
    const { remote, newest } = await engine.pullRemote(cfg, next);
    const updates = { teams: [], projects: [], todos: [], tombstones: [] };
    for (const [coll, row] of remote) {
      if (row.deleted_at !== null && row.deleted_at !== undefined) {
        next.known[coll + ':' + row.id] = Number(row.deleted_at);
        updates.tombstones.push({ coll, id: row.id, deletedAt: Number(row.deleted_at) });
      } else {
        const item = engine.fromRow(coll, row);
        next.known[coll + ':' + row.id] = item.updatedAt;
        // A device whose clock runs ahead would make merge() reject the whole round; take its change as of now.
        if (item.updatedAt > Date.now() + 60000) item.updatedAt = Date.now();
        updates[coll].push(item);
      }
    }
    if (remote.length) merge(updates);
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
