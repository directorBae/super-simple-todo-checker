import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Platform, Pressable, ScrollView, View, Keyboard, InputAccessoryView, Switch } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text, TextInput } from '../text.js';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { SourceMark } from '../SourceIcons.js';
import { useDesign, Sheet, Button, Icon } from '../design.js';
import { todayStr, localDateStr } from '../util.js';
import { datePatch, splitLine } from '../notepad.js';
import { touch } from '../gesture.js';
import { cycleTeam } from '../../../shared/todo-drop.js';
import { CHAR_MS, ERASE_MS, rewriteAt, TICK_MS, CHIP_MS, CARET_MS, STRIKE_MS, FOLD_MS } from '../import-typing.js';
import repeatEngine from '../../../shared/repeat.cjs';
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
const native = Platform.OS !== 'web';
// A line the AI is writing (Notion / Google Calendar): first erased backwards, one character at a time behind a caret,
// down to what the old and the new title start with alike, then the rest typed in (one character every 40 ms) — a new
// line is all typing, a removed one all erasing. A small pencil moves along the end of the text, back while it erases.
// The caret blinks a moment when it is done (`linger` ms), then `onDone`.
function WrittenTitle({ from = '', to = '', style, accent, onLayout, onDone, linger = CARET_MS }) {
 const [now,setNow] = useState(() => rewriteAt(from, to, 0)), [caret,setCaret] = useState(true), [end,setEnd] = useState(null), [box,setBox] = useState(null);
 const finish = useRef(onDone), bob = useRef(new Animated.Value(0)).current;
 finish.current = onDone;
 useEffect(() => {
  const t0 = Date.now(); let blink = null, hold = null;
  const step = setInterval(() => {
   const s = rewriteAt(from, to, Date.now() - t0); setNow(s);
   if(s.done) { clearInterval(step); let b = 0; blink = setInterval(() => { b += 1; setCaret(b % 2 === 0); }, 260); hold = setTimeout(() => finish.current?.(), linger); }
  }, Math.min(ERASE_MS, CHAR_MS));
  const loop = Animated.loop(Animated.sequence([Animated.timing(bob,{ toValue:1,duration:150,useNativeDriver:native }),Animated.timing(bob,{ toValue:0,duration:150,useNativeDriver:native })]));
  loop.start();
  return () => { clearInterval(step); clearInterval(blink); clearTimeout(hold); loop.stop(); };
 }, [from, to]);
 const at = end || { x:box?.width ?? 0, y:0 }; // the web has no line layout: the end of the box
 return <View onLayout={onLayout} style={{ flexShrink:1,maxWidth:'64%',minWidth:28 }}>
  <Text onLayout={e => setBox(e.nativeEvent.layout)} onTextLayout={e => { const l = e.nativeEvent.lines?.at(-1); if(l) setEnd({ x:l.x + l.width, y:l.y }); }} style={{ ...style, maxWidth:undefined, minWidth:undefined, paddingVertical:2 }}>{now.text}<Text style={{ color:caret ? accent : 'transparent', fontWeight:'400', textDecorationLine:'none' }}>|</Text></Text>
  <Animated.Text pointerEvents="none" accessible={false} style={{ position:'absolute', left:at.x - 3, top:at.y - 10, fontSize:13, opacity:now.done ? 0 : 1, transform:[{ translateY:bob.interpolate({ inputRange:[0,1],outputRange:[0,-2] }) },{ rotate:bob.interpolate({ inputRange:[0,1],outputRange:now.erasing ? ['0deg','12deg'] : ['0deg','-10deg'] }) }] }}>✏️</Animated.Text>
 </View>;
}
// The little "10/29 → 10/30" chip by a line whose day or time the AI changed, while it is being written.
function MoveChip({ text, d }) {
 const fade = useRef(new Animated.Value(0)).current;
 useEffect(() => { Animated.timing(fade,{ toValue:1,duration:220,useNativeDriver:native }).start(); }, []);
 return <Animated.View accessibilityLabel={'바뀜 '+text} style={{ opacity:fade, transform:[{ translateY:fade.interpolate({ inputRange:[0,1],outputRange:[4,0] }) }], paddingHorizontal:7,paddingVertical:2,borderRadius:99,borderWidth:1,borderColor:'#c4b5fdcc',backgroundColor:'#ffffffd9' }}>
  <Text style={{ fontSize:11,fontWeight:'700',color:d.accent,fontVariant:['tabular-nums'] }}>{text}</Text>
 </Animated.View>;
}
// The checkbox, which pops with a little sparkle when the AI ticks (or unticks) it.
function Check({ done, d, pop, onPress, label }) {
 const box = <Pressable accessibilityRole="checkbox" accessibilityState={{ checked:done }} accessibilityLabel={label} hitSlop={6} onPress={onPress} style={{ width:19,height:19,borderRadius:6,borderWidth:1.5,borderColor:done?d.accent:d.muted, backgroundColor:done?d.accent:'transparent',alignItems:'center',justifyContent:'center' }}>{done && <Icon name="check" size={15} color={d.dark?'#172842':'#fff'} />}</Pressable>;
 if(!pop) return box;
 return <View>
  <Animated.View style={{ transform:[{ scale:pop.interpolate({ inputRange:[0,0.35,0.7,1],outputRange:[0.6,1.35,0.95,1] }) }] }}>{box}</Animated.View>
  <Animated.Text pointerEvents="none" accessible={false} style={{ position:'absolute', left:9, top:-12, fontSize:12, opacity:pop.interpolate({ inputRange:[0,0.15,0.75,1],outputRange:[0,1,1,0] }), transform:[{ translateY:pop.interpolate({ inputRange:[0,1],outputRange:[4,-8] }) },{ scale:pop.interpolate({ inputRange:[0,0.4,1],outputRange:[0.4,1.15,0.9] }) }] }}>✨</Animated.Text>
 </View>;
}
export function TaskLine({ todo, db, api, previous, next, editing, caret, onEdit, onEndEdit, onFocusLine, onDate, onRepeat, onGrab, onStart, onDrop, onMove, onSelectStart, onSelectMove, onSelectEnd, onToggle, selected = false, selecting = false, rowRef, reveal, typing = null, onTyped }) {
 const d = useDesign(), latest = useRef(null), input = useRef(null), sel = useRef({ start:0,end:0 }), [value,setValue] = useState(todo.title);
 const translate = useRef(new Animated.ValueXY()).current, [lifted,setLifted] = useState(false), [carried,setCarried] = useState(false), mode = useRef('idle'), dropped = useRef(false);
 // Where the text and the date button sit inside the line (from layout), to tell the text from the empty part.
 const box = useRef({ textX:0, textW:0, calX:Infinity });
 latest.current = { todo, previous, next, selecting, onEdit, onGrab, onStart, onDrop, onMove, onSelectStart, onSelectMove, onSelectEnd, onToggle };
 useEffect(() => { if(!editing) setValue(todo.title); },[todo.title, editing]);
 // The team picked while editing ('팀 →' above the keyboard, or the chips): only a tag in front of the text changes —
 // the line stays where it is and moves under that team when the editing ends. undefined: not touched.
 const [picked,setPicked] = useState(undefined), current = picked !== undefined ? picked : (teamOf(todo, db) || null);
 useEffect(() => { if(!editing) setPicked(undefined); },[editing]);
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
 // A tap (not on the checkbox, the date button or the source logo): edit the line, or add/remove it while lines are selected.
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
   if(picked !== undefined && sel.current.start === 0 && sel.current.end === 0) { setPicked(undefined); return; } // the team tag goes first
   if(value === '') { api.deleteTodo(todo.id); onFocusLine(previous ? { id:previous.id, position:previous.title.length } : null); }
   else if(sel.current.start === 0 && sel.current.end === 0 && previous && Array.from(previous.title + value).length <= 50) {
     const pos=previous.title.length; api.updateTodo(previous.id,{ title:previous.title+value }); api.deleteTodo(todo.id); onFocusLine({ id:previous.id,position:pos });
   }
 };
 // What the AI changed here, played in place (Board.js / import-typing.js): `typing` is { mode, … } while it waits or
 // plays — 'wait' a new or moved-in line still blank; 'hold' an edited line still as it was (`look`); 'write' erased
 // back and retyped, then maybe the checkbox ticks (`tick`), with the day/time chip (`chip`) showing; 'glow' (Reduce
 // Motion) it only lights up. While it is written it glows like a line being edited.
 const typed = editing ? null : typing, layoutText = e => { box.current.textX = e.nativeEvent.layout.x; box.current.textW = e.nativeEvent.layout.width; };
 const [ticked,setTicked] = useState(null), pop = useRef(new Animated.Value(1)).current, timers = useRef([]);
 useEffect(() => () => timers.current.forEach(clearTimeout), []);
 const after = (fn, ms) => timers.current.push(setTimeout(fn, ms));
 const written = () => {
   const t = typed; if(!t) return;
   const end = () => onTyped?.(t.key), chipEnd = () => (t.chip ? after(end, CHIP_MS) : end());
   if(t.tick) { setTicked(t.key); pop.setValue(0); Animated.timing(pop,{ toValue:1,duration:TICK_MS - 100,useNativeDriver:native }).start(); after(chipEnd, TICK_MS); }
   else chipEnd();
 };
 const ticking = !!typed?.tick && ticked === typed.key;
 const face = typed?.mode==='hold' ? { ...todo, ...typed.look } : typed?.mode==='write' && typed.look && !ticking ? { ...todo, status:typed.look.status } : todo;
 const done = face.status==='done';
 const textStyle = { flexShrink:1,maxWidth:'64%',minWidth:28,fontSize:15,lineHeight:21,color:done?d.muted:d.text,textDecorationLine:done?'line-through':'none',padding:0,minHeight:25 };
 const busy = typed?.mode==='write' ? 'type' : typed?.mode;
 return <View ref={rowRef} collapsable={false} style={{ zIndex:lifted ? 20 : 1, borderRadius:16, marginVertical:3 }}>
   <GestureDetector gesture={gesture} enabled={!editing}>
   <Animated.View accessibilityRole="button" accessibilityState={{ selected }} accessibilityLabel={todo.title} accessibilityHint="눌러서 고치기 · 글자를 꾹 눌러 쓸면 여러 줄 선택 · 빈 곳을 꾹 눌러 옮기기" style={{ transform:translate.getTranslateTransform(), opacity:carried?0.35:1, borderRadius:16,borderWidth:1,borderColor:selected||busy==='glow'?'#ffffffcc':busy==='type'?'#c4b5fdcc':editing||lifted?d.edge:'transparent',backgroundColor:lifted ? '#ffffffd9' : selected ? '#c4b5fd73' : editing||busy==='type' ? '#ffffff8c' : busy==='glow' ? '#c4b5fd59' : 'transparent', shadowColor:'#1e1b4b',shadowOpacity:lifted?0.18:0,shadowRadius:12,shadowOffset:{ width:0,height:6 },elevation:lifted?6:0 }}>
   <View pointerEvents="box-none" style={{ flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,paddingVertical:5 }}>
    <Check done={done} d={d} pop={ticking ? pop : null} label={todo.title+' 완료'} onPress={() => api.updateTodo(todo.id,{ status:todo.status==='done'?'todo':'done' })} />
    {/* Narrow text that wraps onto more lines; the rest of the line is free to hold and move. */}
    {editing && picked !== undefined && <TeamTag team={db.teams.find(t => t.id === picked)} d={d} />}
    {editing
      ? <TextInput ref={input} accessibilityLabel={'할 일 '+todo.title} inputAccessoryViewID={Platform.OS==='ios' ? 'team-'+todo.id : undefined} maxLength={50} value={value} onChangeText={change} onKeyPress={backspace} onSelectionChange={e => { sel.current=e.nativeEvent.selection; }} multiline scrollEnabled={false} submitBehavior="newline" onBlur={() => { if(!value.trim()) api.deleteTodo(todo.id); else if(picked !== undefined && picked !== (teamOf(todo, db) || null)) api.updateTodo(todo.id, teamPatch(todo, picked, db)); onEndEdit(todo); }} style={{ ...textStyle, flex:1, maxWidth:'82%' }} />
      : typed?.mode==='write' ? <WrittenTitle key={typed.key} from={typed.from} to={typed.to} linger={typed.from===typed.to ? 240 : CARET_MS} style={textStyle} accent={d.accent} onLayout={layoutText} onDone={written} />
      : <Text onLayout={layoutText} style={{ ...textStyle, paddingVertical:2, opacity:typed?.mode==='wait' ? 0 : 1 }}>{face.title}</Text>}
    {!!typed?.chip && (typed.mode==='write' || typed.mode==='glow') && <MoveChip key={typed.key} text={typed.chip} d={d} />}
    <View style={{ flex:1,alignSelf:'stretch',minWidth:28 }} />
    {!!face.startTime && <Text style={{ fontSize:12,color:d.muted,fontVariant:['tabular-nums'],opacity:typed?.mode==='wait' ? 0 : 1 }}>{face.startTime}{face.endTime?`~${face.endTime}`:''}</Text>}
    {editing ? <Pressable accessibilityRole="button" accessibilityLabel={todo.title+' 반복'+(todo.repeat?' · '+repeatEngine.describe(todo.repeat):'')} hitSlop={8} onPress={() => onRepeat?.(todo)}><Icon name="repeat" size={15} color={todo.repeat?d.accent:d.muted} /></Pressable>
      : !!todo.repeat && <View accessibilityLabel={repeatEngine.describe(todo.repeat)+' 반복'}><Icon name="repeat" size={13} color={d.muted} /></View>}
    <Pressable onLayout={e => { box.current.calX = e.nativeEvent.layout.x; }} accessibilityLabel={todo.title+' 날짜'} hitSlop={8} onPress={() => onDate(todo)}><Icon name="calendar" size={15} color={d.muted} /></Pressable>
    {/* Right of the date button, so the line's tap (which stops there) leaves it alone: a tap opens the original. */}
    <SourceMark todo={todo} size={14}/>
   </View>
   </Animated.View>
   </GestureDetector>
   {/* Above the keyboard while editing (iOS): '팀 →' picks the next team (팀 없음 → each team → 팀 없음) for the tag. */}
   {editing && Platform.OS==='ios' && <TeamKey id={'team-'+todo.id} todo={todo} db={db} current={current} onPick={setPicked} d={d} />}
   {/* While editing: pick the line's team (팀 없음 takes it out). Taps here keep the keyboard up. */}
   {editing && !!db?.teams.length && <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap:6, paddingVertical:5, paddingLeft:30, paddingRight:8 }}>
    {[{ id:null, name:'팀 없음', color:null }, ...db.teams].map(t => { const on = current === t.id; return <Pressable key={t.id||'none'} accessibilityRole="button" accessibilityState={{ selected:on }} onPress={() => setPicked(t.id)} style={{ flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:10,paddingVertical:5,borderRadius:99,borderWidth:1,borderColor:on?(t.color||d.accent):d.edge,backgroundColor:on?'#ffffffe6':'#ffffff73' }}>
     {!!t.color && <View style={{ width:8,height:8,borderRadius:4,backgroundColor:t.color }} />}
     <Text style={{ fontSize:12,fontWeight:on?'700':'500',color:on?d.text:d.muted }}>{t.name}</Text>
    </Pressable>; })}
   </ScrollView>}
 </View>;
}

// The picked team in front of the text being edited (팀 없음 is a tag too).
function TeamTag({ team, d }) {
 return <View style={{ flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:9,paddingVertical:3,borderRadius:99,borderWidth:1,borderStyle:team?'solid':'dashed',borderColor:team?team.color+'59':'#141a2e2e',backgroundColor:team?team.color+'29':'#ffffff47' }}>
  {!!team && <View style={{ width:7,height:7,borderRadius:4,backgroundColor:team.color }} />}
  <Text style={{ fontSize:12,fontWeight:'700',color:team?d.text:d.muted }}>{team ? team.name : '팀 없음'}</Text>
 </View>;
}

function TeamKey({ id, todo, db, current, onPick, d }) {
 const team = db.teams.find(t => t.id === current), next = cycleTeam(db, { ...todo, teamId:current }); // undefined: no teams, or set by its project
 return <InputAccessoryView nativeID={id}>
  <View style={{ flexDirection:'row',alignItems:'center',paddingHorizontal:10,paddingVertical:6,backgroundColor:'#eef2fbf2',borderTopWidth:1,borderTopColor:'#ffffff4d' }}>
   <Pressable accessibilityRole="button" accessibilityLabel={'팀 바꾸기 · 지금 '+(team?.name||'팀 없음')} disabled={next === undefined} onPress={() => onPick(next)} style={({ pressed }) => ({ opacity:next === undefined ? 0.45 : 1, flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:6,borderRadius:99,borderWidth:1,borderColor:d.edge,backgroundColor:pressed?'#ffffffcc':d.input })}>
    <Text style={{ fontSize:13,fontWeight:'700',color:d.accent }}>팀 →</Text>
    {!!team?.color && <View style={{ width:8,height:8,borderRadius:4,backgroundColor:team.color }} />}
    <Text style={{ fontSize:13,color:team?d.text:d.muted }}>{team?.name||'팀 없음'}</Text>
   </Pressable>
  </View>
 </InputAccessoryView>;
}

// A line that is no longer in the data — the AI removed it, or moved it to another day — still showing at its old place
// until its turn (presentation only, from the snapshot before the change; it cannot be touched). Its turn (`show`):
// 'leave' — erased backwards, struck through when removed, then it folds away; 'fade' (Reduce Motion) — a quick fade.
// Then `onDone(show.key)`.
export function LeavingLine({ todo, show = null, rowRef, onDone }) {
 const d = useDesign(), height = useRef(0), fold = useRef(new Animated.Value(1)).current, strike = useRef(new Animated.Value(0)).current, [folding,setFolding] = useState(false);
 const finish = useRef(onDone), key = show?.key;
 finish.current = onDone;
 const foldAway = (ms) => { setFolding(true); Animated.timing(fold,{ toValue:0,duration:ms,useNativeDriver:false }).start(({ finished }) => { if(finished) finish.current?.(key); }); };
 useEffect(() => { if(show?.mode==='fade') foldAway(FOLD_MS); }, [key]);
 const erased = () => { if(show?.strike) Animated.timing(strike,{ toValue:1,duration:STRIKE_MS,useNativeDriver:false }).start(() => foldAway(FOLD_MS)); else foldAway(FOLD_MS); };
 const done = todo.status==='done', writing = show?.mode==='leave';
 const textStyle = { flexShrink:1,maxWidth:'64%',minWidth:28,fontSize:15,lineHeight:21,color:done?d.muted:d.text,textDecorationLine:done?'line-through':'none',padding:0,minHeight:25 };
 return <Animated.View ref={rowRef} collapsable={false} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
   onLayout={e => { if(!folding) height.current = e.nativeEvent.layout.height; }}
   style={folding ? { height:fold.interpolate({ inputRange:[0,1],outputRange:[0,height.current] }), marginVertical:fold.interpolate({ inputRange:[0,1],outputRange:[0,3] }), opacity:fold, overflow:'hidden', borderRadius:16 } : { marginVertical:3, borderRadius:16 }}>
  <View style={{ flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:6,paddingVertical:5,borderRadius:16,borderWidth:1,borderColor:writing?'#c4b5fdcc':'transparent',backgroundColor:writing?'#ffffff8c':'transparent' }}>
   <View style={{ width:19,height:19,borderRadius:6,borderWidth:1.5,borderColor:done?d.accent:d.muted,backgroundColor:done?d.accent:'transparent',alignItems:'center',justifyContent:'center' }}>{done && <Icon name="check" size={15} color={d.dark?'#172842':'#fff'} />}</View>
   {writing ? <WrittenTitle key={key} from={show.from} to="" style={textStyle} accent={d.accent} linger={160} onDone={erased} />
     : <Text style={{ ...textStyle, paddingVertical:2 }}>{todo.title}</Text>}
   <View style={{ flex:1,minWidth:28 }} />
   {!!todo.startTime && <Text style={{ fontSize:12,color:d.muted,fontVariant:['tabular-nums'] }}>{todo.startTime}{todo.endTime?`~${todo.endTime}`:''}</Text>}
   <Icon name="calendar" size={15} color={d.muted} />
   <SourceMark todo={todo} size={14}/>
   {/* Crossed off: a pen stroke drawn across the emptied line before it folds away. */}
   <Animated.View style={{ position:'absolute', left:4, top:'50%', height:2, marginTop:-1, borderRadius:1, backgroundColor:d.text, opacity:0.55, width:strike.interpolate({ inputRange:[0,1],outputRange:['0%','97%'] }) }} />
  </View>
 </Animated.View>;
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

// 반복: the toggle; when on, every n 일/주/월/년 from this to-do's day. Changing or turning it off deletes the open
// occurrences after this one (shared/repeat.cjs).
const UNIT_SHORT = { day:'일', week:'주', month:'월', year:'년' };
export function RepeatSheet({ todo, api, onClose }) {
 const d=useDesign(), r=todo.repeat, [on,setOn]=useState(!!r), [every,setEvery]=useState(String(r?.every || 1)), [unit,setUnit]=useState(r?.unit || 'week');
 const rule=repeatEngine.cleanRule({ every, unit });
 const toggle=v => { setOn(v); if(!v && r) { api.setRepeat(todo.id, null); onClose(); } };
 return <Sheet title="반복" onClose={onClose}><Text numberOfLines={2} style={{ color:d.muted }}>{todo.title}</Text>
  {!todo.date ? <Text style={{ color:d.muted }}>날짜가 있는 할 일만 반복할 수 있어요.</Text> : <>
   <View style={{ flexDirection:'row',alignItems:'center',justifyContent:'space-between' }}>
    <Text style={{ fontSize:15,fontWeight:'600',color:d.text }}>반복{r ? ' · '+repeatEngine.describe(r) : ''}</Text>
    <Switch accessibilityLabel="반복" value={on} onValueChange={toggle} trackColor={{ true:d.accent }} />
   </View>
   {on && <>
    <View style={{ flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap' }}>
     <TextInput accessibilityLabel="반복 간격" value={every} onChangeText={t => setEvery(t.replace(/\D/g,'').slice(0,3))} keyboardType="number-pad" selectTextOnFocus style={{ width:58,textAlign:'center',fontSize:16,paddingVertical:7,borderRadius:12,borderWidth:1,borderColor:d.edge,backgroundColor:d.input,color:d.text }} />
     {repeatEngine.UNITS.map(u => <Pressable key={u} accessibilityRole="button" accessibilityState={{ selected:unit===u }} onPress={() => setUnit(u)} style={{ paddingHorizontal:13,paddingVertical:7,borderRadius:99,borderWidth:1,borderColor:unit===u?d.accent+'55':d.edge,backgroundColor:unit===u?d.input:'transparent' }}>
      <Text style={{ fontSize:13,fontWeight:unit===u?'700':'500',color:unit===u?d.accent:d.muted }}>{UNIT_SHORT[u]}</Text>
     </Pressable>)}
     <Text style={{ fontSize:13,color:d.muted }}>마다</Text>
    </View>
    <Text style={{ fontSize:12,color:d.muted }}>{rule ? `${repeatEngine.describe(rule)} · ${todo.date}부터` : '1~999 사이 숫자를 넣어 주세요.'}{r ? '\n바꾸거나 끄면 이 날 다음의 반복은 지워져요.' : ''}</Text>
    <Button title={r ? '반복 바꾸기' : '반복 켜기'} primary disabled={!rule} onPress={() => { api.setRepeat(todo.id, rule); onClose(); }} />
   </>}
  </>}
 </Sheet>;
}
