import React, { useEffect, useRef, useState } from 'react';
import { View, SafeAreaView, Platform, StatusBar as NativeStatusBar, Pressable, PanResponder, Animated, StyleSheet, useWindowDimensions, Linking, ScrollView } from 'react-native';
import { Text } from './src/text.js';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { BlurView } from 'expo-blur';
import { DbProvider, useDb } from './src/store.js';
import { ToolsProvider } from './src/tools.js';
import JobToast from './src/JobToast.js';
import { ImportTypingProvider } from './src/ImportTyping.js';
import RainbowEdge from './src/RainbowEdge.js';
import { DesignProvider, useDesign, Surface, Button, Sheet, Icon } from './src/design.js';
import Board from './src/screens/Board.js';
import Integrations from './src/screens/Integrations.js';
import AppSettings from './src/screens/AppSettings.js';
import Manage from './src/screens/Manage.js';
import MusicPanel from './src/screens/Music.js';
import { usePlaylist } from './src/usePlaylist.js';
import ClockDrawer from './src/screens/ClockDrawer.js';
import Login from './src/screens/Login.js';
import { outsideTap } from './src/gesture.js';
import { notificationPermission, rescheduleReminders } from './src/notifications.js';

function Shell() {
 const { db, api } = useDb(), d = useDesign(), [menu, setMenu] = useState(false), [settings, setSettings] = useState(false), [settingsTab, setSettingsTab] = useState('notify');
 const [music, setMusic] = useState(false), [musicMounted, setMusicMounted] = useState(false), [nowPlaying, setNowPlaying] = useState(null), musicControls = useRef(null);
 const playlist = usePlaylist(); // my playlist, loaded at start (the same list as on PC and web)
 const onboarding = !db.settings.onboardingDone;
 // Rooms side by side: teams/buckets (-1) ← main (0) → clock (1). The phone app has no pet.
 const [room, setRoom] = useState(0), [clockTodo, setClockTodo] = useState(null), clock = useRef(null), latest = useRef(null);
 const { width } = useWindowDimensions();
 latest.current = { room, width, onboarding, menu, settings, music };
 const camera = useRef(new Animated.Value(0)).current;
 useEffect(() => { Animated.timing(camera, { toValue: room, duration: 260, useNativeDriver: false }).start(); }, [room]);
 const swipe = useRef(PanResponder.create({
  // A sideways swipe anywhere opens a side room (← clock, → teams); swiping back returns.
  // A line that is being held and moved keeps the touch (it refuses to hand it over).
  onMoveShouldSetPanResponderCapture: (_, g) => {
   const s = latest.current;
   if (s.onboarding || s.menu || s.settings || s.music || Math.abs(g.dx) <= 24 || Math.abs(g.dx) <= Math.abs(g.dy) * 1.5) return false;
   if (s.room === 1) return g.dx > 0;
   if (s.room === -1) return g.dx < 0;
   return true;
  },
  onPanResponderRelease: (_, g) => {
   const s = latest.current;
   if (s.room === 0) { if (g.dx < -48) setRoom(1); else if (g.dx > 48) setRoom(-1); }
   else if ((s.room === 1 && g.dx > 48) || (s.room === -1 && g.dx < -48)) setRoom(0);
  },
 })).current;
 // Reminders: ask once after onboarding, then keep the device's schedule in step with the to-dos.
 useEffect(() => { if (!onboarding) notificationPermission().then(() => rescheduleReminders(db)).catch(() => {}); }, [onboarding]);
 useEffect(() => { const t = setTimeout(() => rescheduleReminders(db).catch(() => {}), 1500); return () => clearTimeout(t); }, [db.todos, db.settings]);
 // The tool sign-in page ends with a todochecker://settings/tools link: back in the app, open 설정 → 도구 연결.
 useEffect(() => {
  if (Platform.OS === 'web') return undefined;
  const open = url => { if (/^todochecker:\/\/settings\/tools/.test(url || '') && !latest.current.onboarding) { setMenu(false); setSettingsTab('tools'); setSettings(true); } };
  Linking.getInitialURL().then(open).catch(() => {});
  const sub = Linking.addEventListener('url', e => open(e.url));
  return () => sub.remove();
 }, []);
 const finish = () => { api.updateSettings({ onboardingDone:true }); };
 const openMusic = () => { setMenu(false); setMusicMounted(true); setMusic(true); };
 // A tap anywhere closes open pop-overs such as the "내 팀 전부 넣기" pill.
 const tap = useRef(null);
 const touchStart = e => { tap.current = { x:e.nativeEvent.pageX, y:e.nativeEvent.pageY }; };
 const touchEnd = e => { const t = tap.current; tap.current = null; if (t && Math.abs(e.nativeEvent.pageX-t.x)+Math.abs(e.nativeEvent.pageY-t.y) < 10) setTimeout(outsideTap, 0); }; // after a line's own tap handling
 return <SafeAreaView style={{ flex:1, paddingTop:Platform.OS === 'android' ? NativeStatusBar.currentHeight || 0 : 0 }}><View {...swipe.panHandlers} onTouchStart={touchStart} onTouchEnd={touchEnd} style={{flex:1,overflow:'hidden'}}>
   <Surface native style={{borderRadius:0,borderWidth:0,borderBottomWidth:1}} contentStyle={{ paddingHorizontal:18, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:10 }}>
    <Text style={{ fontSize:16, fontWeight:'800', color:d.accent, letterSpacing:-.3 }}>✓ 체커</Text><View style={{ flex:1 }} />
    {/* A closed music panel never plays unseen: what is on (playing or paused) stays here — Ⅱ pauses, ▶ plays again. */}
    {nowPlaying && !music && <View style={{ flexDirection:'row', alignItems:'center', maxWidth:200, borderRadius:99, backgroundColor:'#ffffffa6', borderWidth:1, borderColor:d.edge }}>
     <Pressable accessibilityLabel="음악 열기" onPress={openMusic} style={{ flexShrink:1, paddingLeft:10, paddingVertical:5 }}><Text numberOfLines={1} style={{ fontSize:12, color:d.accent }}>♪ {nowPlaying.title}</Text></Pressable>
     <Pressable accessibilityLabel={nowPlaying.playing ? '음악 일시정지' : '음악 다시 재생'} hitSlop={8} onPress={() => (nowPlaying.playing ? musicControls.current?.pause() : musicControls.current?.play())} style={{ paddingHorizontal:10, paddingVertical:5 }}><Text style={{ fontSize:11, color:d.text }}>{nowPlaying.playing ? 'Ⅱ' : '▶'}</Text></Pressable>
    </View>}
    <Pressable accessibilityLabel="메뉴" onPress={() => setMenu(true)} hitSlop={12}><View style={{padding:5}}><Icon name="menu" size={19} /></View></Pressable>
   </Surface>
   {onboarding ? <View style={{ flex:1 }}><View style={{ paddingHorizontal:28, paddingTop:32, paddingBottom:12 }}><Text style={{ color:'#fff', fontSize:12, fontWeight:'700', letterSpacing:2 }}>WELCOME TO CHECKER</Text><Text style={{ color:'#fff', fontSize:32, lineHeight:42, fontWeight:'700', letterSpacing:-1, marginTop:14, textShadowColor:'#0006', textShadowRadius:8 }}>흩어진 일들을{ '\n' }한곳으로.</Text></View><ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:22, paddingTop:8 }}><Integrations /></ScrollView><View style={{ padding:22, paddingTop:0, gap:8 }}><Button title="시작하기" primary onPress={finish} /><Button title="지금은 건너뛰기" onPress={finish} /></View></View> :
    <View style={{ flex:1 }}><Board clockOpen={room===1} clockLeft={0} onClockReveal={todo=>{setClockTodo(todo);setRoom(1);}} onClockClose={()=>setRoom(0)} onClockDrop={(todo,x,y)=>clock.current?.drop(todo,x,y)} onClockHover={(x,y,todo)=>clock.current?.hover(x,y,todo)} /></View>}
   {menu && <Sheet title="메뉴" onClose={() => setMenu(false)}><Button title="음악" onPress={openMusic} /><Button title="설정" onPress={() => { setMenu(false); setSettingsTab('notify'); setSettings(true); }} /></Sheet>}
   {settings && <Sheet title="설정" onClose={() => setSettings(false)}><AppSettings key={settingsTab} initialTab={settingsTab} /></Sheet>}
   {!onboarding&&<Animated.View pointerEvents={room===-1?'auto':'none'} style={[StyleSheet.absoluteFill,{zIndex:60,borderRightWidth:1,borderRightColor:'#ffffffb3',transform:[{translateX:camera.interpolate({inputRange:[-1,0],outputRange:[0,-width],extrapolate:'clamp'})}]}]}>
    <BlurView blurTarget={d.target} blurMethod="dimezisBlurViewSdk31Plus" intensity={60} tint="systemUltraThinMaterialLight" style={StyleSheet.absoluteFill}/><View pointerEvents="none" style={[StyleSheet.absoluteFill,{backgroundColor:'#ffffff59'}]}/>
    <Manage onClose={()=>setRoom(0)}/>
   </Animated.View>}
   {!onboarding&&<ClockDrawer ref={clock} visible={room===1} camera={camera} db={db} api={api} pending={clockTodo} onAssigned={()=>setClockTodo(null)} onClose={()=>setRoom(0)}/>}
   <JobToast />
   {musicMounted && <MusicPanel visible={music} onClose={() => setMusic(false)} onNowPlaying={setNowPlaying} controls={musicControls} playlist={playlist} />}
   <StatusBar style="dark" />
 </View></SafeAreaView>;
}
// With Supabase on, nothing shows until someone is signed in (blank while the saved session is read).
function Themed() {
 const { db, account, loginRequired } = useDb();
 return <DesignProvider wallpaper={db.settings.wallpaper}>{!loginRequired || account ? <ToolsProvider key={account?.id || account?.email || 'local'}><ImportTypingProvider><Shell /><RainbowEdge /></ImportTypingProvider></ToolsProvider> : account === null ? <Login /> : null}</DesignProvider>;
}
export default function App() { return <GestureHandlerRootView style={{ flex: 1 }}><DbProvider><Themed /></DbProvider></GestureHandlerRootView>; }
