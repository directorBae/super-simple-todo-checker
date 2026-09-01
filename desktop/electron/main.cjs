const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage } = require('electron');
const path = require('path');
const Store = require('./store.cjs');
const scheduler = require('./scheduler.cjs');
const gcal = require('./gcal.cjs');
const sync = require('./sync.cjs');

app.setAppUserModelId('com.baejungwon.todo-checklist');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

let win = null;
let tray = null;
let isQuitting = false;
let store = null;

function broadcast() {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send('db-changed', store.db);
}

function done() {
  store.save();
  broadcast();
  return store.db;
}

function createWindow() {
  win = new BrowserWindow({
    width: 1080,
    height: 740,
    minWidth: 800,
    minHeight: 540,
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.cjs') },
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

function clearTodoNotifs(id) {
  store.db.notifLog = store.db.notifLog.filter((n) => n.todoId !== id);
}

function registerIpc() {
  ipcMain.handle('state:get', () => store.db);

  ipcMain.handle('app:info', () => ({
    userData: app.getPath('userData'),
    version: app.getVersion(),
  }));

  // ---- 할 일 / 콘텐츠 ----
  ipcMain.handle('todo:add', (_, p) => {
    const title = String(p.title || '').trim();
    if (!title) return store.db;
    store.db.todos.push({
      id: store.id(),
      kind: p.kind === 'content' ? 'content' : 'todo',
      title,
      notes: p.notes || '',
      date: p.date || null,
      startTime: p.startTime || null,
      endTime: p.endTime || null,
      projectId: p.projectId || null,
      teamId: p.teamId || null,
      channel: p.channel || null,
      status: p.status === 'bucket' ? 'bucket' : 'todo',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: null,
    });
    return done();
  });

  ipcMain.handle('todo:update', (_, { id, patch }) => {
    const t = store.db.todos.find((x) => x.id === id);
    if (!t) return store.db;
    const timeChanged = ['date', 'startTime', 'endTime'].some((k) => k in patch && patch[k] !== t[k]);
    Object.assign(t, patch);
    t.updatedAt = Date.now();
    if ('status' in patch) t.completedAt = patch.status === 'done' ? Date.now() : null;
    // 시간이 바뀌거나 다시 활성화되면 알림을 재무장
    if (timeChanged || patch.status === 'todo') clearTodoNotifs(id);
    return done();
  });

  ipcMain.handle('todo:delete', (_, id) => {
    store.db.todos = store.db.todos.filter((t) => t.id !== id);
    store.db.tombstones.push({ coll: 'todos', id, deletedAt: Date.now() });
    clearTodoNotifs(id);
    return done();
  });

  // ---- 프로젝트 ----
  ipcMain.handle('project:add', (_, p) => {
    const name = String(p.name || '').trim();
    if (!name) return store.db;
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
    if (!p) return store.db;
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
    if (!name) return store.db;
    store.db.teams.push({ id: store.id(), name, color: p.color || '#2563eb', createdAt: Date.now(), updatedAt: Date.now() });
    return done();
  });

  ipcMain.handle('team:update', (_, { id, patch }) => {
    const t = store.db.teams.find((x) => x.id === id);
    if (!t) return store.db;
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
    const { gcal: gcalPatch, sync: syncPatch, ...rest } = patch;
    if (gcalPatch) Object.assign(s.gcal, gcalPatch);
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

  // ---- 알림 ----
  ipcMain.handle('notif:ack', () => {
    const now = Date.now();
    for (const n of store.db.notifLog) if (n.missed && !n.ackAt) n.ackAt = now;
    return done();
  });

  // ---- 구글 캘린더 ----
  ipcMain.handle('gcal:connect', async () => {
    try {
      await gcal.connect(store);
      await gcal.sync(store);
      broadcast();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('gcal:sync', async () => {
    try {
      await gcal.sync(store);
      broadcast();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('gcal:disconnect', () => {
    store.db.settings.gcal.tokens = null;
    store.db.settings.gcal.lastSync = null;
    store.db.gcalEvents = [];
    done();
    return { ok: true };
  });
}

app.whenReady().then(() => {
  store = new Store();
  registerIpc();
  createTray();

  if (!process.argv.includes('--hidden')) createWindow();
  if (store.db.settings.autoLaunch) applyAutoLaunch();

  scheduler.start(store, broadcast, openView);

  const autoSync = () => {
    if (store.db.settings.gcal.tokens) gcal.sync(store).then(broadcast).catch(() => {});
  };
  autoSync();
  setInterval(autoSync, 30 * 60 * 1000);

  // 동기화 서버가 설정돼 있으면 시작 시 + 10분마다 조용히 동기화
  const autoServerSync = () => {
    if (sync.configured(store)) {
      sync.syncNow(store).then((r) => {
        if (r.ok) broadcast();
      });
    }
  };
  autoServerSync();
  setInterval(autoServerSync, 10 * 60 * 1000);
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
