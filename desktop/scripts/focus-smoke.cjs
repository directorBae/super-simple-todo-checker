const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { wallpaperHtml } = require('../electron/wallpaper.cjs');
const dir = path.resolve(__dirname, '../../artifacts/focus-qa');
fs.mkdirSync(dir, { recursive: true }); app.setPath('userData', path.join(dir, 'profile'));
const now = Date.now(), d = new Date(), today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const original = '이번 주 금요일까지 새 홈페이지의 디자인 시안과 접근성 점검 결과를 정리해서 담당자에게 전달하고 다음 회의에서 검토할 사항을 기록하기';
const db = { todos: [
  { id: 'a', title: original, teamId: 'team', kind: 'todo', status: 'todo', date: today, startTime: '09:00', endTime: '10:00', endDate: today, createdAt: now, timeZone: 'Asia/Seoul' },
  { id: 'b', title: '오후 산책하고 좋아하는 음악 듣기', kind: 'todo', status: 'todo', date: today, createdAt: now + 1 },
  { id: 'c', title: '다음 주 읽을 책 고르기', kind: 'todo', status: 'todo', date: null, createdAt: now + 2 },
], teams: [{ id: 'team', name: 'Studio', color: '#bc9f85' }], projects: [], gcalEvents: [], tombstones: [], notifLog: [{ key: 'k1', todoId: 'a', type: 'start', due: now - 3600000, firedAt: now, missed: true }], settings: { theme: 'light', onboardingDone: true, sync: {} } };
const emit = () => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send('smoke:db', db); return db; };
ipcMain.handle('smoke:state', () => db);
ipcMain.handle('smoke:settings', (e, p) => { Object.assign(db.settings, p); return emit(e); });
ipcMain.handle('smoke:todo', (e, p) => { Object.assign(db.todos.find(t => t.id === p.id), p.patch); return emit(e); });
let aiFails = false;
ipcMain.handle('smoke:integrations', (_, p) => {
  if (aiFails) return { ok: false, error: '테스트: 서버 연결을 확인해 주세요.' };
  if (p?.action === 'compress-title') return { ok: true, title: '금요일까지 홈페이지 시안·접근성 결과 전달 및 회의 안건 정리' };
  if (p?.action === 'create-pet') return { ok: true, name: '구름', species: 'bunny', color: 'lavender', personality: '조용한 응원 친구', greeting: '오늘도 한 걸음씩.' };
  return { ok: true, configured: { openai: true, model: 'test-model' }, connections: [], targets: [], jobs: [] };
});
ipcMain.handle('smoke:wallpaper', (_, p) => { fs.writeFileSync(path.join(dir, 'checker-wallpaper.html'), wallpaperHtml(p)); return { ok: true }; });
const pause = ms => new Promise(r => setTimeout(r, ms));
let clockWindow;
ipcMain.handle('smoke:clock', async (_, id) => {
  if (!clockWindow) clockWindow = new BrowserWindow({ show:false,width:420,height:700,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(__dirname,'ui-smoke-preload.cjs')} });
  await clockWindow.loadFile(path.join(__dirname,'../dist/index.html'),{query:{view:'clock',...(id?{todo:id}:{})}});
  return {ok:true};
});
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,width:1080,height:800,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(__dirname,'ui-smoke-preload.cjs')}});
  win.webContents.setAudioMuted(true);
  const errors=[]; const observe=w=>w.webContents.on('console-message',(_,level,msg)=>{if(level>=3)errors.push(msg);}); observe(win);
  const js = code => win.webContents.executeJavaScript(code,true).catch(e=>{console.error('Failed in renderer:',code.slice(0,240),errors.slice(-3));throw e;});
  const cjs = code => clockWindow.webContents.executeJavaScript(code,true);
  const click = async text => { await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`); await pause(100); };
  const set = async(selector,value)=>{await js(`{const el=document.querySelector(${JSON.stringify(selector)});Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(el,${JSON.stringify(value)});el.dispatchEvent(new Event('change',{bubbles:true}));}`);await pause(100);};
  const snap = async(name,target=win)=>fs.writeFileSync(path.join(dir,name+'.png'),(await target.webContents.capturePage()).toPNG());
  try {
    await win.loadFile(path.join(__dirname,'../dist/index.html')); await pause(250);
    assert.equal(BrowserWindow.getAllWindows().length,1);
    assert.ok(await js(`!!document.querySelector('.notebook-content')&&!document.querySelector('.focus-pane,.clock-dock.is-open,.pet-card,.arcade-card')`));
    assert.ok(await js(`!document.body.innerText.includes('1,000점마다 다른 세계')&&!document.body.innerText.includes('모모와 함께')`));
    assert.equal(await js(`getComputedStyle(document.querySelector('.popup-overlay[hidden]')).display`),'none');
    await pause(500);await snap('main-clean');
    const petInstance=await js(`document.querySelector('.roaming-pet').dataset.petInstance`);
    assert.ok(await js(`!!document.querySelector('.pet-world .pixel-pet-sprite rect')&&!document.querySelector('.clock-pet')`));
    await js(`window.dispatchEvent(new Event('offline'))`);await pause(80);
    assert.ok(await js(`!!document.querySelector('.offline-egg')&&!document.querySelector('.arcade-card')`));
    await js(`document.querySelector('.offline-egg').click()`);await pause(80);
    assert.ok(await js(`!!document.querySelector('.offline-game .arcade-card')`)); await pause(400); await snap('offline-easter-egg');
    // Just the game: no captions or mode names; Space starts the run and the runner is the pet.
    assert.ok(await js(`{const t=document.querySelector('.offline-game').innerText;!/공룡 달리기|수고했어요|작은 모험|점프|장르|1,000점/.test(t)&&getComputedStyle(document.querySelector('.offline-game')).position==='fixed'}`));
    await js(`{const c=document.querySelector('.offline-game canvas');c.dispatchEvent(new KeyboardEvent('keydown',{code:'Space',bubbles:true,cancelable:true}));}`);await pause(900);
    assert.ok(await js(`!document.querySelector('.arcade-start')`)); await snap('game-running');
    await js(`window.dispatchEvent(new Event('online'))`);await pause(80);
    assert.ok(await js(`!document.querySelector('.offline-egg,.arcade-card')`));
    assert.equal(await js(`getComputedStyle(document.querySelector('.memo-toolbar')).backgroundColor`),'rgba(0, 0, 0, 0)');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'c',bubbles:true}))`);await pause(50);assert.ok(await js(`!document.querySelector('.clock-dock.is-open')`));
    // Park the pet in the main room first: it must stay there, off camera, while the clock room is shown.
    await js(`{const pet=document.querySelector('.roaming-pet'),r=pet.getBoundingClientRect();pet.dispatchEvent(new PointerEvent('pointerdown',{pointerId:21,button:0,clientX:r.left+5,clientY:r.top+5,bubbles:true}));pet.dispatchEvent(new PointerEvent('pointermove',{pointerId:21,clientX:305,clientY:305,bubbles:true,cancelable:true}));}`);
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,bubbles:true,cancelable:true}))`);await pause(700);
    assert.equal(BrowserWindow.getAllWindows().length,1);assert.ok(await js(`!!document.querySelector('.clock-dock.is-open .clock-dial')`));
    // The clock is a full-window glass sheet over the main screen: the main stays put underneath, and the pet left there sits under the frosted sheet.
    assert.ok(await js(`{const pet=document.querySelector('.roaming-pet'),r=pet.getBoundingClientRect();pet.dataset.room==='main'&&r.left>200&&Number(getComputedStyle(pet).zIndex)<Number(getComputedStyle(document.querySelector('.clock-dock')).zIndex)&&getComputedStyle(document.querySelector('.clock-popup')).backdropFilter.includes('blur')}`),'main-room pet must stay behind the frosted sheet');
    assert.ok(await js(`{const c=document.querySelector('.clock-popup'),r=c.getBoundingClientRect(),bg=getComputedStyle(c).backgroundImage;getComputedStyle(c).backdropFilter.includes('blur')&&Math.abs(r.left)<2&&r.top===0&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2&&bg.includes('rgba')&&document.querySelector('.content').getBoundingClientRect().left>=0}`),'clock must be a translucent glass sheet covering the whole window');
    assert.ok(await js(`{const r=document.querySelector('.clock-dock.is-open').getBoundingClientRect();r.left===0&&r.top===0&&Math.abs(r.width-innerWidth)<2&&Math.abs(r.height-innerHeight)<2}`));
    // The dial fills the room; the time is glass lettering under the hands, centred, not a giant headline.
    assert.ok(await js(`{const d=document.querySelector('.clock-dial').getBoundingClientRect();d.height>=innerHeight*0.7&&Math.abs(d.left+d.width/2-innerWidth/2)<2}`));
    // No digital text in the dial; metallic hands; the app font is Pretendard.
    assert.ok(await js(`!document.querySelector('.clock-dock .digital-clock')&&document.querySelector('.clock-dock .hand-hour').getAttribute('fill')==='url(#hand-steel)'&&document.fonts.check('16px "Pretendard Variable"')&&getComputedStyle(document.body).fontFamily.startsWith('"Pretendard Variable"')`));
    assert.ok(await js(`!document.querySelector('.clock-schedule')&&![...document.querySelectorAll('.clock-dock button,.clock-dock summary')].some(b=>b.textContent.trim()==='일정')`));
    assert.equal(await js(`document.querySelector('.roaming-pet').dataset.petInstance`),petInstance);
    assert.equal(await js(`document.documentElement.dataset.clock`),undefined);
    await snap('clock-slide-out');
    // Hovering the dial shows a 70° torus lens that magnifies the dial and lists to-dos in that time window.
    // No AM/PM switch: the dial shows the current half of the day (24·15·18·21 in the afternoon).
    const pm=new Date().getHours()>=12;
    assert.deepEqual(await js(`[...document.querySelectorAll('.clock-dock .dial-num')].map(t=>t.textContent)`),pm?['24','15','18','21']:['12','3','6','9']);assert.ok(await js(`!document.querySelector('.half-switch')`));
    await js(`{const d=document.querySelector('.clock-dock .clock-dial'),r=d.getBoundingClientRect();d.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:r.left+r.width/2-r.width*0.33,clientY:r.top+r.height/2}));}`);await pause(300);
    assert.ok(await js(`{const l=document.querySelector('.clock-lens'),layer=document.querySelector('.clock-lens-layer').getBoundingClientRect(),d=document.querySelector('.clock-dock .clock-dial').getBoundingClientRect();!!l&&getComputedStyle(l).clipPath.startsWith('path(')&&getComputedStyle(l).backdropFilter.includes('blur')&&layer.width>d.width*1.5&&document.querySelector('.lens-range').textContent===${JSON.stringify(pm?'20:25 – 21:35':'08:25 – 09:35')}&&document.querySelectorAll('.lens-tick').length>=14&&(${pm}||[...document.querySelectorAll('.clock-lens-task')].some(t=>t.textContent.includes('09:00')&&t.textContent.length>20)&&!!document.querySelector('.lens-dot'))}`),'hover lens must reach past the dial and show the 9-o-clock window with its to-do');
    await snap('clock-hover-lens');
    await js(`document.querySelector('.clock-dock .clock-dial').dispatchEvent(new MouseEvent('mouseout',{bubbles:true,relatedTarget:document.querySelector('.clock-window-head')}))`);await pause(100);
    assert.ok(await js(`!document.querySelector('.clock-lens')`));
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',ctrlKey:true,bubbles:true,cancelable:true}))`);await pause(700);
    assert.ok(await js(`!document.querySelector('.clock-dock.is-open')&&getComputedStyle(document.querySelector('.clock-dock')).visibility==='hidden'`));
    assert.ok(await js(`{const r=document.querySelector('.roaming-pet').getBoundingClientRect();r.left>200&&r.right<innerWidth}`),'pet is back in view with the main room');
    await js(`document.querySelector('.roaming-pet').dispatchEvent(new PointerEvent('pointerup',{pointerId:21,bubbles:true}))`);
    await js(`document.querySelector('.pet-call-button').click()`);await pause(100);assert.equal(await js(`document.querySelector('.roaming-pet').dataset.phase`),'jump');
    await js(`document.body.dispatchEvent(new MouseEvent('contextmenu',{ctrlKey:true,bubbles:true,cancelable:true}))`);await pause(250);assert.ok(await js(`!!document.querySelector('.clock-dock.is-open')`));
    // Called while the clock is up, the pet comes into the clock room and shows on the popup card, above it.
    await js(`document.querySelector('.pet-call-button').click()`);await pause(2200);
    assert.ok(await js(`{const pet=document.querySelector('.roaming-pet'),r=pet.getBoundingClientRect(),c=document.querySelector('.clock-popup').getBoundingClientRect();pet.dataset.room==='clock'&&getComputedStyle(pet).visibility==='visible'&&Number(getComputedStyle(pet).zIndex)>80&&r.left>=c.left-2&&r.right<=c.right+2&&r.top>=c.top-30&&r.bottom<=c.bottom+2}`),'summoned pet must be on the clock card');
    await snap('clock-pet-on-card');
    await js(`{const el=document.querySelector('.clock-dial'),r=el.getBoundingClientRect(),dt=new DataTransfer();dt.setData('application/x-checker-todo','a');el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.right,clientY:r.top+r.height/2}));}`);await pause(100);
    assert.equal(db.todos[0].startTime,new Date().getHours()>=12?'15:00':'03:00');assert.equal(db.todos[0].endTime,null);
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='되돌리기').click()`);await pause(80);assert.equal(db.todos[0].startTime,'09:00');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);await pause(50);
    // Day view: zooming out (Ctrl+wheel down / pinch in) returns to the month, wherever the pointer is.
    for(const where of ['row','left-margin','right-margin']){
      await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='일').click()`);await pause(400);
      assert.ok(await js(`!document.querySelector('.cal-grid')`));
      await js(`{const day=document.querySelector('.memo-day.is-today')||document.querySelector('.memo-day'),r=day.getBoundingClientRect(),where=${JSON.stringify(where)};
        const p=where==='row'?[r.left+r.width/2,r.top+20]:where==='left-margin'?[40,innerHeight/2]:[innerWidth-60,innerHeight/2];
        document.elementFromPoint(p[0],p[1]).dispatchEvent(new WheelEvent('wheel',{deltaY:120,ctrlKey:true,clientX:p[0],clientY:p[1],bubbles:true,cancelable:true}));}`);
      await pause(400);assert.ok(await js(`!!document.querySelector('.cal-grid')`),'Ctrl+wheel zoom-out over '+where+' must return to the month');
    }
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='일').click()`);await pause(100);
    // A row dragged (from anywhere but its text) to the right edge slides the clock in; dropping it on the dial sets the time.
    await js(`(async()=>{const el=document.querySelector('.memo-line[data-todo-id="b"] .memo-line-main');el.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,60));const r=el.getBoundingClientRect(),P=(t,x,y,n=document.body)=>n.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:5,pointerType:'mouse',button:0,clientX:x,clientY:y}));
      P('pointerdown',r.right-30,r.top+5,el);P('pointermove',r.right,r.top+5);P('pointermove',innerWidth-10,r.top+5);await new Promise(r=>setTimeout(r,1000));
      const d=document.querySelector('.clock-dial').getBoundingClientRect();P('pointermove',d.left+d.width/2,d.bottom-2);await new Promise(r=>setTimeout(r,80));window.__dropTime=document.querySelector('.clock-dial .drop-time')?.textContent||'';P('pointerup',d.left+d.width/2,d.bottom-2);})()`);await pause(200);
    assert.ok(await js(`!!document.querySelector('.clock-dock.is-open')`));assert.ok((await js('window.__dropTime')).includes(new Date().getHours()>=12?'18:00':'06:00'),'Dragging over the dial must preview the time');
    assert.equal(db.todos.find(t=>t.id==='b').startTime,new Date().getHours()>=12?'18:00':'06:00');assert.ok(await js(`!!document.querySelector('.clock-toast')`));
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);await pause(50);
    await js(`{const input=document.querySelector('.memo-input');input.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,bubbles:true,cancelable:true}));}`);await pause(50);assert.ok(await js(`!document.querySelector('.clock-dock.is-open')`));
    await js(`{const dt=new DataTransfer();dt.setData('application/x-checker-todo','a');document.querySelector('.memo-line').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));window.dispatchEvent(new DragEvent('dragover',{clientX:innerWidth-10,clientY:220,cancelable:true,dataTransfer:dt}));}`);await pause(250);assert.ok(await js(`!!document.querySelector('.clock-dock.is-open')`));
    await js(`window.dispatchEvent(new Event('dragend'));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);await pause(50);
    // Touch (mobile web): a long press turns on selection mode, then taps add rows; 취소 leaves it.
    await js(`(async()=>{const rows=[...document.querySelectorAll('.memo-day .memo-line-main')].slice(0,2);rows[0].scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,60));const P=(t,el,o={})=>{const r=el.getBoundingClientRect();el.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:11,pointerType:'touch',button:0,clientX:r.right-20,clientY:r.top+r.height/2,...o}));};
      P('pointerdown',rows[0]);await new Promise(r=>setTimeout(r,560));P('pointerup',rows[0]);await new Promise(r=>setTimeout(r,400));P('pointerdown',rows[1]);P('pointerup',rows[1]);})()`);await pause(150);
    assert.equal(await js(`document.querySelectorAll('.memo-line.is-selected').length`),2,'Long-press then tap must select two rows');assert.ok(await js(`document.querySelector('.selection-bar').innerText.includes('2개 선택')`));
    await js(`[...document.querySelectorAll('.selection-bar button')].find(b=>b.textContent==='취소').click()`);await pause(100);assert.ok(await js(`!document.querySelector('.selection-bar')&&!document.querySelector('.memo-line.is-selected')`));
    await js(`{const x=innerWidth-8;document.body.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:8,button:0,clientX:x,clientY:200,bubbles:true}));window.dispatchEvent(new PointerEvent('pointermove',{pointerType:'touch',pointerId:8,clientX:x-100,clientY:205}));window.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:8,clientX:x-100,clientY:205}));}`);await pause(250);assert.ok(await js(`!!document.querySelector('.clock-dock.is-open')`));
    await js(`{const t=document.querySelector('.clock-dock .clock-window-head span'),r=t.getBoundingClientRect();t.dispatchEvent(new PointerEvent('pointerdown',{pointerType:'touch',pointerId:9,button:0,clientX:r.left,clientY:r.top,bubbles:true}));window.dispatchEvent(new PointerEvent('pointerup',{pointerType:'touch',pointerId:9,clientX:r.left+100,clientY:r.top}));}`);await pause(100);assert.ok(await js(`!document.querySelector('.clock-dock.is-open')`));
    // Left room: Ctrl+← from the main screen shows teams (left half) and buckets (right half); Ctrl+→ comes back.
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',ctrlKey:true,bubbles:true,cancelable:true}))`);await pause(700);
    assert.ok(await js(`{const d=document.querySelector('.manage-dock.is-open'),cols=[...document.querySelectorAll('.manage-col')].map(c=>c.getBoundingClientRect());!!d&&document.querySelector('.manage-col[aria-label="팀"]').innerText.includes('Studio')&&!!document.querySelector('.manage-col[aria-label="버킷"]')&&cols[0].left<cols[1].left&&Math.abs(document.querySelector('.manage-popup').getBoundingClientRect().left)<2}`));
    await snap('manage-room');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',ctrlKey:true,bubbles:true,cancelable:true}))`);await pause(700);
    assert.ok(await js(`!document.querySelector('.manage-dock.is-open')&&!document.querySelector('.clock-dock.is-open')`));
    await js(`document.querySelector('[aria-label="메뉴"]').click()`);await click('음악');
    assert.equal(await js(`getComputedStyle(document.querySelector('.popup-overlay[aria-label="unused"]')||document.querySelector('[aria-label="음악"]').parentElement).display`),'flex');
    await js(`document.querySelector('[aria-label="음악 창 닫기"]').click()`);await pause(50);
    // Top bar: just the bell and the menu; the menu holds only music and settings.
    assert.ok(await js(`!document.querySelector('.sync-indicator,.connect-nav,.main-tabs')&&!!document.querySelector('.bell-btn')`));
    assert.equal(await js(`document.querySelector('.bell-badge').textContent`),'1');
    await js(`document.querySelector('.bell-btn').click()`);await pause(80);assert.ok(await js(`!!document.querySelector('.bell-pop')&&document.querySelector('.bell-pop').innerText.includes('모두 확인')`));
    await js(`document.querySelector('.bell-btn').click()`);await pause(50);
    await js(`document.querySelector('[aria-label="메뉴"]').click()`);await pause(50);
    assert.deepEqual(await js(`[...document.querySelectorAll('.menu-pop button')].map(b=>b.textContent)`),['음악','설정','게임 (테스트)']);
    // For testing, the menu opens the offline game while online.
    await click('게임 (테스트)');assert.ok(await js(`!!document.querySelector('.offline-game .arcade-card')&&!document.querySelector('.offline-egg')`));await pause(800);await snap('menu-game');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}))`);await pause(80);assert.ok(await js(`!document.querySelector('.offline-game')`));
    await js(`document.querySelector('[aria-label="메뉴"]').click()`);await pause(50);
    await click('설정');
    assert.deepEqual(await js(`[...document.querySelectorAll('.settings-tab')].map(b=>b.textContent)`),['일반','배경 화면','도구 연결','휴대폰 연결','정보']);
    assert.ok(await js(`!/펫|LLM/.test(document.querySelector('.settings-panel').innerText)`),'pet/LLM settings are gone');
    await snap('settings-popup');
    await click('도구 연결');assert.ok(await js(`document.querySelectorAll('.settings-pane .tool-card').length===3`));
    await click('휴대폰 연결');await click('연결 코드 만들기');assert.equal(await js(`document.querySelector('.pair-code').textContent`),'123456');
    await click('배경 화면');
    await js(`document.querySelector('[aria-label="협곡 배경"]').click()`);await pause(150);
    assert.equal(db.settings.wallpaper.id,'canyon');assert.ok(await js(`document.body.style.getPropertyValue('--wallpaper').includes('canyon')`));
    // Uploading a photo stores a shrunk JPEG and selects it.
    await js(`new Promise(done=>{const c=document.createElement('canvas');c.width=64;c.height=40;const g=c.getContext('2d');g.fillStyle='#3a7';g.fillRect(0,0,64,40);c.toBlob(b=>{const input=document.querySelector('[aria-label="배경 사진 올리기"]'),dt=new DataTransfer();dt.items.add(new File([b],'me.png',{type:'image/png'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));setTimeout(done,600);},'image/png');})`);
    assert.equal(db.settings.wallpaper.id,'custom');assert.ok(db.settings.wallpaper.src.startsWith('data:image/jpeg'));
    await snap('settings-wallpaper');
    await click('월페이퍼 저장');await pause(150);
    {const wall=new BrowserWindow({show:false,width:1080,height:800,webPreferences:{offscreen:true}});await wall.loadFile(path.join(dir,'checker-wallpaper.html'));await pause(400);
     assert.ok(await wall.webContents.executeJavaScript(`document.querySelectorAll('#pet rect').length>100&&getComputedStyle(document.getElementById('time')).backgroundClip==='text'`,true));
     fs.writeFileSync(path.join(dir,'wallpaper.png'),(await wall.webContents.capturePage()).toPNG());wall.destroy();}
    await js(`document.querySelector('[aria-label="닫기"]').click()`);await pause(100);
    await js(`{const pet=document.querySelector('.roaming-pet'),r=pet.getBoundingClientRect();pet.dispatchEvent(new PointerEvent('pointerdown',{pointerId:22,button:0,clientX:r.left+5,clientY:r.top+5,bubbles:true}));pet.dispatchEvent(new PointerEvent('pointermove',{pointerId:22,clientX:125,clientY:135,bubbles:true,cancelable:true}));pet.dispatchEvent(new PointerEvent('pointerup',{pointerId:22,clientX:125,clientY:135,bubbles:true}));}`);await pause(750);
    const origin=await js(`({x:Number(document.querySelector('.roaming-pet').dataset.x),y:Number(document.querySelector('.roaming-pet').dataset.y)})`);
    await js(`document.querySelector('.pet-call-button').click()`);await pause(80);
    const called=await js(`({x:Number(document.querySelector('.roaming-pet').dataset.x),y:Number(document.querySelector('.roaming-pet').dataset.y),phase:document.querySelector('.roaming-pet').dataset.phase})`);
    assert.equal(called.x,origin.x);assert.equal(called.y,origin.y);assert.equal(called.phase,'jump');
    await snap('pet-summoned');
    assert.deepEqual(errors,[]);console.log('Focus smoke passed: transparent aligned title, Ctrl+Right/Ctrl+Left/Ctrl+right-click, two-room pet, input guards, edge handle, long-press task drag, touch swipe open/close, scheduling + undo, offline egg and settings.');app.exit(0);
  } catch(e) { console.error(e);await snap('failure');app.exit(1); }
});
setTimeout(()=>app.exit(1),60000).unref();
