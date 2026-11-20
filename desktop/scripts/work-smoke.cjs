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
const db = { todos: [{ id: 'a', title: 'Design review', teamId: 'team', kind: 'todo', status: 'todo', date: today, createdAt: now, updatedAt: now, origin: { type: 'app' } }, { id: 'b', title: 'Second line here', teamId: 'team', kind: 'todo', status: 'todo', date: today, createdAt: now + 1, updatedAt: now + 1, origin: { type: 'app' } }], teams: [{ id: 'team', name: 'Studio', color: '#6685e8' }], projects: [], gcalEvents: [], tombstones: [], notifLog: [], settings: { theme: 'light', onboardingDone: true, musicSeeded: true, sync: { lastSync: now } } };
const ME = { id: 'me', name: '정원', email: 'me@x.com' }, MJ = { id: 'mj', name: '민지', email: 'minji@x.com', status: 'active', online: true };
const ago = (ms) => new Date(now - ms).toISOString();
const state = { ok: true, me: ME, invites: [], teams: [{ id: 'w1', name: 'UO BioLabs', mine: true, links: [], link: null, members: [{ ...ME, status: 'active', online: true }, MJ],
  memoStore: { kind: 'notion', type: 'database', page: 'db1', title: '회의록', url: 'https://notion.so/db', workspace: 'Studio', by: 'mj', byName: '민지', at: ago(86400_000) } }],
  dives: [
    // Mine, empty for an hour: 5 hours left.
    { id: 'r1', team: 'w1', by: 'me', agenda: '내일 발표 자료 맞추기', targets: ['mj'], createdAt: ago(3600_000 * 2), emptySince: ago(3600_000), replies: [{ id: 'me', answer: 'left', at: ago(3600_000) }] },
    // 민지's, she is in it, I am called.
    { id: 'r2', team: 'w1', by: 'mj', agenda: '세포 배양 결과 리뷰', targets: ['me'], createdAt: ago(60_000), emptySince: null, recording: null, replies: [{ id: 'mj', answer: 'join', at: ago(60_000) }] },
  ],
  missed: [{ id: 'r0', team: 'w1', by: 'mj', agenda: '아침 스탠드업', createdAt: ago(3 * 3600_000), open: false }] };
const memos = [{ id: 'm1', team: 'w1', by: 'mj', title: '발표 자료', state: 'done', transcript: '전체 받아쓴 글', summary: { title: '발표 자료 회의', summary: '내일까지 자료를 맞추기로 했다.', decisions: ['디자인은 민지'], todos: ['민지: 시안 보내기'] }, notionUrl: null, createdAt: ago(7200_000) }];
const notionSent = [], storeSet = [], folderOpened = [];
ipcMain.handle('smoke:memo-save', (_, p) => ({ ok: true, path: 'C:/docs/Work 회의록/' + p.team + '/x.md', folder: 'Work 회의록/' + p.team }));
ipcMain.handle('smoke:memo-show', (_, p) => { folderOpened.push(p); return { ok: true }; });
const asked = [], saved = [];
ipcMain.handle('smoke:state', () => db);
ipcMain.handle('smoke:settings', (e, p) => { Object.assign(db.settings, p); e.sender.send('smoke:db', db); return db; });
ipcMain.handle('smoke:integrations', () => ({ ok: true, connections: [], targets: [], jobs: [], configured: {} }));
ipcMain.handle('smoke:tools', (_, { action, payload }) => {
  if (action === 'work') { asked.push(payload.path); if (payload.path === '/state') return state; if (payload.path === '/dive/delete') { state.dives = state.dives.filter((d) => d.id !== payload.body.dive); return { ok: true }; }
    if (payload.path === '/memos') return { ok: true, memos }; if (payload.path === '/memo/notion/search') return { ok: true, results: [{ id: 'page1', type: 'page', title: '회의록', connection: 'c1', workspace: 'Studio' }] };
    if (payload.path === '/memo/notion') { notionSent.push(payload.body); memos[0].notionUrl = 'https://notion.so/new-memo'; return { ok: true, url: 'https://notion.so/new-memo' }; }
    if (payload.path === '/team/memo-store') { storeSet.push(payload.body); const v = payload.body.store; state.teams[0].memoStore = v ? (v.kind === 'local' ? { kind: 'local', by: 'me', byName: '정원', at: new Date().toISOString() } : { kind: 'notion', type: v.type, page: v.page, title: '회의록', url: 'https://notion.so/db', by: 'me', byName: '정원', at: new Date().toISOString() }) : null; return { ok: true, store: state.teams[0].memoStore }; }
    return { ok: true }; }
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
    // ---- the caret opens where the title was clicked ----
    await js('document.querySelector(".cal-cell.today").click()'); await pause(500);
    const hit = await js(`(()=>{const el=document.querySelector('.memo-line[data-todo-id="a"] .memo-title');const tn=document.createTreeWalker(el,NodeFilter.SHOW_TEXT).nextNode();const r=document.createRange();r.setStart(tn,7);r.setEnd(tn,8);const b=r.getBoundingClientRect();el.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:b.left+1,clientY:b.top+b.height/2}));return {x:b.left+1,y:b.top+b.height/2};})()`);
    await pause(250);
    const sel = await js('(()=>{const a=document.activeElement;return a&&(a.tagName==="TEXTAREA"||a.tagName==="INPUT")?{start:a.selectionStart,end:a.selectionEnd,value:a.value}:null})()');
    if (!sel || sel.start !== 7 || sel.end !== 7) throw Error('the caret should open at the 8th character of "Design review" (click at ' + JSON.stringify(hit) + '), got ' + JSON.stringify(sel));
    // ↓ from the 8th column of line 1 opens line 2 with the caret in its 8th column (like a notepad).
    await js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",bubbles:true,cancelable:true}))'); await pause(250);
    const down = await js('(()=>{const a=document.activeElement,row=a&&a.closest(".memo-line");return a&&a.tagName==="TEXTAREA"?{id:row?.dataset.todoId,start:a.selectionStart}:null})()');
    if (!down || down.id !== 'b' || down.start !== 7) throw Error('↓ should open the next line with the caret in the same column: ' + JSON.stringify(down));
    await js('document.activeElement.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",bubbles:true,cancelable:true}))'); await pause(250);
    const up = await js('(()=>{const a=document.activeElement,row=a&&a.closest(".memo-line");return a&&a.tagName==="TEXTAREA"?{id:row?.dataset.todoId,start:a.selectionStart}:null})()');
    if (!up || up.id !== 'a' || up.start !== 7) throw Error('↑ should go back to line 1, same column: ' + JSON.stringify(up));
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await pause(200);
    // Space on the page itself is swallowed (no scrolling); in a text field it is a space.
    const space = await js('(()=>{document.activeElement.blur();const e=new KeyboardEvent("keydown",{key:" ",bubbles:true,cancelable:true});document.body.dispatchEvent(e);const t=document.createElement("textarea");document.body.appendChild(t);t.focus();const e2=new KeyboardEvent("keydown",{key:" ",bubbles:true,cancelable:true});t.dispatchEvent(e2);t.remove();return {page:e.defaultPrevented,field:e2.defaultPrevented}})()');
    if (!space.page || space.field) throw Error('Space: page ' + space.page + ', field ' + space.field);
    // The clock shows any day: ▶ in its head goes to tomorrow (no hands there), the label says so, → key too.
    await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",ctrlKey:true,bubbles:true,cancelable:true}))'); await pause(800);
    if (!await js('!!document.querySelector(".clock-dock.is-open .clock-day-nav")')) throw Error('the clock head needs its day nav');
    const hadHands = await js('!!document.querySelector(".clock-dock .clock-hands")');
    await js(`document.querySelector('.clock-dock .clock-day-nav button[aria-label="다음 날"]').click()`); await pause(200);
    const nav = await js('({label:document.querySelector(".clock-dock .clock-day-label").textContent,hands:!!document.querySelector(".clock-dock .clock-hands")})');
    if (!nav.label.startsWith('내일') || nav.hands || !hadHands) throw Error('tomorrow on the clock: ' + JSON.stringify({ ...nav, hadHands }));
    await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",bubbles:true,cancelable:true}))'); await pause(200);
    if (!(await js('document.querySelector(".clock-dock .clock-day-label").textContent')).startsWith('오늘')) throw Error('← should come back to today');
    await snap('clock-day-nav');
    await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",ctrlKey:true,bubbles:true,cancelable:true}))'); await pause(800);
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await pause(200);
    // ---- rooms ----
    await js('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Team").click()'); await pause(900);
    let text = await js('document.querySelector(".work-dives")?.innerText || ""');
    must(text, '열린 방', '열린 방'); must(text, '열린 방', '비어 있음'); must(text, '열린 방', '후 삭제'); must(text, '열린 방', '방 삭제');
    must(text, '열린 방', '안에 1명: 민지'); must(text, '열린 방', '들어가기'); must(text, '열린 방', '카톡 가능'); must(text, '열린 방', '지금 연락 불가');
    if (text.includes('사라져요')) throw Error('old wording');
    await snap('rooms');
    // ---- 회의록 저장소: one for the team, shown in the dive hub; anyone changes it; the picker's three choices ----
    const storeText = await js('document.querySelector(".dive-hub .memo-store")?.innerText || ""');
    for (const want of ['회의록', '노션 DB', '민지님이 정함', '바꾸기']) must(storeText, '회의록 저장소', want);
    await js('document.querySelector(".dive-hub .memo-store-change").click()'); await pause(300);
    const pick = await js('document.querySelector(".memo-store-picker")?.innerText || ""');
    for (const want of ['dive 회의록이 기록될 데이터베이스를 선택하세요', 'UO BioLabs', '로컬 저장소', '노션 DB', '회의록', '정하지 않음']) must(pick, '저장소 고르기', want);
    if (!(await js('document.querySelector(".memo-store-option[aria-checked=\'true\']")?.textContent || ""')).includes('노션 DB')) throw Error('the current store is the marked choice');
    await snap('memo-store-picker');
    await js('[...document.querySelectorAll(".memo-store-option")].find(b=>b.textContent.includes("로컬 저장소")).click()'); await pause(700);
    if (storeSet.length !== 1 || storeSet[0].team !== 'w1' || storeSet[0].store?.kind !== 'local') throw Error('choosing 로컬 저장소 must reach /team/memo-store: ' + JSON.stringify(storeSet));
    if (await js('!!document.querySelector(".memo-store-picker")')) throw Error('the picker closes after choosing');
    const after = await js('document.querySelector(".dive-hub .memo-store").innerText');
    must(after, '저장소 바뀜', '로컬 저장소'); must(after, '저장소 바뀜', '정원님이 정함');
    // 로컬 저장소 on this computer: the done memo gets its file, and "폴더 열기" opens it.
    await pause(300);
    await js('document.querySelector(".work-memo-head").click()'); await pause(200);
    const memoOpen = await js('document.querySelector(".work-memo.open")?.innerText || ""');
    must(memoOpen, '로컬 메모', '폴더 열기');
    await js('[...document.querySelectorAll(".work-memo button")].find(b=>b.textContent.includes("폴더 열기")).click()'); await pause(300);
    if (folderOpened.length !== 1 || !folderOpened[0].includes('UO BioLabs')) throw Error('폴더 열기 must open the team folder: ' + JSON.stringify(folderOpened));
    await js('document.querySelector(".work-memo-head").click()'); await pause(150);
    // ---- the pet tells how the note comes along, and where it went; a click on the bubble opens it ----
    await js('window.__opened = 0; window.dispatchEvent(new CustomEvent("checker:pet-work", { detail: { id: "m9", state: "thinking", text: "요약 중…" } }))'); await pause(300);
    const petTitle = await js('document.querySelector(".roaming-pet")?.getAttribute("title") || ""');
    must(petTitle, '펫 작업 중', '요약 중');
    if ((await js('document.querySelector(".roaming-pet")?.dataset.work')) !== 'thinking') throw Error('the pet thinks while the summary is made');
    await js('window.dispatchEvent(new CustomEvent("checker:pet-work", { detail: null })); window.dispatchEvent(new CustomEvent("checker:pet-say", { detail: { id: "m9", mood: "memo", name: "노션 DB 회의록", tail: "에 정리했어요!", text: "‘노션 DB 회의록’에 정리했어요!", onOpen: () => { window.__opened++; } } }))'); await pause(400);
    const say = await js('document.querySelector(".pet-say.memo.can-open")?.textContent || ""');
    must(say, '펫 말풍선', '노션 DB 회의록'); must(say, '펫 말풍선', '에 정리했어요!');
    must(await js('document.querySelector(".pet-live")?.textContent || ""'), '펫 말풍선 (읽어주기)', '정리했어요');
    await js('document.querySelector(".pet-say.memo").click()'); await pause(100);
    if ((await js('window.__opened')) !== 1) throw Error('clicking the bubble must open the note');
    if ((await js('document.querySelector(".roaming-pet")?.dataset.phase'))?.startsWith('drag')) throw Error('clicking the bubble must not grab the pet');
    await snap('pet-memo-say');
    // ---- Settings → 도구 연결 lists every team's store ----
    await js('document.querySelector(\'[aria-label="메뉴"]\').click()'); await pause(150);
    await js('[...document.querySelectorAll(".menu-pop button")].find(b=>b.textContent.trim()==="설정").click()'); await pause(500);
    await js('[...document.querySelectorAll(".settings-tab")].find(b=>b.textContent.trim()==="도구 연결").click()'); await pause(500);
    const settingsText = await js('document.querySelector(".memo-store-settings")?.innerText || ""');
    for (const want of ['UO BioLabs', '로컬 저장소', '바꾸기']) must(settingsText, '설정의 회의록 저장소', want);
    must(await js('document.querySelector(".settings-pane")?.innerText || ""'), '설정', '다이브 회의록');
    await snap('settings-memo-store');
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await pause(300);
    if (await js('!!document.querySelector(".settings-panel")')) throw Error('Escape closes the settings');
    // ---- 부재중 ----
    const missedText = await js('document.querySelector(".work-missed")?.innerText || ""');
    for (const want of ['부재중 다이브', '민지', '아침 스탠드업', '방은 닫혔어요', '확인']) must(missedText, '부재중', want);
    if (missedText.includes('들어가기')) throw Error('a closed room cannot be entered');
    await js('[...document.querySelectorAll(".work-missed button")].find(b=>b.textContent.trim()==="확인").click()'); await pause(400);
    if (!(db.settings.missedSeen || []).includes('r0') || await js('!!document.querySelector(".work-missed")')) throw Error('확인 must put the missed dive away: ' + JSON.stringify(db.settings.missedSeen));
    // ---- 메모 → 노션 ----
    const memoText = await js('document.querySelector(".work-memos")?.innerText || ""');
    for (const want of ['메모', '발표 자료', '민지']) must(memoText, '메모', want);
    await js('document.querySelector(".work-memo-head").click()'); await pause(200);
    const opened = await js('document.querySelector(".work-memo.open")?.innerText || ""');
    for (const want of ['내일까지 자료를 맞추기로', '정해진 것', '디자인은 민지', '할 일', '민지: 시안 보내기', '노션에 보내기']) must(opened, '메모 펼침', want);
    await js('[...document.querySelectorAll(".work-memo button")].find(b=>b.textContent.includes("노션에 보내기")).click()'); await pause(400);
    const picker = await js('document.querySelector(".notion-picker")?.innerText || ""');
    must(picker, '노션 고르기', '회의록'); must(picker, '노션 고르기', 'Studio');
    await js('document.querySelector(".notion-results button").click()'); await pause(400);
    if (!notionSent.length || notionSent[0].memo !== 'm1' || notionSent[0].page !== 'page1' || notionSent[0].connection !== 'c1') throw Error('sending to Notion: ' + JSON.stringify(notionSent));
    if (await js('!!document.querySelector(".notion-picker")') || !(await js('document.querySelector(".work-memo.open").innerText')).includes('노션에서 열기')) throw Error('after sending, the picker closes and the memo links to Notion');
    await snap('memo-notion');
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
    console.log('work smoke passed: 클릭한 자리에 커서, ↑↓ 같은 열, 스페이스바 안 스크롤, 시계 다른 날, 부재중, 메모 → 노션, 회의록 저장소 (허브·고르기·설정, 폴더 열기), 펫 말풍선 (요약 중 → 정리했어요 → 클릭), 열린 방 (비어 있음 · 후 삭제, 방 삭제 → /dive/delete, 안에 n명, 들어가기·답), 음악 제목 (빈 제목·링크 제목이 받아와 저장됨)', errors.length ? 'console errors: ' + errors.join(' / ') : '');
  } catch (e) { console.error(e.message); process.exitCode = 1; }
  app.quit();
});
