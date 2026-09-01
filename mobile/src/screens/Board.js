import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
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
import * as Clipboard from 'expo-clipboard';
import { useDb } from '../store.js';
import { T, shadow, glassCard } from '../theme.js';
import { Check, TeamDot, Badge, TeamChip, GhostButton, PrimaryButton, EmptyNote, FadeInUp, PressScale } from '../components.js';
import {
  todayStr,
  addDays,
  localDateStr,
  dateParts,
  DOW_NAMES,
  lineSort,
  effectiveTeamId,
  importantHighlight,
  channelColor,
  CHANNELS,
  resolveGroup,
  suggestGroups,
  pasteLines,
} from '../util.js';

const PAST = 7;
const FUTURE = 30;

/* 그룹(팀/프로젝트/채널) 선택 칩 */
function GroupChip({ group, active, accent, onPress }) {
  return (
    <PressScale haptic onPress={onPress}>
      <View
        style={[
          styles.gchip,
          active && { borderColor: group.color, backgroundColor: 'rgba(255,255,255,0.88)' },
          accent && { borderColor: T.accent, backgroundColor: 'rgba(255,255,255,0.88)' },
        ]}
      >
        <TeamDot color={group.color} />
        <Text style={[styles.gchipText, (active || accent) && { color: T.text, fontWeight: '700' }]}>{group.label}</Text>
        {accent && <Text style={styles.gchipHint}>카테고리</Text>}
      </View>
    </PressScale>
  );
}

/* 항목 한 줄 */
function Line({ todo, db, api, indent, onOpen }) {
  const done = todo.status === 'done';
  const hl = importantHighlight(todo, db);
  const project = db.projects.find((p) => p.id === todo.projectId);
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
          {project && <Badge>{project.name}</Badge>}
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
  const [ctx, setCtx] = useState(null); // 그룹 컨텍스트 { label, color, teamId, projectId, channel }
  const [focused, setFocused] = useState(false);

  const items = db.todos.filter((t) => t.kind === kind && t.date === date && t.status !== 'bucket').sort(lineSort);
  const noTeam = items.filter((t) => !effectiveTeamId(t, db));
  const teamGroups = db.teams
    .map((team) => ({ team, list: items.filter((t) => effectiveTeamId(t, db) === team.id) }))
    .filter((g) => g.list.length);

  const { m, d, dow } = dateParts(date);
  const dowColor = dow === 0 ? '#e11d48' : dow === 6 ? '#4f6ef7' : T.text;

  const sugs = focused && text.trim() ? suggestGroups(text, kind, db) : [];

  // 빠른 선택 칩 — 콘텐츠는 채널 먼저, 그다음 팀
  const quicks = [
    ...(kind === 'content' ? CHANNELS.map((c) => resolveGroup(c, kind, db)).filter(Boolean) : []),
    ...db.teams.map((t) => ({ label: t.name, color: t.color, teamId: t.id, projectId: null, channel: null })),
  ];

  const addWithCtx = (v) =>
    api.addTodo({
      title: v,
      date,
      kind,
      teamId: ctx ? ctx.teamId : null,
      projectId: ctx ? ctx.projectId : null,
      channel: ctx ? ctx.channel : null,
    });

  const submit = () => {
    const v = text.trim();
    if (!v) return;
    // 팀/프로젝트(콘텐츠는 채널) 이름을 입력하면 그 그룹으로 전환 (데스크톱과 동일한 흐름)
    const g = resolveGroup(v, kind, db);
    if (g) setCtx(g);
    else addWithCtx(v);
    setText('');
  };

  // 클립보드 붙여넣기 — 여러 줄이면 줄마다 추가, 그룹 이름 줄은 그룹 전환 (데스크톱 pasteLines와 동일)
  const pasteClip = async () => {
    const t = ((await Clipboard.getStringAsync()) || '').replace(/\r/g, '');
    if (!t.trim()) return;
    if (t.includes('\n')) {
      const last = pasteLines(t, { date, kind, db, ctx, add: api.addTodo, firstPrefix: text });
      setCtx(last || null);
      setText('');
    } else {
      setText((text + t).trim());
    }
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

      {/* 입력 줄 — 그룹 칩 + 텍스트 + 붙여넣기 */}
      <View style={styles.inputRow}>
        <Text style={{ color: focused ? T.accent : 'rgba(148,163,184,0.7)', fontSize: 15, width: 20, textAlign: 'center' }}>
          ＋
        </Text>
        {ctx && (
          <PressScale haptic onPress={() => setCtx(null)}>
            <View style={[styles.ctxChip, { borderColor: ctx.color }]}>
              <TeamDot color={ctx.color} />
              <Text style={{ fontSize: 11, color: T.text, fontWeight: '600' }}>{ctx.label}</Text>
              <Text style={{ fontSize: 10, color: T.muted }}>✕</Text>
            </View>
          </PressScale>
        )}
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
        {focused && (
          <PressScale haptic onPress={pasteClip}>
            <Text style={{ fontSize: 15, paddingHorizontal: 6 }}>📋</Text>
          </PressScale>
        )}
      </View>
      {focused && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="always" style={{ marginLeft: 20 }}>
          <View style={{ flexDirection: 'row', gap: 5, paddingVertical: 4 }}>
            {sugs.length > 0
              ? sugs.map((g) => (
                  <GroupChip
                    key={g.label}
                    group={g}
                    accent
                    onPress={() => {
                      setCtx(g);
                      setText('');
                    }}
                  />
                ))
              : quicks.map((g) => (
                  <GroupChip
                    key={g.label}
                    group={g}
                    active={!!ctx && ctx.label === g.label}
                    onPress={() => setCtx(ctx && ctx.label === g.label ? null : g)}
                  />
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

  const pickableProjects = db.projects.filter((p) => p.status !== 'done');
  const selProj = db.projects.find((p) => p.id === todo.projectId);
  const inheritedTeam = selProj && selProj.teamId ? db.teams.find((t) => t.id === selProj.teamId) : null;

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
                  <GhostButton label="미정" onPress={() => setDate('')} />
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

                {todo.kind !== 'content' && pickableProjects.length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={{ flexDirection: 'row', gap: 5 }}>
                      <GroupChip
                        group={{ label: '프로젝트 없음', color: T.muted }}
                        active={!todo.projectId}
                        onPress={() => api.updateTodo(todo.id, { projectId: null })}
                      />
                      {pickableProjects.map((p) => {
                        const team = db.teams.find((t) => t.id === p.teamId);
                        return (
                          <GroupChip
                            key={p.id}
                            group={{ label: p.name, color: team ? team.color : '#94a3b8' }}
                            active={todo.projectId === p.id}
                            onPress={() => api.updateTodo(todo.id, { projectId: todo.projectId === p.id ? null : p.id })}
                          />
                        );
                      })}
                    </View>
                  </ScrollView>
                )}

                {inheritedTeam ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <TeamDot color={inheritedTeam.color} />
                    <Text style={{ fontSize: 12, color: T.muted }}>
                      팀: {inheritedTeam.name} ({selProj.name} 프로젝트 따라감)
                    </Text>
                  </View>
                ) : (
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
                )}

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

/* 월 캘린더 뷰 (데스크톱 MonthView와 동일한 규칙) */
function MonthView({ db, kind, ym, setYm, openDay }) {
  const today = todayStr();
  const first = new Date(ym.y, ym.m, 1);
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(localDateStr(new Date(ym.y, ym.m, d)));
  while (cells.length % 7 !== 0) cells.push(null);

  const byDate = {};
  for (const t of db.todos) {
    if (t.kind !== kind || t.status === 'bucket' || !t.date) continue;
    (byDate[t.date] = byDate[t.date] || []).push(t);
  }

  const move = (n) => {
    const d = new Date(ym.y, ym.m + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  const chip = (t) => {
    const hl = importantHighlight(t, db);
    let edge = '#cbd5e1';
    if (kind === 'content') edge = channelColor(t.channel);
    else {
      const team = db.teams.find((x) => x.id === effectiveTeamId(t, db));
      if (team) edge = team.color;
    }
    return (
      <View key={t.id} style={[styles.calChip, { borderLeftColor: edge }, hl && { backgroundColor: hl + '22' }]}>
        <Text
          numberOfLines={1}
          style={[styles.calChipText, t.status === 'done' && { color: T.muted, textDecorationLine: 'line-through' }]}
        >
          {t.title}
        </Text>
      </View>
    );
  };

  return (
    <View>
      <View style={styles.calNav}>
        <GhostButton label="◀" onPress={() => move(-1)} />
        <Text style={styles.calTitle}>
          {ym.y}년 {ym.m + 1}월
        </Text>
        <GhostButton label="▶" onPress={() => move(1)} />
        <View style={{ flex: 1 }} />
        <GhostButton
          label="이번 달"
          onPress={() => {
            const d = new Date();
            setYm({ y: d.getFullYear(), m: d.getMonth() });
          }}
        />
      </View>
      <View style={styles.calGrid}>
        {['일', '월', '화', '수', '목', '금', '토'].map((w, i) => (
          <View key={w} style={styles.calCell}>
            <Text style={[styles.calDow, i === 0 && { color: '#e11d48' }, i === 6 && { color: '#4f6ef7' }]}>{w}</Text>
          </View>
        ))}
        {cells.map((date, i) => {
          const list = date ? byDate[date] || [] : [];
          const isToday = date === today;
          return (
            <Pressable key={i} onPress={() => date && openDay(date)} style={[styles.calCell, styles.calDayCell, isToday && styles.calToday]}>
              {date && (
                <View style={[styles.calDayNum, isToday && { backgroundColor: T.accent }]}>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: isToday ? '#fff' : T.muted }}>
                    {Number(date.slice(8))}
                  </Text>
                </View>
              )}
              {list.slice(0, 3).map(chip)}
              {list.length > 3 && <Text style={styles.calMore}>+{list.length - 3}</Text>}
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.calDesc}>날짜를 누르면 그 날의 리스트로 이동합니다.</Text>
    </View>
  );
}

export default function Board({ kind }) {
  const { db, api } = useDb();
  const [editing, setEditing] = useState(null);
  // 할 일은 일(리스트) 보기, 콘텐츠 캘린더는 월 보기가 기본 — 데스크톱과 동일
  const [view, setView] = useState(kind === 'content' ? 'month' : 'list');
  const [showUndated, setShowUndated] = useState(false);
  const [range, setRange] = useState({ start: -PAST, end: FUTURE });
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const today = todayStr();
  const scrollRef = useRef(null);
  const yMap = useRef({});
  const pendingScroll = useRef(today); // 이 날짜의 레이아웃이 잡히면 그 위치로 스크롤
  const busy = useRef(false);

  useEffect(() => {
    busy.current = false;
  }, [range.start, range.end]);

  const dates = useMemo(() => {
    const out = [];
    for (let i = range.start; i <= range.end; i++) out.push(addDays(today, i));
    return out;
  }, [today, range.start, range.end]);

  const offsetFromToday = (dateStr) => {
    const a = dateParts(today);
    const b = dateParts(dateStr);
    return Math.round((new Date(b.y, b.m - 1, b.d) - new Date(a.y, a.m - 1, a.d)) / 864e5);
  };

  const undated = db.todos
    .filter((t) => !t.date && t.status !== 'bucket' && t.kind === kind)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

  // 월 뷰에서 날짜를 누르면 리스트의 그 날짜로
  const openDay = (date) => {
    const off = offsetFromToday(date);
    setRange((r) => ({ start: Math.min(r.start, off - 7), end: Math.max(r.end, off + 14) }));
    pendingScroll.current = date;
    setView('list');
  };

  const toList = () => {
    if (view === 'list') return;
    pendingScroll.current = today;
    setView('list');
  };

  const goToday = () => {
    if (view === 'month') {
      const d = new Date();
      setYm({ y: d.getFullYear(), m: d.getMonth() });
    } else if (scrollRef.current && yMap.current[today] != null) {
      scrollRef.current.scrollTo({ y: Math.max(0, yMap.current[today] - 6), animated: true });
    }
  };

  // 무한 스크롤: 위/아래 근처에서 날짜 범위 확장 (위쪽은 maintainVisibleContentPosition이 위치 보정)
  const onScroll = (e) => {
    if (busy.current) return;
    const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
    if (contentOffset.y + layoutMeasurement.height > contentSize.height - 900) {
      busy.current = true;
      setRange((r) => ({ ...r, end: r.end + 21 }));
    } else if (contentOffset.y < 400) {
      busy.current = true;
      setRange((r) => ({ ...r, start: r.start - 21 }));
    }
  };

  const editingTodo = editing ? db.todos.find((t) => t.id === editing) : null;

  return (
    <View style={{ flex: 1 }}>
      {/* 툴바 — 일/월 전환, 날짜 미정 */}
      <View style={styles.toolbar}>
        <View style={styles.viewToggle}>
          <PressScale haptic onPress={toList}>
            <View style={[styles.togBtn, view === 'list' && styles.togOn]}>
              <Text style={[styles.togText, view === 'list' && styles.togTextOn]}>일</Text>
            </View>
          </PressScale>
          <PressScale haptic onPress={() => setView('month')}>
            <View style={[styles.togBtn, view === 'month' && styles.togOn]}>
              <Text style={[styles.togText, view === 'month' && styles.togTextOn]}>월</Text>
            </View>
          </PressScale>
        </View>
        {view === 'list' && undated.length > 0 && (
          <GhostButton
            label={`날짜 미정 ${undated.length}`}
            onPress={() => setShowUndated(!showUndated)}
            style={showUndated && { borderColor: T.accent, backgroundColor: 'rgba(255,255,255,0.85)' }}
          />
        )}
      </View>

      {view === 'month' ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}>
          <MonthView db={db} kind={kind} ym={ym} setYm={setYm} openDay={openDay} />
        </ScrollView>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          keyboardShouldPersistTaps="handled"
          onScroll={onScroll}
          scrollEventThrottle={64}
          maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
        >
          {showUndated && (
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.undatedTitle}>날짜 미정</Text>
              {undated.length === 0 && <EmptyNote>날짜 미정 항목이 없습니다.</EmptyNote>}
              {undated.map((t) => (
                <Line key={t.id} todo={t} db={db} api={api} onOpen={() => setEditing(t.id)} />
              ))}
            </View>
          )}
          {dates.map((date) => (
            <View
              key={date}
              onLayout={(e) => {
                yMap.current[date] = e.nativeEvent.layout.y;
                if (pendingScroll.current === date && scrollRef.current) {
                  pendingScroll.current = null;
                  const y = Math.max(0, e.nativeEvent.layout.y - 6);
                  requestAnimationFrame(() => scrollRef.current && scrollRef.current.scrollTo({ y, animated: false }));
                }
              }}
            >
              <DaySection date={date} kind={kind} db={db} api={api} isToday={date === today} onOpen={(t) => setEditing(t.id)} />
            </View>
          ))}
        </ScrollView>
      )}

      {/* 오늘로 점프 FAB */}
      <PressScale haptic onPress={goToday} style={styles.fab}>
        <View style={[styles.fabInner, shadow(2)]}>
          <Text style={styles.fabText}>◎ 오늘</Text>
        </View>
      </PressScale>

      {editingTodo && <Editor todo={editingTodo} db={db} api={api} onClose={() => setEditing(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 4,
  },
  viewToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: 'rgba(255,255,255,0.45)',
    padding: 2,
    gap: 2,
  },
  togBtn: { paddingHorizontal: 14, paddingVertical: 5, borderRadius: 10 },
  togOn: { backgroundColor: 'rgba(255,255,255,0.95)', ...shadow(1) },
  togText: { fontSize: 13, color: T.muted },
  togTextOn: { color: T.accent, fontWeight: '700' },
  undatedTitle: { fontSize: 13, fontWeight: '700', color: T.muted, marginTop: 8, marginBottom: 4 },
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
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2, gap: 4 },
  input: { flex: 1, fontSize: 15, color: T.text, paddingVertical: 6 },
  ctxChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(255,255,255,0.8)',
  },
  gchip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: 'rgba(255,255,255,0.5)',
    borderRadius: 99,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  gchipText: { fontSize: 12, color: T.muted },
  gchipHint: { fontSize: 9, color: T.accent, fontWeight: '700' },
  calNav: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  calTitle: { fontSize: 15, fontWeight: '800', color: T.text, letterSpacing: -0.3 },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100 / 7}%`, alignItems: 'stretch', padding: 1.5 },
  calDow: { fontSize: 11, fontWeight: '700', color: T.muted, textAlign: 'center', paddingVertical: 4 },
  calDayCell: {
    minHeight: 78,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.35)',
    padding: 3,
    gap: 2,
  },
  calToday: {
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderColor: T.accent,
    ...shadow(1),
  },
  calDayNum: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  calChip: {
    borderLeftWidth: 3,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.7)',
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  calChipText: { fontSize: 8.5, color: T.text },
  calMore: { fontSize: 8.5, color: T.muted, paddingLeft: 2 },
  calDesc: { fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 10 },
  fab: { position: 'absolute', right: 16, bottom: 100 },
  fabInner: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: T.glassEdge,
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  fabText: { fontSize: 13, fontWeight: '700', color: T.accent },
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
