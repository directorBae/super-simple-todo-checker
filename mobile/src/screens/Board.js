import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Keyboard, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useDb } from '../store.js';
import { useDesign, Surface, Button, Icon } from '../design.js';
import { todayStr, addDays, dateParts, DOW_NAMES, effectiveTeamId } from '../util.js';
import { lineOrder } from '../notepad.js';
import { TaskLine, DateSheet } from './NotebookLine.js';
import MonthView from './NotebookMonth.js';

function DaySection({ date, db, api, focus, setFocus, onDate, onDrag, onDrop, onMove, rows, onDeleted, reveal }) {
 const d=useDesign(), [draft,setDraft]=useState(''), [team,setTeam]=useState(null), [active,setActive]=useState(false), input=useRef(null);
 const items=db.todos.filter(t=>(t.date||null)===date&&t.status!=='bucket').sort(lineOrder);
 const groups=[{team:null,list:items.filter(t=>!effectiveTeamId(t,db))},...db.teams.map(t=>({team:t,list:items.filter(item=>effectiveTeamId(item,db)===t.id)}))];
 const ordered=groups.flatMap(g=>g.list), isToday=date===todayStr();
 const part=date?dateParts(date):null;
 useEffect(()=>{ if(focus?.id==='draft'&&focus.date===date) {setTeam(focus.teamId||null);input.current?.focus();} },[focus]);
 const add=text=>{
  const parts=text.replace(/\r/g,'').split('\n'); if(parts.length===1){setDraft(text);return;}
  const tail=parts.pop(); let selectedTeam=team, order=Math.max(0,...items.map(t=>t.sortOrder??t.createdAt??0));
  for(const title of parts) { if(!title.trim()) continue; const match=db.teams.find(t=>t.name.toLowerCase()===title.trim().toLowerCase()); if(match){selectedTeam=match.id;setTeam(match.id);}else api.addTodo({title,date,teamId:selectedTeam,sortOrder:order+=1024}); }
  setDraft(tail);
 };
 const commit=()=>{setActive(false);if(draft.trim())add(draft+'\n');};
 const focusLine=target=>setFocus({...target,date,nonce:Date.now()});
 return <View style={{paddingVertical:12,paddingHorizontal:12,marginHorizontal:-12,borderRadius:18,backgroundColor:isToday?d.fill:'transparent',borderWidth:isToday?1:0,borderColor:d.edge,marginVertical:isToday?6:0}}>
  <View style={{flexDirection:'row',alignItems:'baseline',gap:8,marginBottom:4}}>
   <Text style={{fontSize:16,fontWeight:'800',color:isToday?d.accent:part?.dow===0?'#e11d48':part?.dow===6?'#4f6ef7':d.text}}>{part?DOW_NAMES[part.dow]:'날짜 미정'}</Text>
   {part&&<Text style={{fontSize:12,color:d.muted}}>{part.m}월 {part.d}일</Text>}
   {isToday&&<View style={{backgroundColor:d.accent,borderRadius:99,paddingHorizontal:8,paddingVertical:2}}><Text style={{fontSize:10,color:d.dark?'#172842':'#fff',fontWeight:'700'}}>오늘</Text></View>}
  </View>
  {groups.filter(g=>g.list.length).map(g=><View key={g.team?.id||'none'}>
   {g.team&&<View style={{flexDirection:'row',alignItems:'center',gap:6,marginTop:8,marginBottom:2}}><View style={{width:7,height:7,borderRadius:4,backgroundColor:g.team.color}}/><Text style={{fontSize:12,fontWeight:'700',color:g.team.important?g.team.color:d.muted}}>{g.team.name}{g.team.important?' ★':''}</Text></View>}
   {g.list.map(todo=>{const i=ordered.findIndex(t=>t.id===todo.id);return <View key={todo.id} style={{marginLeft:g.team?16:0}}><TaskLine reveal={reveal} todo={todo} api={api} previous={ordered[i-1]} next={ordered[i+1]} focus={focus} register={()=>{}} rowRef={ref=>{rows.current[todo.id]=ref;}} onFocus={focusLine} onDate={onDate} onDrag={onDrag} onDrop={onDrop} onMove={onMove} onDeleted={onDeleted} /></View>;})}
  </View>)}
  <View style={{flexDirection:'row',alignItems:'center',gap:5,paddingVertical:2}}>
   <Text style={{width:20,textAlign:'center',fontSize:15,color:active?d.accent:d.muted}}>＋</Text>
   {team&&<Pressable onPress={()=>setTeam(null)} style={{paddingHorizontal:7,paddingVertical:3,borderRadius:99,backgroundColor:d.input}}><Text style={{fontSize:11,color:d.muted}}>{db.teams.find(t=>t.id===team)?.name} ×</Text></Pressable>}
   <TextInput ref={input} accessibilityLabel={'새 할 일 '+(date||'날짜 미정')} placeholder="할 일 입력" placeholderTextColor={d.muted} value={draft} onChangeText={add} multiline scrollEnabled={false} submitBehavior="newline" onFocus={()=>{setActive(true);reveal(input);}} onBlur={commit} onKeyPress={e=>{if(e.nativeEvent.key==='Backspace'&&!draft&&ordered.length)focusLine({id:ordered.at(-1).id,position:ordered.at(-1).title.length});}} style={{flex:1,fontSize:15,lineHeight:21,color:d.text,paddingVertical:6,minHeight:33}}/>
  </View>
  {active&&!!db.teams.length&&<ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{gap:5,paddingVertical:4,marginLeft:20}}>{db.teams.map(t=><Pressable key={t.id} onPress={()=>setTeam(team===t.id?null:t.id)} style={{flexDirection:'row',alignItems:'center',gap:5,borderWidth:1,borderColor:team===t.id?t.color:d.edge,backgroundColor:d.fill,borderRadius:99,paddingHorizontal:10,paddingVertical:4}}><View style={{width:6,height:6,borderRadius:3,backgroundColor:t.color}}/><Text style={{fontSize:12,color:d.muted}}>{t.name}</Text></Pressable>)}</ScrollView>}
 </View>;
}

export default function Board() {
 const {db,api}=useDb(), d=useDesign(), today=todayStr();
 const [view,setView]=useState('month'),[ym,setYm]=useState(()=>{const n=new Date();return {y:n.getFullYear(),m:n.getMonth()};}),[range,setRange]=useState({start:-7,end:30}),[undated,setUndated]=useState(false);
 const [focus,setFocus]=useState(null),[dateTodo,setDateTodo]=useState(null),[dragging,setDragging]=useState(null),[hover,setHover]=useState(null),[undo,setUndo]=useState(null);
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
 const goToday=()=>{if(view==='month'){const n=new Date();setYm({y:n.getFullYear(),m:n.getMonth()});}else if(positions.current[today]!=null)scroll.current?.scrollTo({y:Math.max(0,positions.current[today]-6),animated:true});else openDay(today);};
 const onScroll=e=>{scrollY.current=e.nativeEvent.contentOffset.y;if(busy.current||pending.current||dragging)return;const {contentOffset,contentSize,layoutMeasurement}=e.nativeEvent;if(contentOffset.y+layoutMeasurement.height>contentSize.height-600){busy.current=true;setRange(r=>({...r,end:r.end+14}));}else if(contentOffset.y<200){busy.current=true;setRange(r=>({...r,start:r.start-14}));}};
 const measure=()=>{const g={rows:[],teams:[]};geometry.current=g;Object.entries(rows.current).forEach(([id,ref])=>ref?.measureInWindow((x,y,w,h)=>g.rows.push({id,x,y,w,h})));Object.entries(zones.current).forEach(([id,ref])=>ref?.measureInWindow((x,y,w,h)=>g.teams.push({id,x,y,w,h})));};
 useEffect(()=>{if(dragging){const t=setTimeout(measure,80);return()=>clearTimeout(t);}},[dragging,db.teams]);
 const hit=(items,x,y)=>items.find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h);
 const drop=(todo,x,y)=>{
  if(todo){const target=hit(geometry.current.teams,x,y),row=hit(geometry.current.rows,x,y);if(target)api.updateTodo(todo.id,{teamId:target.id==='none'?null:target.id,projectId:null});else if(row&&row.id!==todo.id){const destination=db.todos.find(t=>t.id===row.id);const ordered=db.todos.filter(t=>t.id!==todo.id&&t.status!=='bucket'&&(t.date||null)===(destination.date||null)&&effectiveTeamId(t,db)===effectiveTeamId(destination,db)).sort(lineOrder);const at=ordered.findIndex(t=>t.id===row.id);ordered.splice(at+(y>row.y+row.h/2?1:0),0,todo);ordered.forEach((t,i)=>api.updateTodo(t.id,{sortOrder:(i+1)*1024,...(t.id===todo.id?{date:destination.date||null,teamId:effectiveTeamId(destination,db),projectId:null}:{})}));}}
  setDragging(null);setHover(null);
 };
 const section=date=><DaySection date={date} db={db} api={api} focus={focus} setFocus={setFocus} rows={rows} onDate={setDateTodo} onDrag={setDragging} onDrop={drop} onMove={(x,y)=>setHover(hit(geometry.current.teams,x,y)?.id||null)} onDeleted={(todo,action)=>setUndo({todo,action})} reveal={reveal}/>;
 return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':'height'} keyboardVerticalOffset={60}>
  <View style={{flexDirection:'row',alignItems:'center',gap:8,paddingHorizontal:16,paddingTop:10,paddingBottom:4}}>
   <View style={{flexDirection:'row',padding:2,gap:2,borderRadius:12,borderWidth:1,borderColor:d.edge,backgroundColor:d.fill}}>{[['list','일'],['month','월']].map(([key,label])=><Pressable key={key} accessibilityRole="button" accessibilityLabel={label} onPress={()=>key==='list'?openDay(today):setView('month')} style={{paddingHorizontal:14,paddingVertical:5,borderRadius:10,backgroundColor:view===key?d.input:'transparent'}}><Text style={{fontSize:13,color:view===key?d.accent:d.muted,fontWeight:view===key?'700':'400'}}>{label}</Text></Pressable>)}</View>
   {view==='list'&&<Pressable onPress={()=>setUndated(!undated)} style={{padding:6}}><Text style={{fontSize:12,color:undated?d.accent:d.muted}}>날짜 미정 {db.todos.filter(t=>!t.date&&t.status!=='bucket').length||''}</Text></Pressable>}
  </View>
  {view==='month'?<ScrollView contentContainerStyle={{paddingHorizontal:16,paddingBottom:120}}><MonthView db={db} ym={ym} setYm={setYm} openDay={openDay}/></ScrollView>:
   <View ref={viewport} collapsable={false} style={{flex:1}} onLayout={()=>reveal(activeInput.current)}><ScrollView ref={scroll} onContentSizeChange={()=>reveal(activeInput.current)} scrollEnabled={!dragging} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" onScroll={onScroll} scrollEventThrottle={64} maintainVisibleContentPosition={{minIndexForVisible:0}} contentContainerStyle={{paddingHorizontal:16,paddingBottom:160}}>
    {undated&&section(null)}
    {dates.map((date,i)=><View key={date} onLayout={e=>{positions.current[date]=e.nativeEvent.layout.y;if(pending.current===date&&scroll.current){pending.current=null;const y=Math.max(0,e.nativeEvent.layout.y-6);requestAnimationFrame(()=>scroll.current?.scrollTo({y,animated:false}));}}}>
     {(i===0||date.endsWith('-01'))&&<Text style={{fontSize:12,fontWeight:'600',color:d.muted,paddingVertical:12}}>{dateParts(date).y}년 {dateParts(date).m}월</Text>}
     {section(date)}
    </View>)}
   </ScrollView></View>}
  {!dragging&&!undo&&<Pressable accessibilityLabel="오늘로 이동" onPress={goToday} style={{position:'absolute',right:16,bottom:100}}><Surface native style={{borderRadius:99}} contentStyle={{paddingHorizontal:14,paddingVertical:9}}><Text style={{fontSize:13,fontWeight:'700',color:d.accent}}>◎ 오늘</Text></Surface></Pressable>}
  {undo&&!dragging&&<Surface native style={{position:'absolute',bottom:98,left:16,right:16}} contentStyle={{padding:12,flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}><Text style={{fontSize:13,color:d.text}}>{undo.action==='delete'?'할 일을 삭제했어요':'버킷에 담았어요'}</Text><Pressable onPress={()=>{if(undo.action==='bucket')api.updateTodo(undo.todo.id,{status:undo.todo.status});else api.restoreTodo(undo.todo);setUndo(null);}}><Text style={{color:d.accent,fontWeight:'700'}}>되돌리기</Text></Pressable><Pressable accessibilityLabel="알림 닫기" onPress={()=>setUndo(null)}><Icon name="close" size={16}/></Pressable></Surface>}
  {dragging&&<Surface native style={{position:'absolute',left:16,right:16,bottom:96}} contentStyle={{padding:14,gap:10}}><View style={{flexDirection:'row',justifyContent:'space-between'}}><Text style={{fontSize:13,color:d.text,fontWeight:'700'}}>팀으로 옮기기</Text><Pressable accessibilityLabel="이동 취소" onPress={()=>setDragging(null)}><Icon name="close" size={18}/></Pressable></View><View style={{flexDirection:'row',flexWrap:'wrap',gap:6}}>{[{id:'none',name:'팀 없음'},...db.teams].map(t=><View key={t.id} ref={ref=>{zones.current[t.id]=ref;}} collapsable={false} onLayout={measure}><Button title={t.name} primary={hover===t.id} style={{paddingVertical:7,paddingHorizontal:11}} onPress={()=>{api.updateTodo(dragging.id,{teamId:t.id==='none'?null:t.id,projectId:null});setDragging(null);}}/></View>)}</View></Surface>}
  {dateTodo&&<DateSheet todo={db.todos.find(t=>t.id===dateTodo.id)||dateTodo} api={api} onClose={()=>setDateTodo(null)}/>}
 </KeyboardAvoidingView>;
}
