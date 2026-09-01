import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useDb } from '../store.js';
import { T } from '../theme.js';
import { Glass, TeamDot, GhostButton, PrimaryButton, EmptyNote, FadeInUp, PressScale, SectionTitle } from '../components.js';
import { TEAM_COLORS, effectiveTeamId, fmtDateTime } from '../util.js';

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
  const syncCfg = db.settings.sync || { url: '', token: '', lastSync: null };
  const [name, setName] = useState('');
  const [color, setColor] = useState(TEAM_COLORS[db.teams.length % TEAM_COLORS.length]);
  const [recolorId, setRecolorId] = useState(null);
  const [syncUrl, setSyncUrl] = useState(syncCfg.url);
  const [syncToken, setSyncToken] = useState(syncCfg.token);
  const [syncMsg, setSyncMsg] = useState('');

  const doSync = async () => {
    setSyncMsg('동기화 중…');
    const r = await api.syncNow();
    setSyncMsg(r.ok ? '동기화 완료' : '오류: ' + r.error);
  };

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

      <SectionTitle>동기화 (데스크톱 ↔ 모바일)</SectionTitle>
      <FadeInUp>
        <Glass>
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 12, color: T.muted, lineHeight: 18 }}>
              server/를 실행해 두면 데스크톱과 같은 팀·프로젝트·할 일을 공유합니다. 서버가 출력하는 주소와
              토큰을 입력하세요. 설정해 두면 앱을 켤 때 자동으로 동기화됩니다.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="서버 주소 (예: http://192.168.0.10:8787)"
              placeholderTextColor="rgba(148,163,184,0.6)"
              value={syncUrl}
              onChangeText={setSyncUrl}
              onBlur={() => api.updateSettings({ sync: { url: syncUrl.trim() } })}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <TextInput
              style={styles.input}
              placeholder="토큰"
              placeholderTextColor="rgba(148,163,184,0.6)"
              value={syncToken}
              onChangeText={setSyncToken}
              onBlur={() => api.updateSettings({ sync: { token: syncToken.trim() } })}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <PrimaryButton label="지금 동기화" onPress={doSync} />
              {syncCfg.lastSync ? (
                <Text style={{ fontSize: 11, color: T.muted }}>마지막: {fmtDateTime(syncCfg.lastSync)}</Text>
              ) : null}
            </View>
            {syncMsg ? <Text style={{ fontSize: 12, color: T.muted }}>{syncMsg}</Text> : null}
          </View>
        </Glass>
      </FadeInUp>

      <SectionTitle>정보</SectionTitle>
      <FadeInUp>
        <Glass>
          <Text style={{ fontSize: 13, color: T.muted, lineHeight: 20 }}>
            데이터는 이 기기에 저장되고, 동기화 서버를 설정하면 데스크톱(할 일 체커)과 같은 목록을 공유합니다.
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
