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
export function TaskLine({ todo, api, previous, next, focus, register, onFocus, onDate, onDrag, onDrop, onMove, rowRef, onDeleted, reveal }) {
 const d = useDesign(), [value,setValue] = useState(todo.title), input = useRef(null), selection = useRef({ start:0,end:0 }), focused = useRef(false), latest = useRef(null), hold = useRef(null), long = useRef(false), moved = useRef(false);
 const translate = useRef(new Animated.ValueXY()).current, [swipe,setSwipe] = useState(0);
 latest.current = { todo, api, previous, next, onDrag, onDrop, onMove, onDeleted };
 useEffect(() => { if(!focused.current) setValue(todo.title); },[todo.title]);
 useEffect(() => { register(todo.id,input); return () => { register(todo.id,null); clearTimeout(hold.current); }; },[todo.id]);
 useEffect(() => { if(focus?.id === todo.id && input.current) { input.current.focus(); const pos=focus.position ?? value.length; input.current.setNativeProps({ selection:{ start:pos,end:pos } }); selection.current={ start:pos,end:pos }; } },[focus]);
 const reset = () => { setSwipe(0); Animated.spring(translate,{ toValue:{ x:0,y:0 },useNativeDriver:false }).start(); };
 const gestures = useRef(PanResponder.create({
   onMoveShouldSetPanResponderCapture: (_,g) => !focused.current && Math.abs(g.dx)>18 && Math.abs(g.dx)>Math.abs(g.dy)*1.5,
   onPanResponderMove: (_,g) => { translate.setValue({ x:g.dx,y:0 }); setSwipe(g.dx); },
   onPanResponderRelease: (_,g) => { const {todo,api,onDeleted}=latest.current; if(g.dx>85) { api.updateTodo(todo.id,{ status:'bucket' }); onDeleted(todo,'bucket'); } else if(g.dx < -85) { api.deleteTodo(todo.id); onDeleted(todo,'delete'); } reset(); },
   onPanResponderTerminate: reset,
 })).current;
 const drag = useRef(PanResponder.create({
   onStartShouldSetPanResponder: () => true,
   onPanResponderGrant: () => { long.current=false; moved.current=false; hold.current=setTimeout(() => { long.current=true; Keyboard.dismiss(); latest.current.onDrag(latest.current.todo); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(()=>{}); },400); },
   onPanResponderMove: (_,g) => { if(!long.current) { if(Math.abs(g.dx)+Math.abs(g.dy)>12) clearTimeout(hold.current); return; } moved.current=Math.abs(g.dx)+Math.abs(g.dy)>10; translate.setValue({ x:g.dx,y:g.dy }); latest.current.onMove(g.moveX,g.moveY); },
   onPanResponderRelease: (_,g) => { clearTimeout(hold.current); if(long.current && moved.current) latest.current.onDrop(latest.current.todo,g.moveX,g.moveY); else if(!long.current) { Keyboard.dismiss(); latest.current.onDrag(latest.current.todo); } reset(); },
   onPanResponderTerminate: () => { clearTimeout(hold.current); latest.current.onDrop(null); reset(); },
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
 return <View ref={rowRef} collapsable={false} style={{ zIndex:long.current ? 20 : 1, borderRadius:16, marginVertical:3 }}>
   {!!swipe && <View style={{ position:'absolute', top:0,bottom:0,left:0,right:0,borderRadius:16, backgroundColor:swipe>0 ? '#4c8bba' : '#cc5266', justifyContent:'center', alignItems:swipe>0?'flex-start':'flex-end',paddingHorizontal:18 }}><Text style={{ color:'#fff',fontWeight:'600' }}>{swipe>0?'버킷으로':'삭제'}</Text></View>}
   <Animated.View {...gestures.panHandlers} style={{ transform:translate.getTranslateTransform(), flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:0,paddingVertical:5,borderRadius:16,backgroundColor:Math.abs(swipe)>0 || long.current ? (d.dark?'#25364e':'#eaf0fb') : 'transparent' }}>
    <View {...drag.panHandlers} accessible accessibilityLabel="길게 눌러 팀으로 이동 또는 순서 변경" style={{ paddingVertical:7,paddingHorizontal:0 }}><Icon name="drag" size={13} color={d.muted} /></View>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked:todo.status==='done' }} accessibilityLabel={todo.title+' 완료'} hitSlop={6} onPress={() => api.updateTodo(todo.id,{ status:todo.status==='done'?'todo':'done' })} style={{ width:19,height:19,borderRadius:6,borderWidth:1.5,borderColor:todo.status==='done'?d.accent:d.muted, backgroundColor:todo.status==='done'?d.accent:'transparent',alignItems:'center',justifyContent:'center' }}>{todo.status==='done' && <Icon name="check" size={15} color={d.dark?'#172842':'#fff'} />}</Pressable>
    <SourceIcons todo={todo} size={17}/>
    <TextInput ref={input} accessibilityLabel={'할 일 '+todo.title} value={value} onChangeText={change} onKeyPress={backspace} onSelectionChange={e => { selection.current=e.nativeEvent.selection; }} multiline scrollEnabled={false} submitBehavior="newline" onFocus={() => { focused.current=true; reveal?.(input); }} onBlur={() => { focused.current=false; if(!value.trim()) api.deleteTodo(todo.id); }} style={{ flex:1,fontSize:15,lineHeight:21,color:todo.status==='done'?d.muted:d.text,textDecorationLine:todo.status==='done'?'line-through':'none',padding:0,minHeight:25 }} />
    <Pressable accessibilityLabel={todo.title+' 날짜'} hitSlop={8} onPress={() => onDate(todo)}><Icon name="calendar" size={15} color={d.muted} /></Pressable>
   </Animated.View>
 </View>;
}
export function DateSheet({ todo, api, onClose }) {
 const d=useDesign(), [date,setDate]=useState(todo.date || todayStr()), [show,setShow]=useState(true);
 return <Sheet title="날짜" onClose={onClose}><Text numberOfLines={2} style={{ color:d.muted }}>{todo.title}</Text>
  {Platform.OS === 'android' && <Button title={date} onPress={() => setShow(true)} />}
  {(show || Platform.OS==='ios') && <DateTimePicker value={new Date(date+'T12:00:00')} mode="date" display={Platform.OS==='ios'?'inline':'default'} themeVariant={d.dark?'dark':'light'} accentColor={d.accent} onChange={(event,value) => { if(Platform.OS==='android') setShow(false); if(value && event.type !== 'dismissed') setDate(localDateStr(value)); }} />}
  <View style={{ flexDirection:'row',gap:8 }}><Button title="오늘" onPress={() => setDate(todayStr())} /><Button title="날짜 없음" onPress={() => { api.updateTodo(todo.id,datePatch(todo,null)); onClose(); }} /></View>
  <Button title="저장" primary onPress={() => { api.updateTodo(todo.id,datePatch(todo,date)); onClose(); }} />
 </Sheet>;
}
