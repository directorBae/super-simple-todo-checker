/* 동기화 클라이언트 — server/index.js와 짝. 전체 상태를 보내고 병합 결과로 교체한다. */

const { mergeResponse } = require('./sync-merge.cjs');
const { migrateTeams } = require('./migrate-teams.cjs');
const { ensureDates } = require('./ensure-dates.cjs');
let inFlight = null;
async function performSync(store) {
  const s = store.db.settings.sync || {};
  const url = (s.url || '').trim().replace(/\/+$/, '');
  if (!url || !s.token) return { ok: false, error: '서버 주소와 토큰을 입력하세요.' };
  try {
    const sent = structuredClone({ teams: store.db.teams, projects: store.db.projects, todos: store.db.todos, tombstones: store.db.tombstones || [] });
    const res = await fetch(url + '/sync', {
      signal: AbortSignal.timeout(30000),
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
      body: JSON.stringify(sent),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || '서버 오류' };
    mergeResponse(store.db, sent, data);
    migrateTeams(store.db);
    ensureDates(store.db);
    // 원격에서 삭제된 할 일의 알림 로그 정리
    const alive = new Set(store.db.todos.map((t) => t.id));
    store.db.notifLog = store.db.notifLog.filter((n) => !n.todoId || alive.has(n.todoId));
    store.db.settings.sync.lastSync = Date.now();
    store.db.settings.sync.error = null;
    store.save();
    return { ok: true };
  } catch (e) {
    store.db.settings.sync.error = '서버에 연결할 수 없습니다. PC 서버와 Wi-Fi를 확인해 주세요.';
    return { ok: false, error: e.message };
  }
}

const configured = (store) => !!((store.db.settings.sync || {}).url && (store.db.settings.sync || {}).token);

function syncNow(store) {
  if (!inFlight) inFlight = performSync(store).finally(() => { inFlight = null; });
  return inFlight;
}

module.exports = { syncNow, configured };
