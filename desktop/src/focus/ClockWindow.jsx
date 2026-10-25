import React, { useEffect, useRef, useState } from 'react';
import { todayStr } from '../util.js';
import { clockTimeAt, compactTitle, schedulePatch, TODO_DRAG_TYPE } from '../focus-utils.mjs';
import { LENS, arcPath, at, inWindow, lensAngle, lensPath, timeAngle } from './clock-lens.js';

const pad = n => String(n).padStart(2, '0');
export default function ClockWindow({ db, embedded = false, onClose, selectedTodoId = '' }) {
  const [now, setNow] = useState(new Date()), [selectedDate, setSelectedDate] = useState('');
  const [hoverTime, setHoverTime] = useState(''), [lens, setLens] = useState(null);
  const [pending, setPending] = useState(() => new URLSearchParams(location.search).get('todo') || '');
  const [notice, setNotice] = useState(''), [undo, setUndo] = useState(null);
  const dial = useRef(null);
  // The dial always shows the half of the day we are in: 12·3·6·9 in the morning, 24·15·18·21 in the afternoon.
  const h = now.getHours(), m = now.getMinutes(), seconds = now.getSeconds(), half = h >= 12 ? 1 : 0;
  const day = selectedDate || todayStr();
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
  // Several selected to-dos dropped together all get the same time.
  const assign = async (ids, time) => {
    const todos = [].concat(ids).map(id => db.todos.find(t => t.id === id && t.status === 'todo')).filter(Boolean); if (!todos.length) return;
    try {
      await Promise.all(todos.map(todo => window.api.updateTodo(todo.id, schedulePatch(todo, day, time))));
      setUndo(todos.map(todo => ({ id: todo.id, patch: { date: todo.date || null, startTime: todo.startTime || null, endTime: todo.endTime || null, endDate: todo.endDate || null, timeZone: todo.timeZone } })));
      setNotice(`${todos.length > 1 ? `${todos.length}개` : compactTitle(todos[0].title, 20)} · ${time}`); setPending('');
    } catch { setNotice('시간을 저장하지 못했습니다.'); }
  };
  // Hover lens follows the pointer's angle anywhere around the dial, including over the lens itself.
  const aim = e => {
    const r = dial.current.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
    if (Math.hypot(x, y) > r.width / 2 * LENS.outer) { setLens(null); return; }
    setLens({ angle: (Math.atan2(x, -y) * 180 / Math.PI + 360) % 360, size: r.width });
  };
  const clockLabel = minutes => { const v = ((Math.round(minutes) % 720) + 720) % 720 + half * 720; return `${pad(Math.floor(v / 60))}:${pad(v % 60)}`; };
  const centreMinutes = lens ? lens.angle * 2 : 0, windowMinutes = LENS.span / LENS.zoom * 2;
  const inLens = !lens ? [] : scheduled.filter(t => Math.floor(Number(t.startTime.slice(0, 2)) / 12) === half && inWindow(timeAngle(t.startTime), lens.angle));
  // Pills alternate lanes when their times sit close together so the titles never overlap.
  const lanes = inLens.map((t, i) => (i && lensAngle(timeAngle(t.startTime), lens.angle) - lensAngle(timeAngle(inLens[i - 1].startTime), lens.angle) < 11 ? [LENS.pill, LENS.pill - 0.13, LENS.pill + 0.13][i % 3] : LENS.pill));
  // Lens layer is 1.6× the dial, centred on it; positions below are in % of that layer.
  // Pills grow outward from their anchor (away from the dial centre) so they never cover the dot.
  const outward = deg => { const dx = Math.sin(deg * Math.PI / 180), dy = -Math.cos(deg * Math.PI / 180); return `translate(${dx < -0.4 ? '-100%' : dx > 0.4 ? '0%' : '-50%'}, ${dy < -0.4 ? '-100%' : dy > 0.4 ? '0%' : '-50%'})`; };
  const SCALE = 1.6, pos = (deg, r) => ({ left: `${50 + 50 / SCALE * r * Math.sin(deg * Math.PI / 180)}%`, top: `${50 - 50 / SCALE * r * Math.cos(deg * Math.PI / 180)}%` });
  // A task picked from the list (click on its handle) is placed by clicking the dial.
  const pointTime = e => clockTimeAt(e.clientX, e.clientY, dial.current.getBoundingClientRect(), half);
  const isTodoDrag = e => Array.from(e.dataTransfer.types).includes(TODO_DRAG_TYPE);
  const onDragOver = e => { if (!isTodoDrag(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setHoverTime(clockTimeAt(e.clientX, e.clientY, dial.current.getBoundingClientRect(), half)); };
  const onDrop = e => { if (!isTodoDrag(e)) return; e.preventDefault(); const time = clockTimeAt(e.clientX, e.clientY, dial.current.getBoundingClientRect(), half); setHoverTime(''); assign(e.dataTransfer.getData(TODO_DRAG_TYPE), time); };
  useEffect(() => {
    const inside = (x,y) => { const r=dial.current?.getBoundingClientRect(); return r && x>=r.left && x<=r.right && y>=r.top && y<=r.bottom ? r : null; };
    const dropped = e => { const {id,ids,x,y}=e.detail, r=inside(x,y); setHoverTime(''); if(r) assign(ids || id,clockTimeAt(x,y,r,half)); };
    // A row dragged with the pointer (mouse or touch) shows the time it would get, like a native drag.
    const dragging = e => { const r=e.detail && inside(e.detail.x,e.detail.y); setHoverTime(r ? clockTimeAt(e.detail.x,e.detail.y,r,half) : ''); };
    window.addEventListener('checker:clock-pointer-drop',dropped); window.addEventListener('checker:clock-pointer-move',dragging);
    return ()=>{ window.removeEventListener('checker:clock-pointer-drop',dropped); window.removeEventListener('checker:clock-pointer-move',dragging); };
  });

  return <div className="clock-window" aria-label={embedded?'시계':'별도 시계 창'}>
    <header className="clock-window-head"><span>시계</span><button aria-label="시계 닫기" title="Ctrl + ← 또는 Esc" onClick={() => onClose ? onClose() : window.close()}>×</button></header>
    <section className="clock-card" aria-label="날짜와 시계">
      <div className="clock-stage" onMouseMove={e => { if (!pendingTodo && !hoverTime) aim(e); }} onMouseLeave={() => setLens(null)}>
        <div className={'clock-dial' + (hoverTime ? ' drag-over' : '') + (pendingTodo ? ' is-picking' : '')} ref={dial} onDragOver={onDragOver} onDragLeave={() => setHoverTime('')} onDrop={onDrop}
          onMouseMove={e => { if (pendingTodo) setHoverTime(pointTime(e)); }} onMouseLeave={() => { if (pendingTodo) setHoverTime(''); }}
          onClick={e => { if (pendingTodo) { setHoverTime(''); assign(pendingTodo.id, pointTime(e)); } }}>
          <svg viewBox="0 0 280 280" aria-label="할 일을 끌어 놓을 수 있는 아날로그 시계">
            {Array.from({ length: 60 }, (_, i) => { const a = i * Math.PI / 30, r = i % 5 ? 122 : 116; return <line key={i} className={i % 5 ? 'dial-tick' : 'dial-tick major'} x1={140 + Math.sin(a) * r} y1={140 - Math.cos(a) * r} x2={140 + Math.sin(a) * 126} y2={140 - Math.cos(a) * 126} />; })}
            {[12, 3, 6, 9].map(n => <text key={n} className="dial-num" x={140 + Math.sin(n * Math.PI / 6) * 102} y={145 - Math.cos(n * Math.PI / 6) * 102} textAnchor="middle">{half ? n % 12 + 12 + (n === 12 ? 12 : 0) : n}</text>)}
            {scheduled.filter(t => Math.floor(Number(t.startTime.slice(0, 2)) / 12) === half).map((t, i) => { const a = (Number(t.startTime.slice(0, 2)) % 12 * 60 + Number(t.startTime.slice(3))) / 720 * Math.PI * 2, team = db.teams.find(x => x.id === t.teamId); return <circle key={t.id} cx={140 + Math.sin(a) * (91 - i % 3 * 7)} cy={140 - Math.cos(a) * (91 - i % 3 * 7)} r="4" style={{ fill: team?.color || 'var(--accent)' }} opacity={t.status === 'done' ? .3 : 1}><title>{t.startTime} {compactTitle(t.title)}</title></circle>; })}
          </svg>
          {/* Brushed-metal hands: a gradient across each hand's width reads as a curved steel surface. */}
          <svg className="clock-hands" viewBox="0 0 280 280" aria-hidden="true">
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
          </svg>
          {hoverTime && <div className="drop-time">{hoverTime}<small>{pendingTodo ? '눌러서 시간 배정' : '놓으면 시간 배정'}</small></div>}
        </div>
        {/* Hover lens: a big glass torus slice reaching past the dial. ±35 minutes are spread over its 70°,
            with a minute ruler and each to-do as a clear dot and title. */}
        {lens && !hoverTime && (() => {
          const L = lens.size * SCALE, c = L / 2, R = lens.size / 2, shape = lensPath(c, R, lens.angle), first = Math.ceil((centreMinutes - windowMinutes / 2) / 5) * 5;
          const ticks = Array.from({ length: Math.floor(windowMinutes / 5) + 1 }, (_, i) => first + i * 5).filter(mm => mm <= centreMinutes + windowMinutes / 2);
          return <div className="clock-lens-layer" aria-hidden="true">
            <div className="clock-lens" style={{ clipPath: `path('${shape}')` }} />
            <svg className="clock-lens-glass" viewBox={`0 0 ${L} ${L}`}>
              <defs>
                <clipPath id="lens-inside"><path d={shape} /></clipPath>
                <linearGradient id="lens-rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset=".45" stopColor="#fff" stopOpacity=".35" /><stop offset="1" stopColor="#fff" stopOpacity=".85" /></linearGradient>
                <filter id="lens-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation={L / 300} /></filter>
              </defs>
              <path d={shape} fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth={L * 0.025} clipPath="url(#lens-inside)" filter="url(#lens-soft)" />
              <path d={arcPath(c, R, lens.angle, LENS.outer - 0.07, 8)} fill="none" stroke="#fff" strokeOpacity=".9" strokeWidth={L * 0.006} strokeLinecap="round" filter="url(#lens-soft)" />
              {ticks.map(mm => { const deg = lensAngle(mm / 2, lens.angle), major = mm % 15 === 0, [x1, y1] = at(c, R, deg, major ? 1.0 : 1.04), [x2, y2] = at(c, R, deg, 1.1); return <line key={mm} x1={x1} y1={y1} x2={x2} y2={y2} className={'lens-tick' + (major ? ' major' : '')} />; })}
              <path d={arcPath(c, R, lens.angle, LENS.track, 4)} fill="none" className="lens-track" />
              {inLens.map((t, i) => { const deg = lensAngle(timeAngle(t.startTime), lens.angle), [x, y] = at(c, R, deg, LENS.track), [lx, ly] = at(c, R, deg, lanes[i] - 0.1); return <g key={t.id}><line x1={x} y1={y} x2={lx} y2={ly} className="lens-lead" /><circle cx={x} cy={y} r={L * 0.011} style={{ fill: db.teams.find(x => x.id === t.teamId)?.color || 'var(--accent)' }} className="lens-dot" opacity={t.status === 'done' ? 0.45 : 1} /></g>; })}
              <path d={shape} fill="none" stroke="url(#lens-rim)" strokeWidth="1.4" />
            </svg>
            {ticks.filter(mm => mm % 15 === 0).map(mm => <span key={mm} className="lens-time" style={pos(lensAngle(mm / 2, lens.angle), 1.17)}>{clockLabel(mm)}</span>)}
            <span className="lens-range" style={pos(lens.angle - LENS.span / 2 + 7, LENS.inner + 0.12)}>{clockLabel(centreMinutes - windowMinutes / 2)} – {clockLabel(centreMinutes + windowMinutes / 2)}</span>
            {inLens.map((t, i) => { const deg = lensAngle(timeAngle(t.startTime), lens.angle); return <div key={t.id} className={'clock-lens-task' + (t.status === 'done' ? ' done' : '')} style={{ ...pos(deg, lanes[i] - 0.12), transform: outward(deg), '--team': db.teams.find(x => x.id === t.teamId)?.color || 'var(--accent)' }}><time>{t.startTime}</time>{compactTitle(t.title, 28)}</div>; })}
          </div>;
        })()}
      </div>
    </section>
    {pendingTodo ? <div role="status" className="clock-toast clock-pending"><span>{compactTitle(pendingTodo.title, 24)}</span><small>시계를 눌러 시간 배정</small><button aria-label="배정 취소" onClick={() => setPending('')}>×</button></div>
      : notice && <div role="status" className="clock-toast">{notice}{undo && <button onClick={async () => { await Promise.all(undo.map(u => window.api.updateTodo(u.id,u.patch))); setUndo(null); setNotice('배정을 되돌렸어요.'); }}>되돌리기</button>}</div>}
  </div>;
}
