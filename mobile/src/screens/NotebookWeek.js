import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text } from '../text.js';
import { useDesign } from '../design.js';
import { addDays, todayStr, effectiveTeamId } from '../util.js';
import { teamSort } from '../../../shared/todo-drop.js';

// Week view between 일 and 월: seven rows (Sunday first), the date on the left and that day's to-dos
// wrapping beside it — timed ones first with their time. Tapping a day opens it in the 일 view.
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const parts = (date) => { const [y, m, d] = date.split('-').map(Number); return { y, m, d, dow: new Date(y, m - 1, d).getDay() }; };

export default function WeekView({ db, weekOf, setWeekOf, openDay, toggle }) {
  const T = useDesign(), today = todayStr();
  const start = addDays(weekOf, -parts(weekOf).dow);
  const days = DOW.map((_, i) => addDays(start, i));
  const a = parts(days[0]), b = parts(days[6]);
  const nav = (label, onPress, name) => <Pressable accessibilityRole="button" accessibilityLabel={name || label} onPress={onPress} style={{ paddingHorizontal: 10, paddingVertical: 7 }}><Text style={{ fontSize: 13, color: T.muted }}>{label}</Text></Pressable>;
  return <View>
    <View style={styles.nav}>
      {nav('◀', () => setWeekOf(addDays(start, -7)), '지난주')}
      <Text style={[styles.title, { color: T.text }]}>{a.m}월 {a.d}일 – {b.m !== a.m ? `${b.m}월 ` : ''}{b.d}일</Text>
      {nav('▶', () => setWeekOf(addDays(start, 7)), '다음 주')}
      {/* 일 · 주 · 월 (◎ 오늘 at the bottom brings back this week) */}
      {toggle}
    </View>
    <View style={{ gap: 5 }}>
      {days.map((date, i) => {
        const isToday = date === today;
        const list = db.todos.filter((t) => t.date === date && t.status !== 'bucket').sort(teamSort(db)); // grouped by team
        return <Pressable key={date} accessibilityLabel={`${parts(date).m}월 ${parts(date).d}일`} onPress={() => openDay(date)}
          style={[styles.day, { backgroundColor: isToday ? T.input : T.fill, borderColor: isToday ? T.accent : 'transparent' }]}>
          <View style={styles.head}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: isToday ? T.accent : i === 0 ? '#e11d48' : i === 6 ? '#4f6ef7' : T.muted }}>{DOW[i]}</Text>
            <Text style={{ fontSize: 16, fontWeight: '700', color: isToday ? T.accent : T.text }}>{parts(date).d}</Text>
          </View>
          <View style={styles.chips}>
            {list.map((t) => {
              const team = db.teams.find((x) => x.id === effectiveTeamId(t, db));
              const done = t.status === 'done';
              return <View key={t.id} style={[styles.chip, { borderLeftColor: team?.color || '#cbd5e1', backgroundColor: T.input }]}>
                {!!t.startTime && <Text style={{ fontSize: 10.5, fontWeight: '700', color: T.accent }}>{t.startTime}</Text>}
                <Text style={{ fontSize: 12, color: done ? T.muted : T.text, textDecorationLine: done ? 'line-through' : 'none', flexShrink: 1 }}>{t.title}</Text>
              </View>;
            })}
          </View>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  title: { fontSize: 15, fontWeight: '800', letterSpacing: -0.3 },
  day: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 8, borderRadius: 12, borderWidth: 1, minHeight: 48 },
  head: { width: 30, alignItems: 'center' },
  chips: { flex: 1, minWidth: 0, flexDirection: 'row', flexWrap: 'wrap', gap: 4, paddingTop: 2 },
  chip: { flexDirection: 'row', alignItems: 'baseline', gap: 4, maxWidth: '100%', borderLeftWidth: 3, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
});
