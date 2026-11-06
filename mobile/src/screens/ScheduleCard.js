import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Platform, Pressable, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as Haptics from 'expo-haptics';
import { Text } from '../text.js';
import { useDesign, Button } from '../design.js';
import { todayStr, localDateStr } from '../util.js';
import { spanPatch } from '../../../shared/multi-day.js';
import { toRange, fromRange, tickStep, snapStep, snap, fitZoom, clampZoom, tickLabel, magnet, swing, dayOf, DAY, HOUR } from '../../../shared/schedule-span.js';

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

// Same behaviour as the PC banner (desktop/src/ScheduleCard.jsx): handles follow the finger to the minute (sticking to
// round times only right next to them, settling on one when let go), holding a handle near an edge slides and zooms
// out every frame, three quick swings zoom in (eased), the bar moves the span, the empty strip pans (gliding a little
// after), pinching zooms. An end scrolled out of view stays at the edge so it can always be grabbed.
function Banner({ range, setRange }) {
  const d = useDesign(), [width, setWidth] = useState(320);
  const [view, setView] = useState(() => ({ zoom: clampZoom(fitZoom(range, 320)), center: (range.start + range.end) / 2 }));
  const v = useRef(view), r = useRef(range), w = useRef(width), drag = useRef(null), raf = useRef(0), glide = useRef(0), fitted = useRef(false), box = useRef(null), origin = useRef(0);
  v.current = view; r.current = range; w.current = width;
  useEffect(() => () => { cancelAnimationFrame(raf.current); cancelAnimationFrame(glide.current); }, []);
  const vs = view.center - (width / 2) * view.zoom, toX = (ms) => (ms - vs) / view.zoom;
  const { tick, label } = tickStep(view.zoom);
  const ticks = [];
  for (let t = snap(vs, tick) - tick; t <= vs + width * view.zoom + tick; t += tick) {
    const dt = new Date(t), midnight = dt.getHours() === 0 && dt.getMinutes() === 0;
    ticks.push({ t, x: toX(t), major: midnight, label: t - snap(t, label) === 0 && !midnight });
  }
  const days = [];
  for (let t = snap(vs, DAY) - DAY; t <= vs + width * view.zoom; t += DAY) days.push({ t, x: Math.max(0, toX(t)), day: dayOf(t) });
  const dayNames = days.filter((x, i) => (days[i + 1]?.x ?? Infinity) - x.x > 58);

  const frame = (now) => {
    const g = drag.current; if (!g || (g.part !== 'start' && g.part !== 'end')) return;
    const dt = Math.min(0.05, (now - (g.t || now)) / 1000); g.t = now;
    let { zoom, center } = v.current; const W = w.current, x = g.x;
    const depth = g.part === 'end' ? (x - W * EDGE) / (W * (1 - EDGE)) : (W * (1 - EDGE) - x) / (W * (1 - EDGE));
    if (depth > 0) {
      const k = Math.min(1.4, depth), fixed = g.part === 'end' ? r.current.start : r.current.end, prev = zoom;
      zoom = clampZoom(zoom * (1 + 0.9 * k * dt));
      center = fixed + (center - fixed) * (zoom / prev) + (g.part === 'end' ? 1 : -1) * k * 90 * dt * zoom;
    }
    if (g.zoomTo) {
      const at = center - (W / 2) * zoom + x * zoom, next = zoom + (g.zoomTo - zoom) * Math.min(1, dt * 14);
      zoom = Math.abs(next - g.zoomTo) < g.zoomTo * 0.01 ? g.zoomTo : next; center = at - (x - W / 2) * zoom;
      if (zoom === g.zoomTo) g.zoomTo = null;
    }
    if (zoom !== v.current.zoom || center !== v.current.center) { v.current = { zoom, center }; setView(v.current); }
    const ms = magnet(center - (W / 2) * zoom + x * zoom, zoom, r.current.timed), min = 5 * 60_000;
    const next = g.part === 'start' ? { ...r.current, start: Math.min(ms, r.current.end - min) } : { ...r.current, end: Math.max(ms, r.current.start + min) };
    if (next.start !== r.current.start || next.end !== r.current.end) {
      if (snapStep(zoom, next.timed) <= HOUR && snap(next[g.part], snapStep(zoom, next.timed)) === next[g.part]) Haptics.selectionAsync().catch(() => {});
      r.current = next; setRange(next);
    }
    raf.current = requestAnimationFrame(frame);
  };
  const begin = (part) => (e) => {
    cancelAnimationFrame(glide.current);
    drag.current = { part, x: e.absoluteX - origin.current, x0: e.absoluteX, r0: r.current, c0: v.current.center, swing: {}, last: [{ x: e.absoluteX, t: Date.now() }] };
    if (part === 'start' || part === 'end') { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); raf.current = requestAnimationFrame(frame); }
  };
  const update = (e) => {
    const g = drag.current; if (!g) return;
    g.x = e.absoluteX - origin.current;
    const { zoom } = v.current;
    if (g.part === 'pan') { g.last = [...g.last.slice(-4), { x: e.absoluteX, t: Date.now() }]; v.current = { ...v.current, center: g.c0 - (e.absoluteX - g.x0) * zoom }; setView(v.current); return; }
    if (g.part === 'body') { const shift = magnet(g.r0.start + (e.absoluteX - g.x0) * zoom, zoom, g.r0.timed) - g.r0.start; r.current = { ...g.r0, start: g.r0.start + shift, end: g.r0.end + shift }; setRange(r.current); return; }
    const s = swing(g.swing, e.absoluteX, Date.now()); g.swing = s.state;
    if (s.zoomIn) { g.zoomTo = clampZoom(zoom / 1.8); Haptics.selectionAsync().catch(() => {}); }
  };
  const end = () => {
    const g = drag.current; drag.current = null; cancelAnimationFrame(raf.current);
    if (!g) return;
    if (g.part !== 'pan') {
      const step = snapStep(v.current.zoom, r.current.timed), cur = r.current;
      const settled = g.part === 'start' ? { ...cur, start: Math.min(snap(cur.start, step), cur.end - step) } : g.part === 'end' ? { ...cur, end: Math.max(snap(cur.end, step), cur.start + step) } : { ...cur, start: snap(cur.start, step), end: snap(cur.start, step) + (cur.end - cur.start) };
      r.current = settled; setRange(settled); return;
    }
    const [a, b] = [g.last[0], g.last.at(-1)], vel = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    let speed = vel * 16, prev = Date.now();
    const coast = () => {
      const now = Date.now(), dt = (now - prev) / 16; prev = now; speed *= Math.pow(0.9, dt);
      if (Math.abs(speed) < 0.3) return;
      v.current = { ...v.current, center: v.current.center - speed * dt * v.current.zoom }; setView(v.current);
      glide.current = requestAnimationFrame(coast);
    };
    if (Math.abs(speed) > 1) glide.current = requestAnimationFrame(coast);
  };
  const pan = (part) => Gesture.Pan().minDistance(0).runOnJS(true).onBegin(begin(part)).onUpdate(update).onFinalize(end);
  const pinch = Gesture.Pinch().runOnJS(true).onUpdate((e) => { const cur = v.current; v.current = { ...cur, zoom: clampZoom(cur.zoom / Math.max(0.85, Math.min(1.18, e.scaleChange || 1))) }; setView(v.current); });
  const strip = Gesture.Simultaneous(pan('pan'), pinch);
  const left = toX(range.start), right = toX(range.end), pin = (x) => Math.max(8, Math.min(width - 8, x));
  const barL = Math.max(-20, left), barR = Math.min(width + 20, right);
  const f = fromRange(range), barText = range.timed ? `${f.startTime} – ${f.endTime}` : '종일';
  const handle = (part, x, pinned) => <GestureDetector key={part} gesture={pan(part)}>
    <View hitSlop={16} style={{ position: 'absolute', top: 42, height: 38, width: 16, left: 0, transform: [{ translateX: pin(x) - 8 }], borderRadius: 8, backgroundColor: pinned ? d.accent : '#fff', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 4, elevation: 3 }}>
      {pinned ? <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>{part === 'start' ? '‹' : '›'}</Text> : <View style={{ width: 2, height: 14, borderRadius: 1, backgroundColor: d.accent, opacity: 0.6 }} />}
    </View>
  </GestureDetector>;
  return <GestureDetector gesture={strip}>
    <View ref={box} collapsable={false} onLayout={(e) => {
      const nw = e.nativeEvent.layout.width; setWidth(nw);
      box.current?.measureInWindow?.((x) => { origin.current = x; });
      if (!fitted.current) { fitted.current = true; v.current = { zoom: clampZoom(fitZoom(r.current, nw)), center: (r.current.start + r.current.end) / 2 }; setView(v.current); }
    }} style={{ height: H, borderRadius: 16, overflow: 'hidden', backgroundColor: '#ffffff12', borderWidth: 1, borderColor: d.edge }}>
      {dayNames.map((x) => <Text key={x.t} style={{ position: 'absolute', top: 6, left: x.x, paddingLeft: 5, borderLeftWidth: 1, borderLeftColor: '#ffffff73', fontSize: 11, fontWeight: '700', color: x.day === todayStr() ? d.accent : d.text }}>{Number(x.day.slice(5, 7))}/{Number(x.day.slice(8))} {DOW[new Date(x.t).getDay()]}</Text>)}
      {ticks.map((k) => <View key={k.t} pointerEvents="none" style={{ position: 'absolute', left: 0, transform: [{ translateX: k.x }], top: k.major ? 0 : 30, bottom: 0, width: 1, backgroundColor: k.major ? '#ffffff8c' : k.label ? '#ffffff4d' : '#ffffff24' }}>
        {k.label && <Text style={{ position: 'absolute', top: -2, left: 3, width: 44, fontSize: 9, color: d.muted }}>{tickLabel(k.t)}</Text>}
      </View>)}
      <GestureDetector gesture={pan('body')}>
        <View style={{ position: 'absolute', top: 48, height: 26, left: 0, transform: [{ translateX: barL }], width: Math.max(6, barR - barL), borderRadius: 13, backgroundColor: d.accent + 'c8', alignItems: 'center', justifyContent: 'center' }}>
          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 11, fontWeight: '700', paddingHorizontal: 14 }}>{barText}</Text>
        </View>
      </GestureDetector>
      {handle('start', left, left < 8)}
      {handle('end', right, right > width - 8)}
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
