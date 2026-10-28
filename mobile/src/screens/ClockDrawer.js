import React, { forwardRef, memo, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../text.js';
import Svg, { Circle, ClipPath, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop, Text as SvgText } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useDesign } from '../design.js';
import { todayStr, effectiveTeamId } from '../util.js';
import { LENS, PILL, aimAngle, at, compactTitle, estimatePill, halfOf, lensGlass, lensScene, timeAngle } from '../clock-lens.js';

const pad=n=>String(n).padStart(2,'0');
const ACCENT_2='#8b5cf6';
const HALVES=[0,1]; // 오전 (0–12) above, 오후 (12–24) below: any time of day can be picked at any hour
const rad=deg=>deg*Math.PI/180;
function timeAt(x,y,size,half) {
 const angle=(Math.atan2(x-size/2,-(y-size/2))+Math.PI*2)%(Math.PI*2);
 const minutes=Math.round(angle/(Math.PI*2)*720/15)*15%720+half*720;
 return `${pad(Math.floor(minutes/60))}:${pad(minutes%60)}`;
}
const pillKey=(t,max)=>`${t.id}|${t.startTime}|${t.title}|${t.status}|${max}`;

// The dial face (ticks, numbers, the day's dots, the hands). Memoised so a finger sliding the lens around
// only redraws the lens, not two full dials, on every move.
const DialFace=memo(function DialFace({size,half,own,hands,d}) {
 return <Svg pointerEvents="none" width={size} height={size} viewBox="0 0 280 280">
  {Array.from({length:60},(_,i)=>{const a=i*Math.PI/30,r=i%5?122:116;return <Line key={i} x1={140+Math.sin(a)*r} y1={140-Math.cos(a)*r} x2={140+Math.sin(a)*126} y2={140-Math.cos(a)*126} stroke={i%5?d.muted:d.text} strokeOpacity={i%5?.35:.55} strokeWidth={i%5?1:2} strokeLinecap="round"/>;})}
  {[12,3,6,9].map(n=><SvgText key={n} x={140+Math.sin(n*Math.PI/6)*102} y={145-Math.cos(n*Math.PI/6)*102} textAnchor="middle" fill={d.muted} fontFamily="Pretendard" fontSize="13" fontWeight="500">{half?n%12+12+(n===12?12:0):n}</SvgText>)}
  {/* The day's to-dos in this half as dots just inside the numbers. */}
  {own.map(t=>{const a=rad(timeAngle(t.startTime));return <Circle key={t.id} cx={140+Math.sin(a)*86} cy={140-Math.cos(a)*86} r={4.6} fill={t.color} stroke="#fff" strokeWidth={1.4} opacity={t.status==='done'?0.45:1}/>;})}
  {/* Brushed-metal hands, only on the dial of the half we are in. */}
  {hands&&<>
   <Defs>
    <LinearGradient id="steel" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#4a5263"/><Stop offset="0.32" stopColor="#f5f7fb"/><Stop offset="0.5" stopColor="#c7ccd8"/><Stop offset="0.72" stopColor="#8b94a6"/><Stop offset="1" stopColor="#363d4c"/></LinearGradient>
    <LinearGradient id="violet" x1="0" y1="0" x2="1" y2="0"><Stop offset="0" stopColor="#3b2c75"/><Stop offset="0.35" stopColor="#ece6ff"/><Stop offset="0.55" stopColor="#b9a8f6"/><Stop offset="1" stopColor="#4c3a8a"/></LinearGradient>
    <RadialGradient id="cap" cx="0.35" cy="0.3" r="0.75"><Stop offset="0" stopColor="#ffffff"/><Stop offset="0.45" stopColor="#c9cfdb"/><Stop offset="1" stopColor="#4a5263"/></RadialGradient>
   </Defs>
   <Rect x="136.4" y="80" width="7.2" height="72" rx="3.6" fill="url(#steel)" rotation={hands.h%12*30+hands.m/2} origin="140,140"/>
   <Rect x="137.6" y="50" width="4.8" height="102" rx="2.4" fill="url(#steel)" rotation={hands.m*6+hands.s/10} origin="140,140"/>
   <G rotation={hands.s*6} origin="140,140"><Rect x="139.15" y="42" width="1.7" height="128" rx="0.85" fill="url(#violet)"/><Circle cx="140" cy="160" r="3" fill="url(#violet)"/></G>
   <Circle cx="140" cy="140" r="6.5" fill="url(#cap)" stroke="#20263a" strokeOpacity={0.25} strokeWidth={0.6}/><Circle cx="140" cy="140" r="2" fill={ACCENT_2}/>
  </>}
 </Svg>;
},(a,b)=>a.size===b.size&&a.half===b.half&&a.ownKey===b.ownKey&&a.hands?.h===b.hands?.h&&a.hands?.m===b.hands?.m&&a.hands?.s===b.hands?.s);

// Glass shapes from clock-lens.js (gradients, clips and layered paths) drawn with react-native-svg.
function GlassShapes({glass}) {
 const stops=g=>g.stops.map(([o,c,a],i)=><Stop key={i} offset={o} stopColor={c} stopOpacity={a}/>);
 return <>
  <Defs>{glass.defs.map(g=>g.type==='radial'?<RadialGradient key={g.id} id={g.id} gradientUnits="userSpaceOnUse" cx={g.cx} cy={g.cy} fx={g.cx} fy={g.cy} r={g.r}>{stops(g)}</RadialGradient>
   :g.type==='linear'?<LinearGradient key={g.id} id={g.id} gradientUnits="userSpaceOnUse" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2}>{stops(g)}</LinearGradient>
   :<ClipPath key={g.id} id={g.id}><Path d={g.d} clipRule={g.rule||'nonzero'}/></ClipPath>)}</Defs>
  {glass.layers.map((l,i)=><Path key={i} d={l.d} fill={l.fill} fillOpacity={l.fillOpacity} stroke={l.stroke} strokeOpacity={l.strokeOpacity} strokeWidth={l.strokeWidth} strokeLinecap={l.strokeLinecap} strokeLinejoin={l.strokeLinejoin} strokeDasharray={l.strokeDasharray} clipPath={l.clip?`url(#${l.clip})`:undefined}/>)}
 </>;
}

// One to-do as the lens shows it: time and title on a white chip with the team colour down its left edge.
// Text is laid out natively at its real size (never a scaled picture), on one line.
function Pill({t,d,style,onLayout}) {
 return <View onLayout={onLayout} style={[{flexDirection:'row',alignItems:'center',height:PILL.height,paddingLeft:PILL.pad,paddingRight:PILL.padRight,borderRadius:11,backgroundColor:'#ffffffee',borderLeftWidth:PILL.bar,borderLeftColor:t.color},style]}>
  <Text style={{fontSize:PILL.timeSize,fontWeight:'700',color:d.accent,fontVariant:['tabular-nums'],marginRight:PILL.gap,opacity:t.status==='done'?0.55:1}}>{t.startTime}</Text>
  <Text numberOfLines={1} style={{flexShrink:1,fontSize:PILL.titleSize,fontWeight:'500',color:d.text,textDecorationLine:t.status==='done'?'line-through':'none',opacity:t.status==='done'?0.55:1}}>{compactTitle(t.title)}</Text>
 </View>;
}

// Press and slide on a dial: a 70° slice of a glass ring, reaching past the dial, shows ±35 minutes around the finger
// at twice the scale — minute ruler, every scheduled to-do as a dot with its time and title. Same lens as the desktop's.
function Lens({lens,half,size,todos,d,sizes,bounds}) {
 const fade=useRef(new Animated.Value(0)).current;
 useEffect(()=>{Animated.timing(fade,{toValue:1,duration:160,useNativeDriver:true}).start();},[]);
 const scene=lensScene({size,angle:lens.angle,half,todos,sizes,bounds,finger:lens});
 const {R,c,shift}=scene,dotR=Math.max(4,R*0.036);
 const glass=useMemo(()=>lensGlass(c,R,lens.angle,d.accent,`lens${half}`),[c,R,lens.angle,half,d.accent]);
 return <Animated.View pointerEvents="none" style={{position:'absolute',left:-shift,top:-shift,width:c*2,height:c*2,opacity:fade,transform:[{scale:fade.interpolate({inputRange:[0,1],outputRange:[0.96,1]})}]}}>
  <Svg width={c*2} height={c*2}>
   <GlassShapes glass={glass}/>
   {scene.ticks.map(k=>{const [x1,y1]=at(c,R,k.deg,k.major?LENS.tickIn:LENS.tickInMinor),[x2,y2]=at(c,R,k.deg,LENS.tickOut);return <Line key={k.mm} x1={x1} y1={y1} x2={x2} y2={y2} stroke={k.major?d.text:d.muted} strokeOpacity={k.major?0.8:0.55} strokeWidth={k.major?2:1} strokeLinecap="round"/>;})}
   {scene.pills.map(p=><Line key={'l'+p.id} x1={p.dot[0]} y1={p.dot[1]} x2={p.lead[0]} y2={p.lead[1]} stroke="#141a2e" strokeOpacity={0.25} strokeWidth={1.2}/>)}
   {scene.pills.map(p=><G key={'d'+p.id} opacity={p.todo.status==='done'?0.5:1}><Circle cx={p.dot[0]} cy={p.dot[1]+1.4} r={dotR+1.2} fill="#0b1030" fillOpacity={0.16}/><Circle cx={p.dot[0]} cy={p.dot[1]} r={dotR} fill={p.todo.color} stroke="#fff" strokeWidth={2.2}/></G>)}
  </Svg>
  {scene.times.map(t=><View key={t.key} style={{position:'absolute',left:t.x,top:t.y,width:t.w,height:t.h,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:10,fontWeight:'600',color:d.muted,fontVariant:['tabular-nums']}}>{t.label}</Text></View>)}
  {/* The window the lens shows, on the hub of the dial (the slice itself never covers the centre). */}
  <View style={{position:'absolute',left:scene.hub.x,top:scene.hub.y,width:scene.hub.w,alignItems:'center'}}>
   <View style={{height:scene.hub.h,justifyContent:'center'}}><View style={{paddingHorizontal:9,paddingVertical:3,borderRadius:99,backgroundColor:'#ffffffd9',borderWidth:1,borderColor:'#ffffff'}}><Text style={{fontSize:11,fontWeight:'700',color:d.accent,fontVariant:['tabular-nums']}}>{scene.range}</Text></View></View>
   {scene.empty&&<Text style={{fontSize:11,color:d.muted}}>할 일 없음</Text>}
  </View>
  {scene.pills.map(p=><Pill key={p.id} t={p.todo} d={d} style={{position:'absolute',left:p.x,top:p.y,width:p.w,shadowColor:'#080e28',shadowOpacity:0.16,shadowRadius:8,shadowOffset:{width:0,height:4},elevation:4}}/>)}
 </Animated.View>;
}

const ClockDrawer=forwardRef(function ClockDrawer({visible,camera,db,api,pending,onClose,onAssigned},ref) {
 const d=useDesign(),dials=useRef([]),frames=useRef([]),sheet=useRef(null),origin=useRef({x:0,y:0}),[aiming,setAiming]=useState(null),[finger,setFinger]=useState(null); // aiming: { half, time } under a dragged line; finger: { x, y, title }
 const [box,setBox]=useState({width:0,height:0});
 const [lens,setLens]=useState(null),[now,setNow]=useState(new Date()),[notice,setNotice]=useState(''); // lens: { half, angle, x, y } (x, y: the finger in the dial)
 const [measured,setMeasured]=useState({}); // pill sizes measured off-screen, by pillKey
 const touch=useRef({x:0,y:0,at:0}),lensNext=useRef(null),lensFrame=useRef(null);
 // Two dials stacked: each as large as fits in half the sheet.
 const size=Math.max(0,Math.min(box.width*0.64,(box.height-150)/2)),day=pending?.date||todayStr();
 const pillMax=Math.round(Math.max(120,Math.min(240,box.width-40)));
 useEffect(()=>{if(!visible)return;setNow(new Date());const timer=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(timer);},[visible]);
 useEffect(()=>()=>{if(lensFrame.current!=null)cancelAnimationFrame(lensFrame.current);},[]);
 // A dragged selection lands together: every to-do gets the same time. (No undo button here.)
 const assign=(todos,time)=>{
  const list=[].concat(todos).map(todo=>db.todos.find(t=>t.id===todo?.id&&t.status==='todo')).filter(Boolean);if(!list.length)return;
  list.forEach(current=>api.updateTodo(current.id,{date:current.date||day,startTime:time,endTime:null,endDate:null}));
  setNotice(`${time} · ${list.length>1?`${list.length}개`:list[0].title}`);onAssigned?.();
 };
 // Where the two dials are on screen, measured once the sheet has finished sliding in (and after any layout change),
 // so a line dragged in from the list is matched at once — not against a dial that is still moving.
 const measureDials=()=>{sheet.current?.measureInWindow((x,y)=>{origin.current={x,y};});HALVES.forEach(half=>dials.current[half]?.measureInWindow((left,top,w,h)=>{frames.current[half]={left,top,w,h};}));};
 useEffect(()=>{if(!visible){setAiming(null);setFinger(null);clearLens();return;}const t=setTimeout(measureDials,320);return()=>clearTimeout(t);},[visible,size]);
 const dialAt=(x,y)=>{for(const half of HALVES){const f=frames.current[half];if(f&&x>=f.left&&x<=f.left+f.w&&y>=f.top&&y<=f.top+f.h)return {half,time:timeAt(x-f.left,y-f.top,f.w,half)};}return null;};
 // A line dragged from the list: the dial under the finger shows the time it would get; letting go there sets it.
 useImperativeHandle(ref,()=>({
  hover(x,y,todo){const hit=x==null?null:dialAt(x,y);setAiming(a=>(a?.half===hit?.half&&a?.time===hit?.time?a:hit));setFinger(x==null?null:{x:x-origin.current.x,y:y-origin.current.y,title:todo?.title||''});},
  drop(todo,x,y){const hit=dialAt(x,y);setAiming(null);setFinger(null);if(hit){assign(todo,hit.time);return true;}return false;},
 }));
 const hours=now.getHours(),minutes=now.getMinutes(),seconds=now.getSeconds(),current=hours>=12?1:0;
 // The lens follows the finger once per frame (moves arrive faster than the screen redraws). It stays up while the
 // finger is down, also past the rim, so it never blinks at the dial's edge.
 const showLens=next=>{lensNext.current=next;if(lensFrame.current==null)lensFrame.current=requestAnimationFrame(()=>{lensFrame.current=null;setLens(lensNext.current);});};
 function clearLens(){if(lensFrame.current!=null)cancelAnimationFrame(lensFrame.current);lensFrame.current=null;lensNext.current=null;setLens(null);}
 // Finger position in the dial from page coordinates, against the dial's page origin taken when the touch began
 // (locationX/Y can be relative to whichever child is under the finger, which made the lens jump).
 const aim=(pageX,pageY,half)=>{const x=pageX-touch.current.x,y=pageY-touch.current.y,R=size/2,prev=lensNext.current?.half===half?lensNext.current.angle:null;showLens({half,angle:aimAngle(x-R,y-R,R,prev),x,y});};
 const teamColor=t=>db.teams.find(x=>x.id===effectiveTeamId(t,db))?.color||d.accent;
 const timed=db.todos.filter(t=>t.date===day&&t.startTime&&t.status!=='bucket').sort((a,b)=>a.startTime.localeCompare(b.startTime)).map(t=>({id:t.id,startTime:t.startTime,title:t.title,status:t.status,color:teamColor(t)}));
 const glass={borderWidth:1,borderColor:d.edge,overflow:'hidden'};
 const toast=pending?pending.title:notice;
 const sizes=t=>measured[pillKey(t,pillMax)]||estimatePill(t.startTime,t.title,pillMax);
 const unmeasured=visible?timed.filter(t=>!measured[pillKey(t,pillMax)]):[];
 // Where the lens' labels may go, in the dial's frame: the sheet's width, below the close button, above the bottom.
 const boundsOf=half=>{const side=(box.width-size)/2,f=frames.current[half],top=f?f.top-origin.current.y:null;
  return {minX:-side+8,maxX:size+side-8,minY:top==null?-size*0.4:-top+52,maxY:top==null?size*1.4:box.height-top-10};};

 const dialView=half=>{
  const own=timed.filter(t=>halfOf(t.startTime)===half),ownKey=own.map(t=>`${t.id}${t.startTime}${t.status}${t.color}`).join('|');
  return <View key={half} style={{alignItems:'center',gap:4,zIndex:lens?.half===half?5:1}}>
   <View style={{flexDirection:'row',alignItems:'center',gap:6}}>
    <Text style={{fontSize:13,fontWeight:'700',color:half===current?d.text:d.muted}}>{half?'오후':'오전'}</Text>
    {half===current&&<View style={{paddingHorizontal:7,paddingVertical:1,borderRadius:99,backgroundColor:d.accent}}><Text style={{fontSize:10,fontWeight:'700',color:'#fff'}}>지금</Text></View>}
   </View>
   <View style={{width:size,height:size}}>
    <View ref={el=>{dials.current[half]=el;}} collapsable={false} onLayout={()=>setTimeout(measureDials,50)} style={[glass,{width:size,height:size,borderRadius:size/2,backgroundColor:aiming?.half===half?'#ffffff8c':'#ffffff59',borderColor:aiming?.half===half?d.accent:d.edge,borderWidth:aiming?.half===half?2:1}]} onStartShouldSetResponder={()=>true}
     onResponderGrant={e=>{const {pageX,pageY,locationX,locationY}=e.nativeEvent;touch.current={x:pageX-locationX,y:pageY-locationY,at:Date.now()};if(!pending)aim(pageX,pageY,half);}}
     onResponderMove={e=>{if(!pending)aim(e.nativeEvent.pageX,e.nativeEvent.pageY,half);}}
     // A quick sideways flick still swipes the room shut; once the finger has rested on the dial the lens keeps the touch.
     onResponderTerminationRequest={()=>!!pending||Date.now()-touch.current.at<180}
     onResponderTerminate={clearLens}
     onResponderRelease={e=>{clearLens();const {pageX,pageY}=e.nativeEvent;if(pending)dials.current[half]?.measureInWindow((left,top,w)=>assign(pending,timeAt(pageX-left,pageY-top,w,half)));}}>
     <DialFace size={size} half={half} own={own} ownKey={ownKey} d={d} hands={half===current?{h:hours,m:minutes,s:seconds}:null}/>
    </View>
    {aiming?.half===half&&<View pointerEvents="none" style={{position:'absolute',top:size/2-20,left:size/2-44,width:88,height:40,borderRadius:20,alignItems:'center',justifyContent:'center',backgroundColor:'#ffffffe6',borderWidth:1,borderColor:d.edge}}><Text style={{fontSize:18,fontWeight:'800',color:d.accent,fontVariant:['tabular-nums']}}>{aiming.time}</Text></View>}
    {lens?.half===half&&size>0&&<Lens lens={lens} half={half} size={size} todos={own} d={d} sizes={sizes} bounds={boundsOf(half)}/>}
   </View>
  </View>;
 };

 return <Animated.View ref={sheet} onLayout={e=>{setBox(e.nativeEvent.layout);setTimeout(measureDials,50);}} pointerEvents={visible?'auto':'none'} accessibilityElementsHidden={!visible} importantForAccessibility={visible?'auto':'no-hide-descendants'} style={[StyleSheet.absoluteFill,{zIndex:60}]}>
  {/* A full-screen glass sheet that slides over the whole main screen, like a pull-down shade. */}
  <Animated.View style={[StyleSheet.absoluteFill,{overflow:'hidden',borderLeftWidth:1,borderLeftColor:'#ffffffb3',alignItems:'center',justifyContent:'center',transform:[{translateX:camera.interpolate({inputRange:[0,1],outputRange:[Math.max(box.width,1),0]})}]}]}>
   <BlurView blurTarget={d.target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill}/>
   <View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#ffffff66'}]}/>
   {/* The lens' to-do chips, laid out once off-screen so the lens knows their exact size before it opens. */}
   {!!unmeasured.length&&<View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{position:'absolute',left:0,top:0,width:2000,opacity:0}}>
    {unmeasured.map(t=>{const key=pillKey(t,pillMax);return <Pill key={key} t={t} d={d} style={{alignSelf:'flex-start',maxWidth:pillMax}} onLayout={e=>{const {width,height}=e.nativeEvent.layout;setMeasured(m=>(m[key]?m:{...m,[key]:{w:Math.ceil(width)+1,h:Math.ceil(height)}}));}}/>;})}
   </View>}
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
