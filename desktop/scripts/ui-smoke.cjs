const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs'), path = require('node:path');
const dir = path.resolve(__dirname, '../../artifacts/uiux-qa');
fs.mkdirSync(dir,{recursive:true}); app.setPath('userData',path.join(dir,'profile'));
const now=Date.now(), today=new Date().toLocaleDateString('en-CA');
const db={ todos:[{ id:'a',title:'Design review',teamId:'team',kind:'todo',status:'todo',date:today,createdAt:now,updatedAt:now }], teams:[{id:'team',name:'Studio',color:'#6685e8'}], projects:[], gcalEvents:[], tombstones:[], notifLog:[], settings:{theme:'light',sync:{lastSync:now},notifyStart:true,notifyEnd:true} };
const state={ok:true,connections:[],targets:[],jobs:[],configured:{}};
// 노션 · 구글 캘린더 as the signed-in person sees them (window.api.tools); imported to-dos carry origin.
let tools={ok:true,connections:[],subscriptions:[],jobs:[]};const toolCalls=[],opened=[];
db.todos[0].origin={type:'external',provider:'notion',subscription:'s-p1',id:'row-1',url:'https://www.notion.so/design-review'};
db.todos.push(...['apple','google'].map((provider,i)=>({...db.todos[0],id:'logo-'+provider,title:i?'Client meeting':'Afternoon appointment',origin:{type:'external',provider:'google',url:'https://calendar.google.com/calendar/r'}})));
db.todos.push({...db.todos[0],id:'local-logo-test',title:'Write a quick note',origin:{type:'app'}});
db.todos.push(...['Buy stamps','Call the bank'].map((title,i)=>({...db.todos[0],id:'loose-'+i,title,teamId:null,origin:{type:'app'},createdAt:now+i})));
const calls=[];
const emit=e=>{e.sender.send('smoke:db',db);return db;};
let added=0;
// The same undo history the app's main process keeps (electron/undo-history.cjs).
const {createUndoHistory,applyChanges}=require('../electron/undo-history.cjs');const history=createUndoHistory();const snap=t=>t?JSON.parse(JSON.stringify(t)):null;
ipcMain.handle('smoke:add',(e,t)=>{const todo={kind:'todo',status:'todo',createdAt:Date.now(),updatedAt:Date.now(),...t,id:'added-'+(++added)};db.todos.push(todo);history.record(todo.id,null,todo);emit(e);return todo;});
ipcMain.handle('smoke:state',()=>db);
ipcMain.handle('smoke:settings',(e,p)=>{Object.assign(db.settings,p);return emit(e);});
ipcMain.handle('smoke:delete',(e,id)=>{const gone=db.todos.find(t=>t.id===id);if(gone)history.record(id,gone,null);db.todos=db.todos.filter(t=>t.id!==id);return emit(e);});
for(const [ch,dir] of [['smoke:undo','undo'],['smoke:redo','redo']])ipcMain.handle(ch,e=>{const c=history[dir]();if(c)applyChanges(db,c);return emit(e);});
ipcMain.handle('smoke:todo',(e,p)=>{const t=db.todos.find(t=>t.id===p.id);const before=snap(t);Object.assign(t,p.patch);history.record(t.id,before,t);return emit(e);});
ipcMain.handle('smoke:integrations',(_,p)=>{
 if(p) calls.push(p);
 if(p?.action==='containers') return {ok:true,containers:[{id:'source',label:'Tasks',writable:true,properties:[{id:'title',type:'title',name:'Title'},{id:'date',type:'date',name:'Date'},{id:'appId',type:'rich_text',name:'App ID'},{id:'owner',type:'people',name:'Assignee'}]}]};
 if(p?.action==='notion-users') return {ok:true,users:[{id:'11111111-1111-4111-8111-111111111111',label:'Demo user'}]};
 return state;
});
ipcMain.handle('smoke:tools',(_,{action,payload={}})=>{
 toolCalls.push({action,...payload});
 if(action==='start'){tools.connections.push({id:'c-'+payload.provider,provider:payload.provider,account:payload.provider==='notion'?'Studio 워크스페이스':'me@studio.com'});return {ok:true,url:'https://api.notion.com/v1/oauth/authorize?state=x'};}
 if(action==='pages')return {ok:true,pages:[{id:'p1',type:'database',title:'주간 업무',icon:'📋'},{id:'p2',type:'page',title:'회의록',icon:null}].filter(p=>!payload.q||p.title.includes(payload.q))};
 if(action==='subscribe'){tools.subscriptions.push({id:'s-'+payload.resourceId,provider:'notion',resource_type:payload.type,resource_id:payload.resourceId,title:'주간 업무',url:'https://www.notion.so/p1',state:'syncing',last_error:null,last_synced_at:null});return {ok:true};}
 if(action==='unsubscribe'){tools.subscriptions=tools.subscriptions.filter(x=>x.id!==payload.id);return {ok:true};}
 if(action==='state')return JSON.parse(JSON.stringify(tools));
 return {ok:true};
});
ipcMain.handle('smoke:open',(_,url)=>{opened.push(url);return {ok:true};});
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({show:false,width:1180,height:860,webPreferences:{offscreen:true,backgroundThrottling:false,preload:path.join(__dirname,'ui-smoke-preload.cjs')}});
 win.webContents.setAudioMuted(true);
 const errors=[];win.webContents.on('console-message',(_,level,msg)=>{if(level>=3)errors.push(msg);});
 const js=async s=>{try{return await win.webContents.executeJavaScript(s);}catch(e){console.error('Failed UI action:',s,errors);throw e;}};
 const aria=label=>js('document.querySelector('+JSON.stringify('[aria-label="'+label+'"]')+').click()');
 const click=async label=>{await js('[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==='+JSON.stringify(label)+').click()');await pause(180);};
 const snap=async name=>fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG());
 try {
  await win.loadFile(path.join(__dirname,'../dist/index.html'));await pause(450);
  if(!await js('!!document.querySelector(".onboarding")')) throw Error('First-run onboarding missing');
  if(await js('[...document.querySelectorAll(".tool-card strong")].map(e=>e.textContent).join()')!=='노션,구글 캘린더') throw Error('Expected two tool cards (노션, 구글 캘린더)');
  await snap('desktop-welcome');
  // 연결하기 asks for the OAuth page (the main process opens it in the browser); the connection shows up on the next look.
  await click('연결하기');
  if(!toolCalls.some(c=>c.action==='start'&&c.provider==='notion'))throw Error('연결하기 must start the Notion sign-in');
  await pause(400);
  if(!(await js('document.querySelector(".tool-card").innerText')).includes('Studio 워크스페이스'))throw Error('Connected account not shown');
  await click('+ 지켜볼 페이지 고르기');await pause(250);
  {const pages=await js('[...document.querySelectorAll(".tool-page")].map(e=>e.innerText.replace(/\\s+/g," ").trim()).join("|")');if(pages!=='📋 주간 업무 DB|📄 회의록 페이지')throw Error('Notion pages missing: '+pages);}
  await js('document.querySelector(".tool-page").click()');await pause(300);
  if(!toolCalls.some(c=>c.action==='subscribe'&&c.resourceId==='p1'&&c.type==='database'))throw Error('Picking a page must subscribe');
  if(!(await js('document.querySelector(".tool-sub")?.innerText||""')).includes('읽는 중'))throw Error('Subscription state missing');
  await snap('desktop-provider');
  await click('지금은 건너뛰기');
  if(!db.settings.onboardingDone)throw Error('Skip not persisted');
  if(!await js('!!document.querySelector(".month-grid")'))throw Error('Month not default');
  await snap('desktop-month');
  // Imported to-dos show their tool's logo at the end of the chip; clicking it opens the source, not the day.
  await js('document.querySelector(\'.cal-chip[data-todo-id="a"] .source-mark\').click()');await pause(80);
  if(opened.at(-1)!=='https://www.notion.so/design-review'||!await js('!!document.querySelector(".month-grid")'))throw Error('Month chip source mark must open the source only');
  await js('document.querySelector(".cal-cell.today").click()');await pause(250);
  if(await js('document.querySelector(".topbar").getBoundingClientRect().height')>70)throw Error('Notebook header is no longer compact');
  if(await js('document.querySelectorAll(".memo-day").length')<7)throw Error('Continuous notebook days missing');
  await pause(300);await snap('desktop-notebook-restored');
  const mark=await js(`(()=>{const line=document.querySelector('#day-${today} .memo-line[data-todo-id="a"] .memo-line-main'),m=line?.querySelector('.source-mark');if(!m)return null;const a=m.getBoundingClientRect(),b=line.getBoundingClientRect();m.click();return {right:Math.round(b.right-a.right),width:Math.round(a.width),editing:!!document.querySelector('.memo-edit'),last:line.lastElementChild===m}})()`);
  if(!mark||!mark.last||mark.right>16||mark.width>20||mark.editing)throw Error('Source mark must sit at the right end and only open the source: '+JSON.stringify(mark));
  if(opened.length!==2||await js(`!!document.querySelector('.memo-line[data-todo-id="local-logo-test"] .source-mark')`))throw Error('Only imported to-dos have a source mark');
  // Rows drag from anywhere but their text/buttons (no ⠿ handle); Shift picks a range, Ctrl toggles one.
  if(await js('!!document.querySelector(".memo-day .todo-drag-handle")'))throw Error('Six-dot drag handle must be gone');
  await js(`document.getElementById('day-${today}').scrollIntoView({block:'center'});
   window.__row=id=>document.querySelector('.memo-line[data-todo-id="'+id+'"] .memo-line-main');
   window.__ptr=(type,el,x,y,o={})=>el.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,pointerId:1,pointerType:'mouse',button:0,clientX:x,clientY:y,...o}));
   window.__click=(id,o)=>{const el=__row(id),r=el.getBoundingClientRect();__ptr('pointerdown',el,r.right-30,r.top+r.height/2,o);__ptr('pointerup',el,r.right-30,r.top+r.height/2,o);};
   window.__drag=async(id,to,dy=0.5)=>{const el=__row(id);el.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,50));const t=to().getBoundingClientRect(),x=t.left+40,y=t.top+t.height*dy,r=el.getBoundingClientRect(),sx=r.right-30,sy=r.top+r.height/2;__ptr('pointerdown',el,sx,sy);for(let i=1;i<=4;i++){__ptr('pointermove',document.body,sx+(x-sx)*i/4,sy+(y-sy)*i/4);await new Promise(r=>setTimeout(r,16));}__ptr('pointerup',document.body,x,y);};
0`);await pause(200);
  await js(`(async()=>{const el=__row('loose-1');el.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,50));const t=__row('logo-google').getBoundingClientRect(),r=el.getBoundingClientRect();__ptr('pointerdown',el,r.right-30,r.top+8);for(let i=1;i<=3;i++){__ptr('pointermove',document.body,r.right-30-i*60,r.top+8+(t.top+4-r.top-8)*i/3);await new Promise(r=>setTimeout(r,16));}})()`);await pause(120);await snap('desktop-drag-midway');
  await js(`__ptr('pointercancel',document.body,0,0);0`);await pause(80);
  // Several at once on a computer: click, Shift+click a range, Ctrl+click to toggle; dragging carries them all.
  await js(`window.__sel=()=>[...document.querySelectorAll('.memo-line.is-selected')].map(e=>e.dataset.todoId).join(',');0`);
  await js('__click("loose-0")');await pause(80);
  await js('__click("a",{shiftKey:true})');await pause(80);
  if(await js('__sel()')!=='loose-0,loose-1,a')throw Error('Shift-click must select the range: '+await js('__sel()'));
  await js('__click("a",{ctrlKey:true})');await pause(80);
  if(await js('__sel()')!=='loose-0,loose-1')throw Error('Ctrl-click must toggle one row: '+await js('__sel()'));
  await snap('desktop-multi-select');
  // The text is kept narrow (and wraps), so the rest of the line is free to drag.
  if(!await js(`(()=>{const m=__row('loose-1'),t=m.querySelector('.memo-title');return t.getBoundingClientRect().width<=m.getBoundingClientRect().width*0.63+1&&getComputedStyle(t).whiteSpace==='normal';})()`))throw Error('The title must be narrow and wrap');
  await js(`__drag('loose-1',()=>document.querySelector('#day-${today} .memo-team'))`);await pause(400);
  if(!['loose-0','loose-1'].every(id=>db.todos.find(t=>t.id===id).teamId==='team'))throw Error('Dragging the selection onto a team must move all of it '+JSON.stringify(db.todos.map(t=>[t.id,t.teamId]))+await js(`(()=>{const h=document.querySelector('#day-${today} .memo-team'),r=h.getBoundingClientRect(),e=document.elementFromPoint(r.left+40,r.top+r.height/2);return JSON.stringify([r.top,r.left,innerHeight,e?.className,e?.outerHTML.slice(0,160)])})()`));
  await js(`__drag('local-logo-test',()=>__row('a'),0.1)`);await pause(400);
  const order=await js(`[...document.querySelectorAll('#day-${today} .memo-line')].map(e=>e.dataset.todoId).join(',')`);
  if(order.indexOf('local-logo-test')>order.indexOf('a,'))throw Error('Dragging a row must reorder the notebook: '+order);
  await js(`__drag('loose-0',()=>document.querySelector('#day-${today} .memo-head'))`);await pause(400);
  if(db.todos.find(t=>t.id==='loose-0').teamId!==null)throw Error('Dropping on the day header must take a row out of its team');
  // While dragging, a bin appears; dropping on it deletes the row, and 되돌리기 brings it back.
  const binned=await js(`(async()=>{const el=__row('loose-0');el.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,50));const r=el.getBoundingClientRect(),sx=r.right-30,sy=r.top+r.height/2;__ptr('pointerdown',el,sx,sy);__ptr('pointermove',document.body,sx-20,sy+10);await new Promise(r=>setTimeout(r,120));
    if(document.querySelector('.todo-drop-strip [data-drop-team]'))return 'teams shown';const bin=document.querySelector('.todo-drop-strip [data-drop-trash]');if(!bin)return 'no bin';const c=bin.getBoundingClientRect();__ptr('pointermove',document.body,c.left+c.width/2,c.top+c.height/2);await new Promise(r=>setTimeout(r,30));__ptr('pointerup',document.body,c.left+c.width/2,c.top+c.height/2);await new Promise(r=>setTimeout(r,60));return document.querySelector('.todo-drop-strip')?'strip stayed':'ok';})()`);await pause(300);
  if(binned!=='ok'||db.todos.some(t=>t.id==='loose-0'))throw Error('Dropping on the bin must delete the row: '+binned);
  const lostTitle=await js(`document.querySelector('.todo-undo-toast')?.innerText||''`);if(!lostTitle.includes('삭제'))throw Error('Deleting must offer undo');
  await js(`document.querySelector('.todo-undo-toast button').click()`);await pause(300);
  // Clicking a day's date shows "내 팀 전부 넣기"; it brings every team in as a heading with its own input line.
  db.teams.push({id:'team-lab',name:'Lab',color:'#e8a066'});await js('window.api.updateSettings({})');await pause(150);
  await js(`document.querySelector('#day-${today} .memo-head-date').click()`);await pause(100);
  if(!await js(`!!document.querySelector('#day-${today} .team-template-pill')`))throw Error('Clicking the date must show the 내 팀 전부 넣기 button');
  await js(`document.querySelector('#day-${today} .team-template-pill').click()`);await pause(150);
  const heads=await js(`[...document.querySelectorAll('#day-${today} .memo-team .team-name')].map(e=>e.textContent).join(',')`);
  if(heads!=='Studio,Lab')throw Error('Every team must appear as a heading once: '+heads);
  // Only a team with no lines yet gets an input row; a team that has lines gets no empty row in between.
  if(await js(`[...document.querySelectorAll('#day-${today} .team-add-row input')].map(i=>i.getAttribute('aria-label')).join(',')`)!=='Lab 할 일 입력')throw Error('Only empty teams get an input row');
  if(await js(`document.activeElement?.getAttribute('aria-label')`)!=='Lab 할 일 입력')throw Error('The first empty team input must be focused');
  await js(`{const i=document.activeElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'실험 계획');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}`);await pause(200);
  const added=db.todos.find(t=>t.title==='실험 계획');
  if(!added||added.teamId!=='team-lab'||added.date!==today)throw Error('Typing under a team must add the to-do to that team: '+JSON.stringify(added));
  if(await js(`!!document.querySelector('#day-${today} .team-template-pill')`))throw Error('The button closes after use');
  await js(`document.activeElement.blur()`);await pause(150);
  if(await js(`document.querySelectorAll('#day-${today} .team-add-row').length`)!==0)throw Error('Once every team has lines, no empty rows remain between them');
  await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');await pause(100);
  await js('document.querySelector(".memo-actions button").click()');await pause(150);
  const editor=await js('document.querySelector(".todo-editor").innerText');
  if(editor.includes('AI')||editor.includes('종료')||editor.includes('목적지'))throw Error('Task editor contains complexity');
  if(editor.includes('날짜 없음'))throw Error('A to-do can no longer be left without a date');
  // The date is picked on a calendar only; nothing moves until 확정. Ctrl+Z then puts it back.
  {
    const id=await js(`document.querySelector('.todo-editor').closest('[data-todo-id]').dataset.todoId`),was=db.todos.find(t=>t.id===id).date;
    if(!await js(`!!document.querySelector('.todo-editor .date-cal')&&!document.querySelector('.todo-editor input[type="date"]')`))throw Error('The date editor must be a calendar with no typed date');
    const day=await js(`[...document.querySelectorAll('.todo-editor .date-cal-day')].map(b=>b.dataset.date).find(d=>d!==${JSON.stringify(was)})`);
    await js(`document.querySelector('.todo-editor .date-cal-day[data-date="${day}"]').click()`);await pause(150);
    if(db.todos.find(t=>t.id===id).date!==was)throw Error('Picking a day must not move the to-do before 확정');
    if(!await js(`document.querySelector('.todo-editor .date-cal-day[data-date="${day}"]').classList.contains('is-picked')`))throw Error('The picked day must be marked');
    await js(`[...document.querySelectorAll('.todo-editor button')].find(b=>b.textContent==='확정').click()`);await pause(200);
    if(db.todos.find(t=>t.id===id).date!==day)throw Error('확정 must move the to-do to the picked day');
    if(await js(`!!document.querySelector('.todo-editor')`))throw Error('확정 closes the editor');
    await js(`document.activeElement?.blur?.();window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}))`);await pause(200);
    if(db.todos.find(t=>t.id===id).date!==was)throw Error('Ctrl+Z must undo the date change');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,shiftKey:true,bubbles:true,cancelable:true}))`);await pause(200);
    if(db.todos.find(t=>t.id===id).date!==day)throw Error('Ctrl+Shift+Z must redo it');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}))`);await pause(200);
    // A deleted to-do comes back with its own id; inside a text field Ctrl+Z is the field's own text undo.
    const gone=db.todos.find(t=>t.id===id);await js(`window.api.deleteTodo(${JSON.stringify(id)})`);await pause(150);
    // Once something has been typed in a field, Ctrl+Z there is the field's own text undo.
    const input=await js(`(()=>{const i=document.querySelector('.memo-input');i.focus();i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new KeyboardEvent('keydown',{key:'z',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}));return document.activeElement===i;})()`);await pause(200);
    if(!input||db.todos.some(t=>t.id===id))throw Error('Ctrl+Z after typing in an input must stay the text undo');
    // In an untouched field (like the empty new line the notebook leaves the caret on) — and with the Korean
    // keyboard on, where the key reads 'ㅋ' — Ctrl+Z undoes the last to-do change.
    await js(`(()=>{const i=document.querySelector('.memo-input');i.blur();i.focus();i.dispatchEvent(new KeyboardEvent('keydown',{key:'ㅋ',code:'KeyZ',ctrlKey:true,bubbles:true,cancelable:true}));})()`);await pause(200);
    await js(`document.activeElement.blur()`);
    const back=db.todos.find(t=>t.id===id);
    if(!back||back.title!==gone.title||back.date!==gone.date)throw Error('Ctrl+Z must bring a deleted to-do back as it was');
  }
  await aria('메뉴');await pause(100);
  if(await js('!!document.querySelector(".menu-pop [aria-label$=\\" 테마\\"]")||document.querySelector(".menu-pop").innerText.includes("테마")'))throw Error('Theme picker must be gone (single theme)');
  await snap('desktop-menu');
  await aria('메뉴');await pause(100);
  await click('월');
  if(!await js('document.querySelector(".team-side").innerText.includes("내 팀")'))throw Error('My team list must sit next to the calendar');
  await snap('desktop-month-teams');
  // Calendar chips drag too: onto another day moves the date.
  await js(`(async()=>{const chip=document.querySelector('.cal-chip[data-todo-id="local-logo-test"]')||document.querySelector('.cal-cell.today .cal-chip');window.__moved=chip.dataset.todoId;const cell=[...document.querySelectorAll('.cal-cell[data-date]')].find(c=>!c.classList.contains('today')),r=chip.getBoundingClientRect(),t=cell.getBoundingClientRect();__ptr('pointerdown',chip,r.left+10,r.top+5);for(let i=1;i<=4;i++){__ptr('pointermove',document.body,r.left+10+(t.left+20-r.left-10)*i/4,r.top+5+(t.top+t.height/2-r.top-5)*i/4);await new Promise(r=>setTimeout(r,16));}__ptr('pointerup',document.body,t.left+20,t.top+t.height/2);window.__to=cell.dataset.date;})()`);await pause(450);
  {const id=await js('window.__moved'),to=await js('window.__to');if(db.todos.find(t=>t.id===id).date!==to)throw Error('Dragging a calendar chip onto a day must move it there');}
  // Week view sits between 일 and 월: seven days, timed to-dos first with their time; a day opens the 일 view there.
  await js("window.api.updateTodo('a',{startTime:'09:30'})");await pause(150);
  await click('주');await pause(150);
  if(await js('document.querySelectorAll(".week-view .week-day[data-date]").length')!==7)throw Error('Week view must show seven days');
  // Grouped by team under the team's name (lines without a team first); within a team the timed one comes first.
  {const cell=await js(`(()=>{const c=document.querySelector('.week-view .week-day[data-date="${today}"]');if(!c)return null;const studio=[...c.querySelectorAll('.week-team')].find(e=>e.textContent.includes('Studio'));let n=studio?.nextElementSibling;return {text:c.innerText,teams:[...c.querySelectorAll('.week-team')].map(e=>e.textContent),firstInStudio:n?.dataset.todoId};})()`);
   if(!cell||!cell.text.includes('Design review')||!cell.text.includes('09:30')||cell.firstInStudio!=='a'||cell.teams.join()!=='Studio,Lab')throw Error('Today in the week must group its to-dos by team, timed first: '+JSON.stringify(cell));}
  if(await js('[...document.querySelectorAll(".view-toggle button")].map(b=>b.textContent.trim()).join("")')!=='일주월')throw Error('View toggle must read 일 | 주 | 월');
  await snap('desktop-week');
  await js(`document.querySelector('.week-view .week-day[data-date="${today}"] .week-head').click()`);await pause(300);
  if(!await js(`!!document.getElementById('day-${today}')&&!document.querySelector('.week-view')&&document.querySelector('.view-toggle .on').textContent.trim()==='일'`))throw Error('Clicking a day in the week must open that day');
  await click('월');await pause(150);
  await js('document.querySelector(".team-side .ghost").click()');await pause(600);
  if(!await js('!!document.querySelector(".manage-dock.is-open")'))throw Error('Team list "관리" must open the teams/buckets room');
  if((await js('document.querySelector(".manage-dock").innerText')).includes('프로젝트'))throw Error('Projects visible');
  await js('window.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape"}))');await pause(600);
  await aria('메뉴');await click('설정');await click('도구 연결');
  const text=await js('document.querySelector(".settings-pane").innerText');
  for(const hidden of ['OpenAI','개인 메모리','전송 작업','AI 목적지'])if(text.includes(hidden))throw Error('Tool screen leaked '+hidden);
  if(await js('document.querySelectorAll(".settings-pane .tool-card").length')!==2||!text.includes('지켜보는 중')&&!text.includes('읽는 중'))throw Error('Settings must show the two tools and the watched page');
  await snap('desktop-tools');
  if(errors.length)throw Error(errors.join('\n'));
  await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='일').click()`);await pause(300);
  // Dragging the mouse across several lines' text selects those lines; Delete removes them all, with undo.
  const before=db.todos.length;
  const picked=await js(`(async()=>{const rows=[...document.querySelectorAll('#day-${today} .memo-line .memo-title')].slice(0,3);const r=document.createRange();r.setStart(rows[0].firstChild||rows[0],0);r.setEnd(rows[2].firstChild||rows[2],1);const s=getSelection();s.removeAllRanges();s.addRange(r);await new Promise(r=>setTimeout(r,120));return __sel().split(',').filter(Boolean).length;})()`);
  if(picked!==3)throw Error('Selecting text across three lines must select those three: '+picked);
  await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Delete',bubbles:true,cancelable:true}))`);await pause(300);
  if(db.todos.length!==before-3)throw Error('Delete must remove the selected lines: '+(before-db.todos.length));
  await js(`document.querySelector('.todo-undo-toast button').click()`);await pause(300);
  if(db.todos.length!==before)throw Error('Undo must bring them all back');
  await js(`{const h=document.querySelector('#day-${today} .memo-head'),r=h.getBoundingClientRect();__ptr('pointerdown',document.body,5,5);__ptr('pointerup',document.body,5,5);}`);await pause(80);
  if(await js('__sel()'))throw Error('A press outside the to-dos must clear the selection');
  // The day page behaves like a notepad: Backspace at the start of a line joins it to the line above
  // (an emptied line just goes away), and the caret stays where they met — it never jumps down.
  {
    const ids=await js(`[...document.querySelectorAll('#day-${today} .memo-line')].map(e=>e.dataset.todoId)`);
    const [up,mid]=[ids[0],ids[1]],upTitle=db.todos.find(t=>t.id===up).title;
    const edit=async(id,value)=>{await js(`{const t=document.querySelector('#day-${today} .memo-line[data-todo-id="${id}"] .memo-title');t.click();}`);await pause(120);
      await js(`{const i=document.activeElement;Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(i,${JSON.stringify(value)});i.dispatchEvent(new Event('input',{bubbles:true}));i.setSelectionRange(0,0);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true,cancelable:true}));}`);await pause(250);};
    await edit(mid,'뒤');
    const joined=db.todos.find(t=>t.id===up)?.title;
    if(db.todos.some(t=>t.id===mid)||joined!==upTitle+'뒤')throw Error('Backspace at the start must join the line to the one above: '+JSON.stringify({joined,upTitle}));
    const caret=await js(`[document.activeElement?.value,document.activeElement?.selectionStart,document.activeElement?.closest('.memo-line')?.dataset.todoId]`);
    if(caret[2]!==up||caret[1]!==upTitle.length)throw Error('The caret must stay where the lines met: '+JSON.stringify(caret));
    await js(`document.activeElement.blur()`);await pause(150);
    const next=(await js(`[...document.querySelectorAll('#day-${today} .memo-line')].map(e=>e.dataset.todoId)`))[1];
    await edit(next,'');
    if(db.todos.some(t=>t.id===next))throw Error('Backspace on an emptied line must remove it');
    if(await js(`document.activeElement?.closest('.memo-line')?.dataset.todoId`)!==up)throw Error('After removing a line the caret must go up, not down');
    await js(`document.activeElement.blur()`);await pause(150);
  }
  // Notepad keys: Enter splits a line at the caret and the new line lands right under it; ↑ from the empty
  // new line goes back up; pasting several lines into a line puts them right under it.
  {
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='일').click()`);await pause(300);
    const before=await js(`[...document.querySelectorAll('#day-${today} .memo-line')].map(e=>e.dataset.todoId)`);
    const pick=await js(`(()=>{const lines=[...document.querySelectorAll('#day-${today} .memo-line')];const i=lines.findIndex((e,k)=>k<lines.length-1&&e.querySelector('.memo-title')?.textContent.length>4);return i<0?null:lines[i].dataset.todoId;})()`);
    if(!pick)throw Error('Need a line to split');
    const title=db.todos.find(t=>t.id===pick).title;
    await js(`document.querySelector('#day-${today} .memo-line[data-todo-id="${pick}"] .memo-title').click()`);await pause(150);
    await js(`{const i=document.activeElement;i.setSelectionRange(3,3);i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}`);await pause(250);
    const tail=await js(`document.activeElement?.value`);
    if(db.todos.find(t=>t.id===pick).title!==title.slice(0,3).trimEnd()||tail!==title.slice(3).trim())throw Error('Enter must split the line at the caret: '+JSON.stringify([db.todos.find(t=>t.id===pick).title,tail]));
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);await pause(300);
    const after=await js(`[...document.querySelectorAll('#day-${today} .memo-line')].map(e=>e.dataset.todoId)`);
    const added=after.find(id=>!before.includes(id));
    if(!added||after.indexOf(added)!==after.indexOf(pick)+1)throw Error('The split-off line must sit right under the line: '+JSON.stringify(after));
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true,cancelable:true}))`);await pause(200);
    if(await js(`document.activeElement?.closest('.memo-line')?.dataset.todoId`)!==added)throw Error('↑ from the empty new line must go to the line above');
    await js(`{const i=document.activeElement;i.setSelectionRange(i.value.length,i.value.length);const dt=new DataTransfer();dt.setData('text/plain',['','붙인 줄 하나','붙인 줄 둘'].join(String.fromCharCode(10)));i.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));}`);await pause(300);
    const pasted=await js(`[...document.querySelectorAll('#day-${today} .memo-line')].map(e=>e.querySelector('.memo-title')?.textContent)`);
    const k=pasted.indexOf('붙인 줄 하나');
    if(k<0||pasted[k+1]!=='붙인 줄 둘'||(await js(`[...document.querySelectorAll('#day-${today} .memo-line')].map(e=>e.dataset.todoId)`))[k-1]!==added)throw Error('Pasted lines must go right under the line: '+JSON.stringify(pasted));
  }
  // The date editor closes with Esc; bucket activation picks its day on the calendar (no typed date).
  {
    await js(`document.querySelector('#day-${today} .memo-line .memo-actions button').click()`);await pause(200);
    if(!await js(`!!document.querySelector('.todo-editor')`))throw Error('Date editor must open');
    await js(`window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);await pause(150);
    if(await js(`!!document.querySelector('.todo-editor')`))throw Error('Esc must close the date editor');
  }
  // Dragging a line to the bottom edge of the notebook scrolls it by itself.
  {
    await js(`[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==='일').click()`);await pause(300);
    const moved=await js(`(async()=>{const row=document.querySelector('.memo-day .memo-line .memo-line-main');row.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,80));
      let sc=row.parentElement;while(sc&&!(sc.scrollHeight>sc.clientHeight+4&&/(auto|scroll)/.test(getComputedStyle(sc).overflowY)))sc=sc.parentElement;if(!sc)return 'no scroller';
      const before=sc.scrollTop,r=row.getBoundingClientRect(),b=sc.getBoundingClientRect();__ptr('pointerdown',row,r.right-30,r.top+r.height/2);__ptr('pointermove',document.body,r.right-30,r.top+r.height/2+20);__ptr('pointermove',document.body,r.right-30,b.bottom-15);
      await new Promise(r=>setTimeout(r,700));const after=sc.scrollTop;__ptr('pointercancel',document.body,0,0);return after-before;})()`);await pause(150);
    if(!(moved>40))throw Error('Dragging to the bottom edge must scroll the notebook: '+moved);
  }
  // The pet does the tool work: thinking while the job thinks, then says the summary when it is done.
  tools.jobs=[{id:'j1',provider:'notion',kind:'import',state:'thinking',summary:'노션 "주간 업무" 읽는 중',updated_at:new Date().toISOString()}];
  db.auth={required:true,loading:false,email:'smoke@checker.test'};win.webContents.send('smoke:db',db);await pause(2600);
  if(!await js('!!document.querySelector(".roaming-pet[data-work=thinking] .pet-work.thinking")'))throw Error('The pet must think while the job thinks');
  await snap('desktop-pet-thinking');
  Object.assign(tools.jobs[0],{state:'done',summary:'노션 "주간 업무"에서 2개 추가',counts:{created:2},updated_at:new Date().toISOString()});await pause(4400);
  const said=await js('document.querySelector(".roaming-pet .pet-say")?.textContent||""');
  if(!said.includes('2개 추가'))throw Error('The pet must say the summary when the job is done: '+said);
  await snap('desktop-pet-done');
  console.log('UI UX smoke passed: tool connections (connect, pick a Notion page), source marks, pet jobs, onboarding/skip, default month, date-only editor, single theme, row drag (order, team in/out, calendar date), 내 팀 전부 넣기, week view, notepad Backspace, multi-select + Delete, teams room, tools in settings.');app.exit(0);
 }catch(e){console.error(e);await snap('failure');app.exit(1);}
});
setTimeout(()=>app.exit(1),45000).unref();
