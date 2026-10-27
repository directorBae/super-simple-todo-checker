const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, dialog, protocol, net, session } = require('electron');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const { wallpaperHtml } = require('./wallpaper.cjs');
const { titleFields } = require('./todo-title.cjs');
const { ensureDates, localDate } = require('./ensure-dates.cjs');
const { createUndoHistory, applyChanges } = require('./undo-history.cjs');
const path = require('path');
const Store = require('./store.cjs');
const scheduler = require('./scheduler.cjs');
const integrations = require('./integrations.cjs');
const sync = require('./sync.cjs');
const supabase = require('./supabase.cjs');
const updater = require('./updater.cjs');
const localServer = require('./local-server.cjs');

app.setAppUserModelId('com.baejungwon.todo-checklist');
// Uploaded wallpaper lives in userData and is served as checker-media://wallpaper so it works in dev and packaged builds.
protocol.registerSchemesAsPrivileged([{ scheme: 'checker-media', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const customWallpaper = () => path.join(app.getPath('userData'), 'wallpaper-custom.jpg');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

let win = null;
let clockWin = null;
let tray = null;
let isQuitting = false;
let store = null;

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('db-changed', publicState());
}

function publicState() {
  const state = structuredClone(store.db);
  delete state.settings.gcal;
  delete state.supabaseMeta;
  state.auth = supabase.status();
  return state;
}

let syncTimer;

let supabaseTimer;
function done() {
  store.save();
  broadcast();
  clearTimeout(supabaseTimer);
  supabaseTimer = setTimeout(() => supabase.syncNow(store).then((r) => { if (r.changed) broadcast(); }), 700);
  if (sync.configured(store)) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => sync.syncNow(store).then(r => { if (r.ok) broadcast(); }), 1500);
  }
  return publicState();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 800,
    minWidth: 800,
    minHeight: 540,
    icon: ICON,
    autoHideMenuBar: true,
    // YouTube music should keep playing from one track to the next without another click.
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), autoplayPolicy: 'no-user-gesture-required' },
  });
  if (process.env.VITE_DEV_SERVER_URL) win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  if (process.env.TODO_SMOKE) {
    win.webContents.on('console-message', (_, level, message) => console.log('[renderer]', level, message));
  }
  win.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      win.hide(); // 창을 닫아도 트레이에 상주
    }
  });
  win.on('closed', () => {
    win = null;
  });
}

function showWindow() {
  if (!win) createWindow();
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function showClock(todoId) {
  const query = { view: 'clock', ...(typeof todoId === 'string' ? { todo: todoId } : {}) };
  if (clockWin) {
    if (typeof todoId === 'string') clockWin.webContents.send('open-view', 'clock-task:' + todoId);
    if (clockWin.isMinimized()) clockWin.restore();
    clockWin.show(); clockWin.focus(); return { ok: true };
  }
  clockWin = new BrowserWindow({ width: 420, height: 700, minWidth: 340, minHeight: 500, title: '시계', icon: ICON, autoHideMenuBar: true, webPreferences: { preload: path.join(__dirname, 'preload.cjs') } });
  if (process.env.VITE_DEV_SERVER_URL) { const url = new URL(process.env.VITE_DEV_SERVER_URL); url.search = new URLSearchParams(query).toString(); clockWin.loadURL(url.href); }
  else clockWin.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), { query });
  clockWin.on('closed', () => { clockWin = null; });
  return { ok: true };
}

function openView(view) {
  showWindow();
  const send = () => win && win.webContents.send('open-view', view);
  if (win && win.webContents.isLoading()) win.webContents.once('did-finish-load', send);
  else send();
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(ICON).resize({ width: 16, height: 16 }));
  tray.setToolTip('할 일 체커');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '열기', click: showWindow },
      { label: '업데이트 확인', click: updater.checkNow },
      { type: 'separator' },
      {
        label: '종료',
        click: () => {
          isQuitting = true;
          app.quit();
        },
      },
    ])
  );
  tray.on('double-click', showWindow);
}

function applyAutoLaunch() {
  app.setLoginItemSettings({ openAtLogin: !!store.db.settings.autoLaunch, args: ['--hidden'] });
}

// Ctrl+Z / Ctrl+Shift+Z for to-dos changed in this app (changes that arrive by sync are not undone).
const history = createUndoHistory();
const snap = (t) => (t ? JSON.parse(JSON.stringify(t)) : null);

function clearTodoNotifs(id) {
  store.db.notifLog = store.db.notifLog.filter((n) => n.todoId !== id);
}

function registerIpc() {
  ipcMain.handle('clock:open', (_, todoId) => showClock(todoId));
  ipcMain.handle('wallpaper:export', async (_, payload) => {
    try {
      const result = await dialog.showSaveDialog(win, { title: '시계 월페이퍼 저장', defaultPath: path.join(app.getPath('documents'), 'checker-wallpaper.html'), filters: [{ name: 'HTML 월페이퍼', extensions: ['html'] }] });
      if (result.canceled || !result.filePath) return { canceled: true };
      await fs.writeFile(result.filePath, wallpaperHtml(payload), 'utf8');
      return { ok: true };
    } catch { return { ok: false, error: '월페이퍼 파일을 저장할 수 없습니다.' }; }
  });
  ipcMain.handle('wallpaper:save', async (_, dataUrl) => {
    const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!match || match[1].length > 20 * 1024 * 1024) return { ok: false, error: '사진 형식을 확인해 주세요.' };
    try {
      await fs.writeFile(customWallpaper(), Buffer.from(match[1], 'base64'));
      return { ok: true, src: 'checker-media://wallpaper/custom.jpg?v=' + Date.now() };
    } catch { return { ok: false, error: '사진을 저장하지 못했습니다.' }; }
  });
  ipcMain.handle('sync:pair', () => localServer.pairDevice(store));
  ipcMain.handle('state:get', () => publicState());
  ipcMain.handle('integrations:request', async (_, payload) => {
    if (payload && ['route', 'resolve', 'delete-remote', 'resolve-client', 'save-target', 'duplicate-candidates', 'merge-duplicates', 'different-duplicates'].includes(payload.action)) {
      const result = await sync.syncNow(store);
      if (!result.ok) return result;
    }
    const result = await integrations.request(store, payload);
    if (result.ok && payload && !['compress-title', 'create-pet'].includes(payload.action)) { await sync.syncNow(store); broadcast(); }
    return result;
  });

  ipcMain.handle('app:info', () => ({
    userData: app.getPath('userData'),
    version: app.getVersion(),
  }));

  // ---- 할 일 ----
  ipcMain.handle('todo:add', (_, p) => {
    const title = String(p.title || '').trim();
    if (!title) return publicState();
    store.db.todos.push({
      id: store.id(),
      kind: 'todo',
      origin: { type: 'app' },
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
      ...titleFields(title, p.notes || ''),
      date: p.date || (p.status === 'bucket' ? null : localDate()),
      startTime: p.startTime || null,
      endTime: p.endTime || null,
      projectId: p.projectId || null,
      teamId: p.teamId || null,
      channel: p.channel || null,
      status: p.status === 'bucket' ? 'bucket' : 'todo',
      // Where it sits among the day's lines (a new line typed under another one goes right below it).
      ...(Number.isFinite(p.sortOrder) ? { sortOrder: p.sortOrder } : {}),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
    });
    const added = store.db.todos.at(-1);
    history.record(added.id, null, added);
    return done();
  });

  ipcMain.handle('todo:update', (_, { id, patch }) => {
    const t = store.db.todos.find((x) => x.id === id);
    if (!t) return publicState();
    const before = snap(t);
    const timeChanged = ['date', 'startTime', 'endTime'].some((k) => k in patch && patch[k] !== t[k]);
    const allowed = ['title', 'notes', 'date', 'endDate', 'startTime', 'endTime', 'timeZone', 'projectId', 'teamId', 'status', 'important', 'sortOrder'];
    if ('title' in patch) {
      if (!String(patch.title || '').trim()) return publicState();
      patch = { ...patch, ...titleFields(patch.title, patch.notes ?? t.notes ?? '') };
    }
    Object.assign(t, Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k))));
    t.kind = 'todo';
    ensureDates({ todos: [t] });
    t.updatedAt = Math.max(Date.now(), (t.updatedAt || 0) + 1);
    if ('status' in patch) t.completedAt = patch.status === 'done' ? Date.now() : null;
    // 시간이 바뀌거나 다시 활성화되면 알림을 재무장
    if (timeChanged || patch.status === 'todo') clearTodoNotifs(id);
    history.record(id, before, t);
    return done();
  });

  ipcMain.handle('todo:delete', (_, id) => {
    const gone = store.db.todos.find((t) => t.id === id);
    if (gone) history.record(id, gone, null);
    store.db.todos = store.db.todos.filter((t) => t.id !== id);
    store.db.tombstones.push({ coll: 'todos', id, deletedAt: Date.now() });
    clearTodoNotifs(id);
    return done();
  });

  // Ctrl+Z / Ctrl+Shift+Z: put the last step's to-dos back (or forward again).
  for (const [channel, direction] of [['todo:undo', 'undo'], ['todo:redo', 'redo']]) {
    ipcMain.handle(channel, () => {
      const changes = history[direction]();
      if (!changes) return publicState();
      applyChanges(store.db, changes).forEach(clearTodoNotifs);
      return done();
    });
  }

  // ---- 프로젝트 ----
  ipcMain.handle('project:add', (_, p) => {
    const name = String(p.name || '').trim();
    if (!name) return publicState();
    store.db.projects.push({
      id: store.id(),
      name,
      teamId: p.teamId || null,
      term: p.term === 'long' ? 'long' : 'short',
      status: p.status === 'bucket' ? 'bucket' : 'active',
      notes: p.notes || '',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return done();
  });

  ipcMain.handle('project:update', (_, { id, patch }) => {
    const p = store.db.projects.find((x) => x.id === id);
    if (!p) return publicState();
    Object.assign(p, patch);
    p.updatedAt = Date.now();
    return done();
  });

  ipcMain.handle('project:delete', (_, id) => {
    store.db.projects = store.db.projects.filter((p) => p.id !== id);
    store.db.tombstones.push({ coll: 'projects', id, deletedAt: Date.now() });
    for (const t of store.db.todos) {
      if (t.projectId === id) {
        t.projectId = null;
        t.updatedAt = Date.now();
      }
    }
    return done();
  });

  // ---- 팀 ----
  ipcMain.handle('team:add', (_, p) => {
    const name = String(p.name || '').trim();
    if (!name) return publicState();
    store.db.teams.push({ id: store.id(), name, color: p.color || '#2563eb', createdAt: Date.now(), updatedAt: Date.now() });
    return done();
  });

  ipcMain.handle('team:update', (_, { id, patch }) => {
    const t = store.db.teams.find((x) => x.id === id);
    if (!t) return publicState();
    Object.assign(t, patch);
    t.updatedAt = Date.now();
    return done();
  });

  ipcMain.handle('team:delete', (_, id) => {
    store.db.teams = store.db.teams.filter((t) => t.id !== id);
    store.db.tombstones.push({ coll: 'teams', id, deletedAt: Date.now() });
    for (const p of store.db.projects) {
      if (p.teamId === id) {
        p.teamId = null;
        p.updatedAt = Date.now();
      }
    }
    for (const t of store.db.todos) {
      if (t.teamId === id) {
        t.teamId = null;
        t.updatedAt = Date.now();
      }
    }
    return done();
  });

  // ---- 설정 ----
  ipcMain.handle('settings:update', (_, patch) => {
    const s = store.db.settings;
    const { sync: syncPatch, ...rest } = patch;
    if (syncPatch) Object.assign(s.sync, syncPatch);
    Object.assign(s, rest);
    if ('autoLaunch' in rest) applyAutoLaunch();
    return done();
  });

  // ---- 동기화 서버 ----
  ipcMain.handle('sync:now', async () => {
    const r = await sync.syncNow(store);
    if (r.ok) broadcast();
    return r;
  });

  // ---- 로그인 (이메일 + 비밀번호) ----
  // Another account's data replaces this one's, so Ctrl+Z must not reach back into it.
  const signedIn = (r) => { if (r.ok) history.clear(); broadcast(); return { ...r, state: publicState() }; };
  ipcMain.handle('auth:signin', async (_, { email, password }) => signedIn(await supabase.signIn(store, email, password)));
  ipcMain.handle('auth:signup', async (_, { email, password }) => signedIn(await supabase.signUp(store, email, password)));
  ipcMain.handle('auth:signout', async () => signedIn(await supabase.signOut(store)));
  ipcMain.handle('auth:recover', (_, email) => supabase.recover(email));

  // ---- 알림 ----
  ipcMain.handle('notif:ack', () => {
    const now = Date.now();
    for (const n of store.db.notifLog) if (n.missed && !n.ackAt) n.ackAt = now;
    return done();
  });

}

app.whenReady().then(() => {
  // file:// pages send no Referer, which YouTube now rejects (player error 153).
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://www.youtube.com/*', 'https://www.youtube-nocookie.com/*'] }, (details, callback) => {
    if (!details.requestHeaders.Referer) details.requestHeaders.Referer = 'https://checker.app/';
    callback({ requestHeaders: details.requestHeaders });
  });
  protocol.handle('checker-media', (request) => new URL(request.url).pathname === '/custom.jpg' ? net.fetch(pathToFileURL(customWallpaper()).toString()) : new Response('', { status: 404 }));
  store = new Store();
  localServer.useLocalServer(store);
  registerIpc();
  createTray();

  if (!process.argv.includes('--hidden')) createWindow();
  if (store.db.settings.autoLaunch) applyAutoLaunch();

  scheduler.start(store, broadcast, openView);



  // 동기화 서버가 설정돼 있으면 실행 중 15초마다 조용히 동기화
  const autoServerSync = () => {
    if (!sync.configured(store)) localServer.useLocalServer(store);
    if (sync.configured(store)) {
      sync.syncNow(store).then((r) => {
        broadcast();
      });
    }
  };
  autoServerSync();
  setInterval(autoServerSync, 3000);

  // Supabase가 설정돼 있으면 5초마다, 창으로 돌아올 때마다 가져오고 올린다.
  const autoSupabase = () => supabase.syncNow(store).then((r) => { if (r.changed) broadcast(); });
  supabase.ready().then(broadcast); // the window waits for this before it shows the login or the app
  autoSupabase();
  setInterval(autoSupabase, 5000);
  app.on('browser-window-focus', autoSupabase);
  app.on('browser-window-focus', autoServerSync);

  // 트레이 상주라 창을 닫아도 안 죽으므로, 설치 전에 종료 플래그를 세워준다
  updater.start({ beforeInstall: () => { isQuitting = true; } });
});

app.on('second-instance', showWindow);

app.on('activate', showWindow);

app.on('window-all-closed', () => {
  // 트레이 상주: 창이 모두 닫혀도 종료하지 않음
});

app.on('before-quit', () => {
  isQuitting = true;
  if (store) store.flush();
});
