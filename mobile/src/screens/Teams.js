import React, { useState } from 'react';
import { Alert, ScrollView, View, Pressable } from 'react-native';
import { Text, TextInput } from '../text.js';
import { useDb } from '../store.js';
import { useDesign, Surface } from '../design.js';
import { TEAM_COLORS, effectiveTeamId } from '../util.js';

// The 12 team colours, the same as on the computer.
function Swatches({ value, onPick, label }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 8 }}>
    {TEAM_COLORS.map((c) => <Pressable key={c} accessibilityLabel={`${label} 색상 ${c}`} accessibilityState={{ selected: value === c }} hitSlop={4} onPress={() => onPick(c)} style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: c, borderWidth: 2, borderColor: value === c ? '#ffffff' : 'transparent', shadowColor: '#000', shadowOpacity: value === c ? 0.25 : 0, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } }} />)}
  </View>;
}

// Teams as compact rows: colour dot (tap for the palette), name (edit in place), open to-dos, ×.
export default function Teams() {
  const { db, api } = useDb(), d = useDesign();
  const [name, setName] = useState(''), [color, setColor] = useState(TEAM_COLORS[db.teams.length % TEAM_COLORS.length]), [palette, setPalette] = useState(null);
  const add = () => { if (!name.trim()) return; api.addTeam({ name: name.trim(), color }); setName(''); setColor(TEAM_COLORS[(db.teams.length + 1) % TEAM_COLORS.length]); setPalette(null); };
  const open = (teamId) => db.todos.filter((t) => t.status === 'todo' && effectiveTeamId(t, db) === teamId).length;
  const dot = (c, onPress, label) => <Pressable accessibilityLabel={label} hitSlop={8} onPress={onPress} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: c, borderWidth: 2, borderColor: '#ffffffcc' }} />;
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 120, gap: 8 }}>
    <Surface contentStyle={{ paddingHorizontal: 14, paddingVertical: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {dot(color, () => setPalette(palette === 'new' ? null : 'new'), '새 팀 색상 고르기')}
        <TextInput accessibilityLabel="새 팀 이름" value={name} onChangeText={setName} onSubmitEditing={add} placeholder="새 팀" placeholderTextColor={d.muted} style={{ flex: 1, color: d.text, fontSize: 15, paddingVertical: 6 }} />
        <Pressable accessibilityRole="button" disabled={!name.trim()} onPress={add} hitSlop={6} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: name.trim() ? d.accent : d.input }}><Text style={{ fontSize: 13, fontWeight: '700', color: name.trim() ? '#fff' : d.muted }}>추가</Text></Pressable>
      </View>
      {palette === 'new' && <Swatches value={color} label="새 팀" onPick={(c) => { setColor(c); setPalette(null); }} />}
    </Surface>
    {db.teams.map((t) => <Surface key={t.id} contentStyle={{ paddingHorizontal: 14, paddingVertical: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {dot(t.color, () => setPalette(palette === t.id ? null : t.id), t.name + ' 색상 바꾸기')}
        <TextInput accessibilityLabel={t.name + ' 팀 이름 수정'} defaultValue={t.name} onEndEditing={(e) => { const v = e.nativeEvent.text.trim(); if (v && v !== t.name) api.updateTeam(t.id, { name: v }); }} style={{ flex: 1, color: d.text, fontWeight: '700', fontSize: 15, paddingVertical: 4 }} />
        <Text style={{ fontSize: 12, color: d.muted, fontVariant: ['tabular-nums'] }}>{open(t.id)}</Text>
        <Pressable accessibilityLabel={t.name + ' 팀 삭제'} hitSlop={10} onPress={() => Alert.alert('팀 삭제', '할 일은 그대로 두고 팀만 지웁니다.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => api.deleteTeam(t.id) }])}><Text style={{ fontSize: 17, color: d.muted }}>×</Text></Pressable>
      </View>
      {palette === t.id && <Swatches value={t.color} label={t.name} onPick={(c) => { api.updateTeam(t.id, { color: c }); setPalette(null); }} />}
    </Surface>)}
  </ScrollView>;
}
