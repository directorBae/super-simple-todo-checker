import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { useDb } from '../store.js';
import { useDesign, WALLPAPERS, wallpaperSource } from '../design.js';
import Integrations from './Integrations.js';
import ServerSettings from './Settings.js';

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

export default function AppSettings() {
  const d = useDesign(), [tab, setTab] = useState('wallpaper');
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: d.input }}>
      {[['wallpaper', '배경 화면'], ['tools', '도구 연결'], ['pc', 'PC 연결']].map(([key, label]) => <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key }} onPress={() => setTab(key)} style={{ flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 11, backgroundColor: tab === key ? '#ffffffd9' : 'transparent' }}><Text style={{ fontSize: 13, fontWeight: '600', color: tab === key ? d.accent : d.muted }}>{label}</Text></Pressable>)}
    </View>
    {tab === 'wallpaper' ? <Wallpapers /> : tab === 'tools' ? <Integrations /> : <ServerSettings />}
  </View>;
}
