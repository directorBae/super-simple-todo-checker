import { SourceIcons } from '../SourceIcons.js';
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useDesign } from '../design.js';
import { localDateStr, todayStr, effectiveTeamId, importantHighlight } from '../util.js';
import { shadow } from '../theme.js';
function GhostButton({label,onPress}) { const d=useDesign(); return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{paddingHorizontal:10,paddingVertical:7}}><Text style={{fontSize:13,color:d.muted}}>{label}</Text></Pressable>; }
export default function MonthView({ db, ym, setYm, openDay }) {
  const T=useDesign(), styles=makeStyles(T);
  const kind="todo";
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
    {
      const team = db.teams.find((x) => x.id === effectiveTeamId(t, db));
      if (team) edge = team.color;
    }
    return (
      <View key={t.id} style={[styles.calChip, { borderLeftColor: edge }, hl && { backgroundColor: hl + '22' }]}>
        <SourceIcons todo={t} size={9}/>
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
            <Pressable key={i} accessibilityLabel={date || '빈 날짜'} onPress={() => date && openDay(date)} style={[styles.calCell, styles.calDayCell, isToday && styles.calToday]}>
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

const makeStyles = T => StyleSheet.create({
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
    borderColor: T.edge,
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
    borderColor: T.edge,
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
    borderColor: T.edge,
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
    backgroundColor: T.fill,
    padding: 3,
    gap: 2,
  },
  calToday: {
    backgroundColor: T.input,
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
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderLeftWidth: 3,
    borderRadius: 3,
    backgroundColor: T.input,
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  calChipText: { flex: 1, minWidth: 0, fontSize: 8.5, color: T.text },
  calMore: { fontSize: 8.5, color: T.muted, paddingLeft: 2 },
  calDesc: { fontSize: 11, color: T.muted, textAlign: 'center', marginTop: 10 },
  fab: { position: 'absolute', right: 16, bottom: 100 },
  fabInner: {
    borderRadius: 99,
    borderWidth: 1,
    borderColor: T.edge,
    backgroundColor: T.input,
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
    borderColor: T.edge,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    color: T.text,
  },
});
