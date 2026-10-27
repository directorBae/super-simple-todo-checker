import React, { useEffect, useRef, useState } from 'react';
import { todayStr, localDateStr } from '../util.js';
import { clockTimeAt, compactTitle, schedulePatch, TODO_DRAG_TYPE } from '../focus-utils.mjs';
import { LENS, arcPath, at, inWindow, lensAngle, lensPath, timeAngle } from './clock-lens.js';

const pad = n => String(n).padStart(2, '0');
const DOW = ['일', '월', '화', '수', '목', '금', '토'];
const dateLabel = date => { const [y, mo, d] = date.split('-').map(Number); return `${mo}월 ${d}일 (${DOW[new Date(y, mo - 1, d).getDay()]})`; };
const FLIP_MS = 500;
const HALVES = [0, 1]; // 오전 (0–12) and 오후 (12–24), side by side
const halfOf = time => Math.floor(Number(time.slice(0, 2)) / 12);

// While a to-do is dragged over the clock: its own date sits above the dials. Over that date a month calendar opens;
// dropping on a day moves the to-do there (time unchanged), and holding at ◀ / ▶ turns the month, like Notion Calendar.
function DragCalendar({ month, date, hover }) {
  const [y, m] = month, first = new Date(y, m, 1), cells = [];
  for (let i = 0; i < first.getDay(); i++) cells.push(null);
  for (let d = 1, n = new Date(y, m + 1, 0).getDate(); d <= n; d++) cells.push(localDateStr(new Date(y, m, d)));
  const today = todayStr();
  return <div className="clock-drag-cal" role="grid" aria-label="날짜로 옮기기">
    <div className="clock-drag-cal-nav"><span data-clock-flip="-1" aria-label="지난달">◀</span><b>{y}년 {m + 1}월</b><span data-clock-flip="1" aria-label="다음 달">▶</span></div>
    <div className="clock-drag-cal-grid">
      {DOW.map((w, i) => <i key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</i>)}
      {cells.map((c, i) => c ? <span key={c} data-clock-day={c} className={(c === today ? ' today' : '') + (c === date ? ' current' : '') + (c === hover ? ' hover' : '')}>{Number(c.slice(8))}</span> : <span key={'b' + i} className="blank" />)}
    </div>
  </div>;
}

// Brushed-metal hands: a gradient across each hand's width reads as a curved steel surface.
function Hands({ h, m, seconds }) {
  return <svg className="clock-hands" viewBox="0 0 280 280" aria-hidden="true">
    <defs>
      <linearGradient id="hand-steel" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#4a5263" /><stop offset=".32" stopColor="#f5f7fb" /><stop offset=".5" stopColor="#c7ccd8" /><stop offset=".72" stopColor="#8b94a6" /><stop offset="1" stopColor="#363d4c" /></linearGradient>
      <linearGradient id="hand-violet" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b2c75" /><stop offset=".35" stopColor="#ece6ff" /><stop offset=".55" stopColor="#b9a8f6" /><stop offset="1" stopColor="#4c3a8a" /></linearGradient>
      <radialGradient id="hand-cap" cx=".35" cy=".3" r=".75"><stop offset="0" stopColor="#ffffff" /><stop offset=".45" stopColor="#c9cfdb" /><stop offset="1" stopColor="#4a5263" /></radialGradient>
      <filter id="hand-shadow" x="-50%" y="-20%" width="200%" height="140%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.5" floodColor="#0a0f24" floodOpacity=".35" /></filter>
    </defs>
    <g filter="url(#hand-shadow)">
      <rect className="hand-hour" x="136.4" y="80" width="7.2" height="72" rx="3.6" fill="url(#hand-steel)" transform={`rotate(${h % 12 * 30 + m / 2} 140 140)`} />
      <rect className="hand-minute" x="137.6" y="50" width="4.8" height="102" rx="2.4" fill="url(#hand-steel)" transform={`rotate(${m * 6 + seconds / 10} 140 140)`} />
      <g className="hand-second" transform={`rotate(${seconds * 6} 140 140)`}><rect x="139.15" y="42" width="1.7" height="128" rx=".85" fill="url(#hand-violet)" /><circle cx="140" cy="160" r="3" fill="url(#hand-violet)" /></g>
      <circle cx="140" cy="140" r="6.5" fill="url(#hand-cap)" stroke="#20263a" strokeOpacity=".25" strokeWidth=".6" /><circle cx="140" cy="140" r="2" fill="#8b5cf6" />
    </g>
  </svg>;
}

// Hover lens: a big glass torus slice reaching past the dial. ±35 minutes are spread over its 70°,
// with a minute ruler and each to-do as a clear dot and title.
function Lens({ lens, half, todos, teams }) {
  const clockLabel = minutes => { const v = ((Math.round(minutes) % 720) + 720) % 720 + half * 720; return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };
  const centreMinutes = lens.angle * 2, windowMinutes = LENS.span / LENS.zoom * 2;
  const inLens = todos.filter(t => inWindow(timeAngle(t.startTime), lens.angle));
  // Pills alternate lanes when their times sit close together so the titles never overlap.
  const lanes = inLens.map((t, i) => (i && lensAngle(timeAngle(t.startTime), lens.angle) - lensAngle(timeAngle(inLens[i - 1].startTime), lens.angle) < 11 ? [LENS.pill, LENS.pill - 0.13, LENS.pill + 0.13][i % 3] : LENS.pill));
  // Pills grow outward from their anchor (away from the dial centre) so they never cover the dot.
  const outward = deg => { const dx = Math.sin(deg * Math.PI / 180), dy = -Math.cos(deg * Math.PI / 180); return `translate(${dx < -0.4 ? '-100%' : dx > 0.4 ? '0%' : '-50%'}, ${dy < -0.4 ? '-100%' : dy > 0.4 ? '0%' : '-50%'})`; };
  // The lens layer is 1.6× the dial, centred on it; positions are in % of that layer.
  const SCALE = 1.6, pos = (deg, r) => ({ left: `${50 + 50 / SCALE * r * Math.sin(deg * Math.PI / 180)}%`, top: `${50 - 50 / SCALE * r * Math.cos(deg * Math.PI / 180)}%` });
  const L = lens.size * SCALE, c = L / 2, R = lens.size / 2, shape = lensPath(c, R, lens.angle), first = Math.ceil((centreMinutes - windowMinutes / 2) / 5) * 5;
  const ticks = Array.from({ length: Math.floor(windowMinutes / 5) + 1 }, (_, i) => first + i * 5).filter(mm => mm <= centreMinutes + windowMinutes / 2);
  const color = t => teams.find(x => x.id === t.teamId)?.color || 'var(--accent)', id = `lens-inside-${half}`;
  return <div className="clock-lens-layer" aria-hidden="true">
    <div className="clock-lens" style={{ clipPath: `path('${shape}')` }} />
    <svg className="clock-lens-glass" viewBox={`0 0 ${L} ${L}`}>
      <defs>
        <clipPath id={id}><path d={shape} /></clipPath>
        <linearGradient id={`lens-rim-${half}`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset=".45" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity=".85" /></linearGradient>
        <filter id={`lens-soft-${half}`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={L / 300} /></filter>
      </defs>
      <path d={shape} fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth={L * 0.025} clipPath={`url(#${id})`} filter={`url(#lens-soft-${half})`} />
      <path d={arcPath(c, R, lens.angle, LENS.outer - 0.07, 8)} fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth={L * 0.006} strokeLinecap="round" filter={`url(#lens-soft-${half})`} />
      {ticks.map(mm => { const deg = lensAngle(mm / 2, lens.angle), major = mm % 15 === 0, [x1, y1] = at(c, R, deg, major ? 1.0 : 1.04), [x2, y2] = at(c, R, deg, 1.1); return <line key={mm} x1={x1} y1={y1} x2={x2} y2={y2} className={'lens-tick' + (major ? ' major' : '')} />; })}
      <path d={arcPath(c, R, lens.angle, LENS.track, 4)} fill="none" className="lens-track" />
      {inLens.map((t, i) => { const deg = lensAngle(timeAngle(t.startTime), lens.angle), [x, y] = at(c, R, deg, LENS.track), [lx, ly] = at(c, R, deg, lanes[i] - 0.1); return <g key={t.id}><line x1={x} y1={y} x2={lx} y2={ly} className="lens-lead" /><circle cx={x} cy={y} r={L * 0.011} style={{ fill: color(t) }} className="lens-dot" opacity={t.status === 'done' ? 0.45 : 1} /></g>; })}
      <path d={shape} fill="none" stroke={`url(#lens-rim-${half})`} strokeWidth="1.4" />
    </svg>
    {ticks.filter(mm => mm % 15 === 0).map(mm => <span key={mm} className="lens-time" style={pos(lensAngle(mm / 2, lens.angle), 1.17)}>{clockLabel(mm)}</span>)}
    <span className="lens-range" style={pos(lens.angle - LENS.span / 2 + 7, LENS.inner + 0.12)}>{clockLabel(centreMinutes - windowMinutes / 2)} – {clockLabel(centreMinutes + windowMinutes / 2)}</span>
    {inLens.map((t, i) => { const deg = lensAngle(timeAngle(t.startTime), lens.angle); return <div key={t.id} className={'clock-lens-task' + (t.status === 'done' ? ' done' : '')} style={{ ...pos(deg, lanes[i] - 0.12), transform: outward(deg), '--team': color(t) }}><time>{t.startTime}</time>{compactTitle(t.title, 28)}</div>; })}
  </div>;
}

export default function ClockWindow({ db, embedded = false, onClose, selectedTodoId = '' }) {
  const [now, setNow] = useState(new Date()), [selectedDate, setSelectedDate] = useState('');
  // hover: { half, time } where a drop / click would land; lens: { half, angle, size } under the pointer.
  const [hover, setHover] = useState(null), [lens, setLens] = useState(null);
  const [pending, setPending] = useState(() => new URLSearchParams(location.search).get('todo') || '');
  const [notice, setNotice] = useState('');
  const dials = useRef([]);
  // A pointer drag of to-dos over the clock: their ids, and the date calendar state while over the date label.
  const [drag, setDrag] = useState(null), [cal, setCal] = useState(null); // cal: { month: [y, m], hover }
  const flip = useRef(null);
  const h = now.getHours(), m = now.getMinutes(), seconds = now.getSeconds(), current = h >= 12 ? 1 : 0;
  const draggedTodos = (drag?.ids || []).map(id => db.todos.find(t => t.id === id)).filter(Boolean);
  // The clock works on the dragged to-dos' own day (their dots are shown) instead of always today.
  const dragDate = draggedTodos[0]?.date || null;
  const day = dragDate || selectedDate || todayStr();
  const pendingTodo = db.todos.find(t => t.id === pending && t.status === 'todo');
  const scheduled = db.todos.filter(t => t.status !== 'bucket' && t.date === day && t.startTime).sort((a,b) => a.startTime.localeCompare(b.startTime));
  useEffect(() => {
    if (!embedded) { document.title = '시계'; document.documentElement.dataset.clock = 'true'; }
    const timer = setInterval(() => setNow(new Date()), 1000);
    const opened = view => { if (view.startsWith('clock-task:')) setPending(view.slice(11)); };
    window.api.onOpenView(opened);
    return () => { clearInterval(timer); if (!embedded) delete document.documentElement.dataset.clock; };
  }, []);
  useEffect(() => {
    if (!selectedTodoId) return;
    setPending(selectedTodoId); setNotice('');
    const todo = db.todos.find(t=>t.id===selectedTodoId);
    if (todo?.date) setSelectedDate(todo.date);
  }, [selectedTodoId]);
  // Several selected to-dos dropped together all get the same time. (Ctrl+Z undoes it, like any other change.)
  const assign = async (ids, time) => {
    const todos = [].concat(ids).map(id => db.todos.find(t => t.id === id && t.status === 'todo')).filter(Boolean); if (!todos.length) return;
    try {
      // The time only: each to-do keeps its own day (a to-do without one takes the day shown).
      await Promise.all(todos.map(todo => window.api.updateTodo(todo.id, schedulePatch(todo, todo.date || day, time))));
      setNotice(`${todos.length > 1 ? `${todos.length}개` : compactTitle(todos[0].title, 20)} · ${time}`); setPending('');
    } catch { setNotice('시간을 저장하지 못했습니다.'); }
  };
  const moveTo = async (ids, date) => {
    const todos = [].concat(ids).map(id => db.todos.find(t => t.id === id)).filter(Boolean); if (!todos.length) return;
    try {
      await Promise.all(todos.map(todo => window.api.updateTodo(todo.id, { date, ...(todo.endDate && todo.endDate < date ? { endDate: null } : {}) })));
      setNotice(`${todos.length > 1 ? `${todos.length}개` : compactTitle(todos[0].title, 20)} → ${dateLabel(date)}`);
    } catch { setNotice('날짜를 옮기지 못했습니다.'); }
  };
  // Which dial (오전 / 오후) a point is over, and the time there.
  const dialAt = (x, y) => {
    for (const half of HALVES) { const r = dials.current[half]?.getBoundingClientRect(); if (r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return { half, time: clockTimeAt(x, y, r, half) }; }
    return null;
  };
  // Hover lens follows the pointer's angle anywhere around a dial, including over the lens itself.
  const aim = (e, half) => {
    const r = dials.current[half].getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    if (Math.hypot(x, y) > r.width / 2 * LENS.outer) { setLens(l => (l?.half === half ? null : l)); return; }
    setLens({ half, angle: (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360, size: r.width });
  };
  const isTodoDrag = e => Array.from(e.dataTransfer.types).includes(TODO_DRAG_TYPE);
  const stopFlip = () => { clearInterval(flip.current?.timer); clearTimeout(flip.current?.timer); flip.current = null; };
  useEffect(() => stopFlip, []);
  useEffect(() => {
    // What the pointer is over in the date part of the clock. The pill, the calendar and the gap between them are one
    // area, so moving from the pill down to a day never passes "back over the dial" and closes the calendar.
    const dateHit = (x, y) => { const el = document.elementFromPoint(x, y); return { label: el?.closest('[data-clock-date]'), day: el?.closest('[data-clock-day]')?.dataset.clockDay, flipBy: Number(el?.closest('[data-clock-flip]')?.dataset.clockFlip || 0), inDate: !!el?.closest('.clock-date-ui') }; };
    const dropped = e => {
      const { id, ids, x, y } = e.detail, hit = dateHit(x, y), on = dialAt(x, y);
      setHover(null); setDrag(null); setCal(null); stopFlip();
      if (hit.day) moveTo(ids || id, hit.day);
      else if (on && !hit.inDate) assign(ids || id, on.time);
    };
    // A row dragged with the pointer (mouse or touch) shows the time it would get, like a native drag.
    const dragging = e => {
      if (!e.detail) { setHover(null); setDrag(null); setCal(null); stopFlip(); return; }
      const { x, y, ids } = e.detail, hit = dateHit(x, y), on = dialAt(x, y);
      setDrag(d => (d && d.ids.join() === (ids || []).join() ? d : { ids: ids || [] }));
      if (hit.label || (cal && hit.inDate)) {
        setHover(null);
        const base = draggedTodos[0]?.date || todayStr(), [by, bm] = base.split('-').map(Number);
        setCal(c => { const month = c?.month || [by, bm - 1]; return c && c.hover === hit.day ? c : { month, hover: hit.day || null }; });
        // Holding on ◀ / ▶ turns the month, and keeps turning while held.
        if (hit.flipBy && flip.current?.by !== hit.flipBy) {
          stopFlip();
          const turn = () => setCal(c => c && { ...c, month: [new Date(c.month[0], c.month[1] + hit.flipBy, 1).getFullYear(), new Date(c.month[0], c.month[1] + hit.flipBy, 1).getMonth()] });
          flip.current = { by: hit.flipBy, timer: setTimeout(() => { turn(); flip.current.timer = setInterval(turn, FLIP_MS + 150); }, FLIP_MS) };
        } else if (!hit.flipBy) stopFlip();
        return;
      }
      stopFlip();
      // Back on a dial (outside the date area): the calendar closes and the dials work as before.
      if (cal && on) setCal(null);
      setHover(on);
    };
    window.addEventListener('checker:clock-pointer-drop',dropped); window.addEventListener('checker:clock-pointer-move',dragging);
    return ()=>{ window.removeEventListener('checker:clock-pointer-drop',dropped); window.removeEventListener('checker:clock-pointer-move',dragging); };
  });

  const dial = half => {
    const own = scheduled.filter(t => halfOf(t.startTime) === half), here = hover?.half === half ? hover.time : '', point = e => clockTimeAt(e.clientX, e.clientY, dials.current[half].getBoundingClientRect(), half);
    return <div key={half} className={'clock-half' + (half === current ? ' is-now' : '')}>
      <div className="clock-half-name">{half ? '오후' : '오전'}{half === current && <small>지금</small>}</div>
      <div className="clock-stage" onMouseMove={e => { if (!pendingTodo && !hover) aim(e, half); }} onMouseLeave={() => setLens(l => (l?.half === half ? null : l))}>
        <div className={'clock-dial' + (here ? ' drag-over' : '') + (pendingTodo ? ' is-picking' : '')} data-half={half} ref={el => { dials.current[half] = el; }}
          onDragOver={e => { if (!isTodoDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHover({ half, time: point(e) }); }}
          onDragLeave={() => setHover(v => (v?.half === half ? null : v))}
          onDrop={e => { if (!isTodoDrag(e)) return; e.preventDefault(); setHover(null); assign(e.dataTransfer.getData(TODO_DRAG_TYPE), point(e)); }}
          onMouseMove={e => { if (pendingTodo) setHover({ half, time: point(e) }); }} onMouseLeave={() => { if (pendingTodo) setHover(null); }}
          onClick={e => { if (pendingTodo) { setHover(null); assign(pendingTodo.id, point(e)); } }}>
          <svg viewBox="0 0 280 280" aria-label={(half ? '오후' : '오전') + ' 시계 · 할 일을 끌어 놓을 수 있어요'}>
            {Array.from({ length: 60 }, (_, i) => { const a = i * Math.PI / 30, r = i % 5 ? 122 : 116; return <line key={i} className={i % 5 ? 'dial-tick' : 'dial-tick major'} x1={140 + Math.sin(a) * r} y1={140 - Math.cos(a) * r} x2={140 + Math.sin(a) * 126} y2={140 - Math.cos(a) * 126} />; })}
            {[12, 3, 6, 9].map(n => <text key={n} className="dial-num" x={140 + Math.sin(n * Math.PI / 6) * 102} y={145 - Math.cos(n * Math.PI / 6) * 102} textAnchor="middle">{half ? n % 12 + 12 + (n === 12 ? 12 : 0) : n}</text>)}
            {own.map((t, i) => { const a = (Number(t.startTime.slice(0, 2)) % 12 * 60 + Number(t.startTime.slice(3))) / 720 * Math.PI * 2, team = db.teams.find(x => x.id === t.teamId); return <circle key={t.id} cx={140 + Math.sin(a) * (91 - i % 3 * 7)} cy={140 - Math.cos(a) * (91 - i % 3 * 7)} r="4" style={{ fill: team?.color || 'var(--accent)' }} opacity={t.status === 'done' ? .3 : 1}><title>{t.startTime} {compactTitle(t.title)}</title></circle>; })}
          </svg>
          {/* Hands only on the dial of the half we are in; the other dial stays clear for picking a time. */}
          {half === current && <Hands h={h} m={m} seconds={seconds} />}
          {here && <div className="drop-time">{here}<small>{pendingTodo ? '눌러서 시간 배정' : '놓으면 시간 배정'}</small></div>}
        </div>
        {lens?.half === half && !hover && <Lens lens={lens} half={half} todos={own} teams={db.teams} />}
      </div>
    </div>;
  };

  return <div className="clock-window" aria-label={embedded?'시계':'별도 시계 창'}>
    <header className="clock-window-head"><span>시계</span><button aria-label="시계 닫기" title="Ctrl + ← 또는 Esc" onClick={() => onClose ? onClose() : window.close()}>×</button></header>
    {drag && dragDate && <div className="clock-date-ui">
      <div className={'clock-date-pill' + (cal ? ' open' : '')} data-clock-date={dragDate}>{dragDate === todayStr() ? '오늘 · ' : ''}{dateLabel(dragDate)}<small>{cal ? '날짜에 놓으면 그날로 옮겨요' : '여기로 가져가면 다른 날로'}</small></div>
      {cal && <DragCalendar month={cal.month} date={dragDate} hover={cal.hover} />}
    </div>}
    <section className="clock-card" aria-label="날짜와 시계">
      <div className="clock-dials">{HALVES.map(dial)}</div>
    </section>
    {pendingTodo ? <div role="status" className="clock-toast clock-pending"><span>{compactTitle(pendingTodo.title, 24)}</span><small>시계를 눌러 시간 배정</small><button aria-label="배정 취소" onClick={() => setPending('')}>×</button></div>
      : notice && <div role="status" className="clock-toast">{notice}</div>}
  </div>;
}
