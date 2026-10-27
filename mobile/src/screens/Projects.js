import React, { useEffect, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../text.js';
import { useDb } from '../store.js';
import { T, shadow } from '../theme.js';
import { Glass, TeamDot, Badge, TeamChip, GhostButton, PrimaryButton, EmptyNote, FadeInUp, PressScale, Check, SectionTitle } from '../components.js';
import { fmtDate, byDateTime } from '../util.js';

/* 진행률 바 — 폭이 스프링으로 차오름 */
function Progress({ pct, color }) {
  const w = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(w, { toValue: pct, useNativeDriver: false, speed: 6, bounciness: 4 }).start();
  }, [pct]);
  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fill,
          { backgroundColor: color || T.accent, width: w.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }) },
        ]}
      />
    </View>
  );
}

function ProjectCard({ project, db, api, delay }) {
  const [open, setOpen] = useState(false);
  const team = db.teams.find((t) => t.id === project.teamId);
  const linked = db.todos.filter((t) => t.projectId === project.id && t.status !== 'bucket');
  const doneCount = linked.filter((t) => t.status === 'done').length;
  const pct = linked.length ? Math.round((doneCount / linked.length) * 100) : 0;
  const hl = project.important ? (team ? team.color : '#f59e0b') : null;

  return (
    <FadeInUp delay={delay} style={{ marginBottom: 10 }}>
      <Glass>
        <PressScale onPress={() => setOpen(!open)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.cardTitle, hl && { color: hl }]}>
              {project.name}
              {hl ? ' ★' : ''}
            </Text>
            <Badge>{project.term === 'long' ? '장기' : '단기'}</Badge>
            {team && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <TeamDot color={team.color} />
                <Text style={{ fontSize: 11, color: T.muted }}>{team.name}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <Text style={{ fontSize: 12, color: T.muted }}>
              {doneCount}/{linked.length}
            </Text>
          </View>
        </PressScale>
        <Progress pct={pct} color={team ? team.color : null} />
        {open && (
          <View style={{ marginTop: 10, gap: 6 }}>
            {linked.length === 0 && <EmptyNote>연결된 할 일이 없습니다.</EmptyNote>}
            {[...linked].sort(byDateTime).map((t) => {
              const done = t.status === 'done';
              return (
                <View key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Check size={18} checked={done} onToggle={() => api.updateTodo(t.id, { status: done ? 'todo' : 'done' })} />
                  <Text style={[{ fontSize: 13, color: T.text, flex: 1 }, done && { textDecorationLine: 'line-through', color: T.muted }]}>
                    {t.title}
                  </Text>
                  {t.date && <Text style={{ fontSize: 11, color: T.muted }}>{fmtDate(t.date)}</Text>}
                </View>
              );
            })}
            <View style={{ flexDirection: 'row', gap: 6, marginTop: 6 }}>
              <GhostButton
                label={project.important ? '★ 중요 해제' : '☆ 중요'}
                onPress={() => api.updateProject(project.id, { important: !project.important })}
              />
              {project.status === 'active' ? (
                <GhostButton label="완료" onPress={() => api.updateProject(project.id, { status: 'done' })} />
              ) : (
                <GhostButton label="재개" onPress={() => api.updateProject(project.id, { status: 'active' })} />
              )}
              <GhostButton label="삭제" danger onPress={() => api.deleteProject(project.id)} />
            </View>
          </View>
        )}
      </Glass>
    </FadeInUp>
  );
}

export default function Projects() {
  const { db, api } = useDb();
  const [name, setName] = useState('');
  const [term, setTerm] = useState('short');
  const [teamId, setTeamId] = useState(null);

  const active = db.projects.filter((p) => p.status === 'active');
  const done = db.projects.filter((p) => p.status === 'done');

  const submit = () => {
    if (!name.trim()) return;
    api.addProject({ name: name.trim(), term, teamId });
    setName('');
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <FadeInUp style={{ marginBottom: 14 }}>
        <Glass>
          <View style={{ gap: 8 }}>
            <TextInput
              style={styles.input}
              placeholder="프로젝트 이름"
              placeholderTextColor="rgba(148,163,184,0.6)"
              value={name}
              onChangeText={setName}
              onSubmitEditing={submit}
            />
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              <GhostButton
                label={term === 'long' ? '장기' : '단기'}
                onPress={() => setTerm(term === 'long' ? 'short' : 'long')}
              />
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', gap: 5 }}>
                  <TeamChip team={null} active={!teamId} onPress={() => setTeamId(null)} />
                  {db.teams.map((t) => (
                    <TeamChip key={t.id} team={t} active={teamId === t.id} onPress={() => setTeamId(t.id)} />
                  ))}
                </View>
              </ScrollView>
              <PrimaryButton label="추가" onPress={submit} />
            </View>
          </View>
        </Glass>
      </FadeInUp>

      {active.length === 0 && <EmptyNote>진행 중인 프로젝트가 없습니다.</EmptyNote>}
      {active.map((p, i) => (
        <ProjectCard key={p.id} project={p} db={db} api={api} delay={i * 45} />
      ))}

      {done.length > 0 && (
        <>
          <SectionTitle>완료된 프로젝트 ({done.length})</SectionTitle>
          {done.map((p, i) => (
            <ProjectCard key={p.id} project={p} db={db} api={api} delay={i * 45} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  cardTitle: { fontSize: 15, fontWeight: '700', color: T.text },
  track: {
    height: 5,
    backgroundColor: 'rgba(148,163,184,0.18)',
    borderRadius: 99,
    marginTop: 10,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 99 },
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
