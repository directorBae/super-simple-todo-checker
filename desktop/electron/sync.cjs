/* 동기화 클라이언트 — server/index.js와 짝. 전체 상태를 보내고 병합 결과로 교체한다. */

async function syncNow(store) {
  const s = store.db.settings.sync || {};
  const url = (s.url || '').trim().replace(/\/+$/, '');
  if (!url || !s.token) return { ok: false, error: '서버 주소와 토큰을 입력하세요.' };
  try {
    const res = await fetch(url + '/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + s.token },
      body: JSON.stringify({
        teams: store.db.teams,
        projects: store.db.projects,
        todos: store.db.todos,
        tombstones: store.db.tombstones || [],
      }),
    });
    if (!res.ok) return { ok: false, error: 'HTTP ' + res.status };
    const data = await res.json();
    if (!data.ok) return { ok: false, error: data.error || '서버 오류' };
    store.db.teams = data.teams || [];
    store.db.projects = data.projects || [];
    store.db.todos = data.todos || [];
    store.db.tombstones = data.tombstones || [];
    // 원격에서 삭제된 할 일의 알림 로그 정리
    const alive = new Set(store.db.todos.map((t) => t.id));
    store.db.notifLog = store.db.notifLog.filter((n) => !n.todoId || alive.has(n.todoId));
    store.db.settings.sync.lastSync = Date.now();
    store.save();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

const configured = (store) => !!((store.db.settings.sync || {}).url && (store.db.settings.sync || {}).token);

module.exports = { syncNow, configured };
