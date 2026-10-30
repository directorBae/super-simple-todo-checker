/* Supabase 동기화 — 연결 정보는 화면에 두지 않는다.
 * 개발: desktop/.env 의 SUPABASE_URL, SUPABASE_ANON_KEY
 * 배포: electron/supabase.json { "url": "...", "anonKey": "..." } (npm run dist 전에 scripts/write-supabase-config.cjs가 .env로 만든다)
 * 로그인(이메일 + 비밀번호)한 사람의 토큰으로 붙어서 그 사람의 행만 오간다. 세션은 OS 키체인으로 암호화해 userData/session.bin 에 둔다. */
const fs = require('node:fs');
const path = require('node:path');
const { app, safeStorage } = require('electron');
const { migrateTeams } = require('./migrate-teams.cjs');
const { ensureDates } = require('./ensure-dates.cjs');
const repeats = require('./repeats.cjs');
// Packaged builds carry the shared engine under app/shared; in the repo it sits two levels up.
const shared = (name) => { try { return require('../shared/' + name); } catch { return require('../../shared/' + name); } };
const engine = shared('supabase-sync.cjs');
const auth = shared('supabase-auth.cjs');

const envFile = path.join(__dirname, '..', '.env');
try { if (fs.existsSync(envFile)) process.loadEnvFile(envFile); } catch {}
let file = {};
try { file = JSON.parse(fs.readFileSync(path.join(__dirname, 'supabase.json'), 'utf8')); } catch {}
const cfg = { url: process.env.SUPABASE_URL || file.url, key: process.env.SUPABASE_ANON_KEY || file.anonKey };

const sessionFile = () => path.join(app.getPath('userData'), 'session.bin');
const keeper = auth.createSessionKeeper(cfg, {
  load() {
    const raw = fs.readFileSync(sessionFile());
    return JSON.parse(safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(raw) : raw.toString('utf8'));
  },
  save(session) {
    if (!session) return fs.rmSync(sessionFile(), { force: true });
    const text = JSON.stringify(session);
    fs.writeFileSync(sessionFile(), safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(text) : text, { mode: 0o600 });
  },
});
// What the window shows: whether login is needed and who is in. Kept here so publicState() can stay synchronous.
let account = null, loading = true;
const refreshAccount = () => keeper.account().then((a) => { account = a; loading = false; return a; });
const status = () => ({ required: engine.configured(cfg), loading, email: account?.email || null });

let inFlight = null;
async function run(store) {
  const session = await keeper.current();
  const was = account?.id;
  await refreshAccount();
  if (!session) return { ok: false, skipped: true, changed: !!was }; // a dead refresh token logged us out: the window shows the login
  const db = store.db;
  const result = await engine.syncSupabase(db, db.supabaseMeta, { ...cfg, token: session.accessToken, userId: session.user.id });
  db.supabaseMeta = result.meta;
  if (result.changed) {
    migrateTeams(db);
    ensureDates(db);
    repeats.grow(db); // repeats set on another device
    // 다른 기기에서 지운 할 일의 알림 기록 정리
    const alive = new Set(db.todos.map((t) => t.id));
    db.notifLog = db.notifLog.filter((n) => !n.todoId || alive.has(n.todoId));
  }
  store.save();
  if (result.ok) sharePrefs(db.settings);
  if (!result.ok) console.error('Supabase sync failed:', result.error);
  return result;
}
function syncNow(store) {
  if (!engine.configured(cfg)) return Promise.resolve({ ok: false, skipped: true });
  if (!inFlight) inFlight = run(store).finally(() => { inFlight = null; });
  return inFlight;
}

// Login actions for the window. They answer { ok, error?, confirm? }; errors are already in Korean.
const attempt = (fn) => fn().then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, error: e.message }));
async function signIn(store, email, password) {
  return attempt(async () => { await keeper.signIn(email, password); await refreshAccount(); await syncNow(store); });
}
async function signUp(store, email, password) {
  return attempt(async () => {
    const r = await keeper.signUp(email, password);
    if (r.confirm) return { confirm: true };
    await refreshAccount(); await syncNow(store);
  });
}
// Leaves nothing of this account on the computer: one last upload, then the local copy goes.
async function signOut(store) {
  await syncNow(store).catch(() => {});
  await keeper.signOut();
  await refreshAccount();
  Object.assign(store.db, { teams: [], projects: [], todos: [], tombstones: [], notifLog: [] });
  delete store.db.supabaseMeta;
  store.save();
  return { ok: true };
}
const recover = (email) => attempt(() => keeper.recover(email));

// The signed-in person's token for the tool connections (노션 · 구글 캘린더); null when nobody is in.
const accessToken = async () => (await keeper.current())?.accessToken || null;
const tools = require('./tools.cjs').client(cfg, accessToken);
// Tell the server the reminder settings (the phone's reminders are sent from there; the morning time also places the
// Monday/Thursday check-up) — whenever they change.
let sentPrefs = '';
function sharePrefs(settings) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone, key = JSON.stringify([settings.dailySummary, settings.dailySummaryTime, settings.notifyStart, settings.notifyEnd, settings.dailyWrapup, settings.dailyWrapupTime, zone]);
  if (key === sentPrefs) return;
  sentPrefs = key;
  tools.savePrefs?.(settings, zone).catch(() => { sentPrefs = ''; });
}

module.exports = { syncNow, configured: () => engine.configured(cfg), ready: refreshAccount, status, signIn, signUp, signOut, recover, accessToken, tools };
