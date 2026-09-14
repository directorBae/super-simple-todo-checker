const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
function useLocalServer(store) {
  try {
    const config = JSON.parse(fs.readFileSync(path.join(process.env.LOCALAPPDATA || os.homedir(), 'todo-checker', 'server.json'), 'utf8'));
    if (config.url !== 'http://127.0.0.1:8787' || !config.token) return false;
    Object.assign(store.db.settings.sync, { url: config.url, token: config.token });
    store.save(); return true;
  } catch { return false; }
}
async function pairDevice(store) {
  useLocalServer(store);
  const s = store.db.settings.sync;
  try {
    const res = await fetch(s.url.replace(/\/+$/, '') + '/pair/create', { method: 'POST', headers: { Authorization: 'Bearer ' + s.token }, signal: AbortSignal.timeout(10000) });
    return await res.json();
  } catch { return { ok: false, error: 'PC의 동기화 서버를 먼저 실행해 주세요.' }; }
}
module.exports = { useLocalServer, pairDevice };
