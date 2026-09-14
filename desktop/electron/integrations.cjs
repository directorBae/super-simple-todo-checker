const { shell } = require('electron');
async function request(store, payload) {
  const s = store.db.settings.sync || {}, base = (s.url || '').trim().replace(/\/+$/, '');
  if (!base || !s.token) return { ok: false, error: '설정에서 동기화 서버 주소와 토큰을 먼저 저장해 주세요.' };
  try {
    const res = await fetch(base + (payload ? '/integrations/action' : '/integrations/state'), { method: payload ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + s.token, 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}), signal: AbortSignal.timeout(120000) });
    const data = await res.json();
    if (data.url) {
      const u = new URL(data.url);
      if (u.protocol !== 'https:' || !['accounts.google.com', 'api.notion.com'].includes(u.hostname)) throw new Error('계정 인증 주소가 올바르지 않습니다.');
      await shell.openExternal(u.toString());
    }
    return data;
  } catch (e) { return { ok: false, error: e.message }; }
}
module.exports = { request };
