import { createPortal } from 'react-dom';
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TodoEditor, TeamControl, RepeatEditor, repeatLabel } from '../components.jsx';
import { SourceMark } from '../icons.jsx';
import { compactTitle } from '../focus-utils.mjs';
import { lineSort, teamSort, teamGroups, cycleTeam } from '../../../shared/todo-drop.js';
import { useTodoDrag } from './useTodoDrag.js';
import { Typed } from '../typing.jsx';
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
    ...(ctx && Number.isFinite(ctx.sortOrder) ? { sortOrder: ctx.sortOrder } : {}),
  });

/* 여러 줄 붙여넣기: 줄마다 할 일로 추가하되, 팀/프로젝트/채널 이름 줄은 그룹 전환으로 처리 */
// `place` ({ order, next }): pasted into a line, the new lines go right below it (while they stay in its group).
function pasteLines(text, { date, kind, db, ctx, firstPrefix = '', place = null }) {
  const lines = text.split(/\r?\n/).map((s) => s.trim());
  let cur = ctx, order = place?.order;
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
    if (cur === ctx && Number.isFinite(order)) {
      order = Number.isFinite(place.next) ? (order + place.next) / 2 : order + 1024;
      addWith({ ...cur, sortOrder: order }, line, date, kind);
    } else addWith(cur, line, date, kind);
  }
  return cur;
}

// Tab, even pressed while a Korean syllable is still being composed (the IME then reports key 'Process').
const isTab = (e) => e.key === 'Tab' || e.code === 'Tab' || e.keyCode === 9;
// The day input's group chip for a team (null: no team).
const teamCtx = (team) => (team ? { label: team.name, color: team.color, teamId: team.id, projectId: null, channel: null } : null);

// The team a line being written goes to, shown in front of the text (Tab changes it); 팀 없음 is a tag too.
function TeamTag({ team }) {
  return <span className={'edit-team-tag' + (team ? '' : ' none')} style={team ? { '--team': team.color } : undefined} title="Tab / Shift+Tab: 팀 바꾸기">
    {team && <span className="team-dot" style={{ background: team.color }} />}{team ? team.name : '팀 없음'}
  </span>;
}

/* 한 줄(할 일). 제목 클릭 → 인라인 편집 */
function MemoLine({ todo, db, editing, caret, onStartEdit, onEndEdit, onEnter, onEscape, onBackspace, onArrow, placeAfter, indent, kind, selected }) {
  const [detail, setDetail] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const inputRef = useRef(null);
  const project = db.projects.find((p) => p.id === todo.projectId);
  const isDone = todo.status === 'done';
  const hl = importantHighlight(todo, db);

  useEffect(() => {
    if (editing && inputRef.current) {
      const el = inputRef.current;
      el.focus();
      const at = Math.min(caret ?? el.value.length, el.value.length);
      el.setSelectionRange(at, at);
      fit(el);
    }
  }, [editing]);

  // The edit box is as narrow as the title and grows downward when the text wraps.
  const fit = (el) => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; };

  const removed = useRef(false); // joined into the line above by Backspace: nothing left to save
  // Tab picks a team for the line while it is edited: only the tag in front of the text changes (the line stays where
  // it is); the line moves under that team when the editing ends. undefined: not touched.
  const [pickedTeam, setPickedTeam] = useState(undefined);
  const picked = useRef(undefined); picked.current = pickedTeam;
  useEffect(() => { if (!editing) setPickedTeam(undefined); }, [editing]);
  const teamPatch = () => (picked.current !== undefined && picked.current !== (todo.teamId || null) ? { teamId: picked.current } : {});
  const save = () => {
    if (!inputRef.current || removed.current) return;
    const v = inputRef.current.value.trim(), patch = { ...(v !== todo.title ? { title: v } : {}), ...teamPatch() };
    if (!v) window.api.deleteTodo(todo.id);
    else if (Object.keys(patch).length) window.api.updateTodo(todo.id, patch);
    onEndEdit();
  };

  const onKeyDown = (e) => {
    const el = e.currentTarget;
    if (isTab(e)) {
      // Tab / Shift+Tab: the next / previous team in the order the day shows them (팀 없음 first), round and round.
      e.preventDefault();
      const next = cycleTeam(db, { ...todo, teamId: picked.current !== undefined ? picked.current : todo.teamId }, e.shiftKey ? -1 : 1);
      if (next !== undefined) setPickedTeam(next);
      return;
    }
    if (e.nativeEvent.isComposing) return;
    if (e.key === 'Enter') {
      // Like a notepad: Enter splits the line at the caret; what follows the caret moves to a new line right below.
      e.preventDefault();
      const head = el.value.slice(0, el.selectionStart).trimEnd(), tail = el.value.slice(el.selectionEnd).trim();
      if (head) el.value = head;
      save();
      onEnter(todo, head ? tail : '');
    } else if (e.key === 'Escape') {
      const patch = teamPatch();
      if (Object.keys(patch).length) window.api.updateTodo(todo.id, patch);
      onEndEdit();
      onEscape();
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !e.shiftKey && el.selectionStart === el.selectionEnd) {
      // ↑ on the first row / ↓ on the last row of the text moves to the line above / below.
      const rows = Math.round(el.scrollHeight / (parseFloat(getComputedStyle(el).lineHeight) || 20));
      const up = e.key === 'ArrowUp';
      if (rows <= 1 || (up ? el.selectionStart === 0 : el.selectionEnd === el.value.length)) { e.preventDefault(); onArrow(todo, up ? -1 : 1); }
    } else if (e.key === 'Backspace' && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      e.preventDefault();
      // A team tag in front goes first (the line keeps the team it had).
      if (picked.current !== undefined) { setPickedTeam(undefined); return; }
      // Like a notepad: at the start of a line, Backspace joins it to the line above (an empty line just goes away).
      if (onBackspace(todo, inputRef.current.value)) removed.current = true;
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
        {editing && pickedTeam !== undefined && <TeamTag team={db.teams.find((t) => t.id === pickedTeam)} />}
        {editing ? (
          <textarea
            ref={inputRef}
            className="memo-edit" maxLength={50} rows={1}
            defaultValue={todo.title}
            onInput={(e) => fit(e.currentTarget)}
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
                place: placeAfter?.(todo),
              });
              onEndEdit();
            }}
          />
        ) : (
          <span className="memo-title" title={todo.title} onClick={onStartEdit}>
            <Typed id={todo.id} text={compactTitle(todo.title)} />
          </span>
        )}

        {project && <span className="badge">{project.name}</span>}
        {/* The empty stretch of the row: press and move here to drag it (on touch, only here). */}
        <span className="memo-grab" aria-hidden="true" />
        <span className="memo-right">
          {(todo.startTime || todo.endTime) && (
            <span className="meta">
              {todo.startTime || ''}
              {todo.endTime ? `~${todo.endTime}` : ''}
            </span>
          )}
          {todo.repeat && <button type="button" className="repeat-mark" title="반복 설정" onClick={() => setRepeatOpen(!repeatOpen)}>↻ {repeatLabel(todo.repeat)}</button>}
          <TeamControl todo={todo} db={db} />
          <span className="memo-actions">
            <button className="ghost" title="날짜·시간 설정" onClick={() => setDetail(!detail)}>
              📅
            </button>
            {!todo.repeat && <button className="ghost" title="반복" aria-label="반복" onClick={() => setRepeatOpen(!repeatOpen)}>↻</button>}
            <button className="ghost" title="버킷으로" onClick={() => window.api.updateTodo(todo.id, { status: 'bucket' })}>
              버킷
            </button>
            <button className="ghost danger" title="삭제" onClick={() => window.api.deleteTodo(todo.id)}>
              ✕
            </button>
          </span>
        </span>
        <SourceMark todo={todo} />
      </div>
      {detail && <TodoEditor todo={todo} db={db} onClose={() => setDetail(false)} />}
      {repeatOpen && <RepeatEditor todo={todo} onClose={() => setRepeatOpen(false)} />}
    </div>
  );
}

/* 그룹(팀/프로젝트) 안에서 이어 쓰는 입력 줄 */
function GroupInput({ date, kind, db, base, indent, onClose, onEditLast, onAdded, onDown }) {
  const [text, setText] = useState(base.text || '');
  // Each line typed here goes right below the previous one (between the line it came from and the next).
  const order = useRef(base.order);
  // Tab: the team the lines typed here go to (a tag in front; undefined = the group the line came from).
  const [picked, setPicked] = useState(undefined);
  const place = () => {
    const into = picked === undefined ? base : { ...base, teamId: picked, projectId: null, channel: null };
    if (!Number.isFinite(order.current) || picked !== undefined) return into;
    const at = Number.isFinite(base.next) ? (order.current + base.next) / 2 : order.current + 1024;
    order.current = at; onAdded?.(at);
    return { ...into, sortOrder: at };
  };
  const [sugIdx, setSugIdx] = useState(0);
  const [sugOff, setSugOff] = useState(false);
  const ref = useRef(null);

  const sugs = sugOff ? [] : suggestGroups(text, kind, db);

  useEffect(() => {
    if (!ref.current) return;
    ref.current.focus();
    if (base.text) ref.current.setSelectionRange(0, 0); // caret where the line was split
  }, []);

  const pickSug = (g) => {
    setText('');
    setSugIdx(0);
    onClose(g); // 선택한 카테고리로 전환
  };

  const onKeyDown = (e) => {
    if (isTab(e)) {
      // A suggested team name: take it. Otherwise Tab / Shift+Tab changes the tag (팀 없음 → each team → …).
      e.preventDefault();
      if (sugs.length && !e.nativeEvent.isComposing) { pickSug(sugs[sugIdx] || sugs[0]); return; }
      const next = cycleTeam(db, { teamId: picked !== undefined ? picked : base.teamId || null }, e.shiftKey ? -1 : 1);
      if (next !== undefined) setPicked(next);
      return;
    }
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
      addWith(place(), v, date, kind);
      setText('');
    } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !sugs.length && !text) {
      e.preventDefault();
      if (e.key === 'ArrowUp') onEditLast(); else onDown?.();
    } else if (e.key === 'ArrowDown' && sugs.length) {
      e.preventDefault();
      setSugIdx((sugIdx + 1) % sugs.length);
    } else if (e.key === 'ArrowUp' && sugs.length) {
      e.preventDefault();
      setSugIdx((sugIdx - 1 + sugs.length) % sugs.length);
    } else if (e.key === 'Escape') {
      if (sugs.length) setSugOff(true);
      else onClose();
    } else if (e.key === 'Backspace' && picked !== undefined && e.currentTarget.selectionStart === 0 && e.currentTarget.selectionEnd === 0) {
      e.preventDefault();
      setPicked(undefined); // the tag goes first: back to the group the line came from
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault();
      onEditLast();
    }
  };

  // 포커스를 잃으면 쓰던 내용을 그대로 저장하고 닫는다
  const commitOnBlur = () => {
    const v = text.trim();
    if (v) addWith(place(), v, date, kind);
    setText('');
    onClose();
  };

  return (
    <div className={'memo-input-row is-draft' + (indent ? ' indent' : '')}>
      {picked !== undefined && <TeamTag team={db.teams.find((t) => t.id === picked)} />}
      <input
        ref={ref}
        className="memo-input" maxLength={50}
        value={text}
        aria-label="할 일 입력"
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
  const [noTeam, setNoTeam] = useState(false); // Tab went round to 팀 없음: say so with a tag
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
    if (isTab(e)) {
      // A suggested team name: take it. Otherwise Tab / Shift+Tab switches the team these lines go under.
      e.preventDefault();
      if (sugs.length && !e.nativeEvent.isComposing) { pickSug(sugs[sugIdx] || sugs[0]); return; }
      const next = cycleTeam(db, { teamId: ctx?.teamId ?? null }, e.shiftKey ? -1 : 1);
      if (next !== undefined) { setCtx(teamCtx(db.teams.find((t) => t.id === next))); setNoTeam(next === null); }
      return;
    }
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
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault();
      if (ctx) setCtx(null);
      else if (noTeam) setNoTeam(false); // the 팀 없음 tag goes first
      else onBackspaceEmpty();
    } else if (e.key === 'ArrowUp' && text === '') {
      // ↑ from the empty input: the day's last line (or the day before when this one is empty), like a notepad.
      e.preventDefault();
      onBackspaceEmpty();
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
      {!ctx && noTeam && <TeamTag team={null} />}
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
        aria-label="할 일 입력"
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

/* 팀 제목 아래 늘 떠 있는 입력 줄 — "내 팀 전부 넣기"로 꺼낸 팀에 바로 적는다 */
function TeamAddInput({ date, kind, db, team, inputRef, onNext, onUp, onFocusChange }) {
  const [text, setText] = useState('');
  const base = { teamId: team.id, projectId: null, channel: null, label: team.name, color: team.color };
  const commit = () => {
    const v = text.trim();
    if (v) addWith(base, v, date, kind);
    setText('');
  };
  return (
    <div className="memo-input-row indent team-add-row">
      <input
        ref={inputRef}
        className="memo-input" maxLength={50}
        aria-label={team.name + ' 할 일 입력'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            if (text.trim()) commit();
            else onNext(); // 빈 줄에서 Enter → 다음 팀으로
          } else if (e.key === 'Escape') e.currentTarget.blur();
          else if (e.key === 'Backspace' && !text) { e.preventDefault(); onUp(); } // empty: up to the line above
        }}
        onPaste={(e) => {
          const t = e.clipboardData.getData('text');
          if (!t.includes('\n')) return;
          e.preventDefault();
          pasteLines(t, { date, kind, db, ctx: base, firstPrefix: text });
          setText('');
        }}
        onFocus={() => onFocusChange(true)}
        onBlur={() => { commit(); onFocusChange(false); }}
      />
    </div>
  );
}

function DaySection({ date, kind, db, isToday, registerInput, focusDay, selection }) {
  const [editingId, setEditingId] = useState(null);
  const caretRef = useRef(null); // where the caret lands in the line being opened (null = end)
  const [typingTeam, setTypingTeam] = useState(null); // the team input row in use stays while you type in it
  const [draft, setDraft] = useState(null); // { key, teamId, projectId, channel }
  const [ctx, setCtx] = useState(null);
  // 날짜를 누르면 "내 팀 전부 넣기"가 뜨고, 누르면 모든 팀이 제목으로 들어온다(빈 팀은 화면에만 있는 틀).
  const [teamPill, setTeamPill] = useState(false);
  const [allTeams, setAllTeams] = useState(false);
  const headRef = useRef(null);
  const teamInputs = useRef({});
  const pendingTeamFocus = useRef(null);
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
    .filter((g) => allTeams || g.list.length);
  const displayOrder = [...noTeam, ...teamGroups.flatMap((g) => g.list)];

  const { m, d, dow } = dateParts(date);

  // 다른 곳을 누르면 버튼은 닫힌다.
  useEffect(() => {
    if (!teamPill) return;
    const away = (e) => { if (!headRef.current?.contains(e.target)) setTeamPill(false); };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [teamPill]);
  // 넣은 직후 첫 빈 팀(없으면 첫 팀)의 입력 줄로.
  useEffect(() => {
    const id = pendingTeamFocus.current;
    if (!id) return;
    pendingTeamFocus.current = null;
    teamInputs.current[id]?.focus();
  });
  const insertAllTeams = () => {
    setTeamPill(false);
    if (!db.teams.length) return;
    const empty = db.teams.find((team) => !items.some((t) => effectiveTeamId(t, db) === team.id));
    pendingTeamFocus.current = (empty || db.teams[0]).id;
    setAllTeams(true);
  };
  const focusNextTeam = (teamId) => {
    const i = db.teams.findIndex((t) => t.id === teamId);
    const next = db.teams[i + 1];
    if (next) teamInputs.current[next.id]?.focus();
    else focusDay(date);
  };

  // 줄에서 Enter → 그 줄이 속한 그룹에 이어서 새 줄
  // Enter on a line → a new line right below it in the same group (with the text after the caret, if any).
  const sortKey = (t) => t.sortOrder ?? t.createdAt ?? 0;
  const placeAfter = (todo) => {
    const key = effectiveTeamId(todo, db) || '';
    const list = key ? teamGroups.find((g) => g.team.id === key)?.list || [] : noTeam;
    const next = list.slice(list.findIndex((t) => t.id === todo.id) + 1).find((t) => !t.startTime);
    return { key, order: sortKey(todo), next: next ? sortKey(next) : undefined };
  };
  const continueFrom = (todo, text = '') => {
    const { key, order, next } = placeAfter(todo);
    setDraft({ key, teamId: todo.teamId || null, projectId: todo.projectId || null, channel: todo.channel || null, afterId: todo.id, order, next, text });
  };
  // Where the open draft line sits in a group: right after the line it came from and the lines typed since.
  const draftAnchor = (list) => {
    if (!draft?.afterId) return null;
    let at = null;
    for (const t of list) if (t.id === draft.afterId || (!t.startTime && Number.isFinite(draft.order) && sortKey(t) <= draft.order)) at = t.id;
    return at;
  };
  // ↑ / ↓ from a line: the line above / below in the day; below the last line is the day's input.
  const stepLine = (todo, dir) => {
    const i = displayOrder.findIndex((t) => t.id === todo.id), t = displayOrder[i + dir];
    if (t) editLine(t.id, dir < 0 ? null : 0);
    else if (dir > 0) { setEditingId(null); focusDay(date); }
  };

  const closeDraft = (nextGroup) => {
    setDraft(null);
    if (nextGroup) {
      setCtx(nextGroup);
      focusDay(date);
    }
  };

  const editLine = (id, caret = null) => { setDraft(null); caretRef.current = caret; setEditingId(id); };
  // Backspace at the start of a line, as in a notepad: the line joins the one above it in the day (an empty one just
  // disappears) and the caret stays where they met. The first line of the day only goes away if it is empty.
  const backspaceLine = (todo, text) => {
    const i = displayOrder.findIndex((t) => t.id === todo.id), prev = displayOrder[i - 1], next = displayOrder[i + 1];
    if (!prev) {
      if (text) return false;
      window.api.deleteTodo(todo.id);
      if (next) editLine(next.id, 0); else { setEditingId(null); focusDay(date); }
      return true;
    }
    const joined = prev.title + text;
    if (Array.from(joined).length > 50) { editLine(prev.id); return false; } // too long to join: just move up
    window.api.deleteTodo(todo.id);
    if (text) window.api.updateTodo(prev.id, { title: joined });
    editLine(prev.id, prev.title.length);
    return true;
  };
  // From an empty team input row: up to the last line above it.
  const upFromTeam = (teamId) => {
    const i = teamGroups.findIndex((g) => g.team.id === teamId);
    const above = [...noTeam, ...teamGroups.slice(0, i + 1).flatMap((g) => g.list)].at(-1);
    if (above) editLine(above.id);
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
      caret={editingId === t.id ? caretRef.current : null}
      onStartEdit={() => editLine(t.id)}
      onEndEdit={() => setEditingId((id) => (id === t.id ? null : id))}
      onEnter={continueFrom}
      onEscape={() => focusDay(date)}
      onBackspace={backspaceLine}
      onArrow={stepLine}
      placeAfter={placeAfter}
      selected={selection.has(t.id)}
    />
  );

  const draftInput = (list, indent) => {
    const anchor = draftAnchor(list), below = anchor ? displayOrder[displayOrder.findIndex((t) => t.id === anchor) + 1] : null;
    return (
      <GroupInput
        key={'draft-' + (draft.afterId || 'end')}
        date={date}
        kind={kind}
        db={db}
        base={draft}
        indent={indent}
        onClose={closeDraft}
        onEditLast={() => (anchor ? editLine(anchor) : editLastOf(list))}
        onDown={() => (below ? editLine(below.id, 0) : (setDraft(null), focusDay(date)))}
        onAdded={(order) => setDraft((d) => (d ? { ...d, order, text: '' } : d))} // the input moves under the new line
      />
    );
  };
  // The draft line goes right under the line it came from, or at the end of the group.
  const linesWithDraft = (key, list, indent) => {
    const open = draft && draft.key === key, anchor = open ? draftAnchor(list) : null;
    return (
      <>
        {list.map((t) => (
          <React.Fragment key={t.id}>
            {renderLine(t, indent)}
            {open && anchor === t.id && draftInput(list, indent)}
          </React.Fragment>
        ))}
        {open && !anchor && draftInput(list, indent)}
      </>
    );
  };

  return (
    <section
      className={'memo-day' + (isToday ? ' is-today' : '') + (items.length === 0 ? ' is-empty' : '')}
      id={'day-' + date}
    >
      <div className="memo-head" ref={headRef}>
        <button
          type="button"
          className="memo-head-date"
          aria-expanded={teamPill}
          title="눌러서 내 팀 전부 넣기"
          onClick={() => setTeamPill((v) => !v)}
        >
          <span className={'memo-dow' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '')}>{DOW_NAMES[dow]}</span>
          <span className="memo-date">
            {m}월 {d}일
          </span>
        </button>
        {isToday && <span className="memo-today">오늘</span>}
        {teamPill && (
          <button type="button" className="team-template-pill" onClick={insertAllTeams} disabled={!db.teams.length}>
            {db.teams.length ? '내 팀 전부 넣기' : '팀이 없어요'}
          </button>
        )}
      </div>
      {events.map((ev) => (
        <div className="memo-event" key={ev.id} title="구글 캘린더 일정">
          <span className="event-time">{ev.allDay ? '종일' : fmtTime(ev.start)}</span>
          {ev.title}
        </div>
      ))}
      {linesWithDraft('', noTeam, false)}
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
          {linesWithDraft(team.id, list, true)}
          {/* A team's input row shows only while the team has no lines yet (or you are typing in it): no empty rows in between. */}
          {allTeams && !(draft && draft.key === team.id) && (!list.length || typingTeam === team.id) && (
            <TeamAddInput
              date={date}
              kind={kind}
              db={db}
              team={team}
              inputRef={(el) => { if (el) teamInputs.current[team.id] = el; else delete teamInputs.current[team.id]; }}
              onNext={() => focusNextTeam(team.id)}
              onUp={() => upFromTeam(team.id)}
              onFocusChange={(on) => setTypingTeam((cur) => (on ? team.id : cur === team.id ? null : cur))}
            />
          )}
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
          if (displayOrder.length) editLine(displayOrder[displayOrder.length - 1].id);
          else focusDay(addDays(date, -1));
        }}
      />
    </section>
  );
}

/* 월 캘린더 뷰 */
/* 달력 칸의 할 일 한 줄 — 팀 색 띠, 완료는 취소선. 주간 보기에서는 시간도 보인다. */
function calChip(t, db, showTime = false) {
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
      {showTime && t.startTime && <span className="cal-chip-time">{t.startTime}</span>}
      <span className="cal-chip-title"><Typed id={t.id} text={compactTitle(t.title)} /></span><SourceMark todo={t} size={12} />
    </div>
  );
}

function MonthView({ db, kind, ym, setYm, openDay, toggle }) {
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
  // Chips follow the teams (no names here, just the order).
  for (const list of Object.values(byDate)) list.sort(teamSort(db));

  const move = (n) => {
    const d = new Date(ym.y, ym.m + n, 1);
    setYm({ y: d.getFullYear(), m: d.getMonth() });
  };

  const chip = (t) => calChip(t, db);

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
        {toggle}
        <button
          className="ghost cal-today"
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
    </div>
  );
}

/* 주간 보기 — 일~토 7칸(휴대폰에서는 7줄). 시간 있는 일이 먼저, 칸을 누르면 그 날의 일 보기로. */
const WEEK_DOW = ['일', '월', '화', '수', '목', '금', '토'];
const weekStart = (date) => addDays(date, -dateParts(date).dow);

function WeekView({ db, kind, weekOf, setWeekOf, openDay, toggle }) {
  const today = todayStr();
  const start = weekStart(weekOf);
  const days = WEEK_DOW.map((_, i) => addDays(start, i));
  const byDate = {};
  for (const t of db.todos) {
    if (t.kind !== kind || t.status === 'bucket' || !t.date) continue;
    (byDate[t.date] = byDate[t.date] || []).push(t);
  }
  const a = dateParts(days[0]), b = dateParts(days[6]);
  return (
    <div className="month-view week-view">
      <div className="cal-nav">
        <button className="ghost" aria-label="지난주" onClick={() => setWeekOf(addDays(start, -7))}>◀</button>
        <span className="cal-title">{a.m}월 {a.d}일 – {b.m !== a.m ? `${b.m}월 ` : ''}{b.d}일</span>
        <button className="ghost" aria-label="다음 주" onClick={() => setWeekOf(addDays(start, 7))}>▶</button>
        {toggle}
        <button className="ghost cal-today" onClick={() => setWeekOf(today)}>오늘</button>
      </div>
      <div className="week-grid">
        {days.map((date, i) => (
          <div key={date} data-date={date} className={'cal-cell week-day' + (date === today ? ' today' : '')} onClick={() => openDay(date)}>
            <div className={'week-head' + (i === 0 ? ' sun' : i === 6 ? ' sat' : '')}>
              <span className="week-dow">{WEEK_DOW[i]}</span>
              <span className="week-date">{dateParts(date).d}</span>
            </div>
            {/* Grouped by team, each group under its team's name (on phones only the order is kept). */}
            <div className="week-chips">{teamGroups(db, byDate[date] || []).map(({ team, list }) => (
              <React.Fragment key={team?.id || 'none'}>
                {team && <div className="week-team"><span className="team-dot" style={{ background: team.color }} />{team.name}</div>}
                {list.map((t) => calChip(t, db, true))}
              </React.Fragment>
            ))}</div>
          </div>
        ))}
      </div>
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

/* 끄는 동안만 뜨는 쓰레기통 — 여기에 놓으면 삭제(되돌리기 가능). 팀은 그 팀 줄 사이에 놓으면 들어간다. */
function TrashDrop() {
  return (
    <div className="todo-drop-strip" role="group" aria-label="여기에 놓아 삭제">
      <span className="todo-drop-trash" data-drop-trash="">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 7h16M9 7V4.8c0-.4.4-.8.8-.8h4.4c.4 0 .8.4.8.8V7M6.5 7l.9 12.2c.1.9.8 1.6 1.7 1.6h5.8c.9 0 1.6-.7 1.7-1.6L17.5 7M10 11v6M14 11v6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
        삭제
      </span>
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
  const [weekOf, setWeekOf] = useState(today);
  const weekRef = useRef(weekOf);
  weekRef.current = weekOf;
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
  const [dragging, setDragging] = useState(false);
  const [selection, setSelection] = useState(() => new Set());
  useTodoDrag({ rootRef, db, selection, setSelection, onDragging: setDragging });


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

  // Ctrl+휠(핀치 줌)으로 일 ↔ 주 ↔ 월 한 단계씩 전환, 월 뷰에서는 휠로 월 이동.
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
        const cell = e.target.closest ? e.target.closest('[data-date]') : null;
        if (e.deltaY > 0 && viewRef.current === 'list') {
          const under = document.elementFromPoint(e.clientX, e.clientY);
          const dayEl = under && under.closest ? under.closest('.memo-day') : null;
          setWeekOf(dayEl ? dayEl.id.slice(4) : todayStr());
          setView('week');
        } else if (e.deltaY > 0 && viewRef.current === 'week') {
          const [y, m] = ((cell && cell.dataset.date) || weekRef.current).split('-').map(Number);
          setYm({ y, m: m - 1 });
          setView('month');
        } else if (e.deltaY < 0 && viewRef.current === 'month') {
          setWeekOf((cell && cell.dataset.date) || todayStr());
          setView('week');
        } else if (e.deltaY < 0 && viewRef.current === 'week') {
          openDayRef.current((cell && cell.dataset.date) || weekRef.current);
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

  // 일 · 주 · 월 — next to the title on the day page, next to the month/week name in the calendars.
  const toggle = (
    <div className="view-toggle">
      <button className={'ghost' + (view === 'list' ? ' on' : '')} onClick={() => openDay(today)}>
        일
      </button>
      <button className={'ghost' + (view === 'week' ? ' on' : '')} onClick={() => { setWeekOf(today); setView('week'); }}>
        주
      </button>
      <button className={'ghost' + (view === 'month' ? ' on' : '')} onClick={() => setView('month')}>
        월
      </button>
    </div>
  );

  return (
    <div ref={rootRef} className={'memo-wrap' + (view !== 'list' ? ' is-month' : '')}>
      <div className="memo-toolbar">
        <h1 className={''}>
          {'할 일'}
        </h1>
        {view === 'list' && toggle}
      </div>
      {view !== 'list' ? (
        <div className="month-layout">
          <TeamSidebar db={db} onOpenTeams={onOpenTeams} />
          {view === 'week'
            ? <WeekView db={db} kind={kind} weekOf={weekOf} setWeekOf={setWeekOf} openDay={openDay} toggle={toggle} />
            : <MonthView db={db} kind={kind} ym={ym} setYm={setYm} openDay={openDay} toggle={toggle} />}
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
      {fabHost && dragging && createPortal(<TrashDrop />, fabHost)}
      {/* 오늘로 점프 — 항상 우측 하단 고정. 유리판(backdrop-filter)이 fixed 기준이 되지 않게 앱 루트에 띄운다. */}
      {fabHost && createPortal(<button
        className="fab-today"
        title="오늘로 이동"
        onClick={() => {
          if (view === 'month') {
            const d = new Date();
            setYm({ y: d.getFullYear(), m: d.getMonth() });
          } else if (view === 'week') {
            setWeekOf(today);
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
