import React, { useEffect, useState } from 'react';
import { Alert, Image, Platform, Pressable, Switch, View } from 'react-native';
import { Text } from '../text.js';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useDb } from '../store.js';
import { useDesign, WALLPAPERS, wallpaperSource } from '../design.js';
import Integrations from './Integrations.js';
import { REMINDER_DEFAULTS } from '../../../shared/reminders.js';
import { notificationPermission, pushState, startPush, permissionNote } from '../notifications.js';
import { available as voipAvailable, registerVoip } from '../voip.js';
import { log as voipLog } from '../../modules/voip-call/index.js';
import { Linking } from 'react-native';
import { tools } from '../store.js';

// What Expo's receipts can say about a push, in plain words.
const EXPO_ERR = {
  DeviceNotRegistered: '이 휴대폰의 푸시 주소가 더 이상 유효하지 않아요. 앱을 완전히 껐다가 다시 열면 새로 등록해요.',
  InvalidCredentials: 'Expo에 등록된 아이폰 푸시 키(APNs)가 잘못됐어요. PC에서 eas credentials로 다시 넣어야 해요.',
  MismatchSenderId: '푸시 키가 다른 앱의 것이에요.',
  MessageTooBig: '알림이 너무 커요.',
  MessageRateExceeded: '알림을 너무 자주 보냈어요. 잠시 뒤에 다시 해 보세요.',
};

// What Apple can say about a VoIP push (다이브를 전화처럼), in plain words.
const APNS_ERR = {
  BadDeviceToken: 'VoIP 주소가 이 서버의 것이 아니에요 (TestFlight·앱스토어 빌드는 production, 개발 빌드는 APNS_SANDBOX=1).',
  Unregistered: '주소가 더 이상 유효하지 않아요. 앱을 껐다 켜면 새로 등록해요.',
  InvalidProviderToken: 'APNs 키(.p8)·키 ID·팀 ID가 맞지 않아요.', MissingProviderToken: 'APNs 키가 서버에 없어요.', ExpiredProviderToken: 'APNs 토큰이 만료됐어요. 다시 눌러 보세요.',
  TopicDisallowed: '토픽이 맞지 않아요 (번들 ID.voip).', DeviceTokenNotForTopic: 'VoIP 주소가 이 앱 것이 아니에요.',
};

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
      if (p !== 'granted') { setTest('알림이 허용되지 않았어요. 아이폰 설정 > Work > 알림에서 켜 주세요. ' + permissionNote()); Linking.openSettings(); return; }
      if (!pushState().registered) await startPush(tools);
      const s = pushState();
      if (!s.registered) { setTest((s.error || '이 휴대폰을 푸시에 등록하지 못했어요.') + ' · ' + permissionNote()); return; }
      setTest('보내는 중… Expo의 전달 영수증까지 기다려요 (10초쯤).');
      const r = await tools.work('/ping');
      const bad = [...(r.tickets || []), ...(r.receipts || [])].filter((t) => t && !t.ok);
      const why = (t) => EXPO_ERR[t.error] || [t.error, t.message].filter(Boolean).join(' ') || '알 수 없는 오류';
      setTest(!r.devices ? '서버에 등록된 휴대폰이 없어요.' : !r.reached ? 'Expo 푸시 서버에 닿지 못했어요.' : r.errors ? 'Expo가 요청을 거절했어요: ' + JSON.stringify(r.errors)
        : bad.length ? `Expo가 전달하지 못했어요 (휴대폰 ${r.devices}대): ${bad.map(why).join(' / ')}`
        : !r.receipts?.length ? `보냈어요 (휴대폰 ${r.devices}대). Expo 영수증은 아직 없어요 — 몇 초 안에 알림이 와야 해요.`
        : `보냈고, Expo가 아이폰에 전달했다고 했어요 (휴대폰 ${r.devices}대). 그래도 안 보이면 아이폰 설정 > Work > 알림에서 알림 허용·잠금 화면·배너가 켜져 있는지 봐 주세요.`);
    } catch (e) { setTest('실패: ' + (e.message || e)); }
    finally { setTesting(false); }
  };
  // 나에게 테스트 전화: a VoIP push to this phone — the iPhone rings like a phone call, the way a dive will.
  const [calling, setCalling] = useState(false), [callNote, setCallNote] = useState(''), [showLog, setShowLog] = useState(false);
  const testCall = async () => {
    setCalling(true); setCallNote('');
    try {
      if (!(await registerVoip())) { setCallNote('이 휴대폰의 VoIP 주소를 아직 못 받았어요. 잠시 뒤 다시 눌러 보세요.'); return; }
      const r = await tools.work('/ping', { voip: true }), v = r.voip || {};
      const why = (x) => (x.reason || '').startsWith('BadKey') ? 'APNs 키 파일이 올바르지 않아요.' : APNS_ERR[x.reason] || `${x.status} ${x.reason || ''}`.trim();
      setCallNote(!v.configured ? '서버에 APNs 키가 아직 없어요 (server/.env에 APNS_KEY_PATH·APNS_KEY_ID를 넣고 deploy).' : !v.devices ? '서버에 등록된 VoIP 주소가 없어요.' : v.results.every((x) => x.ok) ? '전화를 걸었어요. 지금 울려야 해요.' : 'Apple이 거절했어요: ' + v.results.filter((x) => !x.ok).map(why).join(' / '));
    } catch (e) { setCallNote('실패: ' + (e.message || e)); }
    finally { setCalling(false); }
  };
  const rows = [['notifyBefore', '시작 30분 전 알림 (시간이 있는 할 일)'], ['notifyStart', '시작 시간 알림'], ['notifyEnd', '마무리 시간 알림'], ['dailySummary', `아침 요약 (${s.dailySummaryTime}, 오늘 할 일 개수)`], ['dailyWrapup', `하루 마무리 (${s.dailyWrapupTime}, 완료·남은 일)`]];
  return <View style={{ gap: 12 }}>
    {permission !== 'granted' && <Pressable accessibilityRole="button" onPress={async () => { if (permission === 'denied') return Linking.openSettings(); const p = await notificationPermission(true).catch(() => 'default'); setPermission(p); if (p !== 'granted') Linking.openSettings(); }} style={{ padding: 12, borderRadius: 14, backgroundColor: d.input }}><Text style={{ color: d.accent, fontWeight: '700' }}>{permission === 'denied' ? '알림이 꺼져 있어요 · 눌러서 휴대폰 설정 > Work > 알림에서 켜 주세요' : '알림 허용하기'}</Text></Pressable>}
    {Platform.OS === 'ios' && !!tools && <Pressable accessibilityRole="button" disabled={testing} onPress={sendTest} style={{ padding: 12, borderRadius: 14, backgroundColor: d.input, opacity: testing ? 0.6 : 1 }}><Text style={{ color: d.accent, fontWeight: '700' }}>{testing ? '보내는 중…' : '🔔 나에게 테스트 알림'}</Text>{test ? <Text style={{ color: d.muted, fontSize: 12, marginTop: 6 }}>{test}</Text> : null}<Text style={{ color: d.muted, fontSize: 11, marginTop: 4 }}>{permissionNote()}{pushState().registered ? ' · 이 휴대폰 등록됨' : pushState().step ? ' · ' + pushState().step + '…' : pushState().error ? ' · ' + pushState().error : ''}</Text></Pressable>}
    {Platform.OS === 'ios' && !!tools && voipAvailable && <Pressable accessibilityRole="button" disabled={calling} onPress={testCall} style={{ padding: 12, borderRadius: 14, backgroundColor: d.input, opacity: calling ? 0.6 : 1 }}><Text style={{ color: d.accent, fontWeight: '700' }}>{calling ? '거는 중…' : '📞 나에게 테스트 전화'}</Text><Text style={{ color: d.muted, fontSize: 11, marginTop: 4 }}>다이브가 오면 이렇게 전화처럼 울려요. 잠금 화면에선 전체 화면, 쓰는 중엔 위쪽 띠로.</Text>{callNote ? <Text style={{ color: d.muted, fontSize: 12, marginTop: 6 }}>{callNote}</Text> : null}</Pressable>}
    {Platform.OS === 'ios' && voipAvailable && <Pressable accessibilityRole="button" onPress={() => setShowLog(!showLog)} style={{ paddingHorizontal: 12, paddingVertical: 8 }}><Text style={{ color: d.muted, fontSize: 12, fontWeight: '600' }}>📋 전화 기록 {showLog ? '숨기기' : '보기'} (앱이 꺼져 있을 때 온 전화도 남아요)</Text>{showLog && (voipLog().length ? voipLog().slice().reverse().map((l, i) => <Text key={i} style={{ color: d.text, fontSize: 11, fontVariant: ['tabular-nums'], marginTop: 3 }}>{l}</Text>) : <Text style={{ color: d.muted, fontSize: 11, marginTop: 4 }}>아직 기록이 없어요 (이 빌드부터 남아요).</Text>)}</Pressable>}
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
