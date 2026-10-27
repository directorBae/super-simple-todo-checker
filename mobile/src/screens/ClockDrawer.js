import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../text.js';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useDesign } from '../design.js';
import { todayStr, effectiveTeamId } from '../util.js';

const pad=n=>String(n).padStart(2,'0');
const ACCENT_2='#8b5cf6';
const HALVES=[0,1]; // 오전 (0–12) above, 오후 (12–24) below: any time of day can be picked at any hour
// Press and slide on a dial: a 70° slice of a glass ring, reaching past the dial, shows ±35 minutes
// around the finger at twice the scale — minute ruler, every scheduled to-do as a dot with its title.
// Radii are in units of the dial radius (1 = rim).
const LENS={inner:0.42,outer:1.32,span:70,zoom:2,track:0.6,label:0.98};
const rad=deg=>deg*Math.PI/180,gapDeg=(a,b)=>((a-b+540)%360)-180;
const tAngle=t=>((Number(t.slice(0,2))%12)*60+Number(t.slice(3,5)))/2;
const at=(deg,r)=>[100*r*Math.sin(rad(deg)),-100*r*Math.cos(rad(deg))];
const f=v=>v.toFixed(1);
function slicePath(angle){
 const a0=angle-LENS.span/2,a1=angle+LENS.span/2,ro=100*LENS.outer,ri=100*LENS.inner,[o0,o1,i1,i0]=[at(a0,LENS.outer),at(a1,LENS.outer),at(a1,LENS.inner),at(a0,LENS.inner)];
 return `M${f(o0[0])} ${f(o0[1])}A${ro} ${ro} 0 0 1 ${f(o1[0])} ${f(o1[1])}L${f(i1[0])} ${f(i1[1])}A${ri} ${ri} 0 0 0 ${f(i0[0])} ${f(i0[1])}Z`;
}
const arc=(angle,r,trim=0)=>{const [s0,s1]=[at(angle-LENS.span/2+trim,r),at(angle+LENS.span/2-trim,r)];return `M${f(s0[0])} ${f(s0[1])}A${100*r} ${100*r} 0 0 1 ${f(s1[0])} ${f(s1[1])}`;};
function timeAt(x,y,size,half) {
 const angle=(Math.atan2(x-size/2,-(y-size/2))+Math.PI*2)%(Math.PI*2);
 const minutes=Math.round(angle/(Math.PI*2)*720/15)*15%720+half*720;
 return `${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
}
const ClockDrawer=forwardRef(function ClockDrawer({visible,camera,db,api,pending,onClose,onAssigned},ref) {
 const d=useDesign(),dials=useRef([]),frames=useRef([]),sheet=useRef(null),origin=useRef({x:0,y:0}),[aiming,setAiming]=useState(null),[finger,setFinger]=useState(null); // aiming: { half, time } under a dragged line; finger: { x, y, title }
 const [box,setBox]=useState({width:0,height:0});
 const [lens,setLens]=useState(null),[now,setNow]=useState(new Date()),[notice,setNotice]=useState(''); // lens: { half, angle }
 // Two dials stacked: each as large as fits in half the sheet.
 const size=Math.max(0,Math.min(box.width*0.64,(box.height-150)/2)),day=pending?.date||todayStr();
 useEffect(()=>{if(!visible)return;setNow(new Date());const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[visible]);
 // A dragged selection lands together: every to-do gets the same time. (No undo button here.)
 const assign=(todos,time)=>{
  const list=[].concat(todos).map(todo=>db.todos.find(t=>t.id===todo?.id&&t.status==='todo')).filter(Boolean);if(!list.length)return;
  list.forEach(current=>api.updateTodo(current.id,{date:current.date||day,startTime:time,endTime:null,endDate:null}));
  setNotice(`${time} · ${list.length>1?`${list.length}개`:list[0].title}`);onAssigned?.();
 };
 // Where the two dials are on screen, measured once the sheet has finished sliding in (and after any layout change),
 // so a line dragged in from the list is matched at once — not against a dial that is still moving.
 const measureDials=()=>{sheet.current?.measureInWindow((x,y)=>{origin.current={x,y};});HALVES.forEach(half=>dials.current[half]?.measureInWindow((left,top,w,h)=>{frames.current[half]={left,top,w,h};}));};
 useEffect(()=>{if(!visible){setAiming(null);setFinger(null);return;}const t=setTimeout(measureDials,320);return()=>clearTimeout(t);},[visible,size]);
 const dialAt=(x,y)=>{for(const half of HALVES){const f=frames.current[half];if(f&&x>=f.left&&x<=f.left+f.w&&y>=f.top&&y<=f.top+f.h)return {half,time:timeAt(x-f.left,y-f.top,f.w,half)};}return null;};
 // A line dragged from the list: the dial under the finger shows the time it would get; letting go there sets it.
 useImperativeHandle(ref,()=>({
  hover(x,y,todo){const hit=x==null?null:dialAt(x,y);setAiming(a=>(a?.half===hit?.half&&a?.time===hit?.time?a:hit));setFinger(x==null?null:{x:x-origin.current.x,y:y-origin.current.y,title:todo?.title||''});},
  drop(todo,x,y){const hit=dialAt(x,y);setAiming(null);setFinger(null);if(hit){assign(todo,hit.time);return true;}return false;},
 }));
 const hours=now.getHours(),minutes=now.getMinutes(),seconds=now.getSeconds(),current=hours>=12?1:0;
 const aim=(e,half)=>{const {locationX:x,locationY:y}=e.nativeEvent,dx=x-size/2,dy=y-size/2;setLens(Math.hypot(dx,dy)>size/2?null:{half,angle:(Math.atan2(dx,-dy)*180/Math.PI+360)%360});};
 const toTime=(deg,half)=>{const m=Math.round(((deg+360)%360)/360*720/5)*5%720+half*720;return `${pad(Math.floor(m/60))}:${pad(m%60)}`;};
 const teamColor=t=>db.teams.find(x=>x.id===effectiveTeamId(t,db))?.color||d.accent;
 const timed=db.todos.filter(t=>t.date===day&&t.startTime&&t.status!=='bucket').sort((a,b)=>a.startTime.localeCompare(b.startTime));
 const glass={borderWidth:1,borderColor:d.edge,overflow:'hidden'};
 const toast=pending?pending.title:notice;

 const lensView=half=>{
  if(lens?.half!==half||!size)return null;
  const angle=lens.angle,own=timed.filter(t=>Math.floor(Number(t.startTime.slice(0,2))/12)===half);
  const inLens=own.filter(t=>Math.abs(gapDeg(tAngle(t.startTime),angle))<=LENS.span/2/LENS.zoom),lensDeg=deg=>angle+gapDeg(deg,angle)*LENS.zoom;
  const L=size/2*LENS.outer*1.04,ticks=[],marks=[];
  for(let m=-35;m<=35;m+=5){const deg=lensDeg(angle+m/2),major=m%15===0;ticks.push(<Line key={'t'+m} x1={at(deg,LENS.track-0.07)[0]} y1={at(deg,LENS.track-0.07)[1]} x2={at(deg,LENS.track+(major?0.09:0.05))[0]} y2={at(deg,LENS.track+(major?0.09:0.05))[1]} stroke={d.text} strokeOpacity={major?0.55:0.3} strokeWidth={major?1.4:0.9} strokeLinecap="round"/>);}
  for(let m=-30;m<=30;m+=15){const deg=lensDeg(angle+m/2),[x,y]=at(deg,LENS.track-0.17);marks.push(<SvgText key={'l'+m} x={x} y={y+3} textAnchor="middle" fill={d.muted} fontFamily="Pretendard" fontSize="7.5" fontWeight="600">{toTime(angle+m/2,half)}</SvgText>);}
  return <View pointerEvents="none" style={{position:'absolute',left:size/2-L,top:size/2-L,width:L*2,height:L*2}}>
   <Svg width={L*2} height={L*2} viewBox={`${-100*LENS.outer*1.04} ${-100*LENS.outer*1.04} ${200*LENS.outer*1.04} ${200*LENS.outer*1.04}`}>
    <Defs><LinearGradient id={'lensGlass'+half} x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#ffffff" stopOpacity="0.92"/><Stop offset="0.6" stopColor="#f5f3ff" stopOpacity="0.86"/><Stop offset="1" stopColor="#ffffff" stopOpacity="0.9"/></LinearGradient></Defs>
    <Path d={slicePath(angle)} fill={`url(#lensGlass${half})`} stroke="#ffffff" strokeWidth={1.4}/>
    <Path d={arc(angle,LENS.outer-0.05,4)} fill="none" stroke="#ffffff" strokeWidth={2.2} strokeLinecap="round" strokeOpacity={0.95}/>
    <Path d={arc(angle,LENS.track)} fill="none" stroke={d.text} strokeOpacity={0.18} strokeWidth={1}/>
    {ticks}{marks}
    {inLens.map((t,i)=>{const deg=lensDeg(tAngle(t.startTime)),[dx,dy]=at(deg,LENS.track),[lx,ly]=at(deg,LENS.label+(i%2)*0.14),right=Math.sin(rad(deg))>=0;
     return <G key={t.id}><Line x1={dx} y1={dy} x2={lx} y2={ly} stroke={teamColor(t)} strokeOpacity={0.5} strokeWidth={1}/><Circle cx={dx} cy={dy} r={4.5} fill={teamColor(t)} stroke="#fff" strokeWidth={1.5}/>
      <SvgText x={lx+(right?3:-3)} y={ly+3} textAnchor={right?'start':'end'} fill={d.text} fontFamily="Pretendard" fontSize="8.5" fontWeight="600" textDecoration={t.status==='done'?'line-through':'none'}>{t.startTime} {t.title.length>16?t.title.slice(0,15)+'…':t.title}</SvgText></G>;})}
    {!inLens.length&&(()=>{const [x,y]=at(angle,LENS.label);return <SvgText x={x} y={y+3} textAnchor="middle" fill={d.muted} fontFamily="Pretendard" fontSize="8">할 일 없음</SvgText>;})()}
    {(()=>{const [x,y]=at(angle,LENS.inner+0.08);return <SvgText x={x} y={y+3} textAnchor="middle" fill={d.accent} fontFamily="Pretendard" fontSize="8" fontWeight="700">{toTime(angle-LENS.span/2/LENS.zoom,half)}–{toTime(angle+LENS.span/2/LENS.zoom,half)}</SvgText>;})()}
   </Svg>
  </View>;
 };

 const dialView=half=>{
  const own=timed.filter(t=>Math.floor(Number(t.startTime.slice(0,2))/12)===half);
  return <View key={half} style={{alignItems:'center',gap:4,zIndex:lens?.half===half?5:1}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
    <Text style={{fontSize:13,fontWeight:'700',color:half===current?d.text:d.muted}}>{half?'오후':'오전'}</Text>
    {half===current&&<View style={{paddingHorizontal:7,paddingVertical:1,borderRadius:99,backgroundColor:d.accent}}><Text style={{fontSize:10,fontWeight:'700',color:'#fff'}}>지금</Text></View>}
   </View>
   <View style={{width:size,height:size}}>
    <View ref={el=>{dials.current[half]=el;}} collapsable={false} onLayout={()=>setTimeout(measureDials,50)} style={[glass,{width:size,height:size,borderRadius:size/2,backgroundColor:aiming?.half===half?'#ffffff8c':'#ffffff59',borderColor:aiming?.half===half?d.accent:d.edge,borderWidth:aiming?.half===half?2:1}]} onStartShouldSetResponder={()=>true}
     onResponderGrant={e=>{if(!pending)aim(e,half);}} onResponderMove={e=>{if(!pending)aim(e,half);}}
     onResponderRelease={e=>{setLens(null);const {pageX,pageY}=e.nativeEvent;if(pending)dials.current[half]?.measureInWindow((left,top,w)=>assign(pending,timeAt(pageX-left,pageY-top,w,half)));}}>
     <Svg width={size} height={size} viewBox="0 0 280 280">
      {Array.from({length:60},(_,i)=>{const a=i*Math.PI/30,r=i%5?122:116;return <Line key={i} x1={140+Math.sin(a)*r} y1={140-Math.cos(a)*r} x2={140+Math.sin(a)*126} y2={140-Math.cos(a)*126} stroke={i%5?d.muted:d.text} strokeOpacity={i%5?.35:.55} strokeWidth={i%5?1:2} strokeLinecap="round"/>;})}
      {[12,3,6,9].map(n=><SvgText key={n} x={140+Math.sin(n*Math.PI/6)*102} y={145-Math.cos(n*Math.PI/6)*102} textAnchor="middle" fill={d.muted} fontFamily="Pretendard" fontSize="13" fontWeight="500">{half?n%12+12+(n===12?12:0):n}</SvgText>)}
      {/* The day's to-dos in this half as dots just inside the numbers. */}
      {own.map(t=>{const a=rad(tAngle(t.startTime));return <Circle key={t.id} cx={140+Math.sin(a)*86} cy={140-Math.cos(a)*86} r={4.6} fill={teamColor(t)} stroke="#fff" strokeWidth={1.4} opacity={t.status==='done'?0.45:1}/>;})}
      {/* Brushed-metal hands, only on the dial of the half we are in. */}
      {half===current&&<>
       <Defs>
        <LinearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#4a5263"/><Stop offset="0.32" stopColor="#f5f7fb"/><Stop offset="0.5" stopColor="#c7ccd8"/><Stop offset="0.72" stopColor="#8b94a6"/><Stop offset="1" stopColor="#363d4c"/></LinearGradient>
        <LinearGradient id="violet" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#3b2c75"/><Stop offset="0.35" stopColor="#ece6ff"/><Stop offset="0.55" stopColor="#b9a8f6"/><Stop offset="1" stopColor="#4c3a8a"/></LinearGradient>
        <RadialGradient id="cap" cx="0.35" cy="0.3" r="0.75"><Stop offset="0" stopColor="#ffffff"/><Stop offset="0.45" stopColor="#c9cfdb"/><Stop offset="1" stopColor="#4a5263"/></RadialGradient>
       </Defs>
       <Rect x="136.4" y="80" width="7.2" height="72" rx="3.6" fill="url(#steel)" rotation={hours%12*30+minutes/2} origin="140,140"/>
       <Rect x="137.6" y="50" width="4.8" height="102" rx="2.4" fill="url(#steel)" rotation={minutes*6+seconds/10} origin="140,140"/>
       <G rotation={seconds*6} origin="140,140"><Rect x="139.15" y="42" width="1.7" height="128" rx="0.85" fill="url(#violet)"/><Circle cx="140" cy="160" r="3" fill="url(#violet)"/></G>
       <Circle cx="140" cy="140" r="6.5" fill="url(#cap)" stroke="#20263a" strokeOpacity={0.25} strokeWidth={0.6}/><Circle cx="140" cy="140" r="2" fill={ACCENT_2}/>
      </>}
     </Svg>
    </View>
    {aiming?.half===half&&<View pointerEvents="none" style={{position:'absolute',top:size/2-20,left:size/2-44,width:88,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#ffffffe6',borderWidth:1,borderColor:d.edge}}><Text style={{fontSize:18,fontWeight:'800',color:d.accent,fontVariant:['tabular-nums']}}>{aiming.time}</Text></View>}
    {lensView(half)}
   </View>
  </View>;
 };

 return <Animated.View ref={sheet} onLayout={e=>{setBox(e.nativeEvent.layout);setTimeout(measureDials,50);}} pointerEvents={visible?'auto':'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible?'auto':'no-hide-descendants'} style={[StyleSheet.absoluteFill,{zIndex:60}]}>
  {/* A full-screen glass sheet that slides over the whole main screen, like a pull-down shade. */}
  <Animated.View style={[StyleSheet.absoluteFill,{overflow:'hidden',borderLeftWidth:1,borderLeftColor:'#ffffffb3',alignItems:'center',justifyContent:'center',transform:[{translateX:camera.interpolate({inputRange:[0,1],outputRange:[Math.max(box.width,1),0]})}]}]}>
   <BlurView blurTarget={d.target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill}/>
   <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#ffffff66'}]}/>
   <View style={{alignItems:'center',gap:16,marginTop:24}}>{HALVES.map(dialView)}</View>
   <Text style={{position:'absolute',top:18,left:24,fontSize:11,color:d.muted}}>시계</Text>
   {/* The day the clock is working on: a to-do brought in from another day keeps its own date (only the time is set). */}
   {!!pending&&(()=>{const [y,mo,dd]=day.split('-').map(Number),w='일월화수목금토'[new Date(y,mo-1,dd).getDay()];return <View pointerEvents="none" style={[glass,{position:'absolute',top:12,alignSelf:'center',paddingHorizontal:18,paddingVertical:7,borderRadius:99,backgroundColor:'#ffffffe0',alignItems:'center'}]}><Text style={{fontSize:15,fontWeight:'700',color:d.text}}>{day===todayStr()?'오늘 · ':''}{mo}월 {dd}일 ({w})</Text></View>;})()}
   <Pressable accessibilityLabel="시계 닫기" onPress={onClose} hitSlop={12} style={[glass,{position:'absolute',top:12,right:12,width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#ffffff59'}]}><Text style={{fontSize:16,color:d.muted}}>×</Text></Pressable>
   {!!toast&&<View style={[glass,{position:'absolute',left:14,bottom:14,maxWidth:box.width-28,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8,paddingHorizontal:12,borderRadius:14,backgroundColor:'#ffffffd0'}]}>
    <Text style={{fontSize:12,color:d.text,flexShrink:1}} numberOfLines={1}>{toast}</Text>
    {!!pending&&<Text style={{fontSize:11,color:d.accent}}>시계를 눌러 배정</Text>}
   </View>}
  </Animated.View>
   {/* The line being dragged, above the clock (the row itself stays in the list underneath): its title and the time it would get. */}
  {finger&&<View pointerEvents="none" style={{position:'absolute',left:Math.max(8,finger.x-90),top:Math.max(8,finger.y-64),zIndex:90,maxWidth:200,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:12,paddingVertical:8,borderRadius:16,backgroundColor:'#fffffff0',borderWidth:1,borderColor:d.edge,shadowColor:'#1e1b4b',shadowOpacity:0.2,shadowRadius:12,shadowOffset:{width:0,height:6},elevation:8}}>
   {aiming&&<Text style={{fontSize:13,fontWeight:'800',color:d.accent,fontVariant:['tabular-nums']}}>{aiming.time}</Text>}
   <Text numberOfLines={1} style={{flexShrink:1,fontSize:13,color:d.text}}>{finger.title}</Text>
  </View>}
 </Animated.View>;
});
export default ClockDrawer;
