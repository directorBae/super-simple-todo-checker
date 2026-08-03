import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '../store.js';
import { T } from '../theme.js';
import { Glass, TeamDot, GhostButton, PrimaryButton, EmptyNote, FadeInUp, PressScale, SectionTitle } from '../components.js';
import { TEAM_COLORS, effectiveTeamId } from '../util.js';

function Swatches({ value, onPick }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingVertical: 4 }}>
      {TEAM_COLORS.map((c) => (
        <PressScale key={c} haptic onPress={() => onPick(c)}>
          <View
            style={[
              styles.swatch,
              { backgroundColor: c },
              value === c && { borderWidth: 2.5, borderColor: T.accent },
            ]}
          />
        </PressScale>
      ))}
    </View>
  );
}

export default function Settings() {
  const { db, api } = useDb();
  const [name, setName] = useState('');
  const [color, setColor] = useState(TEAM_COLORS[db.teams.length % TEAM_COLORS.length]);
  const [recolorId, setRecolorId] = useState(null);

  const submit = () => {
    if (!name.trim()) return;
    api.addTeam({ name: name.trim(), color });
    setName('');
    setColor(TEAM_COLORS[(db.teams.length + 1) % TEAM_COLORS.length]);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
      <SectionTitle>팀</SectionTitle>
      <FadeInUp style={{ marginBottom: 10 }}>
        <Glass>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="팀 이름"
                placeholderTextColor="rgba(148,163,184,0.6)"
                value={name}
                onChangeText={setName}
                onSubmitEditing={submit}
              />
              <PrimaryButton label="추가" onPress={submit} />
            </View>
            <Swatches value={color} onPick={setColor} />
          </View>
        </Glass>
      </FadeInUp>

      {db.teams.length === 0 && <EmptyNote>등록된 팀이 없습니다.</EmptyNote>}
      {db.teams.map((team, i) => {
        const projCount = db.projects.filter((p) => p.teamId === team.id && p.status !== 'done').length;
        const todoCount = db.todos.filter((t) => effectiveTeamId(t, db) === team.id && t.status === 'todo').length;
        return (
          <FadeInUp key={team.id} delay={i * 45} style={{ marginBottom: 8 }}>
            <Glass>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <PressScale haptic onPress={() => setRecolorId(recolorId === team.id ? null : team.id)}>
                  <TeamDot color={team.color} size={16} />
                </PressScale>
                <Text style={[styles.teamName, team.important && { color: team.color }]}>
                  {team.name}
                  {team.important ? ' ★' : ''}
                </Text>
                <Text style={{ fontSize: 11, color: T.muted }}>
                  프로젝트 {projCount} · 할 일 {todoCount}
                </Text>
                <View style={{ flex: 1 }} />
                <GhostButton
                  label={team.important ? '★' : '☆'}
                  onPress={() => api.updateTeam(team.id, { important: !team.important })}
                />
                <GhostButton label="✕" danger onPress={() => api.deleteTeam(team.id)} />
              </View>
              {recolorId === team.id && (
                <Swatches
                  value={team.color}
                  onPick={(c) => {
                    api.updateTeam(team.id, { color: c });
                    setRecolorId(null);
                  }}
                />
              )}
            </Glass>
          </FadeInUp>
        );
      })}

      <SectionTitle>정보</SectionTitle>
      <FadeInUp>
        <Glass>
          <Text style={{ fontSize: 13, color: T.muted, lineHeight: 20 }}>
            데이터는 이 기기에만 저장됩니다.{'\n'}
            데스크톱(할 일 체커)과의 동기화는 추후 지원 예정입니다.
          </Text>
        </Glass>
      </FadeInUp>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
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
  teamName: { fontSize: 15, fontWeight: '700', color: T.text },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
  },
});
