import React, { useState } from 'react';
import { Alert, ScrollView, View, Pressable } from 'react-native';
import { Text, TextInput } from '../text.js';
import { useDb } from '../store.js';
import { useDesign, Surface, Button } from '../design.js';
const COLORS = ['#6685e8','#4d9d86','#ba76a7','#ce8d51','#8e79c8','#599ab5'];
export default function Teams() {
  const { db, api } = useDb(), d = useDesign();
  const [name, setName] = useState(''), [color, setColor] = useState(COLORS[0]);
  const add = () => { if (name.trim()) { api.addTeam({ name, color }); setName(''); } };
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, paddingBottom: 120, gap: 14 }}>
    <Text style={{ color: d.muted, lineHeight: 21 }}>함께하는 팀별로 일과 연결된 도구를 모아 보세요.</Text>
    <Surface contentStyle={{ padding: 18, gap: 14 }}><TextInput accessibilityLabel="팀 이름" value={name} onChangeText={setName} onSubmitEditing={add} placeholder="새 팀 이름" placeholderTextColor={d.muted} style={{ color: d.text, fontSize: 17, padding: 10 }} /><View style={{ flexDirection: 'row', gap: 12 }}>{COLORS.map(c => <Pressable key={c} accessibilityLabel={'팀 색상 ' + c} onPress={() => setColor(c)} style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderColor: color === c ? d.text : 'transparent', borderWidth: 3 }} />)}</View><Button title="팀 만들기" primary disabled={!name.trim()} onPress={add} /></Surface>
    {db.teams.map(t => <Surface key={t.id} contentStyle={{ padding: 18, gap: 12 }}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: t.color }} /><TextInput accessibilityLabel={t.name + ' 팀 이름 수정'} defaultValue={t.name} onEndEditing={e => { if(e.nativeEvent.text.trim()) api.updateTeam(t.id, { name: e.nativeEvent.text.trim() }); }} style={{ flex: 1, color: d.text, fontWeight: '700', fontSize: 18, padding: 0 }} /><Text style={{ color: d.muted }}>{db.todos.filter(x => x.teamId === t.id && x.status === 'todo').length}개</Text></View><View style={{ flexDirection: 'row', gap: 10 }}>{COLORS.map(c => <Pressable key={c} accessibilityLabel={t.name + ' 색상 ' + c} onPress={() => api.updateTeam(t.id, { color: c })} style={{ width: 23, height: 23, borderRadius: 12, backgroundColor: c, borderWidth: 2, borderColor: c === t.color ? d.text : 'transparent' }} />)}<View style={{ flex: 1 }} /><Pressable accessibilityLabel={t.name + ' 팀 삭제'} onPress={() => Alert.alert('팀 삭제', '할 일은 유지하고 팀 소속만 해제합니다.', [{ text: '취소', style: 'cancel' }, { text: '삭제', style: 'destructive', onPress: () => api.deleteTeam(t.id) }])}><Text style={{ color: d.muted }}>삭제</Text></Pressable></View></Surface>)}
  </ScrollView>;
}
