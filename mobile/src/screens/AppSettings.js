import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, Switch, View } from 'react-native';
import { Text } from '../text.js';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useDb } from '../store.js';
import { useDesign, WALLPAPERS, wallpaperSource } from '../design.js';
import Integrations from './Integrations.js';
import { REMINDER_DEFAULTS } from '../../../shared/reminders.js';
import { notificationPermission, pushState, startPush } from '../notifications.js';
import { Linking } from 'react-native';
import { tools } from '../store.js';

// Same switches as the desktop settings; reminders are scheduled on this phone.
function Reminders() {
  const { db, api } = useDb(), d = useDesign(), s = { ...REMINDER_DEFAULTS, ...db.settings };
  const [permission, setPermission] = useState('granted'), [test, setTest] = useState(''), [testing, setTesting] = useState(false);
  useEffect(() => { notificationPermission(false).then(setPermission).catch(() => {}); }, []);
  // 나에게 테스트 알림: registers this phone if it is not yet, then the server pushes to this account's phones and
  // says how many it has and what Expo answered — the reason, when alerts do not come.
  const sendTest = async () => {
    setTesting(true); setTest('');
    try {
      const p = await notificationPermission(true); setPermission(p);
      if (p !== 'granted') { setTest('알림이 허용되지 않았어요. 휴대폰 설정 > Work > 알림에서 켜 주세요.'); return; }
      if (!pushState().registered) await startPush(tools);
      const s = pushState();
      if (!s.registered) { setTest(s.error || '이 휴대폰을 푸시에 등록하지 못했어요.'); return; }
      const r = await tools.work('/ping');
      const bad = (r.tickets || []).filter((t) => !t.ok).map((t) => t.error);
      setTest(!r.devices ? '서버에 등록된 휴대폰이 없어요.' : !r.reached ? '푸시 서버(Expo)에 닿지 못했어요.' : r.errors ? '푸시 거절: ' + JSON.stringify(r.errors) : bad.length ? `등록된 휴대폰 ${r.devices}대 중 ${bad.length}대 거절: ${bad.join(', ')}` : `보냈어요 (등록된 휴대폰 ${r.devices}대). 몇 초 안에 알림이 와야 해요.`);
    } catch (e) { setTest('실패: ' + (e.message || e)); }
    finally { setTesting(false); }
  };
  const rows = [['notifyBefore', '시작 30분 전 알림 (시간이 있는 할 일)'], ['notifyStart', '시작 시간 알림'], ['notifyEnd', '마무리 시간 알림'], ['dailySummary', `아침 요약 (${s.dailySummaryTime}, 오늘 할 일 개수)`], ['dailyWrapup', `하루 마무리 (${s.dailyWrapupTime}, 완료·남은 일)`]];
  return <View style={{ gap: 12 }}>
    {permission !== 'granted' && <Pressable accessibilityRole="button" onPress={async () => { if (permission === 'denied') Linking.openSettings(); else setPermission(await notificationPermission(true)); }} style={{ padding: 12, borderRadius: 14, backgroundColor: d.input }}><Text style={{ color: d.accent, fontWeight: '700' }}>{permission === 'denied' ? '알림이 꺼져 있어요 · 눌러서 휴대폰 설정 > Work > 알림에서 켜 주세요' : '알림 허용하기'}</Text></Pressable>}
    {Platform.OS === 'ios' && !!tools && <Pressable accessibilityRole="button" disabled={testing} onPress={sendTest} style={{ padding: 12, borderRadius: 14, backgroundColor: d.input, opacity: testing ? 0.6 : 1 }}><Text style={{ color: d.accent, fontWeight: '700' }}>{testing ? '보내는 중…' : '🔔 나에게 테스트 알림'}</Text>{test ? <Text style={{ color: d.muted, fontSize: 12, marginTop: 6 }}>{test}</Text> : null}</Pressable>}
    {rows.map(([key, label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text style={{ color: d.text, fontSize: 14, flexShrink: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={!!s[key]} onValueChange={(v) => api.updateSettings({ [key]: v })} /></View>)}
  </View>;
}

function Wallpapers() {
  const { db, api } = useDb(), d = useDesign(), current = db.settings.wallpaper || { id: WALLPAPERS[0].id };
  const [error, setError] = useState('');
  // A picked photo is copied into the app's own storage so it survives cache cleanup.
  const pick = async () => {
    setError('');
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets?.[0]) return;
      const dest = new File(Paths.document, `wallpaper-${Date.now()}.jpg`);
      new File(result.assets[0].uri).copy(dest);
      if (current.id === 'custom' && current.uri) try { new File(current.uri).delete(); } catch {}
      api.updateSettings({ wallpaper: { id: 'custom', uri: dest.uri } });
    } catch { setError('사진을 가져오지 못했습니다.'); }
  };
  const tile = { width: '31%', aspectRatio: 0.6, borderRadius: 14, overflow: 'hidden', borderWidth: 2 };
  return <View style={{ gap: 10 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {WALLPAPERS.map((w) => <Pressable key={w.id} accessibilityLabel={w.name + ' 배경'} accessibilityState={{ selected: current.id === w.id }} onPress={() => api.updateSettings({ wallpaper: { id: w.id } })} style={[tile, { borderColor: current.id === w.id ? d.accent : '#ffffffb3' }]}>
        <Image source={w.source} style={{ flex: 1 }} resizeMode="cover" /><Text style={{ position: 'absolute', left: 6, bottom: 4, color: '#fff', fontSize: 11, fontWeight: '600', textShadowColor: '#0008', textShadowRadius: 3 }}>{w.name}</Text>
      </Pressable>)}
      {current.id === 'custom' && <View style={[tile, { borderColor: d.accent }]}><Image source={wallpaperSource(current)} style={{ flex: 1 }} resizeMode="cover" /><Text style={{ position: 'absolute', left: 6, bottom: 4, color: '#fff', fontSize: 11, fontWeight: '600' }}>내 사진</Text></View>}
      <Pressable accessibilityLabel="사진 고르기" onPress={pick} style={[tile, { borderColor: '#ffffffb3', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: d.input }]}><Text style={{ color: d.text, fontSize: 12 }}>+ 사진 고르기</Text></Pressable>
    </View>
    {!!error && <Text style={{ color: '#cc4057' }}>{error}</Text>}
    <Text style={{ color: d.muted, fontSize: 12 }}>기본 사진은 Unsplash 무료 라이선스 사진입니다. 고른 사진은 이 기기에만 저장됩니다.</Text>
  </View>;
}

// Who is signed in, and the way out. Alert has no buttons on the web, so the browser asks there.
function Account() {
  const { account, api } = useDb(), d = useDesign();
  if (!account) return null;
  const out = () => {
    if (Platform.OS === 'web') { if (window.confirm('로그아웃할까요?')) api.signOut(); return; }
    Alert.alert('로그아웃할까요?', undefined, [{ text: '취소', style: 'cancel' }, { text: '로그아웃', style: 'destructive', onPress: () => api.signOut() }]);
  };
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 14, backgroundColor: d.input }}>
    <Text numberOfLines={1} style={{ flex: 1, color: d.text, fontSize: 14 }}>{account.email}</Text>
    <Pressable accessibilityRole="button" hitSlop={8} onPress={out}><Text style={{ color: '#cc4057', fontSize: 13, fontWeight: '600' }}>로그아웃</Text></Pressable>
  </View>;
}

export default function AppSettings({ initialTab = 'notify' }) {
  const d = useDesign(), [tab, setTab] = useState(initialTab);
  return <View style={{ gap: 16 }}>
    <Account />
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: d.input }}>
      {[['notify', '알림'], ['wallpaper', '배경 화면'], ['tools', '도구 연결']].map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11, backgroundColor: tab === key ? '#ffffffd9' : 'transparent' }}><Text style={{ fontSize: 13, fontWeight: '600', color: tab === key ? d.accent : d.muted }}>{label}</Text></Pressable>)}
    </View>
    {tab === 'notify' ? <Reminders /> : tab === 'wallpaper' ? <Wallpapers /> : <Integrations />}
  </View>;
}
