import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, View, Keyboard } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text, TextInput } from '../text.js';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { SourceIcons } from '../SourceIcons.js';
import { useDesign, Sheet, Button, Icon } from '../design.js';
import { todayStr, localDateStr } from '../util.js';
import { datePatch, splitLine } from '../notepad.js';
import { touch } from '../gesture.js';
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
const teamOf = (todo, db) => { const p = db.projects.find((x) => x.id === todo.projectId); return (p && p.teamId) || todo.teamId || null; };
// A project tied to another team would override the new team, so the link is dropped.
const teamPatch = (todo, teamId, db) => { const p = db.projects.find((x) => x.id === todo.projectId); return p && p.teamId && p.teamId !== teamId ? { teamId, projectId:null } : { teamId }; };
// One line of the day. Its text is plain until tapped, then edited right there (Enter splits the line, Backspace at the
// start joins it to the one above, as in a notepad).
// Gestures (react-native-gesture-handler, so a hold inside the scrolling list is recognised by the phone itself):
//   · tap — edit this line (while some lines are selected, a tap adds or removes this one instead)
//   · hold the text, then slide up/down — select the lines the finger passes over
//   · hold the empty part, then move — carry the line (or all the selected ones) to another place, a team, the bin or the clock
const HOLD_MS = 350;
export function TaskLine({ todo, db, api, previous, next, editing, caret, onEdit, onEndEdit, onFocusLine, onDate, onGrab, onStart, onDrop, onMove, onSelectStart, onSelectMove, onSelectEnd, onToggle, selected = false, selecting = false, rowRef, reveal }) {
 const d = useDesign(), latest = useRef(null), input = useRef(null), sel = useRef({ start:0,end:0 }), [value,setValue] = useState(todo.title);
 const translate = useRef(new Animated.ValueXY()).current, [lifted,setLifted] = useState(false), [carried,setCarried] = useState(false), mode = useRef('idle'), dropped = useRef(false);
 // Where the text and the date button sit inside the line (from layout), to tell the text from the empty part.
 const box = useRef({ textX:0, textW:0, calX:Infinity });
 latest.current = { todo, previous, next, selecting, onEdit, onGrab, onStart, onDrop, onMove, onSelectStart, onSelectMove, onSelectEnd, onToggle };
 useEffect(() => { if(!editing) setValue(todo.title); },[todo.title, editing]);
 // Opening this line for editing: the caret goes where it was asked (end of the line by default).
 useEffect(() => { if(!editing) return; const t = setTimeout(() => { const at = Math.min(caret ?? value.length, value.length); input.current?.focus(); input.current?.setNativeProps({ selection:{ start:at,end:at } }); sel.current = { start:at,end:at }; reveal?.(input); }, 30); return () => clearTimeout(t); }, [editing, caret]);
 const settle = () => { if(mode.current==='held' || mode.current==='drag') latest.current.onGrab?.(false); mode.current='idle'; setLifted(false); setCarried(false); Animated.spring(translate,{ toValue:{ x:0,y:0 },useNativeDriver:false }).start(); };
 const onText = (x) => x >= box.current.textX - 4 && x <= box.current.textX + box.current.textW + 4;
 // Hold (0.35s): on the text it starts selecting lines, on the empty part it lifts the line to carry it.
 const hold = Gesture.LongPress().minDuration(HOLD_MS).maxDistance(10).runOnJS(true)
   .onStart((e) => {
     const L = latest.current; dropped.current = false;
     Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(()=>{}); Keyboard.dismiss();
     if(onText(e.x)) { mode.current='select'; L.onSelectStart(L.todo); }
     else { mode.current='held'; setLifted(true); L.onGrab?.(true); }
   })
   .onFinalize(() => { if(mode.current==='select') latest.current.onSelectEnd(); if(mode.current==='select' || mode.current==='held') settle(); });
 // …then moving: extends the selection, or carries the line (and every selected line with it).
 const move = Gesture.Pan().activateAfterLongPress(HOLD_MS).runOnJS(true)
   .onUpdate((e) => {
     const L = latest.current;
     if(mode.current==='select') { L.onSelectMove(e.absoluteX, e.absoluteY); return; }
     if(mode.current==='held' && Math.abs(e.translationX)+Math.abs(e.translationY)>6) { mode.current='drag'; L.onStart(L.todo); }
     if(mode.current==='drag') { if(!carried) setCarried(true); L.onMove(e.absoluteX, e.absoluteY); }
   })
   .onEnd((e) => { if(mode.current==='drag') { dropped.current = true; latest.current.onDrop(latest.current.todo, e.absoluteX, e.absoluteY); } })
   .onFinalize(() => { if(mode.current==='drag' && !dropped.current) latest.current.onDrop(null); if(mode.current==='drag') settle(); });
 // A tap (not on the checkbox or the date button): edit the line, or add/remove it while lines are selected.
 const tap = Gesture.Tap().maxDuration(HOLD_MS).runOnJS(true)
   .onEnd((e, ok) => {
     if(!ok || e.x < box.current.textX - 6 || e.x > box.current.calX - 6) return;
     const L = latest.current; touch.lastRowTap = Date.now();
     if(L.selecting) L.onToggle(L.todo); else L.onEdit(L.todo);
   });
 const gesture = Gesture.Exclusive(Gesture.Simultaneous(hold, move), tap);
 // Enter splits the line at the caret (several lines when pasting), as in a notepad.
 const change = text => {
   if(!text.includes('\n')) { setValue(text); if(text.trim()) api.updateTodo(todo.id,{ title:text }); return; }
   const parts=splitLine(text,todo,next), head=parts[0];
   if(head.title.trim()) api.updateTodo(todo.id,{ title:head.title, sortOrder:head.sortOrder }); else api.deleteTodo(todo.id);
   let focusId=null;
   parts.slice(1).forEach(p => { if(p.title.trim()) { focusId=newId(); api.addTodo({ ...todo, id:focusId, title:p.title, sortOrder:p.sortOrder, status:'todo', startTime:null, endTime:null }); } });
   setValue(head.title);
   // The caret goes to the new line right below (never down to the day's last line).
   onFocusLine(focusId ? { id:focusId, position:0 } : { id:'after:'+todo.id });
 };
 // Backspace on an empty line removes it; at the start of a line it joins the line above. Either way the caret goes up.
 const backspace = e => {
   if(e.nativeEvent.key !== 'Backspace') return;
   if(value === '') { api.deleteTodo(todo.id); onFocusLine(previous ? { id:previous.id, position:previous.title.length } : null); }
   else if(sel.current.start === 0 && sel.current.end === 0 && previous && Array.from(previous.title + value).length <= 50) {
     const pos=previous.title.length; api.updateTodo(previous.id,{ title:previous.title+value }); api.deleteTodo(todo.id); onFocusLine({ id:previous.id,position:pos });
   }
 };
 const done = todo.status==='done';
 const textStyle = { flexShrink:1,maxWidth:'64%',minWidth:28,fontSize:15,lineHeight:21,color:done?d.muted:d.text,textDecorationLine:done?'line-through':'none',padding:0,minHeight:25 };
 return <View ref={rowRef} collapsable={false} style={{ zIndex:lifted ? 20 : 1, borderRadius:16, marginVertical:3 }}>
   <GestureDetector gesture={gesture} enabled={!editing}>
   <Animated.View accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={todo.title} accessibilityHint="눌러서 고치기 · 글자를 꾹 눌러 쓸면 여러 줄 선택 · 빈 곳을 꾹 눌러 옮기기" style={{ transform:translate.getTranslateTransform(), opacity:carried?0.35:1, borderRadius:16,borderWidth:1,borderColor:selected?'#ffffffcc':editing||lifted?d.edge:'transparent',backgroundColor:lifted ? '#ffffffd9' : selected ? '#c4b5fd73' : editing ? '#ffffff8c' : 'transparent', shadowColor:'#1e1b4b',shadowOpacity:lifted?0.18:0,shadowRadius:12,shadowOffset:{ width:0,height:6 },elevation:lifted?6:0 }}>
   <View pointerEvents="box-none" style={{ flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,paddingVertical:5 }}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked:done }} accessibilityLabel={todo.title+' 완료'} hitSlop={6} onPress={() => api.updateTodo(todo.id,{ status:done?'todo':'done' })} style={{ width:19,height:19,borderRadius:6,borderWidth:1.5,borderColor:done?d.accent:d.muted, backgroundColor:done?d.accent:'transparent',alignItems:'center',justifyContent:'center' }}>{done && <Icon name="check" size={15} color={d.dark?'#172842':'#fff'} />}</Pressable>
    <SourceIcons todo={todo} size={17}/>
    {/* Narrow text that wraps onto more lines; the rest of the line is free to hold and move. */}
    {editing
      ? <TextInput ref={input} accessibilityLabel={'할 일 '+todo.title} maxLength={50} value={value} onChangeText={change} onKeyPress={backspace} onSelectionChange={e => { sel.current=e.nativeEvent.selection; }} multiline scrollEnabled={false} submitBehavior="newline" onBlur={() => { if(!value.trim()) api.deleteTodo(todo.id); onEndEdit(todo); }} style={{ ...textStyle, flex:1, maxWidth:'82%' }} />
      : <Text onLayout={e => { box.current.textX = e.nativeEvent.layout.x; box.current.textW = e.nativeEvent.layout.width; }} style={{ ...textStyle, paddingVertical:2 }}>{todo.title}</Text>}
    <View style={{ flex:1,alignSelf:'stretch',minWidth:28 }} />
    {!!todo.startTime && <Text style={{ fontSize:12,color:d.muted,fontVariant:['tabular-nums'] }}>{todo.startTime}{todo.endTime?`~${todo.endTime}`:''}</Text>}
    <Pressable onLayout={e => { box.current.calX = e.nativeEvent.layout.x; }} accessibilityLabel={todo.title+' 날짜'} hitSlop={8} onPress={() => onDate(todo)}><Icon name="calendar" size={15} color={d.muted} /></Pressable>
   </View>
   </Animated.View>
   </GestureDetector>
   {/* While editing: pick the line's team (팀 없음 takes it out). Taps here keep the keyboard up. */}
   {editing && !!db?.teams.length && <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:6, paddingVertical:5, paddingLeft:30, paddingRight:8 }}>
    {[{ id:null, name:'팀 없음', color:null }, ...db.teams].map(t => { const on = (teamOf(todo, db) || null) === t.id; return <Pressable key={t.id||'none'} accessibilityRole="button" accessibilityState={{ selected:on }} onPress={() => api.updateTodo(todo.id, teamPatch(todo, t.id, db))} style={{ flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,paddingVertical:5,borderRadius:99,borderWidth:1,borderColor:on?(t.color||d.accent):d.edge,backgroundColor:on?'#ffffffe6':'#ffffff73' }}>
     {!!t.color && <View style={{ width:8,height:8,borderRadius:4,backgroundColor:t.color }} />}
     <Text style={{ fontSize:12,fontWeight:on?'700':'500',color:on?d.text:d.muted }}>{t.name}</Text>
    </Pressable>; })}
   </ScrollView>}
 </View>;
}

export function DateSheet({ todo, api, onClose }) {
 const d=useDesign(), [date,setDate]=useState(todo.date || todayStr()), [show,setShow]=useState(true);
 return <Sheet title="날짜" onClose={onClose}><Text numberOfLines={2} style={{ color:d.muted }}>{todo.title}</Text>
  {Platform.OS === 'android' && <Button title={date} onPress={() => setShow(true)} />}
  {(show || Platform.OS==='ios') && <DateTimePicker value={new Date(date+'T12:00:00')} mode="date" display={Platform.OS==='ios'?'inline':'default'} themeVariant={d.dark?'dark':'light'} accentColor={d.accent} onChange={(event,value) => { if(Platform.OS==='android') setShow(false); if(value && event.type !== 'dismissed') setDate(localDateStr(value)); }} />}
  <View style={{ flexDirection:'row',gap:8 }}><Button title="오늘" onPress={() => setDate(todayStr())} />{!!todo.startTime&&<Button title={`시간 없애기 (${todo.startTime})`} onPress={() => { api.updateTodo(todo.id,{ startTime:null,endTime:null,endDate:null }); onClose(); }} />}</View>
  <Button title="저장" primary onPress={() => { api.updateTodo(todo.id,datePatch(todo,date)); onClose(); }} />
 </Sheet>;
}
