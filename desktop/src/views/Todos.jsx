import { createPortal } from 'react-dom';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TodoEditor, TeamControl } from '../components.jsx';
import { SourceIcons } from '../icons.jsx';
import { compactTitle } from '../focus-utils.mjs';
import { dropPatches, lineSort } from '../../../shared/todo-drop.js';
import { useTodoDrag } from './useTodoDrag.js';
import {
  todayStr,
  addDays,
  localDateStr,
  effectiveTeamId,
  importantHighlight,
  eventOnDate,
  fmtTime,
  } from '../util.js';

const DOW_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

function dateParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

function offsetFromToday(dateStr, today) {
  const a = dateParts(today);
  const b = dateParts(dateStr);
  return Math.round((new Date(b.y, b.m - 1, b.d) - new Date(a.y, a.m - 1, a.d)) / 864e5);
}

/* 입력한 한 줄이 팀/프로젝트 이름이면 그룹 컨텍스트를 돌려준다 */
function resolveGroup(v, kind, db) {

  const team = db.teams.find((t) => t.name === v);
  if (team) return { label: team.name, color: team.color, teamId: team.id, projectId: null, channel: null };
  return null;
}

/* 입력 중 자동완성 후보 — 팀/프로젝트 이름 부분일치, 앞글자 일치 우선 */
function suggestGroups(q, kind, db) {
  const v = q.trim().toLowerCase();
  if (!v) return [];
  const names = [];

  names.push(...db.teams.map((t) => t.name));

  const rank = (n) => (n.toLowerCase().startsWith(v) ? 0 : 1);
  return [...new Set(names)]
    .filter((n) => n.toLowerCase().includes(v) && n !== q.trim())
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, 4)
    .map((n) => resolveGroup(n, kind, db))
    .filter(Boolean);
}

/* 자동완성 팝업 — Enter/Tab/클릭으로 카테고리 선택 (mousedown 막아 blur 커밋 방지) */
function SuggestPop({ items, activeIdx, onPick }) {
  if (!items.length) return null;
  return (
    <div className="suggest-pop">
      {items.map((g, i) => (
        <button
          key={g.label}
          type="button"
          className={'suggest-item' + (i === activeIdx ? ' active' : '')}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(g)}
        >
          <span className="team-dot" style={{ background: g.color }} />
          {g.label}
          <span className="suggest-hint">카테고리 ⏎</span>
        </button>
      ))}
    </div>
  );
}

const addWith = (ctx, title, date, kind) =>
  window.api.addTodo({
    title,
    date,
    kind,
    teamId: ctx ? ctx.teamId : null,
    projectId: ctx ? ctx.projectId : null,
    channel: ctx ? ctx.channel : null,
  });

/* 여러 줄 붙여넣기: 줄마다 할 일로 추가하되, 팀/프로젝트/채널 이름 줄은 그룹 전환으로 처리 */
function pasteLines(text, { date, kind, db, ctx, firstPrefix = '' }) {
  const lines = text.split(/\r?\n/).map((s) => s.trim());
  let cur = ctx;
  let first = true;
  for (let line of lines) {
    if (first) {
      line = (firstPrefix + line).trim();
      first = false;
    }
    if (!line) continue;
    const g = resolveGroup(line, kind, db);
    if (g) {
      cur = g;
      continue;
    }
    addWith(cur, line, date, kind);
  }
  return cur;
}

/* 한 줄(할 일). 제목 클릭 → 인라인 편집 */
function MemoLine({ todo, db, editing, onStartEdit, onEndEdit, onEnter, onEscape, indent, kind, selected }) {
  const [detail, setDetail] = useState(false);
  const inputRef = useRef(null);
  const project = db.projects.find((p) => p.id === todo.projectId);
  const isDone = todo.status === 'done';
  const hl = importantHighlight(todo, db);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  const save = () => {
    if (!inputRef.current) return;
    const v = inputRef.current.value.trim();
    if (!v) window.api.deleteTodo(todo.id);
    else if (v !== todo.title) window.api.updateTodo(todo.id, { title: v });
    onEndEdit();
  };

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      save();
      onEnter(todo); // 같은 그룹에 이어서 새 줄
    } else if (e.key === 'Escape') {
      onEndEdit();
      onEscape();
    } else if (e.key === 'Backspace' && inputRef.current.value === '') {
      e.preventDefault();
      window.api.deleteTodo(todo.id);
      onEndEdit();
      onEscape();
    }
  };

  return (
    <div
      className={'memo-line' + (isDone ? ' is-done' : '') + (indent ? ' indent' : '') + (hl ? ' hl' : '') + (selected ? ' is-selected' : '')}
      aria-selected={selected || undefined}
      data-todo-id={todo.id}
      style={hl ? { '--hl': hl } : undefined}
    >
      <div className="memo-line-main">
        <input
          type="checkbox"
          checked={isDone}
          onChange={() => window.api.updateTodo(todo.id, { status: isDone ? 'todo' : 'done' })}
        />
        <SourceIcons todo={todo}/>
        {editing ? (
          <input
            ref={inputRef}
            className="memo-edit" maxLength={50}
            defaultValue={todo.title}
            onKeyDown={onKeyDown}
            onBlur={save}
            onPaste={(e) => {
              const t = e.clipboardData.getData('text');
              if (!t.includes('\n')) return;
              e.preventDefault();
              // 첫 줄은 이 항목의 제목으로, 나머지 줄은 같은 그룹의 새 항목으로
              const [head, ...rest] = t.split(/\r?\n/);
              const el = e.target;
              const merged = (el.value.slice(0, el.selectionStart) + head + el.value.slice(el.selectionEnd)).trim();
              if (merged) window.api.updateTodo(todo.id, { title: merged });
              pasteLines(rest.join('\n'), {
                date: todo.date,
                kind: kind || todo.kind,
                db,
                ctx: { teamId: todo.teamId || null, projectId: todo.projectId || null, channel: todo.channel || null },
              });
              onEndEdit();
            }}
          />
        ) : (
          <span className="memo-title" title={todo.title} onClick={onStartEdit}>
            {compactTitle(todo.title)}
          </span>
        )}

        {project && <span className="badge">{project.name}</span>}
        <span className="memo-right">
          {(todo.startTime || todo.endTime) && (
            <span className="meta">
              {todo.startTime || ''}
              {todo.endTime ? `~${todo.endTime}` : ''}
            </span>
          )}
          <TeamControl todo={todo} db={db} />
          <span className="memo-actions">
            <button className="ghost" title="날짜·시간 설정" onClick={() => setDetail(!detail)}>
              📅
            </button>
            <button className="ghost" title="버킷으로" onClick={() => window.api.updateTodo(todo.id, { status: 'bucket' })}>
              버킷
            </button>
            <button className="ghost danger" title="삭제" onClick={() => window.api.deleteTodo(todo.id)}>
              ✕
            </button>
          </span>
        </span>
      </div>
      {detail && <TodoEditor todo={todo} db={db} />}
    </div>
  );
}

/* 그룹(팀/프로젝트) 안에서 이어 쓰는 입력 줄 */
function GroupInput({ date, kind, db, base, indent, onClose, onEditLast }) {
  const [text, setText] = useState('');
  const [sugIdx, setSugIdx] = useState(0);
  const [sugOff, setSugOff] = useState(false);
  const ref = useRef(null);

  const sugs = sugOff ? [] : suggestGroups(text, kind, db);

  useEffect(() => {
    if (ref.current) ref.current.focus();
  }, []);

  const pickSug = (g) => {
    setText('');
    setSugIdx(0);
    onClose(g); // 선택한 카테고리로 전환
  };

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (sugs.length) {
        pickSug(sugs[sugIdx] || sugs[0]);
        return;
      }
      const v = text.trim();
      if (!v) {
        onClose();
        return;
      }
      const g = resolveGroup(v, kind, db);
      if (g) {
        setText('');
        onClose(g); // 다른 그룹 이름을 치면 그 그룹으로 전환
        return;
      }
      addWith(base, v, date, kind);
      setText('');
    } else if (e.key === 'Tab' && sugs.length) {
      e.preventDefault();
      pickSug(sugs[sugIdx] || sugs[0]);
    } else if (e.key === 'ArrowDown' && sugs.length) {
      e.preventDefault();
      setSugIdx((sugIdx + 1) % sugs.length);
    } else if (e.key === 'ArrowUp' && sugs.length) {
      e.preventDefault();
      setSugIdx((sugIdx - 1 + sugs.length) % sugs.length);
    } else if (e.key === 'Escape') {
      if (sugs.length) setSugOff(true);
      else onClose();
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault();
      onEditLast();
    }
  };

  // 포커스를 잃으면 쓰던 내용을 그대로 저장하고 닫는다
  const commitOnBlur = () => {
    const v = text.trim();
    if (v) addWith(base, v, date, kind);
    setText('');
    onClose();
  };

  return (
    <div className={'memo-input-row is-draft' + (indent ? ' indent' : '')}>
      <input
        ref={ref}
        className="memo-input" maxLength={50}
        value={text}
        placeholder="계속 입력"
        onChange={(e) => {
          setText(e.target.value);
          setSugOff(false);
          setSugIdx(0);
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const t = e.clipboardData.getData('text');
          if (!t.includes('\n')) return;
          e.preventDefault();
          pasteLines(t, { date, kind, db, ctx: base, firstPrefix: text });
          setText('');
        }}
        onBlur={commitOnBlur}
      />
      <SuggestPop items={sugs} activeIdx={sugIdx} onPick={pickSug} />
    </div>
  );
}

/* 날짜 맨 아래 입력 줄 */
function DayInput({ date, kind, db, ctx, setCtx, registerInput, focusDay, onBackspaceEmpty }) {
  const [text, setText] = useState('');
  const [sugIdx, setSugIdx] = useState(0);
  const [sugOff, setSugOff] = useState(false);
  const ref = useRef(null);

  const sugs = sugOff ? [] : suggestGroups(text, kind, db);

  useEffect(() => {
    registerInput(date, ref.current);
    return () => registerInput(date, null);
  }, [date]);

  const pickSug = (g) => {
    setCtx(g); // 카테고리 선택 → 이후 입력은 이 그룹 아래로
    setText('');
    setSugIdx(0);
  };

  // Enter와 동일하게 확정 (그룹 이름이면 그룹 전환)
  const commit = () => {
    const v = text.trim();
    if (!v) return;
    const g = resolveGroup(v, kind, db);
    if (g) setCtx(g);
    else addWith(ctx, v, date, kind);
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (sugs.length) {
        pickSug(sugs[sugIdx] || sugs[0]);
        return;
      }
      if (!text.trim()) {
        focusDay(addDays(date, 1)); // 빈 줄에서 Enter → 다음 날
        return;
      }
      commit();
    } else if (e.key === 'Tab' && sugs.length) {
      e.preventDefault();
      pickSug(sugs[sugIdx] || sugs[0]);
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault();
      if (ctx) setCtx(null);
      else onBackspaceEmpty();
    } else if (e.key === 'ArrowUp' && text === '') {
      e.preventDefault();
      focusDay(addDays(date, -1));
    } else if (e.key === 'ArrowDown' && text === '') {
      e.preventDefault();
      focusDay(addDays(date, 1));
    } else if (e.key === 'ArrowDown' && sugs.length) {
      e.preventDefault();
      setSugIdx((sugIdx + 1) % sugs.length);
    } else if (e.key === 'ArrowUp' && sugs.length) {
      e.preventDefault();
      setSugIdx((sugIdx - 1 + sugs.length) % sugs.length);
    } else if (e.key === 'Escape') {
      if (sugs.length) setSugOff(true);
      else setCtx(null);
    }
  };

  return (
    <div className="memo-input-row">
      {ctx && (
        <span className="ctx-chip" style={{ borderColor: ctx.color }}>
          <span className="team-dot" style={{ background: ctx.color }} />
          {ctx.label}
          <button onMouseDown={(e) => e.preventDefault()} onClick={() => setCtx(null)} title="그룹 해제">
            ✕
          </button>
        </span>
      )}
      <input
        ref={ref}
        className="memo-input" maxLength={50}
        placeholder={'할 일 입력'}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setSugOff(false);
          setSugIdx(0);
        }}
        onKeyDown={onKeyDown}
        onPaste={(e) => {
          const t = e.clipboardData.getData('text');
          if (!t.includes('\n')) return;
          e.preventDefault();
          const last = pasteLines(t, { date, kind, db, ctx, firstPrefix: text });
          setCtx(last);
          setText('');
        }}
        onBlur={commit}
      />
      <SuggestPop items={sugs} activeIdx={sugIdx} onPick={pickSug} />
    </div>
  );
}

function DaySection({ date, kind, db, isToday, registerInput, focusDay, selection }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState(null); // { key, teamId, projectId, channel }
  const [ctx, setCtx] = useState(null);
  const items = [...db.todos.filter((t) => t.kind === kind && t.date === date && t.status !== 'bucket')].sort(lineSort);

  const events =
    kind === 'todo'
      ? db.gcalEvents
          .filter((e) => eventOnDate(e, date))
          .sort((a, b) => (a.allDay === b.allDay ? (a.start < b.start ? -1 : 1) : a.allDay ? -1 : 1))
      : [];

  const noTeam = items.filter((t) => !effectiveTeamId(t, db));
  const teamGroups = db.teams
    .map((team) => ({ team, list: items.filter((t) => effectiveTeamId(t, db) === team.id) }))
    .filter((g) => g.list.length);
  const displayOrder = [...noTeam, ...teamGroups.flatMap((g) => g.list)];

  const { m, d, dow } = dateParts(date);

  // 줄에서 Enter → 그 줄이 속한 그룹에 이어서 새 줄
  const continueFrom = (todo) => {
    const key = effectiveTeamId(todo, db) || '';
    setDraft({ key, teamId: todo.teamId || null, projectId: todo.projectId || null, channel: todo.channel || null });
  };

  const closeDraft = (nextGroup) => {
    setDraft(null);
    if (nextGroup) {
      setCtx(nextGroup);
      focusDay(date);
    }
  };

  const editLastOf = (list) => {
    setDraft(null);
    if (list.length) setEditingId(list[list.length - 1].id);
  };

  const renderLine = (t, indent) => (
    <MemoLine
      key={t.id}
      todo={t}
      db={db}
      kind={kind}
      indent={indent}
      editing={editingId === t.id}
      selected={selection.has(t.id)}
      onStartEdit={() => setEditingId(t.id)}
      onEndEdit={() => setEditingId(null)}
      onEnter={continueFrom}
      onEscape={() => focusDay(date)}
    />
  );

  const draftFor = (key, list, indent) =>
    draft && draft.key === key ? (
      <GroupInput
        date={date}
        kind={kind}
        db={db}
        base={draft}
        indent={indent}
        onClose={closeDraft}
        onEditLast={() => editLastOf(list)}
      />
    ) : null;

  return (
    <section
      className={'memo-day' + (isToday ? ' is-today' : '') + (items.length === 0 ? ' is-empty' : '')}
      id={'day-' + date}
    >
      <div className="memo-head" onClick={() => focusDay(date)}>
        <span className={'memo-dow' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '')}>{DOW_NAMES[dow]}</span>
        <span className="memo-date">
          {m}월 {d}일
        </span>
        {isToday && <span className="memo-today">오늘</span>}
      </div>
      {events.map((ev) => (
        <div className="memo-event" key={ev.id} title="구글 캘린더 일정">
          <span className="event-time">{ev.allDay ? '종일' : fmtTime(ev.start)}</span>
          {ev.title}
        </div>
      ))}
      {noTeam.map((t) => renderLine(t, false))}
      {draftFor('', noTeam, false)}
      {teamGroups.map(({ team, list }) => (
        <div key={team.id}>
          <div
            className={'memo-team' + (team.important ? ' hl' : '')}
            data-drop-team={team.id}
            data-drop-date={date}
            style={team.important ? { color: team.color, '--hl': team.color } : undefined}
          >
            <span className="team-dot" style={{ background: team.color }} />
            <span className="team-name">{team.name}</span>
          </div>
          {list.map((t) => renderLine(t, true))}
          {draftFor(team.id, list, true)}
        </div>
      ))}
      <DayInput
        date={date}
        kind={kind}
        db={db}
        ctx={ctx}
        setCtx={setCtx}
        registerInput={registerInput}
        focusDay={focusDay}
        onBackspaceEmpty={() => {
          // 빈 날이면 전날로, 항목이 있으면 마지막 항목 편집
          if (displayOrder.length) setEditingId(displayOrder[displayOrder.length - 1].id);
          else focusDay(addDays(date, -1));
        }}
      />
    </section>
  );
}

/* 월 캘린더 뷰 */
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
    {
      const team = db.teams.find((x) => x.id === effectiveTeamId(t, db));
      if (team) edge = team.color;
    }
    return (
      <div
        key={t.id}
        className={'cal-chip' + (t.status === 'done' ? ' chip-done' : '') + (hl ? ' chip-hl' : '')}
        data-todo-id={t.id}
        style={hl ? { borderLeftColor: edge, '--hl': hl } : { borderLeftColor: edge }}
        title={t.title}
      >
        <SourceIcons todo={t} size={11}/><span className="cal-chip-title">{compactTitle(t.title)}</span>
      </div>
    );
  };

  return (
    <div className="month-view">
      <div className="cal-nav">
        <button className="ghost" onClick={() => move(-1)}>
          ◀
        </button>
        <span className="cal-title">
          {ym.y}년 {ym.m + 1}월
        </span>
        <button className="ghost" onClick={() => move(1)}>
          ▶
        </button>
        <button
          className="ghost"
          onClick={() => {
            const d = new Date();
            setYm({ y: d.getFullYear(), m: d.getMonth() });
          }}
        >
          오늘
        </button>
      </div>
      <div className="cal-grid cal-head">
        {['일', '월', '화', '수', '목', '금', '토'].map((w) => (
          <div key={w} className="cal-dow">
            {w}
          </div>
        ))}
      </div>
      <div className="cal-grid month-grid">
        {cells.map((date, i) => (
          <div
            key={i}
            data-date={date || undefined}
            className={'cal-cell' + (date ? '' : ' blank') + (date === today ? ' today' : '')}
            onClick={() => date && openDay(date)}
          >
            {date && <div className="cal-day">{Number(date.slice(8))}</div>}
            {date && (byDate[date] || []).slice(0, 4).map(chip)}
            {date && (byDate[date] || []).length > 4 && <div className="cal-more">+{byDate[date].length - 4}</div>}
          </div>
        ))}
      </div>
      <p className="desc">날짜 클릭 또는 날짜 위에서 Ctrl+휠 ↑ → 해당 날짜로 · 휠 → 월 이동</p>
    </div>
  );
}

/* 캘린더 왼쪽 내 팀 목록 — 관리(추가·색·삭제)는 왼쪽 방에서 */
function TeamSidebar({ db, onOpenTeams }) {
  const open = (teamId) => db.todos.filter((t) => t.status === 'todo' && effectiveTeamId(t, db) === teamId).length;
  return (
    <aside className="team-side" aria-label="내 팀">
      <div className="team-side-head">
        <h2>내 팀</h2>
        {onOpenTeams && <button className="ghost" title="Ctrl + ←" onClick={onOpenTeams}>관리</button>}
      </div>
      {db.teams.length === 0 ? <p className="desc">아직 팀이 없어요.</p> : (
        <ul>
          {db.teams.map((team) => (
            <li key={team.id} className={team.important ? 'hl' : ''} data-drop-team={team.id}>
              <span className="team-dot" style={{ background: team.color }} />
              <span className="team-side-name">{team.name}</span>
              <span className="team-side-count" title="남은 할 일">{open(team.id)}</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

/* 여러 줄을 골랐을 때 뜨는 막대 — 휴대폰에서는 길게 눌러 선택 모드로 들어온다 */
function SelectionBar({ db, selection, onDone }) {
  const [teams, setTeams] = useState(false);
  const ids = [...selection].filter((id) => db.todos.some((t) => t.id === id));
  const moveTo = async (teamId) => {
    await Promise.all(dropPatches(db, ids, { kind: 'team', teamId }).map(({ id, patch }) => window.api.updateTodo(id, patch)));
    setTeams(false);
    onDone();
  };
  return (
    <div className="selection-bar" role="toolbar" aria-label="선택한 할 일">
      <span className="selection-count">{ids.length}개 선택</span>
      <button className="ghost" aria-expanded={teams} onClick={() => setTeams(!teams)}>팀으로 이동</button>
      <button className="ghost" onClick={onDone}>취소</button>
      {teams && (
        <div className="selection-teams">
          {db.teams.map((team) => (
            <button key={team.id} className="ghost" onClick={() => moveTo(team.id)}>
              <span className="team-dot" style={{ background: team.color }} />
              {team.name}
            </button>
          ))}
          <button className="ghost" onClick={() => moveTo(null)}>팀 없음</button>
        </div>
      )}
    </div>
  );
}

/* 할 일 보드 */
export default function MemoBoard({ db, kind = 'todo', onOpenTeams }) {
  const today = todayStr();
  const [range, setRange] = useState({ start: -7, end: 35 });
  // 기본은 일별 목록
  const [view, setView] = useState('month');
  const [ym, setYm] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const rootRef = useRef(null);
  const inputRefs = useRef({});
  const prependHeightRef = useRef(null);
  const busyRef = useRef(false);
  const pendingFocusRef = useRef(null);
  const pendingScrollRef = useRef(null);
  const wheelGateRef = useRef(0);
  const [fabHost, setFabHost] = useState(null);
  useEffect(() => { setFabHost(rootRef.current?.closest('.app-v') || document.body); }, []);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [selection, setSelection] = useState(() => new Set());
  const [selectMode, setSelectMode] = useState(false);
  useTodoDrag({ rootRef, db, selection, setSelection, selectMode, setSelectMode });


  const scroller = () => (rootRef.current ? rootRef.current.parentElement : null);

  const registerInput = (date, el) => {
    if (el) inputRefs.current[date] = el;
    else delete inputRefs.current[date];
  };

  const focusDay = (date) => {
    const el = inputRefs.current[date];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
    } else {
      pendingFocusRef.current = date;
      const off = offsetFromToday(date, today);
      setRange((r) => ({ start: Math.min(r.start, off - 3), end: Math.max(r.end, off + 3) }));
    }
  };

  // 최초 렌더 시 오늘 위치로 스크롤
  useEffect(() => {
    const sc = scroller();
    const el = document.getElementById('day-' + today);
    if (sc && el) {
      sc.scrollTop = el.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop - parseFloat(getComputedStyle(el).scrollMarginTop || 0);
    }
  }, []);

  // 월 뷰에서 리스트의 특정 날짜로 이동
  const openDay = (date) => {
    const off = offsetFromToday(date, today);
    setRange((r) => ({ start: Math.min(r.start, off - 7), end: Math.max(r.end, off + 14) }));
    pendingScrollRef.current = date;
    setView('list');
  };
  const openDayRef = useRef(openDay);
  openDayRef.current = openDay;

  // Ctrl+휠(핀치 줌)으로 리스트 ↔ 월 뷰 전환, 월 뷰에서는 휠로 월 이동.
  // 가운데 열 바깥 여백에서도 동작하도록 스크롤 영역 전체에서 받는다.
  useEffect(() => {
    const el = scroller();
    if (!el) return;
    const onWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        const now = Date.now();
        if (now - wheelGateRef.current < 350) return;
        wheelGateRef.current = now;
        if (e.deltaY > 0 && viewRef.current === 'list') {
          const under = document.elementFromPoint(e.clientX, e.clientY);
          const dayEl = under && under.closest ? under.closest('.memo-day') : null;
          const d = dayEl ? dayEl.id.slice(4) : todayStr();
          const [y, m] = d.split('-').map(Number);
          setYm({ y, m: m - 1 });
          setView('month');
        } else if (e.deltaY < 0 && viewRef.current === 'month') {
          const cell = e.target.closest ? e.target.closest('[data-date]') : null;
          openDayRef.current((cell && cell.dataset.date) || todayStr());
        }
      } else if (viewRef.current === 'month') {
        e.preventDefault();
        const now = Date.now();
        if (now - wheelGateRef.current < 250) return;
        wheelGateRef.current = now;
        setYm((v) => {
          const d = new Date(v.y, v.m + (e.deltaY > 0 ? 1 : -1), 1);
          return { y: d.getFullYear(), m: d.getMonth() };
        });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // 월 → 리스트 전환 후 해당 날짜로 스크롤
  useEffect(() => {
    if (view === 'list' && pendingScrollRef.current) {
      const el = document.getElementById('day-' + pendingScrollRef.current);
      if (el) {
        pendingScrollRef.current = null;
        el.scrollIntoView({ block: 'start' });
      }
    }
  });

  // 무한 스크롤: 위/아래 근처에서 날짜 범위 확장
  useEffect(() => {
    const sc = scroller();
    if (!sc) return;
    const onScroll = () => {
      if (busyRef.current || viewRef.current !== 'list') return;
      if (sc.scrollTop + sc.clientHeight > sc.scrollHeight - 900) {
        busyRef.current = true;
        setRange((r) => ({ ...r, end: r.end + 21 }));
      } else if (sc.scrollTop < 500) {
        busyRef.current = true;
        prependHeightRef.current = sc.scrollHeight;
        setRange((r) => ({ ...r, start: r.start - 21 }));
      }
    };
    sc.addEventListener('scroll', onScroll);
    return () => sc.removeEventListener('scroll', onScroll);
  }, []);

  // 위쪽으로 날짜를 추가했을 때 스크롤 위치 보정
  useLayoutEffect(() => {
    const sc = scroller();
    if (sc && prependHeightRef.current != null) {
      sc.scrollTop += sc.scrollHeight - prependHeightRef.current;
      prependHeightRef.current = null;
    }
    busyRef.current = false;
  }, [range.start, range.end]);

  // 범위 확장 후 대기 중인 포커스 처리
  useEffect(() => {
    const date = pendingFocusRef.current;
    if (date && inputRefs.current[date]) {
      pendingFocusRef.current = null;
      inputRefs.current[date].focus();
      inputRefs.current[date].scrollIntoView({ block: 'nearest' });
    }
  });

  const goToday = () => {
    const el = document.getElementById('day-' + today);
    if (el) el.scrollIntoView({ block: 'start' });
    const input = inputRefs.current[today];
    if (input) input.focus();
  };

  const dates = [];
  for (let i = range.start; i <= range.end; i++) dates.push(addDays(today, i));

  return (
    <div ref={rootRef} className={'memo-wrap' + (view === 'month' ? ' is-month' : '')}>
      <div className="memo-toolbar">
        <h1 className={''}>
          {'할 일'}
        </h1>

        <div className="view-toggle">
          <button className={'ghost' + (view === 'list' ? ' on' : '')} onClick={() => openDay(today)}>
            일
          </button>
          <button className={'ghost' + (view === 'month' ? ' on' : '')} onClick={() => setView('month')}>
            월
          </button>
        </div>
      </div>
      {view === 'month' ? (
        <div className="month-layout">
          <TeamSidebar db={db} onOpenTeams={onOpenTeams} />
          <MonthView db={db} kind={kind} ym={ym} setYm={setYm} openDay={openDay} />
        </div>
      ) : (
        <>
          {dates.map((date, i) => {
            const p = dateParts(date);
            const showMonth = i === 0 || p.d === 1;
            return (
              <React.Fragment key={date}>
                {showMonth && (
                  <div className="memo-month">
                    {p.y}년 {p.m}월
                  </div>
                )}
                <DaySection
                  date={date}
                  kind={kind}
                  db={db}
                  isToday={date === today}
                  registerInput={registerInput}
                  focusDay={focusDay}
                  selection={selection}
                />
              </React.Fragment>
            );
          })}
        </>
      )}
      {fabHost && selection.size > 0 && (selectMode || selection.size > 1) && createPortal(
        <SelectionBar db={db} selection={selection} onDone={() => { setSelection(new Set()); setSelectMode(false); }} />, fabHost)}
      {/* 오늘로 점프 — 항상 우측 하단 고정. 유리판(backdrop-filter)이 fixed 기준이 되지 않게 앱 루트에 띄운다. */}
      {fabHost && createPortal(<button
        className="fab-today"
        title="오늘로 이동"
        onClick={() => {
          if (view === 'month') {
            const d = new Date();
            setYm({ y: d.getFullYear(), m: d.getMonth() });
          } else {
            goToday();
          }
        }}
      >
        ◎ 오늘
      </button>, fabHost)}
    </div>
  );
}
