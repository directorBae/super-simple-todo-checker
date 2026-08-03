import React, { useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useDb } from '../store.js';
import { T, shadow, glassCard } from '../theme.js';
import { Check, TeamDot, Badge, TeamChip, GhostButton, PrimaryButton, FadeInUp, PressScale } from '../components.js';
import {
  todayStr,
  addDays,
  dateParts,
  DOW_NAMES,
  lineSort,
  effectiveTeamId,
  importantHighlight,
  channelColor,
  CHANNELS,
} from '../util.js';

const PAST = 7;
const FUTURE = 30;

/* 항목 한 줄 */
function Line({ todo, db, api, indent, onOpen }) {
  const done = todo.status === 'done';
  const hl = importantHighlight(todo, db);
  return (
    <FadeInUp>
      <Pressable onPress={onOpen}>
        <View style={[styles.line, indent && { marginLeft: 22 }]}>
          <Check checked={done} onToggle={() => api.updateTodo(todo.id, { status: done ? 'todo' : 'done' })} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={2}
              style={[
                styles.lineTitle,
                hl && { backgroundColor: hl + '2e', paddingHorizontal: 4, borderRadius: 4, alignSelf: 'flex-start' },
                done && { textDecorationLine: 'line-through', color: T.muted },
              ]}
            >
              {todo.title}
            </Text>
          </View>
          {todo.kind === 'content' && todo.channel && (
            <Badge color={channelColor(todo.channel)} textColor="#fff">
              {todo.channel}
            </Badge>
          )}
          {(todo.startTime || todo.endTime) && (
            <Text style={styles.meta}>
              {todo.startTime || ''}
              {todo.endTime ? `~${todo.endTime}` : ''}
            </Text>
          )}
        </View>
      </Pressable>
    </FadeInUp>
  );
}

/* 하루 섹션 */
function DaySection({ date, kind, db, api, isToday, onOpen }) {
  const [text, setText] = useState('');
  const [ctxTeam, setCtxTeam] = useState(null);
  const [focused, setFocused] = useState(false);

  const items = db.todos.filter((t) => t.kind === kind && t.date === date && t.status !== 'bucket').sort(lineSort);
  const noTeam = items.filter((t) => !effectiveTeamId(t, db));
  const teamGroups = db.teams
    .map((team) => ({ team, list: items.filter((t) => effectiveTeamId(t, db) === team.id) }))
    .filter((g) => g.list.length);

  const { m, d, dow } = dateParts(date);
  const dowColor = dow === 0 ? '#e11d48' : dow === 6 ? '#4f6ef7' : T.text;

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    // 팀 이름을 입력하면 그 팀 그룹으로 전환 (데스크톱과 동일한 흐름)
    const team = db.teams.find((t) => t.name === v);
    if (team) {
      setCtxTeam(team.id);
      setText('');
      return;
    }
    api.addTodo({ title: v, date, kind, teamId: ctxTeam });
    setText('');
  };

  return (
    <View style={[styles.day, isToday && styles.dayToday, isToday && shadow(1)]}>
      <View style={styles.dayHead}>
        <Text style={[styles.dow, { color: isToday ? T.accent : dowColor }]}>{DOW_NAMES[dow]}</Text>
        <Text style={styles.dayDate}>
          {m}월 {d}일
        </Text>
        {isToday && (
          <View style={styles.todayBadge}>
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>오늘</Text>
          </View>
        )}
      </View>

      {noTeam.map((t) => (
        <Line key={t.id} todo={t} db={db} api={api} onOpen={() => onOpen(t)} />
      ))}
      {teamGroups.map(({ team, list }) => (
        <View key={team.id}>
          <View style={styles.teamHead}>
            <TeamDot color={team.color} />
            <Text
              style={[
                styles.teamName,
                team.important && { color: team.color, fontWeight: '800' },
              ]}
            >
              {team.name}
              {team.important ? ' ★' : ''}
            </Text>
          </View>
          {list.map((t) => (
            <Line key={t.id} todo={t} db={db} api={api} indent onOpen={() => onOpen(t)} />
          ))}
        </View>
      ))}

      {/* 입력 줄 — 포커스하면 팀 칩이 펼쳐짐 */}
      <View style={styles.inputRow}>
        <Text style={{ color: focused ? T.accent : 'rgba(148,163,184,0.7)', fontSize: 15, width: 20, textAlign: 'center' }}>
          ＋
        </Text>
        <TextInput
          style={styles.input}
          value={text}
          placeholder={kind === 'content' ? '콘텐츠 입력' : '할 일 입력'}
          placeholderTextColor="rgba(148,163,184,0.55)"
          onChangeText={setText}
          onSubmitEditing={submit}
          blurOnSubmit={false}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            if (text.trim()) submit();
          }}
          returnKeyType="done"
        />
      </View>
      {focused && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginLeft: 20 }}>
          <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 4 }}>
            <TeamChip team={null} active={!ctxTeam} onPress={() => setCtxTeam(null)} />
            {db.teams.map((team) => (
              <TeamChip key={team.id} team={team} active={ctxTeam === team.id} onPress={() => setCtxTeam(team.id)} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/* 항목 편집 시트 (유리 모달) */
function Editor({ todo, db, api, onClose }) {
  const [title, setTitle] = useState(todo.title);
  const [date, setDate] = useState(todo.date || '');
  const [startTime, setStartTime] = useState(todo.startTime || '');
  const [endTime, setEndTime] = useState(todo.endTime || '');

  const save = () => {
    const patch = {
      date: /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : date === '' ? null : todo.date,
      startTime: /^\d{2}:\d{2}$/.test(startTime) ? startTime : startTime === '' ? null : todo.startTime,
      endTime: /^\d{2}:\d{2}$/.test(endTime) ? endTime : endTime === '' ? null : todo.endTime,
    };
    const v = title.trim();
    if (v) patch.title = v;
    api.updateTodo(todo.id, patch);
    onClose();
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={save}>
      <Pressable style={styles.overlay} onPress={save}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
          <Pressable onPress={() => {}}>
            <View style={[glassCard, shadow(3), { borderRadius: 24, marginHorizontal: 4 }]}>
              <BlurView intensity={70} tint="light" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.72)' }]} />
              <View style={{ padding: 18, gap: 10 }}>
                <TextInput style={styles.editTitle} value={title} onChangeText={setTitle} multiline />

                <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                  <TextInput
                    style={[styles.editField, { flex: 1 }]}
                    value={date}
                    onChangeText={setDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="rgba(148,163,184,0.6)"
                  />
                  <GhostButton label="오늘" onPress={() => setDate(todayStr())} />
                  <GhostButton label="+1일" onPress={() => setDate(addDays(date || todayStr(), 1))} />
                </View>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TextInput
                    style={[styles.editField, { flex: 1 }]}
                    value={startTime}
                    onChangeText={setStartTime}
                    placeholder="시작 09:00"
                    placeholderTextColor="rgba(148,163,184,0.6)"
                  />
                  <TextInput
                    style={[styles.editField, { flex: 1 }]}
                    value={endTime}
                    onChangeText={setEndTime}
                    placeholder="마무리 18:00"
                    placeholderTextColor="rgba(148,163,184,0.6)"
                  />
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <TeamChip team={null} active={!todo.teamId} onPress={() => api.updateTodo(todo.id, { teamId: null })} />
                    {db.teams.map((team) => (
                      <TeamChip
                        key={team.id}
                        team={team}
                        active={todo.teamId === team.id}
                        onPress={() => api.updateTodo(todo.id, { teamId: team.id })}
                      />
                    ))}
                  </View>
                </ScrollView>

                {todo.kind === 'content' && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      {CHANNELS.map((c) => (
                        <PressScale key={c} haptic onPress={() => api.updateTodo(todo.id, { channel: todo.channel === c ? null : c })}>
                          <Badge color={todo.channel === c ? channelColor(c) : 'rgba(241,245,249,0.9)'} textColor={todo.channel === c ? '#fff' : '#475569'}>
                            {c}
                          </Badge>
                        </PressScale>
                      ))}
                    </View>
                  </ScrollView>
                )}

                <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                  <GhostButton
                    label="버킷으로"
                    onPress={() => {
                      api.updateTodo(todo.id, { status: 'bucket' });
                      onClose();
                    }}
                  />
                  <GhostButton
                    label="삭제"
                    danger
                    onPress={() => {
                      api.deleteTodo(todo.id);
                      onClose();
                    }}
                  />
                  <View style={{ flex: 1 }} />
                  <PrimaryButton label="완료" onPress={save} />
                </View>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

export default function Board({ kind }) {
  const { db, api } = useDb();
  const [editing, setEditing] = useState(null);
  const today = todayStr();
  const scrollRef = useRef(null);
  const yMap = useRef({});
  const scrolled = useRef(false);

  const dates = useMemo(() => {
    const out = [];
    for (let i = -PAST; i <= FUTURE; i++) out.push(addDays(today, i));
    return out;
  }, [today]);

  const editingTodo = editing ? db.todos.find((t) => t.id === editing) : null;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
        keyboardShouldPersistTaps="handled"
      >
        {dates.map((date) => (
          <View
            key={date}
            onLayout={(e) => {
              yMap.current[date] = e.nativeEvent.layout.y;
              // 첫 레이아웃이 끝나면 오늘 위치로 이동
              if (date === today && !scrolled.current && scrollRef.current) {
                scrolled.current = true;
                requestAnimationFrame(() =>
                  scrollRef.current && scrollRef.current.scrollTo({ y: yMap.current[today] - 6, animated: false })
                );
              }
            }}
          >
            <DaySection date={date} kind={kind} db={db} api={api} isToday={date === today} onOpen={(t) => setEditing(t.id)} />
          </View>
        ))}
      </ScrollView>
      {editingTodo && <Editor todo={editingTodo} db={db} api={api} onClose={() => setEditing(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  day: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginHorizontal: -12,
    borderRadius: 18,
  },
  dayToday: {
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderWidth: 1,
    borderColor: T.glassEdge,
    marginVertical: 6,
  },
  dayHead: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 4 },
  dow: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  dayDate: { fontSize: 12, color: T.muted },
  todayBadge: {
    backgroundColor: T.accent,
    borderRadius: 99,
    paddingHorizontal: 9,
    paddingVertical: 2,
    ...shadow(1),
  },
  teamHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 2 },
  teamName: { fontSize: 12, fontWeight: '700', color: T.muted },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  lineTitle: { fontSize: 15, color: T.text },
  meta: { fontSize: 11, color: T.muted, fontVariant: ['tabular-nums'] },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  input: { flex: 1, fontSize: 15, color: T.text, paddingVertical: 6 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30,27,75,0.35)',
    justifyContent: 'center',
    padding: 16,
  },
  editTitle: { fontSize: 17, fontWeight: '600', color: T.text, padding: 0 },
  editField: {
    borderWidth: 1,
    borderColor: T.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    color: T.text,
  },
});
