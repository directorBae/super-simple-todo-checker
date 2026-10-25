import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { createPet, stepPet, summonPet, hidePet, movePetTo, releasePet, petHop, petPixels, petRoom } from '../../../shared/pixel-pet.js';
import { useDesign } from '../design.js';

export default function RoamingPet({db,room=0}) {
 const d=useDesign(),arena=useRef({width:0,height:0}),model=useRef(null),position=useRef(new Animated.ValueXY({x:10000,y:0})).current,latest=useRef(null),reduced=useRef(false),active=useRef(AppState.currentState!=='background'&&AppState.currentState!=='inactive');
 const view=useRef(room);view.current=room;
 const [sprite,setSprite]=useState({pose:'enter',frame:0,direction:-1,hidden:false,under:false});
 // Rooms: teams/buckets (-1), main (0), clock (1). The viewed room shows its pet on top; a main-room
 // pet stays under a frosted side sheet; a pet in another side room is out of sight.
 const place=s=>{
  const {width}=arena.current,r=petRoom(s,width);
  if(r===view.current)return {x:s.x-r*width,y:s.y,under:false};
  return r===0?{x:s.x,y:s.y,under:true}:null;
 };
 const pet={name:'모모',species:'cat',color:'mint',...db.settings.focusPet},done=useRef(db.todos.filter(t=>t.status==='done').length);
 const call=()=>{if(model.current)summonPet(model.current,arena.current.width,arena.current.height,view.current);};
 latest.current={pet,call};
 useEffect(()=>{const count=db.todos.filter(t=>t.status==='done').length;if(count>done.current)call();done.current=count;},[db.todos]);
 useEffect(()=>{
  let frame,last=0,report=0;AccessibilityInfo.isReduceMotionEnabled().then(value=>{reduced.current=value;});
  const pref=AccessibilityInfo.addEventListener('reduceMotionChanged',value=>{reduced.current=value;});
  const app=AppState.addEventListener('change',value=>{active.current=value==='active';});
  const tick=time=>{
   const {width,height}=arena.current;if(!width||!height||!active.current){last=time;frame=requestAnimationFrame(tick);return;}if(!model.current)model.current=createPet(width,height);
   const s=model.current;if(active.current)stepPet(s,last?(time-last)/1000:0,width,height,Math.random,reduced.current,view.current);last=time;
   const spot=place(s);if(spot)position.setValue({x:Math.round(spot.x),y:Math.round(spot.y-petHop(s,reduced.current))});
   if(time-report>110){report=time;setSprite({pose:s.mode,frame:s.frame,direction:s.direction,hidden:s.hidden||!spot,under:!!spot?.under});}
   frame=requestAnimationFrame(tick);
  };frame=requestAnimationFrame(tick);
  return()=>{cancelAnimationFrame(frame);pref.remove();app.remove();};
 },[]);
 const drag=useRef(PanResponder.create({
  onStartShouldSetPanResponder:()=>true,
  onPanResponderGrant:()=>{if(model.current)model.current.mode='drag';},
  onPanResponderMove:(_,g)=>{const s=model.current;if(!s)return;if(!s.dragOrigin)s.dragOrigin={x:s.x,y:s.y};
   movePetTo(s,s.dragOrigin.x+g.dx,s.dragOrigin.y+g.dy,arena.current.width,arena.current.height,view.current);},
  onPanResponderRelease:(_,g)=>{const s=model.current;if(!s)return;delete s.dragOrigin;if(Math.abs(g.dx)+Math.abs(g.dy)<5)latest.current.call();else releasePet(s);},
  onPanResponderTerminate:()=>{if(model.current){delete model.current.dragOrigin;releasePet(model.current);}},
  onPanResponderTerminationRequest:()=>false,
 })).current;
 return <><View pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:sprite.under?50:90}]} onLayout={e=>{arena.current=e.nativeEvent.layout;}}>
  <Animated.View {...drag.panHandlers} accessibilityLabel={`${pet.name} 도트 펫`} style={{position:'absolute',left:0,top:0,width:72,height:72,opacity:sprite.hidden?0:1,transform:position.getTranslateTransform()}} pointerEvents={sprite.hidden?'none':'auto'}>
   <Svg width="72" height="72" viewBox="0 0 24 24" style={{transform:[{scaleX:sprite.direction}]}}>{petPixels(pet,sprite.pose,sprite.frame).map(p=><Rect key={`${p.x}:${p.y}`} x={p.x} y={p.y} width="1" height="1" fill={p.color}/>)}</Svg>
  </Animated.View>
 </View>
 <View pointerEvents="box-none" style={[StyleSheet.absoluteFill,{zIndex:90}]}>
  <Pressable accessibilityRole="button" accessibilityLabel="펫 부르기" onPress={call} onLongPress={()=>{if(model.current)hidePet(model.current,arena.current.width);}} style={{position:'absolute',left:18,bottom:98,padding:7,opacity:.7}}><Svg width="19" height="19" viewBox="0 0 16 16"><Path d="M2 3h3v4H2zM6 1h3v4H6zM11 3h3v4h-3zM5 8h6v2h2v4H3v-4h2z" fill={d.muted}/></Svg></Pressable>
 </View></>;
}
