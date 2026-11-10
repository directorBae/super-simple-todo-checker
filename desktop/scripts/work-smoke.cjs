// Screen check for the Team tab's rooms and the music list's titles (part of scripts/preflight.cjs).
// npx electron scripts/work-smoke.cjs → artifacts/uiux-qa/work-*.png
//  - 열린 방: an empty room I opened shows "비어 있음 · … 후 삭제" and a 방 삭제 button (confirmed → /dive/delete);
//    a room someone else opened, with them in it, shows who is in and 들어가기 / 카톡 가능 / 지금 연락 불가 for me.
//  - 음악: a row saved without a title (or with the bare link as its title) gets its title asked for and shown.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '../../artifacts/uiux-qa');
fs.mkdirSync(dir, { recursive: true }); app.setPath('userData', path.join(dir, 'profile-work'));
const now = Date.now(), today = new Date().toLocaleDateString('en-CA');
const db = { todos: [{ id: 'a', title: 'Design review', teamId: 'team', kind: 'todo', status: 'todo', date: today, createdAt: now, updatedAt: now, origin: { type: 'app' } }], teams: [{ id: 'team', name: 'Studio', color: '#6685e8' }], projects: [], gcalEvents: [], tombstones: [], notifLog: [], settings: { theme: 'light', onboardingDone: true, musicSeeded: true, sync: { lastSync: now } } };
const ME = { id: 'me', name: '정원', email: 'me@x.com' }, MJ = { id: 'mj', name: '민지', email: 'minji@x.com', status: 'active', online: true };
const ago = (ms) => new Date(now - ms).toISOString();
const state = { ok: true, me: ME, invites: [], teams: [{ id: 'w1', name: 'UO BioLabs', mine: true, links: [], link: null, members: [{ ...ME, status: 'active', online: true }, MJ] }],
  dives: [
    // Mine, empty for an hour: 5 hours left.
    { id: 'r1', team: 'w1', by: 'me', agenda: '내일 발표 자료 맞추기', targets: ['mj'], createdAt: ago(3600_000 * 2), emptySince: ago(3600_000), replies: [{ id: 'me', answer: 'left', at: ago(3600_000) }] },
    // 민지's, she is in it, I am called.
    { id: 'r2', team: 'w1', by: 'mj', agenda: '세포 배양 결과 리뷰', targets: ['me'], createdAt: ago(60_000), emptySince: null, replies: [{ id: 'mj', answer: 'join', at: ago(60_000) }] },
  ] };
const asked = [], saved = [];
ipcMain.handle('smoke:state', () => db);
ipcMain.handle('smoke:settings', (e, p) => { Object.assign(db.settings, p); e.sender.send('smoke:db', db); return db; });
ipcMain.handle('smoke:integrations', () => ({ ok: true, connections: [], targets: [], jobs: [], configured: {} }));
ipcMain.handle('smoke:tools', (_, { action, payload }) => {
  if (action === 'work') { asked.push(payload.path); if (payload.path === '/state') return state; if (payload.path === '/dive/delete') { state.dives = state.dives.filter((d) => d.id !== payload.body.dive); return { ok: true }; } return { ok: true }; }
  if (action === 'playlist') return { ok: true, playlist: [{ id: 'm1', url: 'https://www.youtube.com/watch?v=aaaaaaaaaaa', title: '' }, { id: 'm2', url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', title: 'https://www.youtube.com/watch?v=bbbbbbbbbbb' }, { id: 'm3', url: 'https://www.youtube.com/watch?v=ccccccccccc', title: '이미 있는 제목' }] };
  if (action === 'musicTitle') { asked.push('musicTitle:' + payload.url.slice(-3)); return { ok: true, title: '받아온 제목 ' + payload.url.slice(-3) }; }
  if (action === 'savePlaylist') { saved.push(payload.list); return { ok: true }; }
  return action === 'state' ? { ok: true, connections: [], subscriptions: [], jobs: [] } : { ok: true, links: [], grants: [], playlist: [] };
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 1180, height: 860, webPreferences: { offscreen: true, backgroundThrottling: false, preload: path.join(__dirname, 'ui-smoke-preload.cjs') } });
  win.webContents.setAudioMuted(true);
  const errors = []; win.webContents.on('console-message', (_, level, msg) => { if (level >= 3) errors.push(msg); });
  const js = (s) => win.webContents.executeJavaScript(s).catch(() => { throw Error('failed: ' + s + ' ' + errors.join(' / ')); });
  const snap = async (name) => fs.writeFileSync(path.join(dir, 'work-' + name + '.png'), (await win.webContents.capturePage()).toPNG());
  const must = (text, where, what) => { if (!text.includes(what)) throw Error(`${where}: missing "${what}" in: ${text.slice(0, 400)}`); };
  try {
    await win.loadFile(path.join(__dirname, '../dist/index.html')); await pause(1500);
    // ---- rooms ----
    await js('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Team").click()'); await pause(900);
    let text = await js('document.querySelector(".work-dives")?.innerText || ""');
    must(text, '열린 방', '열린 방'); must(text, '열린 방', '비어 있음'); must(text, '열린 방', '후 삭제'); must(text, '열린 방', '방 삭제');
    must(text, '열린 방', '안에 1명: 민지'); must(text, '열린 방', '들어가기'); must(text, '열린 방', '카톡 가능'); must(text, '열린 방', '지금 연락 불가');
    if (text.includes('사라져요')) throw Error('old wording');
    await snap('rooms');
    // 방 삭제 (confirmed) asks the server and the room goes.
    await js('window.confirm = () => true; [...document.querySelectorAll(".work-dive button")].find(b=>b.textContent.trim()==="방 삭제").click()'); await pause(600);
    if (!asked.includes('/dive/delete')) throw Error('방 삭제 did not reach /dive/delete: ' + asked.join(','));
    // ---- music titles ----
    await js('document.querySelector(\'[aria-label="메뉴"]\').click()'); await pause(150);
    await js('[...document.querySelectorAll(".menu-pop button")].find(b=>b.textContent.trim()==="음악").click()'); await pause(1500);
    const rows = await js('[...document.querySelectorAll(".music-row")].map(b=>b.textContent.trim())');
    if (rows.length !== 3) throw Error('3 rows expected, got ' + JSON.stringify(rows));
    for (const [i, want] of [['받아온 제목 aaa'], ['받아온 제목 bbb'], ['이미 있는 제목']].entries()) if (rows[i] !== want[0]) throw Error(`row ${i} shows "${rows[i]}", expected "${want[0]}"`);
    if (asked.filter((a) => a.startsWith('musicTitle:')).length !== 2) throw Error('titles asked for: ' + asked.filter((a) => a.startsWith('musicTitle:')).join(','));
    await pause(700); // the debounced save
    if (!saved.length || !saved.at(-1).every((x) => x.title && !/^https/.test(x.title))) throw Error('titles not saved: ' + JSON.stringify(saved.at(-1)));
    await snap('music-titles');
    console.log('work smoke passed: 열린 방 (비어 있음 · 후 삭제, 방 삭제 → /dive/delete, 안에 n명, 들어가기·답), 음악 제목 (빈 제목·링크 제목이 받아와 저장됨)', errors.length ? 'console errors: ' + errors.join(' / ') : '');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  app.quit();
});
