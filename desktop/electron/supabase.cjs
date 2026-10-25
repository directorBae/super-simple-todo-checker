/* Supabase 동기화 — 연결 정보는 화면에 두지 않는다.
 * 개발: desktop/.env 의 SUPABASE_URL, SUPABASE_ANON_KEY
 * 배포: electron/supabase.json { "url": "...", "anonKey": "..." } (npm run dist 전에 scripts/write-supabase-config.cjs가 .env로 만든다) */
const fs = require('node:fs');
const path = require('node:path');
const { migrateTeams } = require('./migrate-teams.cjs');
const { ensureDates } = require('./ensure-dates.cjs');
// Packaged builds carry the shared engine under app/shared; in the repo it sits two levels up.
const engine = (() => { try { return require('../shared/supabase-sync.cjs'); } catch { return require('../../shared/supabase-sync.cjs'); } })();

const envFile = path.join(__dirname, '..', '.env');
try { if (fs.existsSync(envFile)) process.loadEnvFile(envFile); } catch {}
let file = {};
try { file = JSON.parse(fs.readFileSync(path.join(__dirname, 'supabase.json'), 'utf8')); } catch {}
const cfg = { url: process.env.SUPABASE_URL || file.url, key: process.env.SUPABASE_ANON_KEY || file.anonKey };

let inFlight = null;
async function run(store) {
  const db = store.db;
  const result = await engine.syncSupabase(db, db.supabaseMeta, cfg);
  db.supabaseMeta = result.meta;
  if (result.changed) {
    migrateTeams(db);
    ensureDates(db);
    // 다른 기기에서 지운 할 일의 알림 기록 정리
    const alive = new Set(db.todos.map((t) => t.id));
    db.notifLog = db.notifLog.filter((n) => !n.todoId || alive.has(n.todoId));
  }
  store.save();
  if (!result.ok) console.error('Supabase sync failed:', result.error);
  return result;
}
function syncNow(store) {
  if (!engine.configured(cfg)) return Promise.resolve({ ok: false, skipped: true });
  if (!inFlight) inFlight = run(store).finally(() => { inFlight = null; });
  return inFlight;
}
module.exports = { syncNow, configured: () => engine.configured(cfg) };
