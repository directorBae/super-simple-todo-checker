// Screen check (part of scripts/preflight.cjs): open a to-do's schedule card, type a start time in the time popup,
// click 확정 — the typed time must be saved however the click arrives.
// Three ways of clicking 확정 after typing 14:30: (A) one synchronous mousedown+mouseup+click, (B) mousedown, a
// moment, then mouseup+click (a person), (C) Enter in the minute field first, then a click.
// npx electron scripts/sched-probe.cjs
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '../../artifacts/uiux-qa');
fs.mkdirSync(dir, { recursive: true }); app.setPath('userData', path.join(dir, 'profile-sched'));
const now = Date.now(), today = new Date().toLocaleDateString('en-CA');
const db = { todos: [{ id: 'a', title: 'Design review', teamId: 'team', kind: 'todo', status: 'todo', date: today, createdAt: now, updatedAt: now, origin: { type: 'app' } }], teams: [{ id: 'team', name: 'Studio', color: '#6685e8' }], projects: [], gcalEvents: [], tombstones: [], notifLog: [], settings: { theme: 'light', onboardingDone: true, sync: { lastSync: now } } };
let patches = [];
ipcMain.handle('smoke:state', () => db);
ipcMain.handle('smoke:settings', (e, p) => { Object.assign(db.settings, p); e.sender.send('smoke:db', db); return db; });
ipcMain.handle('smoke:todo', (e, { id, patch }) => { patches.push({ id, patch }); Object.assign(db.todos.find((t) => t.id === id), patch); e.sender.send('smoke:db', db); return db; });
ipcMain.handle('smoke:integrations', () => ({ ok: true, connections: [], targets: [], jobs: [], configured: {} }));
ipcMain.handle('smoke:tools', (_, { action }) => (action === 'state' ? { ok: true, connections: [], subscriptions: [], jobs: [] } : { ok: true, links: [], grants: [], playlist: [] }));
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1180, height: 860, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(__dirname, 'ui-smoke-preload.cjs') } });
  win.webContents.setAudioMuted(true);
  const errors = []; win.webContents.on('console-message', (_, level, msg) => { if (level >= 3) errors.push(msg); });
  const js = (s) => win.webContents.executeJavaScript(s).catch(() => { throw Error('failed: ' + s + ' ' + errors.join(' / ')); });
  const ev = (sel, names) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'missing';const r=el.getBoundingClientRect(),o={bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2,button:0};for(const n of ${JSON.stringify(names)})el.dispatchEvent(new MouseEvent(n,o));return 'ok';})()`);
  const type = (sel, text) => js(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});if(!el)return 'missing';el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,${JSON.stringify(text)});el.dispatchEvent(new Event('input',{bubbles:true}));return el.value;})()`);
  const openCardAndType = async () => {
    db.todos[0].startTime = null; db.todos[0].endTime = null; patches = [];
    await js('document.querySelector(\'.memo-line[data-todo-id="a"]\').dispatchEvent(new MouseEvent("mouseover",{bubbles:true}))');
    await ev('.memo-line[data-todo-id="a"] .memo-actions button[title="날짜·시간 설정"]', ['click']); await pause(400);
    await ev('.sched-card .sched-time .time-display', ['click']); await pause(150);
    await type('.sched-card .time-popup input:nth-of-type(1)', '14');
    await js(`(()=>{const el=document.querySelectorAll(".sched-card .time-popup input")[1];el.focus();Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'30');el.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await pause(50);
  };
  const result = async (label) => { await pause(400); const got = patches.map((p) => [p.patch.startTime, p.patch.endTime]); console.log(label, '→ saved:', JSON.stringify(got), 'card closed:', await js('!document.querySelector(".sched-card")')); if (JSON.stringify(got) !== '[["14:30","15:30"]]') throw Error(label + ': the typed time was not saved: ' + JSON.stringify(got)); };
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html')); await pause(1500);
    await js('document.querySelector(".cal-cell.today").click()'); await pause(500);
    // A: all at once
    await openCardAndType();
    await ev('.sched-card .date-cal-actions .primary', ['mousedown', 'mouseup', 'click']);
    await result('A (one go)        ');
    // B: like a person — mousedown, a moment, mouseup + click
    await openCardAndType();
    await ev('.sched-card .date-cal-actions .primary', ['mousedown']); await pause(60);
    await ev('.sched-card .date-cal-actions .primary', ['mouseup', 'click']);
    await result('B (person-paced)  ');
    // C: Enter in the minute field (commits and closes the popup), then click 확정
    await openCardAndType();
    await js(`document.querySelectorAll(".sched-card .time-popup input")[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`); await pause(100);
    console.log('   after Enter, display shows:', await js('document.querySelector(".sched-card .sched-time .time-display").textContent'));
    await ev('.sched-card .date-cal-actions .primary', ['mousedown']); await pause(60);
    await ev('.sched-card .date-cal-actions .primary', ['mouseup', 'click']);
    await result('C (Enter, then click)');
    if (errors.length) console.log('console errors:', errors.join(' / '));
    console.log('schedule probe passed: 확정 saves the typed time — in one go, person-paced, and after Enter');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  app.quit();
});
