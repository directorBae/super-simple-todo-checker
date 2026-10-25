import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useDesign } from '../design.js';
import { todayStr } from '../util.js';

const pad=n=>String(n).padStart(2,'0');
const ACCENT_2='#8b5cf6';
function timeAt(x,y,size,half) {
 const angle=(Math.atan2(x-size/2,-(y-size/2))+Math.PI*2)%(Math.PI*2);
 const minutes=Math.round(angle/(Math.PI*2)*720/15)*15%720+half*720;
 return `${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
}
const ClockDrawer=forwardRef(function ClockDrawer({visible,camera,db,api,pending,onClose,onAssigned},ref) {
 const d=useDesign(),dial=useRef(null);
 const [box,setBox]=useState({width:0,height:0});
 const [lens,setLens]=useState(null),[now,setNow]=useState(new Date()),[notice,setNotice]=useState(''),[undo,setUndo]=useState(null);
 const size=Math.max(0,Math.min(box.width,box.height)-24),day=pending?.date||todayStr();
 useEffect(()=>{if(!visible)return;setNow(new Date());const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[visible]);
 // A dragged selection lands together: every to-do gets the same time.
 const assign=(todos,time)=>{
  const list=[].concat(todos).map(todo=>db.todos.find(t=>t.id===todo?.id&&t.status==='todo')).filter(Boolean);if(!list.length)return;
  setUndo(list.map(current=>({id:current.id,patch:{date:current.date||null,startTime:current.startTime||null,endTime:current.endTime||null,endDate:current.endDate||null}})));
  list.forEach(current=>api.updateTodo(current.id,{date:current.date||day,startTime:time,endTime:null,endDate:null}));
  setNotice(`${time} · ${list.length>1?`${list.length}개`:list[0].title}`);onAssigned?.();
 };
 useImperativeHandle(ref,()=>({drop(todo,x,y){dial.current?.measureInWindow((left,top,w,h)=>{if(x>=left&&x<=left+w&&y>=top&&y<=top+h)assign(todo,timeAt(x-left,y-top,w,half));});}}));
 const hours=now.getHours(),minutes=now.getMinutes(),seconds=now.getSeconds();
 // The dial follows the current half of the day: 12·3·6·9 in the morning, 24·15·18·21 in the afternoon.
 const half=hours>=12?1:0;
 // Press and slide around the dial: a 70° torus slice follows the finger and lists the to-dos scheduled in it.
 const SPAN=70,IN=0.54,OUT=0.92,gap=(a,b)=>((a-b+540)%360)-180,tAngle=t=>((Number(t.slice(0,2))%12)*60+Number(t.slice(3,5)))/2;
 const aim=e=>{const {locationX:x,locationY:y}=e.nativeEvent,dx=x-size/2,dy=y-size/2;setLens(Math.hypot(dx,dy)>size/2?null:(Math.atan2(dx,-dy)*180/Math.PI+360)%360);};
 const toTime=deg=>{const m=Math.round(((deg+360)%360)/360*720/5)*5%720+half*720;return `${pad(Math.floor(m/60))}:${pad(m%60)}`;};
 const pt=(deg,r)=>[140+140*r*Math.sin(deg*Math.PI/180),140-140*r*Math.cos(deg*Math.PI/180)];
 const sector=deg=>{const [a,b]=[deg-SPAN/2,deg+SPAN/2],ro=140*OUT,ri=140*IN,cap=(ro-ri)/2,[o1,o2,i1,i2]=[pt(a,OUT),pt(b,OUT),pt(b,IN),pt(a,IN)];return `M${o1}A${ro} ${ro} 0 0 1 ${o2}A${cap} ${cap} 0 0 1 ${i1}A${ri} ${ri} 0 0 0 ${i2}A${cap} ${cap} 0 0 1 ${o1}Z`;};
 const inLens=lens===null?[]:db.todos.filter(t=>t.date===day&&t.startTime&&t.status!=='bucket'&&Math.floor(Number(t.startTime.slice(0,2))/12)===half&&Math.abs(gap(tAngle(t.startTime),lens))<=SPAN/2).sort((a,b)=>a.startTime.localeCompare(b.startTime));
 const glass={borderWidth:1,borderColor:d.edge,overflow:'hidden'};
 const toast=pending?pending.title:notice;
 return <Animated.View onLayout={e=>setBox(e.nativeEvent.layout)} pointerEvents={visible?'auto':'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible?'auto':'no-hide-descendants'} style={[StyleSheet.absoluteFill,{zIndex:60}]}>
  {/* A full-screen glass sheet that slides over the whole main screen, like a pull-down shade. */}
  <Animated.View style={[StyleSheet.absoluteFill,{overflow:'hidden',borderLeftWidth:1,borderLeftColor:'#ffffffb3',alignItems:'center',justifyContent:'center',transform:[{translateX:camera.interpolate({inputRange:[0,1],outputRange:[Math.max(box.width,1),0]})}]}]}>
   <BlurView blurTarget={d.target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill}/>
   <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#ffffff66'}]}/>
   <View ref={dial} collapsable={false} style={[glass,{width:size,height:size,borderRadius:size/2,backgroundColor:'#ffffff59'}]} onStartShouldSetResponder={()=>true} onResponderGrant={e=>{if(!pending)aim(e);}} onResponderMove={e=>{if(!pending)aim(e);}} onResponderRelease={e=>{setLens(null);const {pageX,pageY}=e.nativeEvent;if(pending)dial.current?.measureInWindow((left,top,w)=>assign(pending,timeAt(pageX-left,pageY-top,w,half)));}}>
    <Svg width={size} height={size} viewBox="0 0 280 280">
     {Array.from({length:60},(_,i)=>{const a=i*Math.PI/30,r=i%5?122:116;return <Line key={i} x1={140+Math.sin(a)*r} y1={140-Math.cos(a)*r} x2={140+Math.sin(a)*126} y2={140-Math.cos(a)*126} stroke={i%5?d.muted:d.text} strokeOpacity={i%5?.35:.55} strokeWidth={i%5?1:2} strokeLinecap="round"/>;})}
     {[12,3,6,9].map(n=><SvgText key={n} x={140+Math.sin(n*Math.PI/6)*102} y={145-Math.cos(n*Math.PI/6)*102} textAnchor="middle" fill={d.muted} fontSize="12" fontWeight="500">{half?n%12+12+(n===12?12:0):n}</SvgText>)}
     <Defs>
      <LinearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#4a5263"/><Stop offset="0.32" stopColor="#f5f7fb"/><Stop offset="0.5" stopColor="#c7ccd8"/><Stop offset="0.72" stopColor="#8b94a6"/><Stop offset="1" stopColor="#363d4c"/></LinearGradient>
      <LinearGradient id="violet" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#3b2c75"/><Stop offset="0.35" stopColor="#ece6ff"/><Stop offset="0.55" stopColor="#b9a8f6"/><Stop offset="1" stopColor="#4c3a8a"/></LinearGradient>
      <RadialGradient id="cap" cx="0.35" cy="0.3" r="0.75"><Stop offset="0" stopColor="#ffffff"/><Stop offset="0.45" stopColor="#c9cfdb"/><Stop offset="1" stopColor="#4a5263"/></RadialGradient>
      <LinearGradient id="lensFill" x1="0" y1="0" x2="1" y2="1"><Stop offset="0" stopColor="#ffffff" stopOpacity="0.55"/><Stop offset="0.55" stopColor="#ffffff" stopOpacity="0.28"/><Stop offset="1" stopColor="#ffffff" stopOpacity="0.4"/></LinearGradient>
     </Defs>
     {/* Glass torus slice: soft fill, bright rim, and a white streak along the crest. */}
     {lens!==null&&<><Path d={sector(lens)} fill="url(#lensFill)" stroke="#ffffff" strokeOpacity={0.95} strokeWidth={1.2}/><Path d={(()=>{const k=OUT-(OUT-IN)*0.18,r=140*k,[s1,s2]=[pt(lens-SPAN/2+6,k),pt(lens+SPAN/2-6,k)];return `M${s1}A${r} ${r} 0 0 1 ${s2}`;})()} fill="none" stroke="#ffffff" strokeOpacity={0.85} strokeWidth={2.4} strokeLinecap="round"/></>}
     {/* Brushed-metal hands */}
     <Rect x="136.4" y="80" width="7.2" height="72" rx="3.6" fill="url(#steel)" rotation={hours%12*30+minutes/2} origin="140,140"/>
     <Rect x="137.6" y="50" width="4.8" height="102" rx="2.4" fill="url(#steel)" rotation={minutes*6+seconds/10} origin="140,140"/>
     <G rotation={seconds*6} origin="140,140"><Rect x="139.15" y="42" width="1.7" height="128" rx="0.85" fill="url(#violet)"/><Circle cx="140" cy="160" r="3" fill="url(#violet)"/></G>
     <Circle cx="140" cy="140" r="6.5" fill="url(#cap)" stroke="#20263a" strokeOpacity={0.25} strokeWidth={0.6}/><Circle cx="140" cy="140" r="2" fill={ACCENT_2}/>
    </Svg>
    {lens!==null&&(()=>{const [x,y]=pt(lens,0.67);return <View pointerEvents="none" style={{position:'absolute',left:x/280*size,top:y/280*size,transform:[{translateX:-90},{translateY:-24}],width:180,padding:8,borderRadius:12,backgroundColor:'#ffffffe0',gap:3}}>
     <Text style={{fontSize:11,fontWeight:'700',color:d.muted}}>{toTime(lens-SPAN/2)} – {toTime(lens+SPAN/2)}</Text>
     {inLens.length?inLens.map(t=><Text key={t.id} numberOfLines={1} style={{fontSize:13,color:d.text,textDecorationLine:t.status==='done'?'line-through':'none'}}><Text style={{fontSize:11,fontWeight:'700',color:d.accent}}>{t.startTime} </Text>{t.title}</Text>):<Text style={{fontSize:12,color:d.muted}}>할 일 없음</Text>}
    </View>;})()}
   </View>
   <Text style={{position:'absolute',top:18,left:24,fontSize:11,color:d.muted}}>시계</Text>
   <Pressable accessibilityLabel="시계 닫기" onPress={onClose} hitSlop={12} style={[glass,{position:'absolute',top:12,right:12,width:32,height:32,borderRadius:16,alignItems:'center',justifyContent:'center',backgroundColor:'#ffffff59'}]}><Text style={{fontSize:16,color:d.muted}}>×</Text></Pressable>
   {!!toast&&<View style={[glass,{position:'absolute',left:14,bottom:14,maxWidth:box.width-150,flexDirection:'row',alignItems:'center',gap:8,paddingVertical:8,paddingHorizontal:12,borderRadius:14,backgroundColor:'#ffffffd0'}]}>
    <Text style={{fontSize:12,color:d.text,flexShrink:1}} numberOfLines={1}>{toast}</Text>
    {pending?<Text style={{fontSize:11,color:d.accent}}>시계를 눌러 배정</Text>:undo&&<Pressable onPress={()=>{undo.forEach(u=>api.updateTodo(u.id,u.patch));setUndo(null);setNotice('배정을 되돌렸어요.');}}><Text style={{fontSize:11,color:d.accent}}>되돌리기</Text></Pressable>}
   </View>}
  </Animated.View>
 </Animated.View>;
});
export default ClockDrawer;
