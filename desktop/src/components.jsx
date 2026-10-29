import React, { useEffect, useRef, useState } from 'react';
import { fmtDate, importantHighlight, localDateStr, todayStr } from './util.js';
import { compactTitle } from './focus-utils.mjs';

export function ChipPicker({ label, options, value, onChange }) {
  if (!options.length) return null;
  return (
    <div className="chip-picker">
      {label && <span className="chip-picker-label">{label}</span>}
      {options.map((o) => (
        <button
          type="button"
          key={o.id}
          className={'pick-chip' + (value === o.id ? ' active' : '') + (o.important ? ' imp' : '')}
          style={o.color ? { '--tc': o.color } : undefined}
          onClick={() => onChange(value === o.id ? '' : o.id)}
        >
          {o.color && <span className="team-dot" style={{ background: o.color }} />}
          {o.label}
          {o.important && <span className="hl-star" style={{ color: o.color }}>★</span>}
        </button>
      ))}
    </div>
  );
}

/* 라디오 스타일 팀 선택 — 클릭 즉시 저장 */
export function TeamRadios({ todo, db, onPicked }) {
  const cur = todo.teamId || '';
  const pick = (id) => {
    window.api.updateTodo(todo.id, { teamId: id || null });
    if (onPicked) onPicked();
  };
  return (
    <span className="team-radios" onClick={(e) => e.stopPropagation()}>
      <button type="button" className={'team-radio' + (!cur ? ' active' : '')} onClick={() => pick('')}>
        팀 없음
      </button>
      {db.teams.map((t) => (
        <button
          type="button"
          key={t.id}
          className={'team-radio' + (cur === t.id ? ' active' : '') + (t.important ? ' imp' : '')}
          style={{ '--tc': t.color }}
          onClick={() => pick(t.id)}
        >
          <span className="team-dot" style={{ background: t.color }} />
          {t.name}
          {t.important && <span className="hl-star" style={{ color: t.color }}>★</span>}
        </button>
      ))}
    </span>
  );
}

/* 줄 위 팀 표시/선택 컨트롤
   - 팀 없음: 호버하면 라디오가 바로 나타나 즉시 선택
   - 팀 있음: 팀 이름 배지를 다시 누르면 라디오로 전환해 변경
   - 프로젝트에서 상속된 팀은 표시만 (프로젝트 따라감) */
export function TeamControl({ todo, db }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const project = db.projects.find((p) => p.id === todo.projectId);
  const inherited = project && project.teamId;
  const team = db.teams.find((t) => t.id === (inherited || todo.teamId));

  // 라디오가 열린 상태에서 바깥을 클릭하면 닫는다
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  if (inherited) {
    return team ? (
      <span className="badge team-badge" title={`${project.name} 프로젝트의 팀`}>
        <span className="team-dot" style={{ background: team.color }} />
        {team.name}
      </span>
    ) : null;
  }
  if (open)
    return (
      <span ref={wrapRef} style={{ display: 'inline-flex' }}>
        <TeamRadios todo={todo} db={db} onPicked={() => setOpen(false)} />
      </span>
    );
  if (team) {
    return (
      <button
        type="button"
        className="badge team-badge team-badge-btn"
        style={team.important ? { color: team.color, '--hl': team.color, fontWeight: 600 } : undefined}
        title="누르면 팀 변경"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <span className="team-dot" style={{ background: team.color }} />
        {team.name}
        {team.important && <span className="hl-star" style={{ color: team.color }}>★</span>}
      </button>
    );
  }
  if (!db.teams.length) return null;
  return (
    <span className="hover-reveal">
      <TeamRadios todo={todo} db={db} />
    </span>
  );
}

/* 디지털 시계 팝업 시간 선택기. ↑↓로 시/분 조작(분은 10분 단위), 직접 입력 시 10분 단위로 반올림 */
export function TimeField({ value, onChange, placeholder }) {
  const [open, setOpen] = useState(false);
  const [hh, setHh] = useState('09');
  const [mm, setMm] = useState('00');
  const dirtyRef = useRef(false);
  const wrapRef = useRef(null);
  const hourRef = useRef(null);

  const openPopup = () => {
    const [h, m] = (value || '09:00').split(':');
    setHh(h);
    setMm(m);
    dirtyRef.current = false;
    setOpen(true);
  };

  useEffect(() => {
    if (open && hourRef.current) {
      hourRef.current.focus();
      hourRef.current.select();
    }
  }, [open]);

  const commit = (h, m) => {
    let hn = parseInt(h, 10);
    let mn = parseInt(m, 10);
    if (isNaN(hn)) hn = 0;
    if (isNaN(mn)) mn = 0;
    let total = hn * 60 + Math.round(mn / 10) * 10; // 분 반올림 (13 → 10), 60 넘어가면 시로 올림
    total = ((total % 1440) + 1440) % 1440;
    const H = String(Math.floor(total / 60)).padStart(2, '0');
    const M = String(total % 60).padStart(2, '0');
    setHh(H);
    setMm(M);
    dirtyRef.current = false;
    onChange(`${H}:${M}`);
  };

  const close = (commitTyped) => {
    if (commitTyped && dirtyRef.current) commit(hh, mm);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) close(true);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, hh, mm]);

  const stepHour = (d) => commit((parseInt(hh, 10) || 0) + d, mm);
  const stepMin = (d) => commit(hh, Math.round((parseInt(mm, 10) || 0) / 10) * 10 + d * 10);

  const segKey = (isHour) => (e) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      isHour ? stepHour(1) : stepMin(1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      isHour ? stepHour(-1) : stepMin(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const segChange = (setter) => (e) => {
    setter(e.target.value.replace(/\D/g, '').slice(0, 2));
    dirtyRef.current = true;
  };

  const segBlur = () => {
    if (dirtyRef.current) commit(hh, mm);
  };

  return (
    <div className="time-field" ref={wrapRef}>
      <button
        type="button"
        className={'time-display' + (value ? '' : ' is-empty')}
        onClick={() => (open ? close(true) : openPopup())}
        onKeyDown={(e) => {
          if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !open) {
            e.preventDefault();
            openPopup();
          }
        }}
        title={placeholder}
      >
        {value || placeholder || '--:--'}
      </button>
      {open && (
        <div className="time-popup">
          <div className="time-col">
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => stepHour(1)}>
              ▲
            </button>
            <input ref={hourRef} value={hh} inputMode="numeric" onChange={segChange(setHh)} onKeyDown={segKey(true)} onBlur={segBlur} />
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => stepHour(-1)}>
              ▼
            </button>
          </div>
          <div className="time-sep">:</div>
          <div className="time-col">
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => stepMin(1)}>
              ▲
            </button>
            <input value={mm} inputMode="numeric" onChange={segChange(setMm)} onKeyDown={segKey(false)} onBlur={segBlur} />
            <button type="button" tabIndex={-1} onMouseDown={(e) => e.preventDefault()} onClick={() => stepMin(-1)}>
              ▼
            </button>
          </div>
          <button
            type="button"
            className="ghost time-clear"
            onClick={() => {
              onChange('');
              setOpen(false);
            }}
          >
            지움
          </button>
        </div>
      )}
    </div>
  );
}

export function Section({ title, extra, children }) {
  return (
    <section className="section">
      <div className="section-head">
        <h2>{title}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

/* 새 항목 추가 폼 */
export function TodoForm({ initial = {}, kind = 'todo', projects = [], teams = [], onSubmit, showLinks = true }) {
  const blank = { title: '', date: '', startTime: '', endTime: '', projectId: '', teamId: '', channel: '', notes: '' };
  const [f, setF] = useState({ ...blank, ...normalize(initial) });

  function normalize(o) {
    const r = {};
    for (const k of Object.keys(blank)) if (o[k] != null) r[k] = o[k];
    return r;
  }

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = (e) => {
    e.preventDefault();
    const title = f.title.trim();
    if (!title) return;
    onSubmit({
      kind,
      title,
      notes: f.notes,
      date: f.date || null,
      startTime: f.startTime || null,
      endTime: f.endTime || null,
      projectId: f.projectId || null,
      teamId: f.teamId || null,
      channel: f.channel || null,
    });
    setF({ ...f, title: '', notes: '' });
  };

  return (
    <form className="todo-form" onSubmit={submit}>
      <input
        className="grow"
        placeholder={'할 일 제목'}
        value={f.title}
        onChange={set('title')}
      />
      <input type="date" value={f.date} onChange={set('date')} title="날짜" />
      <TimeField value={f.startTime} placeholder="시작" onChange={(v) => setF({ ...f, startTime: v })} />
      <TimeField value={f.endTime} placeholder="마무리" onChange={(v) => setF({ ...f, endTime: v })} />

      <button type="submit" className="primary">
        추가
      </button>
      {showLinks && (projects.length > 0 || teams.length > 0) && (
        <div className="picker-rows">
          <ChipPicker
            label="프로젝트"
            options={projects
              .filter((p) => p.status !== 'done')
              .map((p) => {
                const team = teams.find((t) => t.id === p.teamId);
                return { id: p.id, label: p.name, color: team ? team.color : null, important: p.important };
              })}
            value={f.projectId}
            onChange={(v) => setF({ ...f, projectId: v })}
          />
          <ChipPicker
            label="팀"
            options={teams.map((t) => ({ id: t.id, label: t.name, color: t.color, important: t.important }))}
            value={f.teamId}
            onChange={(v) => setF({ ...f, teamId: v })}
          />
        </div>
      )}
    </form>
  );
}

/* 기존 항목 편집기 — 버튼 없이 모든 변경이 즉시 저장됨 */
// A small month calendar: picking a day only marks it; `onPick` gets the day, nothing else happens.
const CAL_DOW = ['일', '월', '화', '수', '목', '금', '토'];
export function DateCalendar({ value, onPick }) {
  const [ym, setYm] = useState(() => { const [y, m] = (value || todayStr()).split('-').map(Number); return { y, m: m - 1 }; });
  const today = todayStr(), first = new Date(ym.y, ym.m, 1), days = new Date(ym.y, ym.m + 1, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => localDateStr(new Date(ym.y, ym.m, i + 1)))];
  const move = (n) => { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  return (
    <div className="date-cal" role="group" aria-label="날짜 고르기">
      <div className="date-cal-nav">
        <button type="button" className="ghost" aria-label="이전 달" onClick={() => move(-1)}>◀</button>
        <span>{ym.y}년 {ym.m + 1}월</span>
        <button type="button" className="ghost" aria-label="다음 달" onClick={() => move(1)}>▶</button>
      </div>
      <div className="date-cal-grid">
        {CAL_DOW.map((w, i) => <span key={w} className={'date-cal-dow' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>{w}</span>)}
        {cells.map((date, i) => date ? (
          <button type="button" key={date} data-date={date} aria-pressed={date === value}
            className={'date-cal-day' + (date === value ? ' is-picked' : '') + (date === today ? ' is-today' : '')}
            onClick={() => onPick(date)}>{Number(date.slice(8))}</button>
        ) : <span key={'b' + i} />)}
      </div>
    </div>
  );
}

export function TodoEditor({ todo, onClose }) {
  // Every to-do keeps a date, chosen on the calendar only (no typing). Picking a day just marks it;
  // the to-do moves when 확정 is pressed. A scheduled time can be cleared instead.
  const [picked, setPicked] = useState(todo.date || todayStr());
  const confirm = () => { if (picked && picked !== todo.date) window.api.updateTodo(todo.id, { date: picked, endDate: null }); onClose?.(); };
  // Esc closes it without moving anything, like the other pop-overs.
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  return (
    <div className="todo-editor date-only">
      <DateCalendar value={picked} onPick={setPicked} />
      <div className="date-cal-actions">
        {todo.startTime && <button type="button" className="ghost" onClick={() => window.api.updateTodo(todo.id, { startTime: null, endTime: null, endDate: null })}>시간 없애기 ({todo.startTime})</button>}
        <span className="date-cal-spacer" />
        <button type="button" className="ghost" onClick={() => onClose?.()}>취소</button>
        <button type="button" className="primary" onClick={confirm}>확정</button>
      </div>
    </div>
  );
}

// ↻ Repeat: a switch; on, every n 일/주/월/년 from this to-do's day (the main process / web server makes the
// occurrences: shared/repeat.cjs). Switching it off removes the open occurrences after this day.
const REPEAT_UNITS = [['day', '일'], ['week', '주'], ['month', '월'], ['year', '년']];
export const repeatLabel = (r) => (!r ? '' : r.every === 1 ? { day: '매일', week: '매주', month: '매달', year: '매년' }[r.unit] : `${r.every}${{ day: '일', week: '주', month: '개월', year: '년' }[r.unit]}마다`);
export function RepeatEditor({ todo, onClose }) {
  const [on, setOn] = useState(!!todo.repeat);
  const [every, setEvery] = useState(String(todo.repeat?.every || 1));
  const [unit, setUnit] = useState(todo.repeat?.unit || 'week');
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, [onClose]);
  const n = Math.floor(Number(every)), valid = n >= 1 && n <= 999;
  const toggle = () => {
    if (on && todo.repeat) { window.api.repeatTodo(todo.id, null); onClose?.(); return; } // off: right away
    setOn(!on);
  };
  const confirm = () => { if (valid) window.api.repeatTodo(todo.id, { every: n, unit }); onClose?.(); };
  const [, m, d] = (todo.date || '').split('-').map(Number);
  return (
    <div className="todo-editor repeat-editor">
      {!todo.date ? <p className="repeat-note">날짜가 있는 할 일만 반복할 수 있어요.</p> : <>
        <div className="repeat-switch-row">
          <span>반복</span>
          <button type="button" role="switch" aria-checked={on} aria-label="반복" className={'switch' + (on ? ' on' : '')} onClick={toggle}><i /></button>
        </div>
        {on && <div className="repeat-rule">
          <input type="number" min="1" max="999" inputMode="numeric" aria-label="반복 간격" value={every} autoFocus
            onChange={(e) => setEvery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && valid) confirm(); }} />
          <select aria-label="반복 단위" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {REPEAT_UNITS.map(([u, label]) => <option key={u} value={u}>{label}</option>)}
          </select>
          <span>마다</span>
        </div>}
        <p className="repeat-note">{on ? (valid ? `${m}월 ${d}일부터 ${repeatLabel({ every: n, unit })} 반복해요.` : '1~999 사이 숫자를 넣어 주세요.') : '켜면 반복 주기를 정할 수 있어요.'}
          {todo.repeat && <><br />끄면 이 날 다음 반복부터 지워져요.</>}</p>
      </>}
      <div className="date-cal-actions">
        <span className="date-cal-spacer" />
        <button type="button" className="ghost" onClick={() => onClose?.()}>{on && todo.date ? '취소' : '닫기'}</button>
        {on && todo.date && <button type="button" className="primary" disabled={!valid} onClick={confirm}>확정</button>}
      </div>
    </div>
  );
}

export function TodoRow({ todo, db, showDate = false }) {
  const [editing, setEditing] = useState(false);
  const project = db.projects.find((p) => p.id === todo.projectId);
  const isDone = todo.status === 'done';
  const hl = importantHighlight(todo, db);

  return (
    <div className={'todo-row' + (isDone ? ' is-done' : '') + (hl ? ' hl' : '')} style={hl ? { '--hl': hl } : undefined}>
      <div className="todo-line">
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => window.api.updateTodo(todo.id, { status: isDone ? 'todo' : 'done' })}
        />
        <span className="title" onClick={() => setEditing(!editing)} title="클릭하여 편집">
          {compactTitle(todo.title)}
        </span>

        {project && <span className="badge">{project.name}</span>}
        <TeamControl todo={todo} db={db} />
        <span className="meta">
          {showDate && todo.date ? fmtDate(todo.date) + ' ' : ''}
          {todo.startTime || ''}
          {todo.endTime ? `~${todo.endTime}` : ''}
        </span>
        <span className="row-actions">
          <button className="ghost" title="날짜·시간 설정" onClick={() => setEditing(!editing)}>
            📅
          </button>
          {todo.status !== 'bucket' && (
            <button className="ghost" title="버킷으로 보내기" onClick={() => window.api.updateTodo(todo.id, { status: 'bucket' })}>
              버킷
            </button>
          )}
          <button className="ghost danger" title="삭제" onClick={() => window.api.deleteTodo(todo.id)}>
            ✕
          </button>
        </span>
      </div>
      {editing && (
        <div className="row-editor">
          <input
            className="grow"
            defaultValue={todo.title}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') e.target.blur();
              else if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== todo.title) window.api.updateTodo(todo.id, { title: v });
            }}
          />
          <TodoEditor todo={todo} db={db} onClose={() => setEditing(false)} />
        </div>
      )}
    </div>
  );
}

export function Empty({ children }) {
  return <p className="empty">{children}</p>;
}
