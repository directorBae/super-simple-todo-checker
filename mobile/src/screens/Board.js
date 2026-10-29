import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Keyboard, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { ScrollView as GestureScrollView } from 'react-native-gesture-handler';
import { Text, TextInput } from '../text.js';
import { useDb } from '../store.js';
import { useDesign, Surface, Icon, GlowText } from '../design.js';
import { todayStr, addDays, dateParts, DOW_NAMES } from '../util.js';
import { lineOrder } from '../notepad.js';
import { dropPatches } from '../../../shared/todo-drop.js';
import { TaskLine, LeavingLine, DateSheet, RepeatSheet } from './NotebookLine.js';
import { dayGroups } from '../../../shared/notepad-diff.js';
import MonthView from './NotebookMonth.js';
import WeekView from './NotebookWeek.js';
import { onOutsideTap } from '../gesture.js';
import { useImportTyping } from '../ImportTyping.js';
import { stepsOf, stepMs, lookOf, ghostsOf } from '../import-typing.js';

// The add line under a team heading brought in by "내 팀 전부 넣기": what you type there joins that team.
function TeamAddLine({ team, date, api, items, inputRef, reveal, onNext, onTyping }) {
 const d=useDesign(), [text,setText]=useState(''), [active,setActive]=useState(false), own=useRef(null);
 const add=value=>{
  const parts=value.replace(/\r/g,'').split('\n'); if(parts.length===1){setText(value);return;}
  const tail=parts.pop(); let order=Math.max(0,...items.map(t=>t.sortOrder??t.createdAt??0));
  for(const title of parts) if(title.trim()) api.addTodo({title,date,teamId:team.id,sortOrder:order+=1024});
  setText(tail);
  if(parts.length===1&&!parts[0].trim()) onNext(); // Enter on an empty line moves to the next team
 };
 return <View style={{flexDirection:'row',alignItems:'center',gap:5,marginLeft:16,paddingVertical:1,paddingHorizontal:4,borderRadius:12,borderWidth:1,borderColor:active?d.edge:'transparent',backgroundColor:active?'#ffffff8c':'transparent'}}>
  <View style={{width:19,height:19,borderRadius:6,borderWidth:1.5,borderColor:active?d.accent:d.muted,opacity:active?0.7:0.35}}/>
  <TextInput ref={el=>{own.current=el;inputRef(el);}} accessibilityLabel={team.name+' 할 일 입력'} maxLength={50} value={text} onChangeText={add} multiline scrollEnabled={false} submitBehavior="newline" onFocus={()=>{setActive(true);onTyping?.(true);reveal(own);}} onBlur={()=>{setActive(false);onTyping?.(false);if(text.trim())add(text+'\n');}} style={{flex:1,fontSize:15,lineHeight:21,color:d.text,paddingVertical:5,minHeight:31}}/>
 </View>;
}

// The new line opened right below a line by Enter: what is typed joins that line's team and sits just under it;
// Enter again keeps going below, Backspace on the empty line goes back up to the end of the line above.
function LineBelow({ anchor, next, date, api, setFocus, reveal }) {
 const d=useDesign(), [text,setText]=useState(''), input=useRef(null), after=useRef(anchor);
 useEffect(()=>{const t=setTimeout(()=>{input.current?.focus();reveal?.(input);},30);return()=>clearTimeout(t);},[]);
 const between=(a,b)=>{const s=a?.sortOrder??a?.createdAt??0,f=b?(b.sortOrder??b.createdAt??s+1024):s+1024;return f>s?(s+f)/2:s+1;};
 const put=title=>{const id=Date.now().toString(36)+Math.random().toString(36).slice(2),sortOrder=between(after.current,next);api.addTodo({id,title,date,teamId:anchor.teamId||null,projectId:anchor.projectId||null,sortOrder});after.current={id,sortOrder};return id;};
 const change=value=>{
  if(!value.includes('\n')){setText(value);return;}
  const parts=value.replace(/\r/g,'').split('\n'),tail=parts.pop();
  let last=null;for(const title of parts) if(title.trim()) last=put(title);
  setText(tail);
  if(last) setFocus({id:'after:'+last,date,nonce:Date.now()}); // keep going right below the line just added
 };
 return <View style={{flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,paddingVertical:3,marginVertical:3,borderRadius:16,borderWidth:1,borderColor:d.edge,backgroundColor:'#ffffff8c'}}>
  <View style={{width:19,height:19,borderRadius:6,borderWidth:1.5,borderColor:d.accent,opacity:0.6}}/>
  <TextInput ref={input} accessibilityLabel="새 할 일" maxLength={50} value={text} onChangeText={change} multiline scrollEnabled={false} submitBehavior="newline"
   onKeyPress={e=>{if(e.nativeEvent.key==='Backspace'&&!text)setFocus({id:anchor.id,position:anchor.title?.length??0,date,nonce:Date.now()});}}
   onBlur={()=>{if(text.trim())put(text.trim());setFocus(f=>f?.id==='after:'+anchor.id?null:f);}}
   style={{flex:1,fontSize:15,lineHeight:21,color:d.text,padding:0,minHeight:25}}/>
 </View>;
}

// One day: its lines grouped by team, each edited where it is; the faint checkbox at the end starts a new line.
function DaySection({ date, db, api, focus, setFocus, onDate, onRepeat, onGrab, onStart, onDrop, onMove, rows, reveal, selection, onSelectStart, onSelectMove, onSelectEnd, onToggle, typing }) {
 const d=useDesign(), [draft,setDraft]=useState(''), [team,setTeam]=useState(null), [active,setActive]=useState(false), input=useRef(null), [typingTeam,setTypingTeam]=useState(null);
 // Tap the date for "내 팀 전부 넣기": every team then shows as a heading (an input row only while it has no lines).
 const [pill,setPill]=useState(false),[allTeams,setAllTeams]=useState(false),teamInputs=useRef({}),pendingTeam=useRef(null),pillAt=useRef(0);
 useEffect(()=>{if(!pill)return;return onOutsideTap(()=>{if(Date.now()-pillAt.current>350)setPill(false);});},[pill]);
 useEffect(()=>{const id=pendingTeam.current;if(!id)return;pendingTeam.current=null;setTimeout(()=>teamInputs.current[id]?.focus(),60);});
 // Lines the AI removed or moved away still show at their old place until their turn (typing.ghosts, LeavingLine).
 const ghosts=typing.ghosts(date), shown=dayGroups(ghosts.length?{...db,todos:[...db.todos,...ghosts]}:db,date), items=shown.flatMap(g=>g.todos).filter(t=>!t.ghost);
 const groups=[...shown.filter(g=>!g.team),...db.teams.map(t=>shown.find(g=>g.team?.id===t.id)||(allTeams?{team:t,todos:[]}:null)).filter(Boolean)];
 const ordered=groups.flatMap(g=>g.todos).filter(t=>!t.ghost), isToday=date===todayStr();
 const part=date?dateParts(date):null;
 useEffect(()=>{ if(focus?.id==='draft'&&focus.date===date) {setTeam(focus.teamId||null);input.current?.focus();} },[focus]);
 const add=text=>{
  const parts=text.replace(/\r/g,'').split('\n'); if(parts.length===1){setDraft(text);return;}
  const tail=parts.pop(); let selectedTeam=team, order=Math.max(0,...items.map(t=>t.sortOrder??t.createdAt??0));
  for(const title of parts) { if(!title.trim()) continue; const match=db.teams.find(t=>t.name.toLowerCase()===title.trim().toLowerCase()); if(match){selectedTeam=match.id;setTeam(match.id);}else api.addTodo({title,date,teamId:selectedTeam,sortOrder:order+=1024}); }
  setDraft(tail);
 };
 const commit=()=>{setActive(false);if(draft.trim())add(draft+'\n');};
 const focusLine=target=>setFocus(target?{...target,date,nonce:Date.now()}:null);
 const insertAllTeams=()=>{setPill(false);if(!db.teams.length)return;const empty=db.teams.find(t=>!items.some(item=>shown.find(g=>g.team?.id===t.id)?.todos.includes(item)));pendingTeam.current=(empty||db.teams[0]).id;setAllTeams(true);};
 const nextTeam=id=>{const i=db.teams.findIndex(t=>t.id===id),next=db.teams[i+1];if(next)teamInputs.current[next.id]?.focus();else input.current?.focus();};
 return <View style={{paddingVertical:12,paddingHorizontal:12,marginHorizontal:-12}}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:4}}>
   <Pressable accessibilityRole="button" accessibilityLabel={(part?`${part.m}월 ${part.d}일`:'날짜')+' · 눌러서 내 팀 전부 넣기'} accessibilityState={{expanded:pill}} hitSlop={6} onPress={()=>{pillAt.current=Date.now();setPill(v=>!v);}} style={({pressed})=>({flexDirection:'row',alignItems:'baseline',gap:8,paddingHorizontal:6,paddingVertical:2,marginHorizontal:-6,borderRadius:10,backgroundColor:pressed||pill?'#ffffff8c':'transparent'})}>
   {isToday?<GlowText style={{fontSize:16,fontWeight:'800'}}>{DOW_NAMES[part.dow]}</GlowText>:<Text style={{fontSize:16,fontWeight:'800',color:part?.dow===0?'#e11d48':part?.dow===6?'#4f6ef7':d.text}}>{part?DOW_NAMES[part.dow]:'날짜 미정'}</Text>}
   {part&&(isToday?<GlowText style={{fontSize:13,fontWeight:'700'}}>{part.m}월 {part.d}일</GlowText>:<Text style={{fontSize:12,color:d.muted}}>{part.m}월 {part.d}일</Text>)}
   </Pressable>
   {isToday&&<View style={{backgroundColor:d.accent,borderRadius:99,paddingHorizontal:8,paddingVertical:2}}><Text style={{fontSize:10,color:'#fff',fontWeight:'700'}}>오늘</Text></View>}
   {pill&&<Pressable accessibilityRole="button" disabled={!db.teams.length} onPress={insertAllTeams} style={{paddingHorizontal:12,paddingVertical:5,borderRadius:99,borderWidth:1,borderColor:'#ffffffcc',backgroundColor:'#ffffffb3',shadowColor:'#4f46e5',shadowOpacity:.16,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2}}><Text style={{fontSize:12,fontWeight:'700',color:db.teams.length?d.accent:d.muted}}>{db.teams.length?'내 팀 전부 넣기':'팀이 없어요'}</Text></Pressable>}
  </View>
  {groups.map(g=><View key={g.team?.id||'none'}>
   {g.team&&<View style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:8,marginBottom:2}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:g.team.color}}/><Text style={{fontSize:12,fontWeight:'700',color:g.team.important?g.team.color:d.muted}}>{g.team.name}{g.team.important?' ★':''}</Text></View>}
   {g.todos.map((todo,k)=>{if(todo.ghost)return <View key={todo.id} style={{marginLeft:g.team?16:0}}><LeavingLine todo={todo} show={typing.ghostShow(todo.ghost)} rowRef={ref=>typing.ghostRef(todo.ghost,ref)} onDone={typing.done}/></View>;const i=ordered.findIndex(t=>t.id===todo.id);return <View key={todo.id} style={{marginLeft:g.team?16:0}}><TaskLine reveal={reveal} todo={todo} db={db} api={api} previous={ordered[i-1]} next={ordered[i+1]} editing={focus?.id===todo.id} caret={focus?.id===todo.id?focus.position:null} onEdit={t=>focusLine({id:t.id,position:t.title.length})} onEndEdit={t=>setFocus(f=>f?.id===t.id?null:f)} onFocusLine={focusLine} rowRef={ref=>{rows.current[todo.id]=ref;}} onDate={onDate} onRepeat={onRepeat} onGrab={onGrab} onStart={onStart} onDrop={onDrop} onMove={onMove} selected={selection.has(todo.id)} selecting={selection.size>0} onSelectStart={onSelectStart} onSelectMove={onSelectMove} onSelectEnd={onSelectEnd} onToggle={onToggle} typing={typing.of(todo.id)} onTyped={typing.done} />{focus?.id==='after:'+todo.id&&<LineBelow key={'below'+focus.nonce} anchor={todo} next={g.todos[k+1]} date={date} api={api} setFocus={setFocus} reveal={reveal}/>}</View>;})}
   {/* Only a team with no lines yet (or the one being typed in) keeps an input row: no empty rows between teams. */}
   {allTeams&&g.team&&(!g.todos.length||typingTeam===g.team.id)&&<TeamAddLine onTyping={on=>setTypingTeam(cur=>on?g.team.id:cur===g.team.id?null:cur)} team={g.team} date={date} api={api} items={items} reveal={reveal} inputRef={el=>{if(el)teamInputs.current[g.team.id]=el;else delete teamInputs.current[g.team.id];}} onNext={()=>nextTeam(g.team.id)}/>}
  </View>)}
  {/* A new line starts as a faint empty checkbox. */}
  <View style={{flexDirection:'row',alignItems:'center',gap:5,paddingVertical:2,paddingHorizontal:4,marginHorizontal:-4,borderRadius:12,borderWidth:1,borderColor:active?d.edge:'transparent',backgroundColor:active?'#ffffff8c':'transparent'}}>
   <View style={{width:19,height:19,marginHorizontal:1,borderRadius:6,borderWidth:1.5,borderColor:active?d.accent:d.muted,opacity:active?0.7:0.35}}/>
   {team&&<Pressable onPress={()=>setTeam(null)} style={{paddingHorizontal:7,paddingVertical:3,borderRadius:99,backgroundColor:d.input}}><Text style={{fontSize:11,color:d.muted}}>{db.teams.find(t=>t.id===team)?.name} ×</Text></Pressable>}
   <TextInput ref={input} accessibilityLabel={'새 할 일 '+(date||'날짜 미정')} maxLength={50} value={draft} onChangeText={add} multiline scrollEnabled={false} submitBehavior="newline" onFocus={()=>{setActive(true);reveal(input);}} onBlur={commit} onKeyPress={e=>{if(e.nativeEvent.key==='Backspace'&&!draft&&ordered.length)focusLine({id:ordered.at(-1).id,position:ordered.at(-1).title.length});}} style={{flex:1,fontSize:15,lineHeight:21,color:d.text,paddingVertical:6,minHeight:33}}/>
  </View>
 </View>;
}

export default function Board({ clockOpen=false, clockLeft=Infinity, onClockReveal=()=>{}, onClockClose=()=>{}, onClockDrop=()=>{}, onClockHover=()=>{} }) {
 const {db,api}=useDb(), d=useDesign(), today=todayStr();
 const {width}=useWindowDimensions();
 const [weekOf,setWeekOf]=useState(today);
 const [view,setView]=useState('month'),[ym,setYm]=useState(()=>{const n=new Date();return {y:n.getFullYear(),m:n.getMonth()};}),[range,setRange]=useState({start:-7,end:30});
 const [focus,setFocus]=useState(null),[selection,setSelection]=useState(()=>new Set()),[dateTodo,setDateTodo]=useState(null),[repeatTodo,setRepeatTodo]=useState(null),[dragging,setDragging]=useState(null),[hover,setHover]=useState(null),[undo,setUndo]=useState(null);
 // A held line is being moved (the list stops scrolling while it is).
 const [grabbing,setGrabbing]=useState(false);
 const scroll=useRef(null),positions=useRef({}),pending=useRef(today),busy=useRef(false),rows=useRef({}),zones=useRef({}),geometry=useRef({rows:[],teams:[]}),activeInput=useRef(null),viewport=useRef(null),scrollY=useRef(0),keyboardTop=useRef(Infinity);
 const dates=useMemo(()=>Array.from({length:range.end-range.start+1},(_,i)=>addDays(today,range.start+i)),[range,today]);
 const reveal=ref=>{if(ref)activeInput.current=ref;setTimeout(()=>{
  const field=activeInput.current?.current;if(!field?.isFocused())return;
  viewport.current?.measureInWindow((vx,vy,vw,vh)=>field.measureInWindow((x,y,w,h)=>{
   const bottom=Math.min(vy+vh,keyboardTop.current)-28,top=vy+12;
   const delta=y+h>bottom?y+h-bottom:y<top?y-top:0;
   if(Math.abs(delta)>2)scroll.current?.scrollTo({y:Math.max(0,scrollY.current+delta),animated:false});
  }));
 },120);};
 useEffect(()=>{const show=Keyboard.addListener('keyboardDidShow',e=>{keyboardTop.current=e.endCoordinates.screenY;reveal(activeInput.current);});const hide=Keyboard.addListener('keyboardDidHide',()=>{keyboardTop.current=Infinity;});return()=>{show.remove();hide.remove();};},[]);
 useEffect(()=>{busy.current=false;},[range]);
 const openDay=date=>{const offset=Math.round((Date.parse(date+'T12:00:00')-Date.parse(today+'T12:00:00'))/864e5);pending.current=date;setRange(r=>({start:Math.min(r.start,offset-7),end:Math.max(r.end,offset+14)}));setView('list');};
 const goToday=()=>{if(view==='month'){const n=new Date();setYm({y:n.getFullYear(),m:n.getMonth()});}else if(view==='week')setWeekOf(today);else if(positions.current[today]!=null)scroll.current?.scrollTo({y:Math.max(0,positions.current[today]-6),animated:true});else openDay(today);};
 const onScroll=e=>{scrollY.current=e.nativeEvent.contentOffset.y;if(busy.current||pending.current||dragging)return;const {contentOffset,contentSize,layoutMeasurement}=e.nativeEvent;if(contentOffset.y+layoutMeasurement.height>contentSize.height-600){busy.current=true;setRange(r=>({...r,end:r.end+14}));}else if(contentOffset.y<200){busy.current=true;setRange(r=>({...r,start:r.start-14}));}};
 const measure=()=>{const g={rows:[],teams:[]};geometry.current=g;Object.entries(rows.current).forEach(([id,ref])=>ref?.measureInWindow((x,y,w,h)=>g.rows.push({id,x,y,w,h})));Object.entries(zones.current).forEach(([id,ref])=>ref?.measureInWindow((x,y,w,h)=>g.teams.push({id,x,y,w,h})));};
 useEffect(()=>{if(dragging){const t=setTimeout(measure,80);return()=>clearTimeout(t);}},[dragging,db.teams]);
 const hit=(items,x,y)=>items.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
 const apply=patches=>patches.forEach(({id,patch})=>api.updateTodo(id,patch));
 // Selecting lines: hold a line's text and slide — every line from there to the finger is selected (screen order).
 // A tap on a line then adds or removes it; a tap anywhere else lets go.
 const selAnchor=useRef(null),screenOrder=()=>[...geometry.current.rows].sort((a,b)=>a.y-b.y||a.x-b.x).map(r=>r.id);

 // Near the top or bottom of the list while dragging or selecting, the list scrolls by itself (faster closer to the edge);
 // the drag or selection keeps following the finger while it does.
 const auto=useRef({dir:0,speed:0,raf:0,frame:0,x:0,y:0,kind:null}),contentH=useRef(0),frameBox=useRef(null),[ghost,setGhost]=useState(null);
 const measureViewport=()=>viewport.current?.measureInWindow((x,y,w,h)=>{frameBox.current={x,y,w,h};});
 const stopAuto=()=>{cancelAnimationFrame(auto.current.raf);auto.current.dir=0;};
 const autoStep=()=>{
  const a=auto.current,f=frameBox.current;if(!a.dir||!f){a.raf=0;return;}
  const max=Math.max(0,contentH.current-f.h),next=Math.max(0,Math.min(max,scrollY.current+a.dir*a.speed));
  if(next!==scrollY.current){scroll.current?.scrollTo({y:next,animated:false});scrollY.current=next;}
  if(++a.frame%6===0)measure();
  if(a.kind==='select')selectMove(a.x,a.y);
  a.raf=requestAnimationFrame(autoStep);
 };
 const edgeScroll=(x,y,kind)=>{
  const a=auto.current,f=frameBox.current;a.x=x;a.y=y;a.kind=kind;if(!f)return;
  const zone=80,top=y-f.y,bottom=f.y+f.h-y,dir=top<zone?-1:bottom<zone?1:0;
  a.speed=dir?Math.round(4+14*(1-Math.max(0,Math.min(zone,dir<0?top:bottom))/zone)):0;
  if(dir===a.dir)return;
  cancelAnimationFrame(a.raf);a.dir=dir;if(dir)a.raf=requestAnimationFrame(autoStep);
 };
 const selectStart=todo=>{setFocus(null);measure();measureViewport();selAnchor.current=todo.id;setSelection(new Set([todo.id]));};
 const selectMoveFinger=(x,y)=>{edgeScroll(x,y,'select');selectMove(x,y);};
 const selectMove=(x,y)=>{const order=screenOrder(),row=geometry.current.rows.find(r=>y>=r.y&&y<=r.y+r.h)||(y<(geometry.current.rows[0]?.y??0)?null:null);if(!row)return;const a=order.indexOf(selAnchor.current),b=order.indexOf(row.id);if(a<0||b<0)return;const ids=order.slice(Math.min(a,b),Math.max(a,b)+1);setSelection(s=>(s.size===ids.length&&ids.every(id=>s.has(id))?s:new Set(ids)));};
 const selectEnd=()=>{stopAuto();};
 const toggleLine=todo=>setSelection(s=>{const next=new Set(s);if(next.has(todo.id))next.delete(todo.id);else next.add(todo.id);return next;});
 useEffect(()=>onOutsideTap(()=>setSelection(s=>(s.size?new Set():s))),[]);
 // A selected line carries the whole selection with it (in the order shown).
 const carried=todo=>{if(!selection.has(todo.id))return [todo];const order=screenOrder();return db.todos.filter(t=>selection.has(t.id)).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));};
 const drop=(todo,x,y)=>{
  setDragging(null);setHover(null);onClockHover(null);stopAuto();setGhost(null);
  if(!todo)return;
  const list=carried(todo),ids=list.map(t=>t.id);
  if(clockOpen&&x>=clockLeft){onClockDrop(list,x,y);return;}
  if(hit(geometry.current.teams,x,y)){ids.forEach(id=>api.deleteTodo(id));setUndo({todos:list,action:'delete'});setSelection(new Set());return;}
  const row=hit(geometry.current.rows,x,y);
  if(row&&!ids.includes(row.id))apply(dropPatches(db,ids,{kind:'line',targetId:row.id,after:y>row.y+row.h/2},lineOrder));
 };
 // Dragging to the right edge slides the clock in; back to the left edge slides it away again.
 // Over the clock the dragged line is hidden under the sheet, so the clock draws it (title + the time it would get).
 const moving=(x,y)=>{if(!clockOpen){edgeScroll(x,y,'drag');const f=frameBox.current;if(f&&dragging)setGhost({x:x-f.x,y:y-f.y,title:dragging.title,count:selection.has(dragging.id)?selection.size:1});}else setGhost(null);if(dragging&&x>width-64)onClockReveal(dragging);else if(clockOpen&&x<40)onClockClose();if(clockOpen)onClockHover(x,y,dragging);setHover(clockOpen?null:hit(geometry.current.teams,x,y)?.id||null);};
 const section=date=><DaySection date={date} db={db} api={api} focus={focus} setFocus={setFocus} rows={rows} selection={selection} onSelectStart={selectStart} onSelectMove={selectMoveFinger} onSelectEnd={selectEnd} onToggle={toggleLine} onDate={setDateTodo} onRepeat={setRepeatTodo} onGrab={on=>{setGrabbing(on);if(on)measureViewport();}} onStart={setDragging} onDrop={drop} onMove={moving} reveal={reveal} typing={typingRows}/>;
 // What a Notion / Google Calendar job does to the lines is played here, one change at a time (ImportTyping.js,
 // import-typing.js): the list scrolls to the line, then a new line is typed out, a changed one erased back and
 // retyped (its checkbox ticking if that changed too), a moved one erased and folded away at its old day and typed into
 // the new one with a "10/29 → 10/30" chip, a removed one erased, struck and folded away. With Reduce Motion the line
 // only lights up for a moment (a removed one fades). Any touch on the list, or starting to edit, select or move a
 // line, finishes them all at once — and while that goes on, nothing new is played (it just shows).
 const typing=useImportTyping(),[stage,setStage]=useState(null),item=view==='list'?typing.item:null,ghostRows=useRef({}),run=useRef(null);
 useEffect(()=>view==='list'?typing.attach():undefined,[view]);
 useEffect(()=>{const on=!!(focus||dragging||grabbing||selection.size);typing.setBusy(on);if(on)typing.finishAll();},[focus,dragging,grabbing,selection.size>0]);
 useEffect(()=>()=>typing.setBusy(false),[]);
 // A line on a day the list has not drawn yet: draw that far (not for days far away; those just change).
 const ensureDay=date=>{if(!date)return;const offset=Math.round((Date.parse(date+'T12:00:00')-Date.parse(today+'T12:00:00'))/864e5);if(!Number.isFinite(offset)||Math.abs(offset)>180)return;setRange(r=>offset>=r.start&&offset<=r.end?r:{start:Math.min(r.start,offset-2),end:Math.max(r.end,offset+2)});};
 useEffect(()=>{
  setStage(null);
  if(!item)return undefined;
  const reduced=typing.reduced,steps=stepsOf(item,reduced),r={key:item.key,n:-1,live:true,timers:[]};
  run.current=r;
  const later=(fn,ms)=>r.timers.push(setTimeout(()=>{if(r.live)fn();},ms));
  const next=()=>{
   r.timers.forEach(clearTimeout);r.timers=[];r.n+=1;const s=steps[r.n];
   if(!s){r.live=false;typing.done(item.key);return;}
   setStage({key:item.key,id:item.id,n:r.n,at:s.at,show:null});
   ensureDay(s.date);
   later(()=>go(s,r.n,0),40);
  };
  r.next=next;
  const go=(s,n,tries)=>{
   const row=s.at==='ghost'?ghostRows.current[item.key]:rows.current[item.id];
   if(!row||!viewport.current){if(tries<8)later(()=>go(s,n,tries+1),120);else next();return;}
   viewport.current.measureInWindow((vx,vy,vw,vh)=>row.measureInWindow((x,y,w,h)=>{
    if(!r.live||r.n!==n)return;
    // Out of the comfortable band (under the toggle, above the 오늘 button): bring it to a bit above the middle.
    const off=y<vy+40||y+h>vy+vh-150,delta=off?y-(vy+vh*0.36):0,max=Math.max(0,contentH.current-vh);
    if(Math.abs(delta)>2){const to=Math.max(0,Math.min(max,scrollY.current+delta));scroll.current?.scrollTo({y:to,animated:!reduced});if(reduced)scrollY.current=to;}
    later(()=>{
     setStage({key:item.key,id:item.id,n,at:s.at,show:{...s.show,key:item.key+'#'+n}});
     // 'glow' just lasts its time; the others say when they are done (this is in case the line goes away mid-way).
     later(next,s.show.mode==='glow'?stepMs(s.show):stepMs(s.show)+2500);
    },Math.abs(delta)>2&&!reduced?420:40);
   }));
  };
  next();
  return()=>{r.live=false;r.timers.forEach(clearTimeout);if(run.current===r)run.current=null;};
 },[item?.key]);
 const stepDone=key=>{const r=run.current;if(r?.live&&key===r.key+'#'+r.n)r.next();};
 // A moved line's first step (leaving its old day) has played: its copy there is gone.
 const left=stage&&stage.n>=1?stage.key:null;
 const ghostList=useMemo(()=>ghostsOf(typing.items,{left,reduced:typing.reduced}),[typing.items,left,typing.reduced]);
 const typingRows={
  done:stepDone,
  of:id=>stage?.show&&stage.at==='row'&&stage.id===id?stage.show:lookOf(typing.items,id,typing.reduced),
  ghosts:date=>view==='list'?ghostList.filter(g=>g.date===date):[],
  ghostShow:key=>stage?.show&&stage.at==='ghost'&&stage.key===key?stage.show:null,
  ghostRef:(key,ref)=>{if(ref)ghostRows.current[key]=ref;else delete ghostRows.current[key];},
 };
 // 일 · 주 · 월: above the day list, and next to the month/week name in the calendars.
 const toggle=<View style={{flexDirection:'row',padding:2,gap:2,borderRadius:12,borderWidth:1,borderColor:d.edge,backgroundColor:d.fill}}>{[['list','일'],['week','주'],['month','월']].map(([key,label])=><Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={()=>key==='list'?openDay(today):key==='week'?(setWeekOf(today),setView('week')):setView('month')} style={{paddingHorizontal:14,paddingVertical:5,borderRadius:10,backgroundColor:view===key?d.input:'transparent'}}><Text style={{fontSize:13,color:view===key?d.accent:d.muted,fontWeight:view===key?'700':'400'}}>{label}</Text></Pressable>)}</View>;
 return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={60}>
  {view==='list'&&<View style={{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingTop:10,paddingBottom:4}}>{toggle}</View>}
  {view==='week'?<ScrollView contentContainerStyle={{paddingHorizontal:16,paddingBottom:120}}><WeekView db={db} weekOf={weekOf} setWeekOf={setWeekOf} openDay={openDay} toggle={toggle}/></ScrollView>:
   view==='month'?<ScrollView contentContainerStyle={{paddingHorizontal:16,paddingBottom:120}}><MonthView db={db} ym={ym} setYm={setYm} openDay={openDay} toggle={toggle}/></ScrollView>:
   <View ref={viewport} collapsable={false} style={{flex:1}} onTouchStart={()=>{if(typing.current)typing.finishAll();}} onLayout={()=>reveal(activeInput.current)}><GestureScrollView ref={scroll} onContentSizeChange={(w,h)=>{contentH.current=h;reveal(activeInput.current);}} scrollEnabled={!dragging&&!grabbing} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" onScroll={onScroll} scrollEventThrottle={64} maintainVisibleContentPosition={{minIndexForVisible:0}} contentContainerStyle={{paddingHorizontal:16,paddingBottom:160}}>
    {dates.map((date,i)=><View key={date} onLayout={e=>{positions.current[date]=e.nativeEvent.layout.y;if(pending.current===date&&scroll.current){pending.current=null;const y=Math.max(0,e.nativeEvent.layout.y-6);requestAnimationFrame(()=>scroll.current?.scrollTo({y,animated:false}));}}}>
     {(i===0||date.endsWith('-01'))&&<Text style={{fontSize:12,fontWeight:'600',color:d.muted,paddingVertical:12}}>{dateParts(date).y}년 {dateParts(date).m}월</Text>}
     {section(date)}
    </View>)}
   </GestureScrollView>
   {ghost&&<View pointerEvents="none" style={{position:'absolute',left:Math.max(8,ghost.x-40),top:ghost.y-44,maxWidth:240,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:8,borderRadius:16,backgroundColor:'#fffffff0',borderWidth:1,borderColor:d.edge,shadowColor:'#1e1b4b',shadowOpacity:0.2,shadowRadius:12,shadowOffset:{width:0,height:6},elevation:8}}>
    <Text numberOfLines={1} style={{flexShrink:1,fontSize:14,color:d.text}}>{ghost.title}</Text>
    {ghost.count>1&&<View style={{minWidth:20,height:20,paddingHorizontal:6,borderRadius:10,alignItems:'center',justifyContent:'center',backgroundColor:d.accent}}><Text style={{fontSize:11,fontWeight:'700',color:'#fff'}}>{ghost.count}</Text></View>}
   </View>}
   </View>}
  {!dragging&&!undo&&<Pressable accessibilityLabel="오늘로 이동" onPress={goToday} style={{position:'absolute',right:16,bottom:100}}><Surface native style={{borderRadius:99}} contentStyle={{paddingHorizontal:14,paddingVertical:9}}><Text style={{fontSize:13,fontWeight:'700',color:d.accent}}>◎ 오늘</Text></Surface></Pressable>}
  {undo&&!dragging&&<Surface native style={{position:'absolute',bottom:98,left:16,right:16}} contentStyle={{padding:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{fontSize:13,color:d.text}}>{undo.action==='delete'?(undo.todos?.length>1?`할 일 ${undo.todos.length}개를 삭제했어요`:'할 일을 삭제했어요'):'버킷에 담았어요'}</Text><Pressable onPress={()=>{if(undo.action==='bucket')api.updateTodo(undo.todo.id,{status:undo.todo.status});else (undo.todos||[undo.todo]).forEach(t=>api.restoreTodo(t));setUndo(null);}}><Text style={{color:d.accent,fontWeight:'700'}}>되돌리기</Text></Pressable><Pressable accessibilityLabel="알림 닫기" onPress={()=>setUndo(null)}><Icon name="close" size={16}/></Pressable></Surface>}
  {/* While dragging: the bin (drop to delete, with undo). A line dropped among a team's lines joins that team. */}
  {dragging&&<View pointerEvents="none" style={{position:'absolute',left:0,right:0,bottom:96,alignItems:'center'}}>
   <View ref={ref=>{zones.current.trash=ref;}} collapsable={false} onLayout={measure} accessibilityLabel="여기에 놓아 삭제" style={{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:24,paddingVertical:12,borderRadius:99,borderWidth:1,borderColor:'#ffffffb3',backgroundColor:hover==='trash'?'#e5486a':'#ffffffb3',transform:[{scale:hover==='trash'?1.08:1}]}}>
    <Icon name="trash" size={18} color={hover==='trash'?'#fff':'#b4233c'}/><Text style={{fontSize:13,fontWeight:'600',color:hover==='trash'?'#fff':'#b4233c'}}>{dragging&&selection.has(dragging.id)&&selection.size>1?`${selection.size}개 삭제`:'삭제'}</Text>
   </View>
  </View>}
  {dateTodo&&<DateSheet todo={db.todos.find(t=>t.id===dateTodo.id)||dateTodo} api={api} onClose={()=>setDateTodo(null)}/>}
  {repeatTodo&&<RepeatSheet todo={db.todos.find(t=>t.id===repeatTodo.id)||repeatTodo} api={api} onClose={()=>setRepeatTodo(null)}/>}
 </KeyboardAvoidingView>;
}
