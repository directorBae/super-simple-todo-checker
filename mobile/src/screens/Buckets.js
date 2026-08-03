import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '../store.js';
import { T } from '../theme.js';
import { Glass, Badge, GhostButton, PrimaryButton, EmptyNote, FadeInUp, SectionTitle } from '../components.js';
import { channelColor, todayStr } from '../util.js';

export default function Buckets() {
  const { db, api } = useDb();
  const [title, setTitle] = useState('');
  const [projName, setProjName] = useState('');

  const todoBuckets = db.todos.filter((t) => t.status === 'bucket');
  const projBuckets = db.projects.filter((p) => p.status === 'bucket');

  const addTodo = () => {
    if (!title.trim()) return;
    api.addTodo({ title: title.trim(), status: 'bucket' });
    setTitle('');
  };

  const addProj = () => {
    if (!projName.trim()) return;
    api.addProject({ name: projName.trim(), status: 'bucket' });
    setProjName('');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <Text style={styles.desc}>앞으로 챙기고 싶지만 아직 애매한 일들을 담아 두는 곳. 준비가 되면 활성화하세요.</Text>

      <SectionTitle>할 일 · 콘텐츠 버킷 ({todoBuckets.length})</SectionTitle>
      <FadeInUp style={{ marginBottom: 10 }}>
        <Glass>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="언젠가 할 일 / 만들 콘텐츠"
              placeholderTextColor="rgba(148,163,184,0.6)"
              value={title}
              onChangeText={setTitle}
              onSubmitEditing={addTodo}
            />
            <PrimaryButton label="담기" onPress={addTodo} />
          </View>
        </Glass>
      </FadeInUp>
      {todoBuckets.length === 0 && <EmptyNote>버킷이 비어 있습니다.</EmptyNote>}
      {todoBuckets.map((t, i) => (
        <FadeInUp key={t.id} delay={i * 40} style={{ marginBottom: 8 }}>
          <Glass>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 14, color: T.text }}>{t.title}</Text>
              {t.kind === 'content' && (
                <Badge color={channelColor(t.channel)} textColor="#fff">
                  {t.channel || '콘텐츠'}
                </Badge>
              )}
              <GhostButton label="오늘로" onPress={() => api.updateTodo(t.id, { status: 'todo', date: todayStr() })} />
              <GhostButton label="활성화" onPress={() => api.updateTodo(t.id, { status: 'todo' })} />
              <GhostButton label="✕" danger onPress={() => api.deleteTodo(t.id)} />
            </View>
          </Glass>
        </FadeInUp>
      ))}

      <SectionTitle>프로젝트 버킷 ({projBuckets.length})</SectionTitle>
      <FadeInUp style={{ marginBottom: 10 }}>
        <Glass>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="언젠가 하고 싶은 프로젝트"
              placeholderTextColor="rgba(148,163,184,0.6)"
              value={projName}
              onChangeText={setProjName}
              onSubmitEditing={addProj}
            />
            <PrimaryButton label="담기" onPress={addProj} />
          </View>
        </Glass>
      </FadeInUp>
      {projBuckets.length === 0 && <EmptyNote>버킷이 비어 있습니다.</EmptyNote>}
      {projBuckets.map((p, i) => (
        <FadeInUp key={p.id} delay={i * 40} style={{ marginBottom: 8 }}>
          <Glass>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ flex: 1, fontSize: 14, color: T.text }}>{p.name}</Text>
              <GhostButton label="활성화" onPress={() => api.updateProject(p.id, { status: 'active' })} />
              <GhostButton label="✕" danger onPress={() => api.deleteProject(p.id)} />
            </View>
          </Glass>
        </FadeInUp>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  desc: { color: T.muted, fontSize: 13 },
  input: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
    fontSize: 14,
    color: T.text,
  },
});
