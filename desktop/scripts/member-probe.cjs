// Screenshots of a teammate's window (Team tab → tap a member) and of the 👁 private toggle on a to-do line.
// npx electron scripts/member-probe.cjs → artifacts/uiux-qa/member-*.png
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '../../artifacts/uiux-qa');
fs.mkdirSync(dir, { recursive: true }); app.setPath('userData', path.join(dir, 'profile-member'));
const now = Date.now(), today = new Date().toLocaleDateString('en-CA');
const day = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toLocaleDateString('en-CA'); };
const db = { todos: [{ id: 'a', title: 'Design review', teamId: 'team', kind: 'todo', status: 'todo', date: today, createdAt: now, updatedAt: now, origin: { type: 'app' } }], teams: [{ id: 'team', name: 'Studio', color: '#6685e8' }], projects: [], gcalEvents: [], tombstones: [], notifLog: [], settings: { theme: 'light', onboardingDone: true, sync: { lastSync: now } } };
const ME = { id: 'me', name: '정원', email: 'me@x.com' }, MINJI = { id: 'mj', name: '민지', email: 'minji@x.com', status: 'active', online: true };
const state = { ok: true, me: ME, invites: [], dives: [], teams: [{ id: 'w1', name: 'UO BioLabs', mine: true, links: [], link: null, members: [{ ...ME, status: 'active', online: true }, MINJI] }] };
const board = { ok: true, member: { id: 'mj', name: '민지', online: true }, today, from: day(-7), to: day(21), hidden: 2, pet: { species: 'dog', design: 1, color: null, name: '콩이' },
  teams: [{ id: 't1', name: '연구', color: '#f59e0b' }, { id: 't2', name: '디자인', color: '#8b5cf6' }],
  todos: [
    { id: '1', title: '세포 배양 결과 정리', date: today, status: 'done', teamId: 't1', startTime: '10:00', endTime: '11:00', doneDays: [] },
    { id: '2', title: '논문 초안 리뷰', date: today, endDate: day(2), status: 'todo', teamId: 't1', startTime: '14:00', endTime: '12:00', doneDays: [] },
    { id: '3', title: '포스터 시안', date: today, status: 'todo', teamId: 't2', doneDays: [] },
    { id: '4', title: '장보기', date: day(1), status: 'todo', teamId: null, doneDays: [] },
  ] };
let asked = null;
ipcMain.handle('smoke:state', () => db);
ipcMain.handle('smoke:settings', (e, p) => { Object.assign(db.settings, p); e.sender.send('smoke:db', db); return db; });
ipcMain.handle('smoke:todo', (e, { id, patch }) => { Object.assign(db.todos.find((t) => t.id === id), patch); e.sender.send('smoke:db', db); return db; });
ipcMain.handle('smoke:integrations', () => ({ ok: true, connections: [], targets: [], jobs: [], configured: {} }));
ipcMain.handle('smoke:tools', (_, { action, payload }) => {
  if (action === 'work' && payload?.path === '/state') return state;
  if (action === 'work' && payload?.path === '/member') { asked = payload.body; return board; }
  return action === 'state' ? { ok: true, connections: [], subscriptions: [], jobs: [] } : { ok: true, links: [], grants: [], playlist: [] };
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1180, height: 860, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(__dirname, 'ui-smoke-preload.cjs') } });
  win.webContents.setAudioMuted(true);
  const errors = []; win.webContents.on('console-message', (_, level, msg) => { if (level >= 3) errors.push(msg); });
  const js = (s) => win.webContents.executeJavaScript(s).catch(() => { throw Error('failed: ' + s + ' ' + errors.join(' / ')); });
  const snap = async (name) => fs.writeFileSync(path.join(dir, 'member-' + name + '.png'), (await win.webContents.capturePage()).toPNG());
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html')); await pause(1500);
    // 👁 on the line: hover shows it; a click makes the to-do private (crossed-out eye stays on the line).
    await js('document.querySelector(".cal-cell.today").click()'); await pause(500);
    await js('document.querySelector(".eye-btn").click()'); await pause(400);
    if (db.todos[0].private !== true) throw Error('eye did not make it private');
    if (!await js('!!document.querySelector(".private-mark")')) throw Error('no private mark');
    await snap('private');
    await js('document.querySelector(".private-mark").click()'); await pause(300);
    if (db.todos[0].private !== false) throw Error('mark did not make it visible again');
    // Team tab → 민지 → her window.
    await js('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Team").click()'); await pause(800);
    await js('document.querySelector(".work-member.peekable").click()'); await pause(1500);
    if (asked?.member !== 'mj' || asked?.team !== 'w1') throw Error('asked for ' + JSON.stringify(asked));
    const text = await js('document.querySelector(".member-window").innerText');
    for (const s of ['민지의 Work', '숨긴 할 일 2개', '논문 초안 리뷰', '(1일차)', '(2일차)', '연구', '디자인', '장보기']) if (!text.includes(s)) throw Error('missing ' + s + ' in ' + text);
    if (!await js('!!document.querySelector(".window-pet .pixel-pet-sprite")')) throw Error('no pet');
    await snap('window'); await pause(4500); await snap('window-pet-moved');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await pause(300);
    if (await js('!!document.querySelector(".member-window")')) throw Error('Esc did not close');
    console.log('member probe passed', errors.length ? 'console errors: ' + errors.join(' / ') : '');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  app.quit();
});
