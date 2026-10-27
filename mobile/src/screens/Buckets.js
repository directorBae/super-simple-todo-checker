import { SourceMark } from '../SourceIcons.js';
import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { Text, TextInput } from '../text.js';
import { useDb } from '../store.js';
import { useDesign, Surface, Button } from '../design.js';
import { todayStr } from '../util.js';
export default function Buckets() {
 const { db, api } = useDb(), d = useDesign(), [title, setTitle] = useState('');
 const add = () => { if(title.trim()) { api.addTodo({ title, status: 'bucket' }); setTitle(''); } };
 const list = db.todos.filter(t => t.status === 'bucket');
 return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, paddingBottom: 120, gap: 14 }}><Text style={{ color: d.muted }}>지금은 미뤄 두고, 준비되면 다시 꺼내세요.</Text><Surface contentStyle={{ padding: 16, gap: 12 }}><TextInput value={title} onChangeText={setTitle} onSubmitEditing={add} maxLength={50} placeholder="언젠가 할 일" placeholderTextColor={d.muted} style={{ padding: 8, fontSize: 16, color: d.text }} /><Button title="버킷에 담기" disabled={!title.trim()} onPress={add} /></Surface>{!list.length && <Text style={{ color: d.muted, padding: 20, textAlign: 'center' }}>버킷이 비어 있습니다.</Text>}{list.map(t => <Surface key={t.id} contentStyle={{ padding: 18, gap: 14 }}><View style={{flexDirection:'row',alignItems:'center',gap:8}}><TextInput defaultValue={t.title} onEndEditing={e => { if(e.nativeEvent.text.trim()) api.updateTodo(t.id, { title:e.nativeEvent.text.trim() }); }} style={{ flex:1, fontSize: 17, color: d.text }} /><SourceMark todo={t} size={16}/></View><View style={{ flexDirection: 'row', gap: 8 }}><Button title="오늘로 가져오기" onPress={() => api.updateTodo(t.id, { status: 'todo', date: todayStr() })} /><Button title="삭제" onPress={() => api.deleteTodo(t.id)} /></View></Surface>)}</ScrollView>;
}
