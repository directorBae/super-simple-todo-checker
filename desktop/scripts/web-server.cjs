const http = require('node:http');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createApp, configuration } = require('../../server/index');
const { titleFields } = require('../electron/todo-title.cjs');
const { wallpaperHtml } = require('../electron/wallpaper.cjs');
const { ensureDates } = require('../electron/ensure-dates.cjs');
const { createUndoHistory } = require('../electron/undo-history.cjs');
const authApi = require('../../shared/supabase-auth.cjs');
const toolsApi = require('../electron/tools.cjs');

function createWebService({ dataDir = process.env.DATA_DIR || path.resolve(__dirname, '../../server/data'), config = configuration(), env = process.env, authFetch } = {}) {
  // Login (email + password): this server keeps one person's session and syncs Supabase with their token.
  const authCfg = { url: env.SUPABASE_URL, key: env.SUPABASE_ANON_KEY, fetch: authFetch };
  const authRequired = !!(authCfg.url && authCfg.key);
  let keeper = null, account = null;
  const sessionFile = path.join(dataDir, 'web-session.txt');
  const core = createApp({ dir: dataDir, config, supabaseEnv: env, supabaseFetch: authFetch, supabaseAuth: authRequired ? async () => {
    const session = await keeper.current();
    account = session ? session.user : null;
    return session && { token: session.accessToken, userId: session.user.id };
  } : undefined });
  if (authRequired) keeper = authApi.createSessionKeeper(authCfg, {
    load: () => core.store.unseal(fs.readFileSync(sessionFile, 'utf8')),
    save: (session) => (session ? fs.writeFileSync(sessionFile, core.store.seal(session), { mode: 0o600 }) : fs.rmSync(sessionFile, { force: true })),
  });
  const ready = keeper ? keeper.account().then((a) => { account = a; }) : Promise.resolve();
  // 노션 · 구글 캘린더 연결: the same person's token. The browser opens the OAuth page itself (web-api.js).
  // The morning alert time goes to the server too (the Monday/Thursday check-up runs just before it).
  const sharePrefs = () => { if (account) tools?.savePrefs?.(settings, Intl.DateTimeFormat().resolvedOptions().timeZone).catch(() => {}); };
  const tools = authRequired ? toolsApi.client(authCfg, async () => (await keeper.current())?.accessToken || null) : null, importDone = toolsApi.doneWatcher();
  async function toolsAction(p) {
    const result = await toolsApi.run(tools, String(p.action || ''), p);
    if (result.ok && p.action === 'state' && importDone(result.jobs)) core.supabase?.sync().catch(() => {});
    return result;
  }
  const locked = () => authRequired && !account;
  const authState = () => ({ required: authRequired, loading: false, email: account?.email || null });
  const settingsFile = path.join(dataDir, 'web-settings.json'), wallpaperFile = path.join(dataDir, 'wallpaper-custom.jpg');
  const defaults = { theme: 'light', onboardingDone: true, notifyStart: true, notifyEnd: true, dailySummary: true, dailyWrapup: true, dailySummaryTime: '09:00', dailyWrapupTime: '21:00', autoLaunch: false };
  let settings = { ...defaults };
  try { settings = { ...settings, ...JSON.parse(fs.readFileSync(settingsFile, 'utf8')) }; } catch (e) { if (e.code !== 'ENOENT') { core.store.close(); throw e; } }
  const state = () => ({ ...(locked() ? { teams: [], projects: [], todos: [], tombstones: [] } : core.snapshot()), settings: { ...settings, sync: { lastSync: Date.now() } }, notifLog: [], gcalEvents: [], auth: authState() });
  async function authAction(method, p) {
    const email = String(p.email || ''), password = String(p.password || '');
    try {
      if (method === 'signin') await keeper.signIn(email, password);
      else if (method === 'signup') { if ((await keeper.signUp(email, password)).confirm) return { ok: true, confirm: true, state: state() }; }
      else if (method === 'recover') { await keeper.recover(email); return { ok: true }; }
      else if (method === 'signout') {
        await core.supabase?.sync().catch(() => {}); // last upload, then nothing of this account stays here
        await keeper.signOut(); account = null; core.resetData(); history.clear();
        return { ok: true, state: state() };
      } else throw error('요청을 찾을 수 없습니다.', 404);
    } catch (e) { if (e instanceof authApi.AuthError) return { ok: false, error: e.message }; throw e; }
    account = await keeper.account(); history.clear(); sharePrefs();
    await core.supabase?.sync(); // another account: its data replaces what was here before the window shows it
    return { ok: true, state: state() };
  }
  const stamp = item => Math.max(Date.now(), (item?.updatedAt || 0) + 1);
  const send = (res, code, result) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(result)); };
  const error = (message, status = 400) => Object.assign(new Error(message), { status });
  let mutations = Promise.resolve();
  async function body(req, limit = 1024 * 1024) {
    if (!req.headers['content-type']?.startsWith('application/json')) throw error('JSON 요청이 필요합니다.', 415);
    const chunks = []; let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > limit) throw error('요청이 너무 큽니다.', 413); chunks.push(chunk); }
    let value; try { value = JSON.parse(Buffer.concat(chunks).toString()); } catch { throw error('잘못된 JSON입니다.'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('잘못된 요청입니다.');
    return value;
  }
  // Ctrl+Z / Ctrl+Shift+Z for to-dos changed from the web page.
  const history = createUndoHistory();
  function undoRedo(direction) {
    const changes = history[direction]();
    if (!changes) return state();
    const snapshot = core.snapshot(), todos = [], tombstones = [], current = snapshot.todos;
    for (const { id, to } of changes) {
      const now = current.find((t) => t.id === id);
      // Newer than its deletion mark, or merge would keep it deleted.
      const deleted = snapshot.tombstones.find((t) => t.coll === 'todos' && t.id === id)?.deletedAt || 0;
      if (to) todos.push({ ...to, updatedAt: Math.max(stamp(now || to), deleted + 1) });
      else if (now) tombstones.push({ coll: 'todos', id, deletedAt: stamp(now) });
    }
    core.merge({ todos, tombstones }); return state();
  }
  function change(kind, action, p) {
    const coll = { todo: 'todos', team: 'teams', project: 'projects' }[kind];
    const snapshot = core.snapshot(), list = snapshot[coll];
    const old = list.find(item => item.id === p.id);
    if (action !== 'add' && !old) throw error('항목을 찾을 수 없습니다.', 404);
    if (action === 'delete') {
      const updates = { tombstones: [{ coll, id: p.id, deletedAt: stamp(old) }] };
      if (kind === 'team') {
        updates.todos = snapshot.todos.filter(t => t.teamId === p.id).map(t => ({ ...t, teamId: null, updatedAt: stamp(t) }));
        updates.projects = snapshot.projects.filter(t => t.teamId === p.id).map(t => ({ ...t, teamId: null, updatedAt: stamp(t) }));
      } else if (kind === 'project') updates.todos = snapshot.todos.filter(t => t.projectId === p.id).map(t => ({ ...t, projectId: null, updatedAt: stamp(t) }));
      if (kind === 'todo') history.record(p.id, old, null);
      core.merge(updates); return state();
    }
    const input = action === 'add' ? p : p.patch;
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw error('항목 내용을 확인해 주세요.');
    const fields = kind === 'todo' ? ['title', 'notes', 'date', 'endDate', 'startTime', 'endTime', 'timeZone', 'projectId', 'teamId', 'channel', 'status', 'important', 'sortOrder'] : kind === 'team' ? ['name', 'color', 'important'] : ['name', 'notes', 'teamId', 'term', 'status', 'important'];
    const patch = Object.fromEntries(Object.entries(input).filter(([key]) => fields.includes(key)));
    const item = action === 'add' ? { id: randomUUID(), createdAt: Date.now(), ...(kind === 'todo' ? { kind: 'todo', origin: { type: 'app' }, title: '', notes: '', date: null, startTime: null, endTime: null, teamId: null, projectId: null, status: 'todo', timeZone: config.timeZone || 'Asia/Seoul' } : {}) } : old;
    if ('title' in patch) {
      if (!String(patch.title || '').trim()) throw error('할 일을 입력해 주세요.');
      Object.assign(patch, titleFields(patch.title, patch.notes ?? item.notes ?? ''));
    }
    if (kind !== 'todo' && action === 'add' && !String(patch.name || '').trim()) throw error('이름을 입력해 주세요.');
    const next = { ...item, ...patch, updatedAt: stamp(item) };
    if (kind === 'todo') ensureDates({ todos: [next] }, next.updatedAt);
    core.merge({ [coll]: [next] });
    if (kind === 'todo') history.record(next.id, action === 'add' ? null : old, core.snapshot().todos.find((t) => t.id === next.id) || next);
    return state();
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const host = req.headers.host || '';
      if (!/^127\.0\.0\.1:\d+$/.test(host)) throw error('로컬 주소로 접속해 주세요.', 403);
      const origin = 'http://' + host;
      if (req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') throw error('다른 사이트의 요청은 허용하지 않습니다.', 403);
      const url = new URL(req.url, origin);
      if (url.pathname.startsWith('/api/')) {
        const method = url.pathname.slice(5);
        if (req.method === 'GET' && method === 'state') { await ready; return send(res, 200, state()); }
        if (req.method === 'GET' && method === 'info') return send(res, 200, { version: '1.3.0-web', userData: '로컬 서버 SQLite · 웹 설정', platform: 'web' });
        if (req.method === 'GET' && method === 'integrations') return send(res, 200, { ok: true, ...core.integrations.state() });
        if (req.method === 'GET' && method === 'wallpaper-image') { const image = await fsp.readFile(wallpaperFile); res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache' }); return res.end(image); }
        if (req.method !== 'POST') throw error('요청을 찾을 수 없습니다.', 404);
        if (req.headers.origin !== origin) throw error('웹 앱에서 요청해 주세요.', 403);
        const p = await body(req, method === 'wallpaper-upload' ? 25 * 1024 * 1024 : undefined);
        if (method.startsWith('auth/') && keeper) return send(res, 200, await (mutations = mutations.then(() => authAction(method.slice(5), p))));
        await ready;
        if (locked() && !['settings', 'ack'].includes(method)) throw error('로그인해 주세요.', 401);
        if (method === 'tools') return send(res, 200, await toolsAction(p));
        if (method === 'wallpaper-upload') {
          const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(p.dataUrl || ''));
          if (!match) throw error('사진 형식을 확인해 주세요.');
          await fsp.writeFile(wallpaperFile, Buffer.from(match[1], 'base64'));
          return send(res, 200, { ok: true, src: '/api/wallpaper-image?v=' + Date.now() });
        }
        if (method === 'wallpaper') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Disposition': 'attachment; filename="checker-wallpaper.html"', 'Cache-Control': 'no-store' }); return res.end(wallpaperHtml(p)); }
        if (method === 'pair') return send(res, 200, { ok: true, ...await fetch(`http://127.0.0.1:${core.server.address().port}/pair/create`, { method: 'POST', headers: { Authorization: 'Bearer ' + core.token } }).then(r => r.json()) });
        const result = mutations.then(async () => {
          if (method === 'settings') {
            const allowed = [...Object.keys(defaults), 'focusPet', 'arcadeBest', 'wallpaper', 'music', 'musicSeeded'];
            settings = { ...settings, ...Object.fromEntries(Object.entries(p).filter(([key]) => allowed.includes(key))), autoLaunch: false };
            await fsp.writeFile(settingsFile + '.tmp', JSON.stringify(settings), 'utf8'); await fsp.rename(settingsFile + '.tmp', settingsFile); sharePrefs(); return state();
          }
          if (method === 'ack') return state();
          if (method === 'integrations') return core.integrations.action(p);
          if (method === 'todo/undo' || method === 'todo/redo') return undoRedo(method.slice(5));
          const match = /^(todo|team|project)\/(add|update|delete)$/.exec(method);
          if (match) return change(match[1], match[2], p);
          throw error('요청을 찾을 수 없습니다.', 404);
        });
        mutations = result.catch(() => {}); return send(res, 200, await result);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') throw error('요청을 찾을 수 없습니다.', 404);
      const root = path.resolve(__dirname, '../dist'), relative = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep)) throw error('잘못된 경로입니다.', 403);
      const content = await fsp.readFile(file);
      const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream';
      res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube.com https://www.youtube-nocookie.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
      res.writeHead(200, { 'Content-Type': mime, 'Cache-Control': 'no-cache' }); res.end(req.method === 'HEAD' ? undefined : content);
    } catch (e) { if (!res.headersSent) send(res, e.code === 'ENOENT' ? 404 : e.status || 500, { ok: false, error: e.code === 'ENOENT' ? '먼저 npm run build를 실행해 주세요.' : e.message }); }
  });
  return { server, core, close: () => new Promise(resolve => { server.close(() => core.server.close(() => { core.store.close(); resolve(); })); }) };
}
if (require.main === module) {
  for (const envFile of [path.resolve(__dirname, '../../server/.env'), path.resolve(__dirname, '../.env')]) if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  const web = createWebService(), port = Number(process.env.WEB_PORT || 5173);
  const fail = e => { console.error(e.code === 'EADDRINUSE' ? '포트가 이미 사용 중입니다. 기존 서비스를 확인해 주세요.' : e.message); web.core.store.close(); process.exit(1); };
  web.server.on('error', fail); web.core.server.on('error', fail);
  web.core.server.listen(Number(process.env.SYNC_PORT || 8787), '127.0.0.1', () => {
    web.server.listen(port, '127.0.0.1', () => console.log(`Checker web: http://127.0.0.1:${port}`));
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => web.close().then(() => process.exit(0)));
}
module.exports = { createWebService };
