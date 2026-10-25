const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Storage } = require('./lib/storage');
const { Integrations } = require('./lib/integrations');
const { ApiError, editable } = require('./lib/common');
const { createPairing, publishLocalConnection } = require('./lib/pairing');
const { createLogin } = require('./lib/login');
const { createSupabaseSync } = require('./lib/supabase');

function configuration(env = process.env) {
  const publicUrl = (env.PUBLIC_URL || '').trim().replace(/\/+$/, '');
  if (publicUrl) {
    const u = new URL(publicUrl);
    if (u.pathname !== '/' || u.search || u.hash || u.username || u.password || (u.protocol !== 'https:' && !(u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)))) throw new Error('PUBLIC_URL must be an HTTPS origin (localhost HTTP allowed).');
  }
  return { publicUrl, googleClientId: env.GOOGLE_CLIENT_ID, googleClientSecret: env.GOOGLE_CLIENT_SECRET, notionClientId: env.NOTION_CLIENT_ID, notionClientSecret: env.NOTION_CLIENT_SECRET, openaiKey: env.OPENAI_API_KEY, openaiModel: env.OPENAI_MODEL || 'gpt-4.1-mini', timeZone: env.TIME_ZONE || 'Asia/Seoul' };
}
function createApp({ dir = process.env.DATA_DIR || path.join(__dirname, 'data'), token = process.env.SYNC_TOKEN, config = configuration(), overrides, loginPassword = process.env.PERSONAL_PASSWORD, supabaseEnv = process.env, supabaseFetch } = {}) {
  const store = new Storage(dir), db = store.data;
  const tokenPath = path.join(dir, 'token.txt');
  if (!token) {
    if (!fs.existsSync(tokenPath)) fs.writeFileSync(tokenPath, crypto.randomBytes(24).toString('base64url'), { mode: 0o600 });
    token = fs.readFileSync(tokenPath, 'utf8').trim();
  }
  if (!token) throw new Error('SYNC_TOKEN cannot be empty');
  const integrations = new Integrations(store, config, overrides);
  const pairing = createPairing();
  const login = createLogin(dir, loginPassword);
  const authFailures = new Map();
  const stamp = r => r.updatedAt || r.createdAt || 0;
  const snapshot = () => ({ teams: db.teams, projects: db.projects, todos: db.todos.filter(t => !integrations.excluded(t.id)).map(t => integrations.decorate(t)), excludedTodoIds: db.todos.filter(t => integrations.excluded(t.id)).map(t => t.id), tombstones: db.tombstones });
  function merge(client) {
    if (!client || typeof client !== 'object' || Array.isArray(client)) throw new ApiError('상태 형식이 올바르지 않습니다.');
    for (const key of ['teams', 'projects', 'todos', 'tombstones']) if (client[key] !== undefined && (!Array.isArray(client[key]) || client[key].length > 100000)) throw new ApiError('잘못된 컬렉션: ' + key);
    for (const coll of ['teams', 'projects', 'todos']) for (const r of client[coll] || []) {
      if (!r || typeof r.id !== 'string' || r.id.length > 200 || !Number.isFinite(stamp(r)) || stamp(r) > Date.now() + 300000) throw new ApiError('항목 ID와 기기 시간을 확인해 주세요.');
      if (coll === 'todos') {
        if (typeof r.title !== 'string' || r.title.length > 10000 || (r.notes && (typeof r.notes !== 'string' || r.notes.length > 50000))) throw new ApiError('할 일 제목 또는 메모가 너무 깁니다.');
        if (!['todo', 'done', 'bucket'].includes(r.status)) throw new ApiError('할 일 상태가 올바르지 않습니다.');
      }
    }
    const tombs = new Map(db.tombstones.map(t => [t.coll + ':' + t.id, t]));
    for (const t of client.tombstones || []) {
      if (!t || !['teams', 'projects', 'todos'].includes(t.coll) || typeof t.id !== 'string' || !Number.isFinite(t.deletedAt) || t.deletedAt > Date.now() + 300000) throw new ApiError('삭제 기록이 올바르지 않습니다.');
      const key = t.coll + ':' + t.id;
      if (!tombs.has(key) || tombs.get(key).deletedAt < t.deletedAt) tombs.set(key, { coll: t.coll, id: t.id, deletedAt: t.deletedAt });
    }
    for (const coll of ['teams', 'projects', 'todos']) {
      const map = new Map(db[coll].map(r => [r.id, r]));
      for (const incoming of client[coll] || []) {
        if (coll === 'todos' && Object.hasOwn(db.todoAliases, incoming.id)) {
          // Preserve edits made to a merged item offline as a reviewable conflict.
          const canonical = db.todos.find(t => t.id === integrations.duplicates.canonicalId(incoming.id));
          const previous = db.duplicateMemories.findLast(m => m.decision === 'merged' && m.members.some(x => x.snapshot.todoId === incoming.id))?.members.find(x => x.snapshot.todoId === incoming.id)?.snapshot;
          if (canonical && previous && editable.some(k => k in incoming && k in previous && (incoming[k] ?? null) !== (previous[k] ?? null))) {
            canonical.clientConflict ||= { message: '병합된 업무가 다른 기기에서 수정되었습니다. 유지할 내용을 선택해 주세요.', incoming: Object.fromEntries(editable.filter(k => k in incoming).map(k => [k, incoming[k]])) };
          }
          continue;
        }
        const old = map.get(incoming.id), tomb = tombs.get(coll + ':' + incoming.id);
        if (tomb && tomb.deletedAt >= stamp(incoming)) continue;
        if (coll !== 'todos') {
          if (!old || stamp(incoming) > stamp(old)) {
            const keys = coll === 'teams' ? ['id', 'name', 'color', 'important', 'createdAt', 'updatedAt'] : ['id', 'name', 'teamId', 'term', 'status', 'notes', 'important', 'createdAt', 'updatedAt'];
            map.set(incoming.id, Object.fromEntries(keys.filter(k => k in incoming).map(k => [k, incoming[k]])));
          }
          continue;
        }
        const patch = Object.fromEntries(editable.filter(k => k in incoming).map(k => [k, incoming[k]]));
        patch.kind = 'todo'; delete patch.channel;
        if (!old) {
          const todo = { ...patch, id: incoming.id, createdAt: incoming.createdAt || Date.now(), updatedAt: stamp(incoming), revision: 1, origin: { type: incoming.origin?.type === 'app' ? 'app' : 'legacy' } };
          map.set(todo.id, todo); integrations.changed(todo);
        } else if (stamp(incoming) > stamp(old)) {
          if (!editable.some(k => k in patch && (patch[k] ?? null) !== (old[k] ?? null))) continue;
          if (config.multiUser && ((incoming.syncRevision !== undefined && incoming.syncRevision !== old.revision) || (incoming.syncRevision === undefined && db.links.some(l => l.todoId === old.id)))) {
            old.clientConflict = { message: '다른 기기 또는 원본에서 먼저 수정했습니다.', incoming: patch }; continue;
          }
          Object.assign(old, patch, { updatedAt: stamp(incoming), revision: old.revision + 1 });
          delete old.clientConflict;
          old.completedAt = old.status === 'done' ? Date.now() : null;
          integrations.changed(old);
        }
      }
      db[coll] = [...map.values()].filter(r => !(tombs.get(coll + ':' + r.id)?.deletedAt >= stamp(r)));
    }
    db.tombstones = [...tombs.values()].map(t => t.coll === 'todos' && Object.hasOwn(db.todoAliases, t.id) ? { ...t, mergedInto: integrations.duplicates.canonicalId(t.id) } : t);
    for (const t of db.todos) { t.kind = 'todo'; if (t.teamId && !db.teams.some(x => x.id === t.teamId)) t.teamId = null; if (t.projectId && !db.projects.some(x => x.id === t.projectId)) t.projectId = null; }
    for (const p of db.projects) if (p.teamId && !db.teams.some(t => t.id === p.teamId)) p.teamId = null;
    store.save();
  }
  function send(res, status, data) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 20 * 1024 * 1024) throw new ApiError('요청이 너무 큽니다.', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new ApiError('잘못된 JSON 요청'); }
  }
  const supabase = createSupabaseSync({ dir, env: supabaseEnv, merge, snapshot, fetch: supabaseFetch });
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, name: 'todo-checker-sync' });
      if (req.method === 'POST' && url.pathname === '/auth/login') {
        if (req.headers.origin || !req.headers['content-type']?.startsWith('application/json')) throw new ApiError('앱에서 로그인해 주세요.', 403);
        const credentials = await body(req);
        const result = await login.verify(credentials?.password, req.socket.remoteAddress);
        return result.ok ? send(res, 200, { ok: true, token }) : send(res, result.status, { ok: false, error: result.error });
      }
      if (req.method === 'POST' && url.pathname === '/pair') {
        if (req.headers.origin || !req.headers['content-type']?.startsWith('application/json')) throw new ApiError('앱에서 연결해 주세요.', 403);
        const p = await body(req);
        if (!pairing.redeem(p.code, req.socket.remoteAddress)) throw new ApiError('연결 코드가 만료되었거나 일치하지 않습니다.', 403);
        return send(res, 200, { ok: true, token });
      }
      const callback = /^\/oauth\/(google|notion)\/callback$/.exec(url.pathname);
      if (callback && req.method === 'GET') {
        let message = '계정이 연결되었습니다. 앱으로 돌아가 목록을 새로고침하세요.';
        try { await integrations.callback(callback[1], url.searchParams); } catch (e) { message = e.message; }
        const escaped = message.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'", 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' });
        return res.end('<meta charset="utf-8"><title>계정 연결</title><p>' + escaped + '</p>');
      }
      const ip = req.socket.remoteAddress, fail = authFailures.get(ip);
      if (fail && fail.until > Date.now() && fail.count >= 20) return send(res, 429, { ok: false, error: '잠시 후 다시 시도하세요.' });
      const got = Buffer.from(req.headers.authorization || ''), want = Buffer.from('Bearer ' + token);
      if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) {
        authFailures.set(ip, { count: (fail?.until > Date.now() ? fail.count : 0) + 1, until: Date.now() + 600000 });
        return send(res, 401, { ok: false, error: '서버 토큰을 확인해 주세요.' });
      }
      authFailures.delete(ip);
      if (req.method === 'POST' && url.pathname === '/pair/create') return send(res, 200, { ok: true, ...pairing.issue(server.address().port) });
      if (req.method === 'GET' && url.pathname === '/db') return send(res, 200, { ok: true, ...snapshot() });
      if (req.method === 'POST' && url.pathname === '/sync') { merge(await body(req)); send(res, 200, { ok: true, serverTime: Date.now(), ...snapshot() }); void integrations.cycle().catch(console.error); void supabase?.sync(); return; }
      if (req.method === 'GET' && url.pathname === '/integrations/state') return send(res, 200, { ok: true, ...integrations.state() });
      if (req.method === 'POST' && url.pathname === '/integrations/action') {
        const p = await body(req);
        if (p.action === 'resolve-client') {
          const todo = db.todos.find(t => t.id === p.todoId); if (!todo?.clientConflict) throw new ApiError('충돌 항목이 없습니다.');
          if (p.choice === 'incoming') { Object.assign(todo, todo.clientConflict.incoming); todo.revision++; todo.updatedAt = Date.now(); integrations.changed(todo); }
          else if (p.choice !== 'server') throw new ApiError('유지할 내용을 선택해 주세요.');
          delete todo.clientConflict; store.save(); return send(res, 200, { ok: true, ...integrations.state() });
        }
        return send(res, 200, await integrations.action(p));
      }
      send(res, 404, { ok: false, error: '요청 경로가 없습니다.' });
    } catch (e) { if (!res.headersSent) send(res, e.status >= 400 && e.status < 500 ? e.status : 500, { ok: false, error: e.message || '서버 오류' }); }
  });
  server.requestTimeout = 120000;
  const worker = setInterval(() => { void integrations.cycle().catch(console.error); }, 10000);
  const poller = setInterval(() => { void integrations.cycle({ pull: true }).catch(console.error); }, 5 * 60000);
  // Supabase가 설정돼 있으면 5초마다 서로의 변경을 주고받는다.
  const supabaseTimer = supabase && setInterval(() => { void supabase.sync(); }, 5000);
  worker.unref(); poller.unref(); supabaseTimer?.unref();
  server.on('close', () => { clearInterval(worker); clearInterval(poller); clearInterval(supabaseTimer); });
  return { server, store, integrations, merge, snapshot, token, login, supabase };
}
if (require.main === module) {
  if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));
  const app = createApp();
  app.server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? '8787 포트를 이미 사용 중입니다. start-server.cmd로 기존 서버를 사용해 주세요.' : error.message); app.store.close(); process.exitCode = 1; });
  if (app.login.passwordFile) console.log('모바일 직접 로그인 비밀번호: ' + app.login.passwordFile);
  app.server.listen(Number(process.env.PORT || 8787), '0.0.0.0', () => { publishLocalConnection(app.token, app.server.address().port); console.log('TODO 서버 실행: 포트 ' + app.server.address().port + ' / 로컬 SQLite 저장'); if (!process.env.SYNC_TOKEN) console.log('서버 토큰은 data/token.txt 파일에서 확인하세요.'); void app.integrations.cycle({ pull: true }).catch(console.error); });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { app.server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 5000).unref(); });
}
module.exports = { createApp, configuration };
