import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Text } from '../text.js';
import { useDesign, Button } from '../design.js';
import { todayStr, localDateStr } from '../util.js';
import { spanPatch } from '../../../shared/multi-day.js';
import { toRange, fromRange, tickStep, snapStep, snap, fitZoom, clampZoom, tickLabel, wobble, dayOf, DAY, HOUR } from '../../../shared/schedule-span.js';

/*
 * The schedule card on the phone (as on PC: desktop/src/ScheduleCard.jsx): tapping a line's time or calendar
 * unfolds this glass card right under it —
 *   - the timeline banner: days and hours, the to-do a bar whose two ends are dragged to set its start and end (the bar
 *     itself moves the whole span); pulling an end to the edge zooms out, going back and forth quickly zooms in,
 *     pinching zooms, dragging the empty strip pans.
 *   - a month calendar: tap the first day, then the last.
 *   - start / end times, "시간 없음", ↻ 반복. Nothing changes until 저장.
 */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const EDGE = 0.86, H = 84;

function Banner({ range, setRange }) {
  const d = useDesign(), [width, setWidth] = useState(320);
  const [view, setView] = useState(() => ({ zoom: clampZoom(fitZoom(range, 320)), center: (range.start + range.end) / 2 }));
  const live = useRef({}); live.current = { range, view, width };
  const fitted = useRef(false), drag = useRef(null);
  const viewStart = view.center - (width / 2) * view.zoom, toX = (ms) => (ms - viewStart) / view.zoom;
  const { tick, label } = tickStep(view.zoom);
  const ticks = [];
  for (let t = snap(viewStart, tick) - tick; t <= viewStart + width * view.zoom + tick; t += tick) {
    const dt = new Date(t), midnight = dt.getHours() === 0 && dt.getMinutes() === 0;
    ticks.push({ t, x: toX(t), major: midnight, label: t - snap(t, label) === 0 && !midnight });
  }
  const days = [];
  for (let t = snap(viewStart, DAY) - DAY; t <= viewStart + width * view.zoom; t += DAY) days.push({ t, x: Math.max(0, toX(t)), day: dayOf(t) });

  const begin = (part) => (e) => { const L = live.current; drag.current = { part, x0: e.absoluteX, r0: L.range, c0: L.view.center, w: { x: e.absoluteX }, step: null }; };
  const update = (e) => {
    const g = drag.current; if (!g) return;
    const { range: r, view: v, width: w } = live.current, x = e.x;
    if (g.part === 'pan') { setView({ ...v, center: g.c0 - (e.absoluteX - g.x0) * v.zoom }); return; }
    g.w = wobble(g.w, e.absoluteX, Date.now());
    let zoom = v.zoom, center = v.center;
    const toMs = (px) => center - (w / 2) * zoom + px * zoom;
    if (g.w.zoomIn) { const at = toMs(x); zoom = clampZoom(zoom / 1.6); center = at - (x - w / 2) * zoom; Haptics.selectionAsync().catch(() => {}); }
    if ((g.part === 'end' && x > w * EDGE) || (g.part === 'start' && x < w * (1 - EDGE))) {
      const fixed = g.part === 'end' ? r.start : r.end; zoom = clampZoom(zoom * 1.05); center = fixed + (center - fixed) * 1.05;
    }
    if (zoom !== v.zoom || center !== v.center) setView({ zoom, center });
    const step = snapStep(zoom, r.timed), ms = center - (w / 2) * zoom + x * zoom;
    let next = r;
    if (g.part === 'body') { const shift = snap(g.r0.start + (e.absoluteX - g.x0) * zoom, step) - g.r0.start; next = { ...r, start: g.r0.start + shift, end: g.r0.end + shift }; }
    else if (g.part === 'start') next = { ...r, start: Math.min(snap(ms, step), r.end - step) };
    else next = { ...r, end: Math.max(snap(ms, step), r.start + step) };
    if (next.start !== r.start || next.end !== r.end) { if (step <= HOUR) Haptics.selectionAsync().catch(() => {}); setRange(next); }
  };
  const end = () => { drag.current = null; };
  // x in the banner's own coordinates: the handles report their own, so they convert through the banner's left edge.
  const origin = useRef(0);
  const pan = (part) => Gesture.Pan().minDistance(0).runOnJS(true)
    .onBegin(begin(part)).onUpdate((e) => update({ ...e, x: e.absoluteX - origin.current })).onFinalize(end);
  const pinch = Gesture.Pinch().runOnJS(true).onUpdate((e) => {
    const { view: v } = live.current; setView({ ...v, zoom: clampZoom(v.zoom / Math.max(0.85, Math.min(1.18, e.scaleChange || 1))) });
  });
  const strip = Gesture.Simultaneous(pan('pan'), pinch);
  const box = useRef(null);
  const left = toX(range.start), right = toX(range.end);
  const f = fromRange(range), barText = range.timed ? `${f.startTime} – ${f.endTime}` : '종일';
  return <GestureDetector gesture={strip}>
    <View ref={box} collapsable={false} onLayout={(e) => {
      const w = e.nativeEvent.layout.width; setWidth(w);
      box.current?.measureInWindow?.((x) => { origin.current = x; });
      if (!fitted.current) { fitted.current = true; setView((v) => ({ ...v, zoom: clampZoom(fitZoom(range, w)) })); }
    }} style={{ height: H, borderRadius: 16, overflow: 'hidden', backgroundColor: '#ffffff12', borderWidth: 1, borderColor: d.edge }}>
      {days.map((x) => <Text key={x.t} style={{ position: 'absolute', top: 6, left: x.x, paddingLeft: 5, borderLeftWidth: 1, borderLeftColor: '#ffffff73', fontSize: 11, fontWeight: '700', color: x.day === todayStr() ? d.accent : d.text }}>{Number(x.day.slice(5, 7))}/{Number(x.day.slice(8))} {DOW[new Date(x.t).getDay()]}</Text>)}
      {ticks.map((k) => <View key={k.t} pointerEvents="none" style={{ position: 'absolute', left: k.x, top: k.major ? 0 : 30, bottom: 0, width: 1, backgroundColor: k.major ? '#ffffff8c' : k.label ? '#ffffff4d' : '#ffffff24' }}>
        {k.label && <Text style={{ position: 'absolute', top: -2, left: 3, width: 44, fontSize: 9, color: d.muted }}>{tickLabel(k.t)}</Text>}
      </View>)}
      <GestureDetector gesture={pan('body')}>
        <View style={{ position: 'absolute', top: 48, height: 26, left, width: Math.max(6, right - left), borderRadius: 13, backgroundColor: d.accent + 'c8', alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 14 }}>{barText}</Text>
          <GestureDetector gesture={pan('start')}><View hitSlop={14} style={{ position: 'absolute', left: -8, top: -6, bottom: -6, width: 16, borderRadius: 8, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }} /></GestureDetector>
          <GestureDetector gesture={pan('end')}><View hitSlop={14} style={{ position: 'absolute', right: -8, top: -6, bottom: -6, width: 16, borderRadius: 8, backgroundColor: '#fff', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }} /></GestureDetector>
        </View>
      </GestureDetector>
    </View>
  </GestureDetector>;
}

function RangeCalendar({ range, setRange }) {
  const d = useDesign(), startDay = dayOf(range.start), lastDay = dayOf(range.end - 1);
  const [ym, setYm] = useState(() => { const [y, m] = startDay.split('-').map(Number); return { y, m: m - 1 }; });
  const [picking, setPicking] = useState(false);
  const first = new Date(ym.y, ym.m, 1), count = new Date(ym.y, ym.m + 1, 0).getDate(), today = todayStr();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: count }, (_, i) => localDateStr(new Date(ym.y, ym.m, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const shiftTo = (day, ms) => { const t = new Date(ms), [y, m, dd] = day.split('-').map(Number); return new Date(y, m - 1, dd, t.getHours(), t.getMinutes()).getTime(); };
  const pick = (day) => {
    Haptics.selectionAsync().catch(() => {});
    if (!picking) {
      const start = shiftTo(day, range.start);
      let end = range.timed ? shiftTo(day, range.end) : start + DAY; if (end <= start) end += DAY;
      setRange({ ...range, start, end }); setPicking(true);
    } else {
      let a = startDay, b = day; if (b < a) [a, b] = [b, a];
      const [by, bm, bd] = b.split('-').map(Number), start = shiftTo(a, range.start);
      const end = range.timed ? shiftTo(b, range.end) : new Date(by, bm - 1, bd).getTime() + DAY;
      setRange({ ...range, start, end: end > start ? end : start + HOUR }); setPicking(false);
    }
  };
  const move = (n) => { const x = new Date(ym.y, ym.m + n, 1); setYm({ y: x.getFullYear(), m: x.getMonth() }); };
  return <View style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable accessibilityLabel="이전 달" hitSlop={10} onPress={() => move(-1)}><Text style={{ color: d.muted, padding: 6 }}>◀</Text></Pressable>
      <Text style={{ color: d.text, fontWeight: '700' }}>{ym.y}년 {ym.m + 1}월</Text>
      <Pressable accessibilityLabel="다음 달" hitSlop={10} onPress={() => move(1)}><Text style={{ color: d.muted, padding: 6 }}>▶</Text></Pressable>
    </View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
      {DOW.map((w, i) => <Text key={w} style={{ width: `${100 / 7}%`, textAlign: 'center', fontSize: 11, color: i === 0 ? '#e11d48' : i === 6 ? '#4f6ef7' : d.muted }}>{w}</Text>)}
      {cells.map((day, i) => {
        if (!day) return <View key={'b' + i} style={{ width: `${100 / 7}%`, height: 36 }} />;
        const edge = day === startDay || day === lastDay, inside = day > startDay && day < lastDay;
        return <Pressable key={day} accessibilityLabel={`${Number(day.slice(5, 7))}월 ${Number(day.slice(8))}일`} accessibilityState={{ selected: edge || inside }} onPress={() => pick(day)}
          style={{ width: `${100 / 7}%`, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: inside ? d.accent + '29' : 'transparent' }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: edge ? d.accent : 'transparent', borderWidth: day === today && !edge ? 1 : 0, borderColor: d.accent }}>
            <Text style={{ color: edge ? '#fff' : d.text, fontWeight: edge ? '700' : '400' }}>{Number(day.slice(8))}</Text>
          </View>
        </Pressable>;
      })}
    </View>
    <Text style={{ textAlign: 'center', fontSize: 11, color: d.muted }}>{picking ? '마지막 날을 눌러요 (같은 날이면 하루)' : startDay === lastDay ? '하루 · 날짜를 눌러 바꿔요' : `${Number(startDay.slice(5, 7))}/${Number(startDay.slice(8))} – ${Number(lastDay.slice(5, 7))}/${Number(lastDay.slice(8))} · ${Math.round((new Date(lastDay) - new Date(startDay)) / DAY) + 1}일`}</Text>
  </View>;
}

function TimePick({ label, value, onPick }) {
  const d = useDesign(), [open, setOpen] = useState(false);
  const date = useMemo(() => { const [h, m] = (value && value !== '24:00' ? value : '09:00').split(':').map(Number); const x = new Date(); x.setHours(h, m, 0, 0); return x; }, [value]);
  const done = (e, v) => { if (Platform.OS === 'android') setOpen(false); if (v && e.type !== 'dismissed') onPick(`${String(v.getHours()).padStart(2, '0')}:${String(v.getMinutes()).padStart(2, '0')}`); };
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <Text style={{ width: 32, color: d.muted, fontSize: 13 }}>{label}</Text>
    {Platform.OS === 'ios' ? <DateTimePicker value={date} mode="time" display="compact" minuteInterval={5} accentColor={d.accent} onChange={done} />
      : <><Button title={value || '--:--'} onPress={() => setOpen(true)} />{open && <DateTimePicker value={date} mode="time" minuteInterval={5} onChange={done} />}</>}
    {!value && Platform.OS === 'ios' && <Text style={{ color: d.muted, fontSize: 12 }}>(시간 없음)</Text>}
  </View>;
}

export default function ScheduleCard({ todo, api, onRepeat, onClose }) {
  const d = useDesign(), [range, setRange] = useState(() => toRange(todo, todayStr()));
  const fields = useMemo(() => fromRange(range), [range]);
  // Unfolds to its measured height, then follows its content (the calendar month can grow a row).
  const unfold = useRef(new Animated.Value(0)).current, [height, setHeight] = useState(0), [open, setOpen] = useState(false);
  useEffect(() => { if (height) Animated.timing(unfold, { toValue: 1, duration: 480, easing: Easing.bezier(0.2, 0.85, 0.25, 1), useNativeDriver: false }).start(() => setOpen(true)); }, [height]);
  const setTime = (which, hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    if (which === 'start') {
      const s = new Date(range.start); s.setHours(h, m, 0, 0); const start = s.getTime();
      setRange({ start, end: range.timed ? Math.max(range.end, start + 15 * 60_000) : start + HOUR, timed: true });
    } else {
      const last = new Date(range.timed ? range.end - 1 : range.end - DAY); last.setHours(h, m, 0, 0);
      let end = last.getTime(); const start = range.timed ? range.start : (() => { const s = new Date(range.start); s.setHours(9, 0, 0, 0); return s.getTime(); })();
      if (end <= start) end += DAY;
      setRange({ start, end, timed: true });
    }
  };
  const untimed = () => { const s = new Date(range.start); s.setHours(0, 0, 0, 0); const e = new Date(range.end - 1); e.setHours(0, 0, 0, 0); setRange({ start: s.getTime(), end: e.getTime() + DAY, timed: false }); };
  const save = () => { api.updateTodo(todo.id, spanPatch(todo, fields)); onClose(); };
  return <Animated.View style={{ overflow: 'hidden', marginTop: 2, marginBottom: 10, height: open ? undefined : height ? unfold.interpolate({ inputRange: [0, 1], outputRange: [0, height] }) : 1, opacity: open ? 1 : unfold }}>
    <View onLayout={(e) => { if (!height) setHeight(e.nativeEvent.layout.height); }} style={{ position: open ? 'relative' : 'absolute', left: 0, right: 0, gap: 12, padding: 14, borderRadius: 22, borderWidth: 1, borderColor: d.edge, backgroundColor: '#eef2ffd9' }}>
      <Banner range={range} setRange={setRange} />
      <RangeCalendar range={range} setRange={setRange} />
      <TimePick label="시작" value={range.timed ? fields.startTime : null} onPick={(v) => setTime('start', v)} />
      <TimePick label="종료" value={range.timed ? fields.endTime : null} onPick={(v) => setTime('end', v)} />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} title={range.timed ? '시간 없음' : '✓ 시간 없음'} onPress={untimed} />
        <Button style={{ flex: 1 }} title="↻ 반복" onPress={() => onRepeat?.(todo)} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}><Button style={{ flex: 1 }} title="취소" onPress={onClose} /><Button style={{ flex: 1 }} primary title="저장" onPress={save} /></View>
    </View>
  </Animated.View>;
}
