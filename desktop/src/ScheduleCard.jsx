import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { TimeField, RepeatEditor, repeatLabel } from './components.jsx';
import { todayStr, localDateStr } from './util.js';
import { spanPatch } from '../../shared/multi-day.js';
import { toRange, fromRange, tickStep, snapStep, snap, fitZoom, clampZoom, tickLabel, magnet, dragFrame, dayOf, DAY, HOUR } from '../../shared/schedule-span.js';

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
const EDGE = 0.86;

/*
 * The banner keeps its own view (zoom = ms per pixel, center = the instant in the middle) and, while something is
 * dragged, works from refs every animation frame — so the bar glides with the pointer instead of stepping:
 *   - a handle follows the pointer to the minute and only sticks to a round time within a few pixels of one; letting
 *     go settles it on the nearest round time.
 *   - holding a handle near the outer edge zooms out around the other end (keeps stretching the span, all of it in
 *     view); pulling it back toward the other side slides the view that way, so it can be shrunk back any distance.
 *   - small movements for a moment zoom in around the handle by themselves, down to 5-minute detail.
 *   - dragging the bar moves the whole span; dragging the empty strip pans (with a little glide after letting go);
 *     the wheel zooms around the pointer, shift/sideways wheel pans.
 */
function Banner({ range, setRange }) {
  const box = useRef(null), [width, setWidth] = useState(560);
  const [view, setView] = useState(() => ({ zoom: clampZoom(fitZoom(range, 560)), center: (range.start + range.end) / 2 }));
  const v = useRef(view), r = useRef(range), w = useRef(width), drag = useRef(null), raf = useRef(0), glide = useRef(0);
  v.current = view; r.current = range; w.current = width;
  const fitted = useRef(false);
  useLayoutEffect(() => {
    const el = box.current; if (!el) return undefined;
    const ro = new ResizeObserver(() => {
      const nw = el.clientWidth; setWidth(nw);
      if (!fitted.current) { fitted.current = true; setView({ zoom: clampZoom(fitZoom(r.current, nw)), center: (r.current.start + r.current.end) / 2 }); }
    });
    ro.observe(el); return () => { ro.disconnect(); cancelAnimationFrame(raf.current); cancelAnimationFrame(glide.current); };
  }, []);
  const vs = view.center - (width / 2) * view.zoom, toX = (ms) => (ms - vs) / view.zoom;
  const { tick, label } = tickStep(view.zoom);
  const ticks = [];
  for (let t = snap(vs, tick) - tick; t <= vs + width * view.zoom + tick; t += tick) {
    const d = new Date(t), midnight = d.getHours() === 0 && d.getMinutes() === 0;
    ticks.push({ t, x: toX(t), major: midnight, label: t - snap(t, label) === 0 || midnight });
  }
  const days = [];
  for (let t = snap(vs, DAY) - DAY; t <= vs + width * view.zoom; t += DAY) days.push({ t, x: Math.max(0, toX(t)), day: dayOf(t) });
  // The day already under way is named at the left edge, unless the next day's name is right there.
  const dayNames = days.filter((d, i) => (days[i + 1]?.x ?? Infinity) - d.x > 58);

  // One frame of a handle drag: edge slide/zoom, then the handle under the pointer.
  const frame = (now) => {
    const d = drag.current; if (!d || (d.part !== 'start' && d.part !== 'end')) return;
    const dt = Math.min(0.05, (now - (d.t || now)) / 1000); d.t = now;
    const W = w.current, x = d.x;
    d.recent = [...(d.recent || []).filter((p) => now - p.t < 500), { x, t: now }];
    const { zoom, center } = dragFrame(v.current, { part: d.part, x, w: W, dt, range: r.current, recent: d.recent, held: (now - d.began) / 1000 });
    if (zoom !== v.current.zoom || center !== v.current.center) { v.current = { zoom, center }; setView(v.current); }
    const ms = magnet(center - (W / 2) * zoom + x * zoom, zoom, r.current.timed), min = 5 * 60_000;
    const next = d.part === 'start' ? { ...r.current, start: Math.min(ms, r.current.end - min) } : { ...r.current, end: Math.max(ms, r.current.start + min) };
    if (next.start !== r.current.start || next.end !== r.current.end) { r.current = next; setRange(next); }
    raf.current = requestAnimationFrame(frame);
  };
  const down = (part) => (e) => {
    e.preventDefault(); e.stopPropagation(); cancelAnimationFrame(glide.current);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const x = e.clientX - box.current.getBoundingClientRect().left;
    drag.current = { part, x, x0: e.clientX, r0: r.current, c0: v.current.center, began: performance.now(), last: [{ x: e.clientX, t: performance.now() }] };
    if (part === 'start' || part === 'end') raf.current = requestAnimationFrame(frame);
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    d.x = e.clientX - box.current.getBoundingClientRect().left;
    const { zoom } = v.current;
    if (d.part === 'pan') {
      d.last = [...d.last.slice(-4), { x: e.clientX, t: performance.now() }];
      v.current = { ...v.current, center: d.c0 - (e.clientX - d.x0) * zoom }; setView(v.current); return;
    }
    if (d.part === 'body') {
      const shift = magnet(d.r0.start + (e.clientX - d.x0) * zoom, zoom, d.r0.timed) - d.r0.start;
      r.current = { ...d.r0, start: d.r0.start + shift, end: d.r0.end + shift }; setRange(r.current); return;
    }
  };
  const up = () => {
    const d = drag.current; drag.current = null; cancelAnimationFrame(raf.current);
    if (!d) return;
    // Handles and the bar settle on the nearest round time.
    if (d.part !== 'pan') {
      const step = snapStep(v.current.zoom, r.current.timed), cur = r.current;
      const settled = d.part === 'start' ? { ...cur, start: Math.min(snap(cur.start, step), cur.end - step) } : d.part === 'end' ? { ...cur, end: Math.max(snap(cur.end, step), cur.start + step) } : { ...cur, start: snap(cur.start, step), end: snap(cur.start, step) + (cur.end - cur.start) };
      r.current = settled; setRange(settled); return;
    }
    // A pan glides on a little after letting go.
    const [a, b] = [d.last[0], d.last.at(-1)], vel = b && a && b.t > a.t ? (b.x - a.x) / (b.t - a.t) : 0;
    let speed = vel * 16, prev = performance.now();
    const coast = (now) => {
      const dt = (now - prev) / 16; prev = now; speed *= Math.pow(0.9, dt);
      if (Math.abs(speed) < 0.3) return;
      v.current = { ...v.current, center: v.current.center - speed * dt * v.current.zoom }; setView(v.current);
      glide.current = requestAnimationFrame(coast);
    };
    if (Math.abs(speed) > 1) glide.current = requestAnimationFrame(coast);
  };
  const wheel = (e) => {
    e.preventDefault();
    const x = e.clientX - box.current.getBoundingClientRect().left, cur = v.current;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) { v.current = { ...cur, center: cur.center + (e.deltaX || e.deltaY) * cur.zoom }; setView(v.current); return; }
    const at = cur.center - (w.current / 2) * cur.zoom + x * cur.zoom, zoom = clampZoom(cur.zoom * Math.exp(e.deltaY * 0.0022));
    v.current = { zoom, center: at - (x - w.current / 2) * zoom }; setView(v.current);
  };
  useEffect(() => { const el = box.current; el.addEventListener('wheel', wheel, { passive: false }); return () => el.removeEventListener('wheel', wheel); }, []);
  // An end scrolled out of view stays at the edge (with an arrow), so it can always be grabbed.
  const left = toX(range.start), right = toX(range.end), pin = (x) => Math.max(7, Math.min(width - 7, x));
  const barL = Math.max(-20, left), barR = Math.min(width + 20, right);
  return <div className="sched-banner" ref={box} onPointerDown={down('pan')} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="group" aria-label="시간 막대: 끝을 끌어 시작과 끝을 바꿔요 · 빈 곳을 끌면 옮겨져요 · 휠로 확대·축소">
    <div className="sched-days">{dayNames.map((d) => <span key={d.t} style={{ left: d.x }} className={d.day === todayStr() ? 'today' : ''}>{Number(d.day.slice(5, 7))}/{Number(d.day.slice(8))} {DOW[new Date(d.t).getDay()]}</span>)}</div>
    <div className="sched-ticks">{ticks.map((k) => <i key={k.t} style={{ transform: `translateX(${k.x}px)` }} className={(k.major ? 'major' : '') + (k.label ? ' labeled' : '')}>{k.label && !k.major && <b>{tickLabel(k.t)}</b>}</i>)}</div>
    <div className="sched-bar" style={{ transform: `translateX(${barL}px)`, width: Math.max(4, barR - barL) }} onPointerDown={down('body')}>
      <span className="sched-bar-label">{barLabel(range)}</span>
    </div>
    <span className={'sched-handle start' + (left < 7 ? ' pinned' : '')} style={{ transform: `translateX(${pin(left) - 7}px)` }} onPointerDown={down('start')} aria-label="시작 끌기" />
    <span className={'sched-handle end' + (right > width - 7 ? ' pinned' : '')} style={{ transform: `translateX(${pin(right) - 7}px)` }} onPointerDown={down('end')} aria-label="끝 끌기" />
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
  const [range, setRangeState] = useState(() => toRange(todo, todayStr()));
  // The latest range, at once: a time popup hands its value over on the mousedown of 확정, and the click can follow
  // in the same tick (a tap on a touch screen or trackpad) — before React has re-rendered. 확정 saves from here, so
  // it never saves the moment before the time was typed.
  const rangeRef = useRef(range);
  const setRange = (next) => { const r = typeof next === 'function' ? next(rangeRef.current) : next; rangeRef.current = r; setRangeState(r); };
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
  const save = () => { window.api.updateTodo(todo.id, spanPatch(todo, fromRange(rangeRef.current))); onClose?.(); };
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
