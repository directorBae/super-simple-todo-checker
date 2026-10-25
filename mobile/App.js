import React, { useEffect, useRef, useState } from 'react';
import { View, Text, SafeAreaView, Platform, StatusBar as NativeStatusBar, Pressable, PanResponder, Animated, StyleSheet, useWindowDimensions } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { DbProvider, useDb } from './src/store.js';
import { DesignProvider, useDesign, Surface, Button, Sheet, Icon } from './src/design.js';
import Board from './src/screens/Board.js';
import Integrations from './src/screens/Integrations.js';
import AppSettings from './src/screens/AppSettings.js';
import Manage from './src/screens/Manage.js';
import MusicPanel from './src/screens/Music.js';
import ClockDrawer from './src/screens/ClockDrawer.js';
import RoamingPet from './src/screens/RoamingPet.js';

function Shell() {
 const { db, api } = useDb(), d = useDesign(), [menu, setMenu] = useState(false), [settings, setSettings] = useState(false);
 const [music, setMusic] = useState(false), [musicMounted, setMusicMounted] = useState(false), [nowPlaying, setNowPlaying] = useState(null), musicControls = useRef(null);
 const onboarding = !db.settings.onboardingDone;
 // Rooms side by side: teams/buckets (-1) ← main (0) → clock (1). The pet lives in one of them (see RoamingPet).
 const [room, setRoom] = useState(0), [clockTodo, setClockTodo] = useState(null), clock = useRef(null), latest = useRef(null);
 const { width } = useWindowDimensions();
 latest.current = { room, width, onboarding, menu, settings };
 const camera = useRef(new Animated.Value(0)).current;
 useEffect(() => { Animated.timing(camera, { toValue: room, duration: 260, useNativeDriver: false }).start(); }, [room]);
 const swipe = useRef(PanResponder.create({
  // Edge swipes open a side room; swiping back toward the middle returns to the main screen.
  onMoveShouldSetPanResponderCapture: (_, g) => {
   const s = latest.current;
   if (s.onboarding || s.menu || s.settings || Math.abs(g.dx) <= 24 || Math.abs(g.dx) <= Math.abs(g.dy) * 1.5) return false;
   if (s.room === 1) return g.dx > 0;
   if (s.room === -1) return g.dx < 0;
   return (g.x0 > s.width - 36 && g.dx < 0) || (g.x0 < 36 && g.dx > 0);
  },
  onPanResponderRelease: (_, g) => {
   const s = latest.current;
   if (s.room === 0) { if (g.dx < -48) setRoom(1); else if (g.dx > 48) setRoom(-1); }
   else if ((s.room === 1 && g.dx > 48) || (s.room === -1 && g.dx < -48)) setRoom(0);
  },
 })).current;
 const finish = () => { api.updateSettings({ onboardingDone:true }); };
 const openMusic = () => { setMenu(false); setMusicMounted(true); setMusic(true); };
 return <SafeAreaView style={{ flex:1, paddingTop:Platform.OS === 'android' ? NativeStatusBar.currentHeight || 0 : 0 }}><View {...swipe.panHandlers} style={{flex:1,overflow:'hidden'}}>
   <Surface native style={{borderRadius:0,borderWidth:0,borderBottomWidth:1}} contentStyle={{ paddingHorizontal:18, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:10 }}>
    <Text style={{ fontSize:16, fontWeight:'800', color:d.accent, letterSpacing:-.3 }}>✓ 체커</Text><View style={{ flex:1 }} />
    {/* A closed music panel never plays unseen: show what is playing, tap to open, Ⅱ to stop. */}
    {nowPlaying && !music && <View style={{ flexDirection:'row', alignItems:'center', maxWidth:200, borderRadius:99, backgroundColor:'#ffffffa6', borderWidth:1, borderColor:d.edge }}>
     <Pressable accessibilityLabel="음악 열기" onPress={openMusic} style={{ flexShrink:1, paddingLeft:10, paddingVertical:5 }}><Text numberOfLines={1} style={{ fontSize:12, color:d.accent }}>♪ {nowPlaying}</Text></Pressable>
     <Pressable accessibilityLabel="음악 일시정지" hitSlop={8} onPress={() => musicControls.current?.pause()} style={{ paddingHorizontal:10, paddingVertical:5 }}><Text style={{ fontSize:11, color:d.text }}>Ⅱ</Text></Pressable>
    </View>}
    <Pressable accessibilityLabel="메뉴" onPress={() => setMenu(true)} hitSlop={12}><View style={{padding:5}}><Icon name="menu" size={19} /></View></Pressable>
   </Surface>
   {onboarding ? <View style={{ flex:1 }}><View style={{ paddingHorizontal:28, paddingTop:32, paddingBottom:12 }}><Text style={{ color:'#fff', fontSize:12, fontWeight:'700', letterSpacing:2 }}>WELCOME TO CHECKER</Text><Text style={{ color:'#fff', fontSize:32, lineHeight:42, fontWeight:'700', letterSpacing:-1, marginTop:14, textShadowColor:'#0006', textShadowRadius:8 }}>흩어진 일들을{ '\n' }한곳으로.</Text></View><Integrations /><View style={{ padding:22, paddingTop:0, gap:8 }}><Button title="시작하기" primary onPress={finish} /><Button title="지금은 건너뛰기" onPress={finish} /></View></View> :
    <View style={{ flex:1 }}><Board clockOpen={room===1} clockLeft={0} onClockReveal={todo=>{setClockTodo(todo);setRoom(1);}} onClockDrop={(todo,x,y)=>clock.current?.drop(todo,x,y)} /></View>}
   {menu && <Sheet title="메뉴" onClose={() => setMenu(false)}><Button title="음악" onPress={openMusic} /><Button title="설정" onPress={() => { setMenu(false); setSettings(true); }} /></Sheet>}
   {settings && <Sheet title="설정" onClose={() => setSettings(false)}><AppSettings /></Sheet>}
   {!onboarding&&<Animated.View pointerEvents={room===-1?'auto':'none'} style={[StyleSheet.absoluteFill,{zIndex:60,borderRightWidth:1,borderRightColor:'#ffffffb3',transform:[{translateX:camera.interpolate({inputRange:[-1,0],outputRange:[0,-width],extrapolate:'clamp'})}]}]}>
    <BlurView blurTarget={d.target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill}/><View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#ffffff59'}]}/>
    <Manage onClose={()=>setRoom(0)}/>
   </Animated.View>}
   {!onboarding&&<ClockDrawer ref={clock} visible={room===1} camera={camera} db={db} api={api} pending={clockTodo} onAssigned={()=>setClockTodo(null)} onClose={()=>setRoom(0)}/>}
   {!onboarding&&<RoamingPet db={db} room={room}/>}
   {musicMounted && <MusicPanel visible={music} onClose={() => setMusic(false)} onNowPlaying={setNowPlaying} controls={musicControls} />}
   <StatusBar style="dark" />
 </View></SafeAreaView>;
}
function Themed() { const { db } = useDb(); return <DesignProvider wallpaper={db.settings.wallpaper}><Shell /></DesignProvider>; }
export default function App() { return <DbProvider><Themed /></DbProvider>; }
