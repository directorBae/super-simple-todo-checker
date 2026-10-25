import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View, PanResponder, Keyboard } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { SourceIcons } from '../SourceIcons.js';
import { useDb } from '../store.js';
import { useDesign, Surface, Sheet, Button, Icon } from '../design.js';
import { todayStr, localDateStr, addDays } from '../util.js';
import { lineOrder, splitLine, datePatch } from '../notepad.js';
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2);
// Long-press anywhere on a line (not while typing in it) to pick it up: that turns on selection mode,
// where taps add/remove lines and a held line drags the whole selection to reorder, into a team or onto the clock.
export function TaskLine({ todo, api, previous, next, focus, register, onFocus, onDate, onHold, onToggle, onDrop, onMove, rowRef, onDeleted, reveal, selected = false, selectMode = false }) {
 const d = useDesign(), [value,setValue] = useState(todo.title), [editing,setEditing] = useState(false), input = useRef(null), selection = useRef({ start:0,end:0 }), focused = useRef(false), latest = useRef(null), hold = useRef(null), long = useRef(false), moved = useRef(false);
 const translate = useRef(new Animated.ValueXY()).current, [swipe,setSwipe] = useState(0), [lifted,setLifted] = useState(false), start = useRef(null), mode = useRef('swipe');
 latest.current = { todo, api, previous, next, onHold, onToggle, onDrop, onMove, onDeleted, selectMode };
 useEffect(() => { if(!focused.current) setValue(todo.title); },[todo.title]);
 useEffect(() => { register(todo.id,input); return () => { register(todo.id,null); clearTimeout(hold.current); }; },[todo.id]);
 useEffect(() => { if(focus?.id === todo.id && input.current) { input.current.focus(); const pos=focus.position ?? value.length; input.current.setNativeProps({ selection:{ start:pos,end:pos } }); selection.current={ start:pos,end:pos }; } },[focus]);
 const reset = () => { setSwipe(0); Animated.spring(translate,{ toValue:{ x:0,y:0 },useNativeDriver:false }).start(); };
 // Raw touch events reach the row even when the text field or a button owns the touch, so a hold is noticed anywhere.
 const touchStart = e => {
   if(focused.current) return;
   start.current={ x:e.nativeEvent.pageX, y:e.nativeEvent.pageY }; long.current=false; moved.current=false; clearTimeout(hold.current);
   hold.current=setTimeout(() => { long.current=true; setLifted(true); Keyboard.dismiss(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(()=>{}); latest.current.onHold(latest.current.todo); },450);
 };
 const touchMove = e => { if(!long.current && start.current && Math.abs(e.nativeEvent.pageX-start.current.x)+Math.abs(e.nativeEvent.pageY-start.current.y)>10) clearTimeout(hold.current); };
 const touchEnd = () => { clearTimeout(hold.current); start.current=null; if(long.current && !moved.current) { long.current=false; setLifted(false); latest.current.onDrop(null); } }; // held without moving: just selected
 const gestures = useRef(PanResponder.create({
   // In selection mode the row takes taps itself (its text field and buttons are switched off).
   onStartShouldSetPanResponder: () => latest.current.selectMode,
   onMoveShouldSetPanResponderCapture: (_,g) => long.current || (!latest.current.selectMode && !focused.current && Math.abs(g.dx)>18 && Math.abs(g.dx)>Math.abs(g.dy)*1.5),
   onPanResponderGrant: () => { mode.current = long.current ? 'drag' : latest.current.selectMode ? 'tap' : 'swipe'; },
   onPanResponderMove: (_,g) => {
     if(long.current) { moved.current=moved.current || Math.abs(g.dx)+Math.abs(g.dy)>8; translate.setValue({ x:g.dx,y:g.dy }); latest.current.onMove(g.moveX,g.moveY); return; }
     if(mode.current==='swipe') { translate.setValue({ x:g.dx,y:0 }); setSwipe(g.dx); }
   },
   onPanResponderRelease: (_,g) => {
     clearTimeout(hold.current);
     const {todo,api,onDeleted}=latest.current;
     if(long.current) { const dragged=moved.current; long.current=false; moved.current=false; setLifted(false); if(dragged) latest.current.onDrop(todo,g.moveX,g.moveY); reset(); return; }
     if(mode.current==='tap') { if(Math.abs(g.dx)+Math.abs(g.dy)<10) latest.current.onToggle(todo); return; }
     if(g.dx>85) { api.updateTodo(todo.id,{ status:'bucket' }); onDeleted(todo,'bucket'); } else if(g.dx < -85) { api.deleteTodo(todo.id); onDeleted(todo,'delete'); }
     reset();
   },
   onPanResponderTerminate: () => { clearTimeout(hold.current); if(long.current && moved.current) latest.current.onDrop(null); long.current=false; moved.current=false; setLifted(false); reset(); },
   onPanResponderTerminationRequest: () => !long.current,
 })).current;
 const change = text => {
   if(text.includes('\n')) {
     const parts=splitLine(text,todo,next); const head=parts[0];
     if(head.title.trim()) api.updateTodo(todo.id,{ title:head.title, sortOrder:head.sortOrder });
     else api.deleteTodo(todo.id);
     let focusId=null;
     parts.slice(1).forEach(p => { if(p.title.trim()) { focusId=newId(); api.addTodo({ ...todo, id:focusId, title:p.title, sortOrder:p.sortOrder, status:'todo' }); } });
     setValue(head.title);
     onFocus(focusId ? { id:focusId, position:0 } : { id:'draft', position:0, teamId:todo.teamId });
   } else { setValue(text); if(text.trim()) api.updateTodo(todo.id,{ title:text }); }
 };
 const backspace = e => {
   if(e.nativeEvent.key !== 'Backspace') return;
   if(value === '') { api.deleteTodo(todo.id); onFocus({ id:previous?.id || 'draft', position:previous?.title.length || 0 }); }
   else if(selection.current.start === 0 && selection.current.end === 0 && previous) {
     const pos=previous.title.length; api.updateTodo(previous.id,{ title:previous.title+value }); api.deleteTodo(todo.id); onFocus({ id:previous.id,position:pos });
   }
 };
 return <View ref={rowRef} collapsable={false} onTouchStart={touchStart} onTouchMove={touchMove} onTouchEnd={touchEnd} onTouchCancel={touchEnd} style={{ zIndex:lifted ? 20 : 1, borderRadius:16, marginVertical:3 }}>
   {!!swipe && <View style={{ position:'absolute', top:0,bottom:0,left:0,right:0,borderRadius:16, backgroundColor:swipe>0 ? '#4c8bba' : '#cc5266', justifyContent:'center', alignItems:swipe>0?'flex-start':'flex-end',paddingHorizontal:18 }}><Text style={{ color:'#fff',fontWeight:'600' }}>{swipe>0?'버킷으로':'삭제'}</Text></View>}
   <Animated.View {...gestures.panHandlers} accessibilityHint="길게 눌러 선택 · 끌어서 순서, 팀, 시계로 옮기기" accessibilityState={{ selected }} style={{ transform:translate.getTranslateTransform(), borderRadius:16,borderWidth:1,borderColor:selected?'#ffffffcc':editing?d.edge:'transparent',backgroundColor:Math.abs(swipe)>0 ? '#eaf0fb' : lifted ? '#ffffffd9' : selected ? '#c4b5fd73' : editing ? '#ffffff8c' : 'transparent', shadowColor:'#1e1b4b',shadowOpacity:lifted?0.18:0,shadowRadius:12,shadowOffset:{ width:0,height:6 },elevation:lifted?6:0 }}>
   <View pointerEvents={selectMode?'none':'box-none'} style={{ flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,paddingVertical:5 }}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked:todo.status==='done' }} accessibilityLabel={todo.title+' 완료'} hitSlop={6} onLongPress={()=>{}} delayLongPress={450} onPress={() => api.updateTodo(todo.id,{ status:todo.status==='done'?'todo':'done' })} style={{ width:19,height:19,borderRadius:6,borderWidth:1.5,borderColor:todo.status==='done'?d.accent:d.muted, backgroundColor:todo.status==='done'?d.accent:'transparent',alignItems:'center',justifyContent:'center' }}>{todo.status==='done' && <Icon name="check" size={15} color={d.dark?'#172842':'#fff'} />}</Pressable>
    <SourceIcons todo={todo} size={17}/>
    <TextInput ref={input} editable={!selectMode} accessibilityLabel={'할 일 '+todo.title} maxLength={50} value={value} onChangeText={change} onKeyPress={backspace} onSelectionChange={e => { selection.current=e.nativeEvent.selection; }} multiline scrollEnabled={false} submitBehavior="newline" onFocus={() => { focused.current=true; setEditing(true); reveal?.(input); }} onBlur={() => { focused.current=false; setEditing(false); if(!value.trim()) api.deleteTodo(todo.id); }} style={{ flex:1,fontSize:15,lineHeight:21,color:todo.status==='done'?d.muted:d.text,textDecorationLine:todo.status==='done'?'line-through':'none',padding:0,minHeight:25 }} />
    <Pressable accessibilityLabel={todo.title+' 날짜'} hitSlop={8} onLongPress={()=>{}} delayLongPress={450} onPress={() => onDate(todo)}><Icon name="calendar" size={15} color={d.muted} /></Pressable>
   </View>
   </Animated.View>
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
