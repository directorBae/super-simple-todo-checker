import React, { useState } from 'react';
import { View, Text, SafeAreaView, Platform, StatusBar as NativeStatusBar, Pressable } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DbProvider, useDb } from './src/store.js';
import { DesignProvider, useDesign, Surface, Button, Sheet, Icon, THEMES } from './src/design.js';
import Board from './src/screens/Board.js';
import Teams from './src/screens/Teams.js';
import Buckets from './src/screens/Buckets.js';
import Settings from './src/screens/Settings.js';
import Integrations from './src/screens/Integrations.js';
const TABS = [{ key:'todos', label:'TODOs', icon:'check' }, { key:'integrations', label:'도구 연결', icon:'connect' }, { key:'teams', label:'팀', icon:'teams' }, { key:'buckets', label:'버킷', icon:'bucket' }];
function Shell() {
 const { db, api } = useDb(), d = useDesign(), [tab, setTab] = useState('todos'), [menu, setMenu] = useState(false), [settings, setSettings] = useState(false);
 const onboarding = !db.settings.onboardingDone;
 const finish = () => { api.updateSettings({ onboardingDone:true }); setTab('todos'); };
 return <SafeAreaView style={{ flex:1, paddingTop:Platform.OS === 'android' ? NativeStatusBar.currentHeight || 0 : 0 }}>
   <Surface native style={{borderRadius:0,borderWidth:0,borderBottomWidth:1}} contentStyle={{ paddingHorizontal:18, paddingVertical:10, flexDirection:'row', alignItems:'center', gap:10 }}>
    <Text style={{ fontSize:16, fontWeight:'800', color:d.accent, letterSpacing:-.3 }}>{onboarding || tab==='todos' ? '✓ 체커' : TABS.find(t => t.key === tab).label}</Text><View style={{ flex:1 }} />
    {!onboarding && <Pressable accessibilityLabel="동기화 상태" onPress={() => setSettings(true)}><View style={{ width:7, height:7, borderRadius:4, backgroundColor:db.settings.sync.error ? '#d99556' : db.settings.sync.lastSync ? '#4baf91' : '#a0adbf' }} /></Pressable>}
    <Pressable accessibilityLabel="메뉴" onPress={() => setMenu(true)} hitSlop={12}><View style={{padding:5}}><Icon name="menu" size={19} /></View></Pressable>
   </Surface>
   {onboarding ? <View style={{ flex:1 }}><View style={{ paddingHorizontal:28, paddingTop:32, paddingBottom:12 }}><Text style={{ color:d.muted, fontSize:12, fontWeight:'700', letterSpacing:2 }}>WELCOME TO CHECKER</Text><Text style={{ color:d.text, fontSize:32, lineHeight:42, fontWeight:'700', letterSpacing:-1, marginTop:14 }}>흩어진 일들을{ '\n' }한곳으로.</Text><Text style={{ color:d.muted, lineHeight:22, marginTop:12 }}>쓰고 있는 도구를 연결해 시작하세요.{ '\n' }연결은 언제든 바꿀 수 있어요.</Text></View><Integrations /><View style={{ padding:22, paddingTop:0, gap:8 }}><Button title="시작하기" primary onPress={finish} /><Button title="지금은 건너뛰기" onPress={finish} /></View></View> :
    <View style={{ flex:1 }}>{tab === 'todos' ? <Board /> : tab === 'integrations' ? <Integrations /> : tab === 'teams' ? <Teams /> : <Buckets />}</View>}
   {!onboarding && <Surface native style={{ position:'absolute', left:16, right:16, bottom:Platform.OS === 'ios' ? 28 : 20, borderRadius:24 }} contentStyle={{ flexDirection:'row', padding:6 }}>
    {TABS.map(t => <Pressable key={t.key} accessibilityRole="tab" accessibilityLabel={t.label} accessibilityState={{ selected:tab === t.key }} onPress={() => setTab(t.key)} style={{ flex:1, alignItems:'center', gap:2, paddingVertical:7, borderRadius:18, backgroundColor:tab === t.key ? d.input : 'transparent' }}><Icon name={t.icon} size={18} color={tab === t.key ? d.accent : d.muted} /><Text style={{ fontSize:10, color:tab === t.key ? d.accent : d.muted, fontWeight:'600' }}>{t.label}</Text></Pressable>)}
   </Surface>}
   {menu && <Sheet title="메뉴" onClose={() => setMenu(false)}><Text style={{ color:d.muted }}>테마</Text><View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>{THEMES.map(t => <Button key={t.id} title={t.name} primary={db.settings.theme === t.id || (!db.settings.theme && t.id === 'light')} onPress={() => api.updateSettings({ theme:t.id })} />)}</View><Button title="서버 연결 · 동기화" onPress={() => { setMenu(false); setSettings(true); }} /><Button title="도구 연결" onPress={() => { setMenu(false); if(!onboarding) setTab('integrations'); }} /></Sheet>}
   {settings && <Sheet title="내 서버" onClose={() => setSettings(false)}><Settings /></Sheet>}
   <StatusBar style={d.dark ? 'light' : 'dark'} />
 </SafeAreaView>;
}
function ThemedApp() { const { db } = useDb(); return <DesignProvider theme={db.settings.theme}><Shell /></DesignProvider>; }
export default function App() { return <DbProvider><ThemedApp /></DbProvider>; }
