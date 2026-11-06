import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TimeField, RepeatEditor, repeatLabel } from './components.jsx';
import { todayStr, localDateStr } from './util.js';
import { spanPatch } from '../../shared/multi-day.js';
import { toRange, fromRange, tickStep, snapStep, snap, fitZoom, clampZoom, tickLabel, wobble, dayOf, DAY, HOUR } from '../../shared/schedule-span.js';

/*
 * The schedule card: clicking a to-do's time or 📅 unfolds this glass card under the line.
 *   - the timeline banner on top: days and hours finely laid out, the to-do a bar whose two ends are dragged to set
 *     when it starts and ends (the bar itself moves the whole span). Pulling an end toward the edge zooms out so the
 *     span keeps fitting; going back and forth quickly over a spot zooms in to find it exactly. The wheel zooms too,
 *     dragging the empty strip pans.
 *   - a month calendar below it: click the first day, then the last (one click on a day = a one-day to-do).
 *   - start / end times, "시간 없음", and the repeat (↻) control.
 * Nothing changes until 확정; a multi-day to-do is saved as one span (shared/multi-day.js shows it on every day).
 */
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const EDGE = 0.88;

function Banner({ range, setRange }) {
  const box = useRef(null), [width, setWidth] = useState(560);
  const [view, setView] = useState(() => ({ zoom: clampZoom(fitZoom(range, 560)), center: (range.start + range.end) / 2 }));
  const drag = useRef(null);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => { const w = el.clientWidth; setWidth(w); setView((v) => ({ ...v, zoom: v.fitted ? v.zoom : clampZoom(fitZoom(range, w)), fitted: true })); });
    ro.observe(el); return () => ro.disconnect();
  }, []);
  const viewStart = view.center - (width / 2) * view.zoom, toX = (ms) => (ms - viewStart) / view.zoom, toMs = (x) => viewStart + x * view.zoom;
  const { tick, label } = tickStep(view.zoom);
  const ticks = [];
  for (let t = snap(viewStart, tick) - tick; t <= viewStart + width * view.zoom + tick; t += tick) {
    const d = new Date(t), midnight = d.getHours() === 0 && d.getMinutes() === 0;
    ticks.push({ t, x: toX(t), major: midnight, label: (t - snap(t, label)) === 0 || midnight });
  }
  // Days along the top: their names where they start (or at the left edge for the day already under way).
  const days = [];
  for (let t = snap(viewStart, DAY) - DAY; t <= viewStart + width * view.zoom; t += DAY) days.push({ t, x: Math.max(0, toX(t)), day: dayOf(t) });

  const down = (part) => (e) => {
    e.preventDefault(); e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { part, x0: e.clientX, r0: range, c0: view.center, w: { x: e.clientX } };
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    const rect = box.current.getBoundingClientRect(), x = e.clientX - rect.left, now = performance.now();
    if (d.part === 'pan') { setView((v) => ({ ...v, center: d.c0 - (e.clientX - d.x0) * v.zoom })); return; }
    // Back and forth quickly: zoom in around the handle.
    d.w = wobble(d.w, e.clientX, now);
    let zoom = view.zoom, center = view.center;
    if (d.w.zoomIn) { const at = toMs(x); zoom = clampZoom(zoom / 1.6); center = at - (x - width / 2) * zoom; }
    // Pulling an end out toward the edge: zoom out so the span keeps fitting.
    if ((d.part === 'end' && x > width * EDGE) || (d.part === 'start' && x < width * (1 - EDGE))) {
      const fixed = d.part === 'end' ? range.start : range.end;
      zoom = clampZoom(zoom * 1.045);
      center = fixed + (center - fixed) * 1.045; // around the end that stays put
    }
    if (zoom !== view.zoom || center !== view.center) setView((v) => ({ ...v, zoom, center }));
    const vs = center - (width / 2) * zoom, ms = vs + x * zoom, step = snapStep(zoom, range.timed);
    if (d.part === 'body') {
      const shift = snap(d.r0.start + (e.clientX - d.x0) * zoom, step) - d.r0.start;
      setRange({ ...range, start: d.r0.start + shift, end: d.r0.end + shift });
    } else if (d.part === 'start') setRange({ ...range, start: Math.min(snap(ms, step), range.end - step) });
    else setRange({ ...range, end: Math.max(snap(ms, step), range.start + step) });
  };
  const up = () => { drag.current = null; };
  const wheel = (e) => {
    e.preventDefault();
    const rect = box.current.getBoundingClientRect(), x = e.clientX - rect.left;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { setView((v) => ({ ...v, center: v.center + (e.deltaX || e.deltaY) * v.zoom })); return; }
    setView((v) => { const at = v.center - (width / 2) * v.zoom + x * v.zoom, zoom = clampZoom(v.zoom * Math.exp(e.deltaY * 0.0022)); return { ...v, zoom, center: at - (x - width / 2) * zoom }; });
  };
  useEffect(() => { const el = box.current; el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel); });
  const left = toX(range.start), right = toX(range.end);
  return <div className="sched-banner" ref={box} onPointerDown={down('pan')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="group" aria-label="시간 막대: 끝을 끌어 시작과 끝을 바꿔요">
    <div className="sched-days">{days.map((d) => <span key={d.t} style={{ left: d.x }} className={d.day === todayStr() ? 'today' : ''}>{Number(d.day.slice(5, 7))}/{Number(d.day.slice(8))} {DOW[new Date(d.t).getDay()]}</span>)}</div>
    <div className="sched-ticks">{ticks.map((k) => <i key={k.t} style={{ left: k.x }} className={(k.major ? 'major' : '') + (k.label ? ' labeled' : '')}>{k.label && !k.major && <b>{tickLabel(k.t)}</b>}</i>)}</div>
    <div className="sched-bar" style={{ left, width: Math.max(4, right - left) }} onPointerDown={down('body')}>
      <span className="sched-handle start" onPointerDown={down('start')} aria-label="시작 끌기" />
      <span className="sched-bar-label">{barLabel(range)}</span>
      <span className="sched-handle end" onPointerDown={down('end')} aria-label="끝 끌기" />
    </div>
  </div>;
}

const barLabel = (r) => { const f = fromRange(r); return r.timed ? `${f.startTime} – ${f.endTime}` : f.endDate ? '종일' : '하루 종일'; };

// The month: the first click is the first day, the second the last (before the first: they swap).
function RangeCalendar({ range, setRange }) {
  const startDay = dayOf(range.start), lastDay = dayOf(range.end - 1);
  const [ym, setYm] = useState(() => { const [y, m] = startDay.split('-').map(Number); return { y, m: m - 1 }; });
  const [picking, setPicking] = useState(false);
  const today = todayStr(), first = new Date(ym.y, ym.m, 1), days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => localDateStr(new Date(ym.y, ym.m, i + 1)))];
  const shiftTo = (day, ms) => { const d = new Date(ms), [y, m, dd] = day.split('-').map(Number); return new Date(y, m - 1, dd, d.getHours(), d.getMinutes()).getTime(); };
  const pick = (day) => {
    if (!picking) {
      // A new first day; the span keeps its length in time of day but becomes one day long (pick the last day next).
      const start = shiftTo(day, range.start), dayLen = range.timed ? Math.min(range.end - range.start, DAY - 1) : DAY;
      let end = range.timed ? shiftTo(day, range.end) : start + DAY;
      if (end <= start) end = start + Math.max(HOUR, dayLen % DAY || HOUR);
      setRange({ ...range, start, end }); setPicking(true);
    } else {
      let a = startDay, b = day; if (b < a) [a, b] = [b, a];
      const start = shiftTo(a, range.start);
      const [by, bm, bd] = b.split('-').map(Number), end = range.timed ? shiftTo(b, range.end) : new Date(by, bm - 1, bd).getTime() + DAY;
      setRange({ ...range, start, end: end > start ? end : start + HOUR }); setPicking(false);
    }
  };
  const move = (n) => { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  return <div className="date-cal sched-cal" role="group" aria-label="날짜 고르기: 첫날, 마지막 날 순서로 눌러요">
    <div className="date-cal-nav">
      <button type="button" className="ghost" aria-label="이전 달" onClick={() => move(-1)}>◀</button>
      <span>{ym.y}년 {ym.m + 1}월</span>
      <button type="button" className="ghost" aria-label="다음 달" onClick={() => move(1)}>▶</button>
    </div>
    <div className="date-cal-grid">
      {DOW.map((w, i) => <span key={w} className={'date-cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</span>)}
      {cells.map((date, i) => date ? <button type="button" key={date} data-date={date}
        className={'date-cal-day' + (date === startDay ? ' is-picked is-first' : '') + (date === lastDay ? ' is-picked is-last' : '') + (date > startDay && date < lastDay ? ' in-range' : '') + (date === today ? ' is-today' : '')}
        aria-pressed={date >= startDay && date <= lastDay} onClick={() => pick(date)}>{Number(date.slice(8))}</button> : <span key={'b' + i} />)}
    </div>
    <p className="sched-hint">{picking ? '마지막 날을 눌러요 (같은 날을 누르면 하루)' : startDay === lastDay ? '하루 · 날짜를 눌러 바꿔요' : `${daysLabel(startDay, lastDay)}`}</p>
  </div>;
}
const daysLabel = (a, b) => { const n = Math.round((new Date(b) - new Date(a)) / DAY) + 1; return `${Number(a.slice(5, 7))}/${Number(a.slice(8))} – ${Number(b.slice(5, 7))}/${Number(b.slice(8))} · ${n}일`; };

export default function ScheduleCard({ todo, onClose }) {
  const [range, setRange] = useState(() => toRange(todo, todayStr()));
  const [repeat, setRepeat] = useState(false);
  const fields = useMemo(() => fromRange(range), [range]);
  const timeAt = (which) => (which === 'start' ? fields.startTime : fields.endTime === '24:00' ? '24:00' : fields.endTime);
  const setTime = (which, hhmm) => {
    if (!hhmm) return;
    const [h, m] = hhmm.split(':').map(Number);
    if (which === 'start') {
      const d = new Date(range.start); d.setHours(h, m, 0, 0);
      const len = range.timed ? range.end - range.start : HOUR, start = d.getTime();
      setRange({ start, end: range.timed ? Math.max(range.end, start + 15 * 60_000) : start + len, timed: true });
    } else {
      const last = range.timed ? new Date(range.end - 1) : new Date(range.end - DAY), d = new Date(last); d.setHours(h, m, 0, 0);
      let end = d.getTime(); if (end <= range.start) end += DAY;
      setRange({ start: range.timed ? range.start : (() => { const s = new Date(range.start); s.setHours(9, 0, 0, 0); return s.getTime(); })(), end, timed: true });
    }
  };
  const untimed = () => { const s = new Date(range.start); s.setHours(0, 0, 0, 0); const e = new Date(range.end - 1); e.setHours(0, 0, 0, 0); setRange({ start: s.getTime(), end: e.getTime() + DAY, timed: false }); };
  const save = () => { window.api.updateTodo(todo.id, spanPatch(todo, fields)); onClose?.(); };
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } if (e.key === 'Enter' && !e.target.closest?.('input,textarea')) { e.preventDefault(); save(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  });
  return <div className="sched-card" role="dialog" aria-label="일정 정하기">
    <div className="sched-card-inner">
      <Banner range={range} setRange={setRange} />
      <div className="sched-body">
        <RangeCalendar range={range} setRange={setRange} />
        <div className="sched-side">
          <label className="sched-time"><span>시작</span><TimeField value={range.timed ? timeAt('start') : ''} placeholder="--:--" onChange={(v) => setTime('start', v)} /></label>
          <label className="sched-time"><span>종료</span><TimeField value={range.timed ? timeAt('end') : ''} placeholder="--:--" onChange={(v) => setTime('end', v)} /></label>
          <button type="button" className={'ghost sched-allday' + (!range.timed ? ' on' : '')} aria-pressed={!range.timed} onClick={untimed}>시간 없음</button>
          <button type="button" className={'ghost sched-repeat' + (todo.repeat ? ' on' : '')} onClick={() => setRepeat(!repeat)}>↻ {todo.repeat ? repeatLabel(todo.repeat) : '반복'}</button>
          <p className="sched-summary">{summary(fields)}</p>
        </div>
      </div>
      {repeat && <RepeatEditor todo={todo} onClose={() => setRepeat(false)} />}
      <div className="date-cal-actions">
        <span className="date-cal-spacer" />
        <button type="button" className="ghost" onClick={() => onClose?.()}>취소</button>
        <button type="button" className="primary" onClick={save}>확정</button>
      </div>
    </div>
  </div>;
}
function summary(f) {
  const md = (s) => `${Number(s.slice(5, 7))}월 ${Number(s.slice(8))}일`;
  const span = f.endDate ? `${md(f.date)} ${f.startTime || ''} – ${md(f.endDate)} ${f.endTime || ''}` : `${md(f.date)} ${f.startTime ? `${f.startTime} – ${f.endTime || ''}` : ''}`;
  const n = f.endDate ? Math.round((new Date(f.endDate) - new Date(f.date)) / DAY) + 1 : 1;
  return span.replace(/\s+/g, ' ').trim() + (n > 1 ? ` · ${n}일차까지` : '');
}
