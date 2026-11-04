// Screenshots of the pet picker and of the game's opening (curtain, pet running in, game fading in, closing).
// npx electron scripts/pet-probe.cjs → artifacts/uiux-qa/pet-*.png
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '../../artifacts/uiux-qa');
fs.mkdirSync(dir, { recursive: true }); app.setPath('userData', path.join(dir, 'profile-pet'));
const now = Date.now(), today = new Date().toLocaleDateString('en-CA');
const db = { todos: [{ id: 'a', title: 'Design review', teamId: 'team', kind: 'todo', status: 'todo', date: today, createdAt: now, updatedAt: now, origin: { type: 'app' } }], teams: [{ id: 'team', name: 'Studio', color: '#6685e8' }], projects: [], gcalEvents: [], tombstones: [], notifLog: [], settings: { theme: 'light', onboardingDone: true, sync: { lastSync: now } } };
ipcMain.handle('smoke:state', () => db);
ipcMain.handle('smoke:settings', (e, p) => { Object.assign(db.settings, p); e.sender.send('smoke:db', db); return db; });
ipcMain.handle('smoke:integrations', () => ({ ok: true, connections: [], targets: [], jobs: [], configured: {} }));
ipcMain.handle('smoke:tools', (_, { action }) => action === 'state' ? { ok: true, connections: [], subscriptions: [], jobs: [] } : { ok: true, links: [], grants: [], playlist: [] });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1180, height: 860, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(__dirname, 'ui-smoke-preload.cjs') } });
  win.webContents.setAudioMuted(true);
  const errors = []; win.webContents.on('console-message', (_, level, msg) => { if (level >= 3) errors.push(msg); });
  const js = (s) => win.webContents.executeJavaScript(s).catch((e) => { throw Error('failed: ' + s + ' ' + errors.join(' / ')); });
  const snap = async (name) => fs.writeFileSync(path.join(dir, 'pet-' + name + '.png'), (await win.webContents.capturePage()).toPNG());
  const pet = () => js('(()=>{const p=document.querySelector(".roaming-pet");const r=p.getBoundingClientRect();return {x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),vis:p.style.visibility,z:p.style.zIndex,mode:p.dataset.phase}})()');
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html')); await pause(1200);
    // Settings → 펫: pick 시바견.
    await js('document.querySelector(\'[aria-label="메뉴"]\').click()'); await pause(150);
    await js('[...document.querySelectorAll(".menu-pop button")].find(b=>b.textContent==="설정").click()'); await pause(250);
    await js('[...document.querySelectorAll(".settings-tab")].find(b=>b.textContent==="펫").click()'); await pause(250);
    await js('document.querySelector(\'[aria-label="시바견"]\').click()'); await pause(300);
    if (db.settings.focusPet?.species !== 'dog' || db.settings.focusPet?.design !== 0) throw Error('pick did not save: ' + JSON.stringify(db.settings.focusPet));
    await snap('picker');
    await js('document.querySelector(\'.settings-panel [aria-label="닫기"]\').click()'); await pause(2500);
    console.log('before', await pet());
    // Ctrl+G: curtain + pet runs in.
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'G', modifiers: ['control'] });
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'G', modifiers: ['control'] });
    let at = 0;
    for (const t of [200, 450, 800, 1300]) { await pause(t - at); at = t; console.log(t, await js('document.querySelector(".offline-game")?.className'), await pet()); await snap('enter-' + t); }
    await pause(900); console.log('settled', await js('document.querySelector(".offline-game")?.className'), await pet()); await snap('open');
    const want = await js('(()=>{const r=document.querySelector(".offline-game canvas").getBoundingClientRect(),k=r.width/500;return {x:Math.round(r.left+58*k),y:Math.round(r.top+215.5*k),w:Math.round(36*k)}})()');
    console.log('game pet spot', want);
    if ((await pet()).x !== want.x) throw Error('the pet did not stop where the game draws it');
    // Esc: the game fades, the pet comes back out.
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
    await pause(200); console.log('leave', await pet()); await snap('leave');
    await pause(1500); console.log('after', await js('!!document.querySelector(".offline-game")'), await pet()); await snap('after');
    if (errors.length) console.log('errors', errors);
  } catch (e) { console.error(e); process.exitCode = 1; }
  app.quit();
});
