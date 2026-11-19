import { useEffect, useRef } from 'react';
import { compactTitle } from '../focus-utils.mjs';
import { dropPatches } from '../../../shared/todo-drop.js';

const EDGE = 56, EDGE_DWELL = 420, HOLD_MS = 350;
// Parts of a row that keep their own click (editing, checkbox, buttons, team picker).
const OWN_CLICK = 'input,button,a,select,textarea,label,.suggest-pop,.todo-editor';

const openRoom = () => (document.querySelector('.clock-dock.is-open') ? 1 : document.querySelector('.manage-dock.is-open') ? -1 : 0);
const goRoom = (room) => window.dispatchEvent(new CustomEvent('checker:room', { detail: { room } }));
// "할 일을 삭제했어요 · 되돌리기" after a drop on the bin; one at a time.
let toast = null;
function undoToast(text, undo) {
  toast?.remove();
  const el = document.createElement('div');
  el.className = 'todo-undo-toast'; el.setAttribute('role', 'status');
  const label = document.createElement('span'); label.textContent = text;
  const button = document.createElement('button'); button.type = 'button'; button.textContent = '되돌리기';
  button.onclick = () => { undo(); el.remove(); };
  el.append(label, button); document.body.appendChild(el); toast = el;
  setTimeout(() => { if (toast === el) { el.remove(); toast = null; } }, 5000);
}
async function trash(todos) {
  await Promise.all(todos.map((t) => window.api.deleteTodo(t.id)));
  const back = todos.map(({ title, notes, date, startTime, endTime, teamId, projectId, channel, status }) => ({ title, notes, date, startTime, endTime, teamId, projectId, channel, status }));
  undoToast(todos.length > 1 ? `할 일 ${todos.length}개를 삭제했어요` : '할 일을 삭제했어요', () => back.forEach((t) => window.api.addTodo(t)));
}
const typing = (el) => el instanceof Element && !!el.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');

/*
 * Drag notebook rows by the part beside their text (the text itself is kept narrow and wraps, so the two never mix).
 * Mouse: press and move drags at once. Touch: hold still for a moment, then move — a move before that scrolls,
 * and a plain tap anywhere on a row edits its text.
 * Several at once (computer): click a row to select it, Shift+click for a range, Ctrl/⌘+click to add or remove one,
 * or drag a box over the notebook's empty space (like icons on a desktop). A selected row drags the whole selection;
 * Delete removes it (with undo); Esc or a press outside the to-dos lets go.
 * Text, like a notepad: dragging across the titles selects text, across lines too; Delete / Backspace / typing then
 * joins what is left of the first line with what is left of the last (the lines between go), and the caret stays
 * where the cut was.
 * Drops: between lines (order, day and team — dropping among a team's lines puts it in that team), onto a team
 * (sidebar, notebook header or the teams room), onto a day header (out of its team), onto a calendar cell (date),
 * onto the bin shown while dragging (delete, with undo) and onto the clock (time).
 * Dragging to the right edge slides the clock in; dragging back left out of it slides it away again.
 */
export function useTodoDrag({ rootRef, db, selection, setSelection, onDragging }) {
  const live = useRef({});
  live.current = { db, selection, onDragging };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let p = null, ghost = null, line = null, marked = null, edge = null, suppress = { until: 0, el: null }, anchor = null, m = null, box = null;
    const order = () => [...root.querySelectorAll('.memo-line[data-todo-id]')].map((el) => el.dataset.todoId);
    const set = (ids) => setSelection(new Set(ids));
    const clear = () => { if (live.current.selection.size) set([]); };

    const mark = (el) => {
      if (marked === el) return;
      marked?.classList.remove('is-drop-target');
      marked = el; el?.classList.add('is-drop-target');
    };
    const showLine = (rect, after) => {
      if (!line) { line = document.createElement('div'); line.className = 'todo-drop-line'; document.body.appendChild(line); }
      Object.assign(line.style, { display: 'block', left: rect.left + 'px', width: rect.width + 'px', top: (after ? rect.bottom : rect.top) - 1 + 'px' });
    };
    const hideLine = () => { if (line) line.style.display = 'none'; };

    // What is under the pointer right now, in the room that is open.
    const targetAt = (x, y) => {
      const room = openRoom();
      if (room === 1) return { kind: 'clock' };
      const el = document.elementFromPoint(x, y);
      if (!el) return null;
      const bin = el.closest('[data-drop-trash]');
      if (bin) return { kind: 'trash', el: bin };
      const team = el.closest('[data-drop-team]');
      if (team) return { kind: 'team', teamId: team.dataset.dropTeam || null, date: team.dataset.dropDate, el: team };
      if (room !== 0) return null;
      const row = el.closest('.memo-line[data-todo-id]');
      if (row && root.contains(row)) {
        if (p.ids.includes(row.dataset.todoId)) return null;
        const r = row.querySelector('.memo-line-main').getBoundingClientRect();
        return { kind: 'line', targetId: row.dataset.todoId, targetDay: row.dataset.spanDay, after: y > r.top + r.height / 2, rect: r };
      }
      const day = el.closest('.memo-day');
      if (day && root.contains(day)) return { kind: 'day', date: day.id.slice(4), el: day.querySelector('.memo-head') };
      const cell = el.closest('.cal-cell[data-date]');
      if (cell) return { kind: 'date', date: cell.dataset.date, el: cell };
      return null;
    };

    const begin = () => {
      const sel = live.current.selection;
      let ids = [p.id];
      if (!p.chip && sel.has(p.id)) ids = order().filter((id) => sel.has(id));
      else if (!p.chip && !p.touch) set([p.id]);
      p.ids = ids; p.started = true;
      // The day of a multi-day to-do's part that was picked up (it lands where it is dropped; the span moves along).
      p.fromDays = p.el.dataset.spanDay ? { [p.id]: p.el.dataset.spanDay } : {};
      const todo = live.current.db.todos.find((t) => t.id === p.id);
      ghost = document.createElement('div');
      ghost.className = 'todo-drag-ghost';
      ghost.textContent = compactTitle(todo?.title || '', 24);
      if (ids.length > 1) { const b = document.createElement('b'); b.textContent = String(ids.length); ghost.appendChild(b); }
      document.body.appendChild(ghost);
      document.body.classList.add('todo-dragging');
      live.current.onDragging?.(true);
      getSelection()?.removeAllRanges();
      p.sources = p.chip ? [p.el] : ids.map((id) => root.querySelector(`.memo-line[data-todo-id="${CSS.escape(id)}"]`)).filter(Boolean);
      p.sources.forEach((el) => el.classList.add('is-drag-source'));
    };
    // Near the top or bottom of the notebook while dragging, it scrolls by itself (faster closer to the edge).
    const auto = { dir: 0, speed: 0, raf: 0, x: 0, y: 0 };
    const scroller = () => { for (let el = root.parentElement; el; el = el.parentElement) if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) return el; return null; };
    const stopAuto = () => { cancelAnimationFrame(auto.raf); auto.dir = 0; auto.raf = 0; };
    const autoStep = () => {
      const sc = scroller();
      if (!auto.dir || !p?.started || !sc || openRoom() !== 0) { auto.dir = 0; auto.raf = 0; return; }
      sc.scrollTop += auto.dir * auto.speed;
      track(auto.x, auto.y, true);
      auto.raf = requestAnimationFrame(autoStep);
    };
    const edgeScroll = (x, y) => {
      auto.x = x; auto.y = y;
      // Only in the notebook itself, and not while heading for the side rooms (the left/right edges).
      const sc = openRoom() === 0 && x > EDGE && x < innerWidth - EDGE ? scroller() : null;
      if (!sc) { stopAuto(); return; }
      const r = sc.getBoundingClientRect(), zone = 70, top = y - r.top, bottom = r.bottom - y;
      const dir = top < zone ? -1 : bottom < zone ? 1 : 0;
      auto.speed = dir ? Math.round(4 + 16 * (1 - Math.max(0, Math.min(zone, dir < 0 ? top : bottom)) / zone)) : 0;
      if (dir === auto.dir) return;
      cancelAnimationFrame(auto.raf); auto.dir = dir; auto.raf = dir ? requestAnimationFrame(autoStep) : 0;
    };
    const track = (x, y, fromAuto = false) => {
      if (!fromAuto) edgeScroll(x, y);
      ghost.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
      p.lastX = x; p.lastY = y;
      // Holding at the right/left edge slides to the next room (clock / teams), like a swipe.
      const side = x > innerWidth - EDGE ? 1 : x < EDGE ? -1 : 0;
      if (side !== (edge?.side || 0)) {
        clearTimeout(edge?.timer); edge = null;
        // Once the next room is in, tell it right away where the drag is (the clock then shows the to-do's date).
        if (side) edge = { side, timer: setTimeout(() => { const next = Math.max(-1, Math.min(1, openRoom() + side)); goRoom(next); edge = { side, timer: null }; setTimeout(() => { if (p?.started) track(p.lastX, p.lastY); }, 60); }, EDGE_DWELL) };
      }
      // Changed your mind: moving back left out of the clock (past its dial, or to the left edge) slides it away at once.
      if (openRoom() === 1) {
        const dial = document.querySelector('.clock-dock .clock-dial')?.getBoundingClientRect();
        // (The clock's date label and its calendar may sit outside the dial; they are part of the clock.)
        const onDate = document.elementFromPoint(x, y)?.closest('.clock-date-ui');
        // (While the sheet is still sliding in, the dial is off to the right — don't read that as "moved left".)
        const settled = dial && dial.right <= innerWidth;
        if (!onDate && (x < EDGE || (settled && x < dial.left - 12))) { clearTimeout(edge?.timer); edge = { side: x < EDGE ? -1 : 0, timer: null }; goRoom(0); }
      }
      const t = targetAt(x, y);
      p.drop = t;
      // The clock shows the dragged to-dos' own date and can move them to another day (see ClockWindow).
      window.dispatchEvent(new CustomEvent('checker:clock-pointer-move', { detail: t?.kind === 'clock' ? { x, y, ids: p.ids } : null }));
      if (t?.kind === 'line') { mark(null); showLine(t.rect, t.after); } else { hideLine(); mark(t?.el || null); }
    };
    const finish = async (x, y) => {
      const t = p.drop, ids = p.ids, fromDays = p.fromDays || {};
      cleanup();
      if (!t) return;
      if (t.kind === 'trash') { trash(live.current.db.todos.filter((x) => ids.includes(x.id))); if (ids.length > 1) set([]); return; }
      if (t.kind === 'clock') { window.dispatchEvent(new CustomEvent('checker:clock-pointer-drop', { detail: { ids, id: ids[0], x, y } })); return; }
      const patches = dropPatches(live.current.db, ids, t, undefined, fromDays);
      await Promise.all(patches.map(({ id, patch }) => window.api.updateTodo(id, patch)));
    };
    const cleanup = () => {
      stopAuto();
      clearTimeout(p?.timer); clearTimeout(edge?.timer); edge = null;
      ghost?.remove(); ghost = null; hideLine(); mark(null);
      p?.sources?.forEach((el) => el.classList.remove('is-drag-source'));
      p?.el.classList.remove('is-held');
      window.dispatchEvent(new CustomEvent('checker:clock-pointer-move', { detail: null }));
      // Other window listeners (room swipes) run after this one in the same event; let them see the drag.
      if (p?.started) live.current.onDragging?.(false);
      setTimeout(() => document.body.classList.remove('todo-dragging'), 0);
      p = null;
    };

    const down = (e) => {
      if (e.button !== 0) return;
      const target = e.target instanceof Element ? e.target : null;
      // Only a finger counts as touch; a mouse, a pen or an unreported pointer type ('') works like a mouse.
      const modifier = e.shiftKey || e.ctrlKey || e.metaKey, mouse = e.pointerType !== 'touch';
      // Pressing anything that is not a to-do lets go of the selection.
      if (!target?.closest('.memo-line[data-todo-id], .cal-chip[data-todo-id], .todo-drop-strip, .todo-undo-toast')) {
        if (!modifier) clear();
        // Empty space of the notebook, with a mouse: a drag from here draws a box that selects the lines it touches.
        if (mouse && !modifier && root.contains(target) && !target.closest('input,textarea,select,button,a,label,[contenteditable],.memo-head,.suggest-pop,.todo-editor,.popup-overlay,.sched-card,.cal-cell')) m = { x: e.clientX, y: e.clientY, started: false };
        return;
      }
      const main = target.closest('.memo-line-main, .cal-chip');
      if (!main || !root.contains(main) || target.closest(OWN_CLICK)) return;
      const el = main.closest('[data-todo-id]'), touch = !mouse, chip = main.classList.contains('cal-chip');
      // The title keeps its click/tap to edit (and on a computer, dragging across titles selects their lines);
      // with Shift or Ctrl held it selects instead.
      if (target.closest('.memo-title') && !(mouse && modifier && !chip)) { if (mouse && !modifier) clear(); return; }
      if (mouse && modifier && !chip) e.preventDefault(); // no text selection from Shift+click
      p = { id: el.dataset.todoId, el, chip, touch, x: e.clientX, y: e.clientY, started: false, pointerId: e.pointerId, held: !touch, shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey };
      // On touch a row is picked up only by holding still; moving first is a scroll.
      if (touch) p.timer = setTimeout(() => { if (!p) return; p.held = true; el.classList.add('is-held'); navigator.vibrate?.(12); }, HOLD_MS);
    };
    const marqueeMove = (e) => {
      if (!m.started) {
        if (Math.abs(e.clientX - m.x) + Math.abs(e.clientY - m.y) < 6) return;
        m.started = true;
        box = document.createElement('div'); box.className = 'todo-marquee'; document.body.appendChild(box);
        document.body.classList.add('todo-marquee-on');
      }
      getSelection()?.removeAllRanges();
      const l = Math.min(m.x, e.clientX), t = Math.min(m.y, e.clientY), w = Math.abs(e.clientX - m.x), h = Math.abs(e.clientY - m.y);
      Object.assign(box.style, { left: l + 'px', top: t + 'px', width: w + 'px', height: h + 'px' });
      const ids = [...root.querySelectorAll('.memo-line[data-todo-id]')].filter((row) => { const r = (row.querySelector('.memo-line-main') || row).getBoundingClientRect(); return r.left < l + w && r.right > l && r.top < t + h && r.bottom > t; }).map((row) => row.dataset.todoId);
      const sel = live.current.selection;
      if (ids.length !== sel.size || ids.some((id) => !sel.has(id))) set(ids);
    };
    const marqueeEnd = () => {
      if (m?.started) { box?.remove(); box = null; document.body.classList.remove('todo-marquee-on'); suppress = { until: Date.now() + 350, el: null }; anchor = order().find((id) => live.current.selection.has(id)) || null; }
      m = null;
    };
    const move = (e) => {
      if (m) { marqueeMove(e); return; }
      if (!p) return;
      const dist = Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      if (!p.started) {
        if (!p.held) { if (dist > 8) { clearTimeout(p.timer); p = null; } return; }
        if (dist < 6) return;
        begin();
        try { p.el.setPointerCapture?.(p.pointerId); } catch {}
      }
      e.preventDefault();
      track(e.clientX, e.clientY);
    };
    const up = (e) => {
      if (m) { marqueeEnd(); return; }
      if (!p) return;
      if (p.started) { suppress = { until: Date.now() + 350, el: null }; finish(e.clientX, e.clientY); return; }
      clearTimeout(p.timer); p.el.classList.remove('is-held');
      const { held, touch, chip, el, id, shift, toggle } = p;
      p = null;
      if (held && touch) { suppress = { until: Date.now() + 350, el }; return; } // a hold without a move does nothing
      // On touch, a tap anywhere on a row edits its text, as in the phone app.
      if (touch) { if (!chip) el.querySelector('.memo-title')?.click(); return; }
      if (chip) return;
      // A click selects: one row, a Shift range, or Ctrl/⌘ to add or remove one.
      suppress = { until: Date.now() + 350, el };
      const sel = live.current.selection;
      if (shift && anchor) { set(order().slice(Math.min(order().indexOf(anchor), order().indexOf(id)), Math.max(order().indexOf(anchor), order().indexOf(id)) + 1)); return; }
      if (toggle) { const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id); setSelection(next); }
      else set([id]);
      anchor = id;
    };
    // A point of the text selection → the line it is in and the index in that line's real title (the shown text may
    // have whitespace collapsed or an ending cut; outside the title it counts as its start or end).
    const shownTitle = (title) => { let s = ''; const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT); for (let n = walker.nextNode(); n; n = walker.nextNode()) { if (n.parentElement?.closest('.span-day')) break; s += n.nodeValue; } return s; };
    const rawIndex = (raw, shown, k) => { let i = 0, j = 0; while (j < k && i < raw.length) { if (raw[i] === shown[j]) { i++; j++; } else if (/\s/.test(raw[i])) i++; else break; } return Math.min(i, raw.length); };
    const pointOf = (node, offset) => {
      const el = node.nodeType === 1 ? node : node.parentElement, row = el?.closest('.memo-line[data-todo-id]'), title = row?.querySelector('.memo-title');
      if (!row || !title || !root.contains(row)) return null;
      const id = row.dataset.todoId, raw = live.current.db.todos.find((t) => t.id === id)?.title || '', shown = shownTitle(title);
      const r = document.createRange(); r.selectNodeContents(title);
      try { r.setEnd(node, offset); } catch { /* before the title: its start */ }
      const k = title.contains(node) ? Math.min(r.toString().length, shown.length) : (title.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_PRECEDING ? 0 : shown.length);
      return { id, index: rawIndex(raw, shown, k) };
    };
    const textSelection = () => {
      const s = getSelection();
      if (!s || !s.rangeCount || s.isCollapsed) return null;
      const r = s.getRangeAt(0), a = pointOf(r.startContainer, r.startOffset), b = pointOf(r.endContainer, r.endOffset);
      if (!a || !b) return null;
      const ids = order(), ia = ids.indexOf(a.id), ib = ids.indexOf(b.id);
      if (ia < 0 || ib < 0 || ia > ib) return null;
      return { first: a, last: b, between: ids.slice(ia + 1, ib) };
    };
    // Delete / Backspace / a typed character over a text selection: the first line keeps what is before the cut
    // (+ the character), the last line's remainder joins it, the lines between go; the first line opens for editing
    // with the caret at the cut. Undo brings everything back.
    const cutSelection = async ({ first, last, between }, typed) => {
      const todos = live.current.db.todos, A = todos.find((t) => t.id === first.id), B = todos.find((t) => t.id === last.id);
      if (!A || !B) return;
      const one = first.id === last.id, head = A.title.slice(0, first.index), tail = (one ? A.title : B.title).slice(last.index), title = (head + typed + tail).slice(0, 50);
      const gone = one ? [] : [...between, last.id].map((id) => todos.find((t) => t.id === id)).filter(Boolean);
      getSelection()?.removeAllRanges();
      if (title.trim()) await window.api.updateTodo(A.id, { title });
      await Promise.all(gone.map((t) => window.api.deleteTodo(t.id)));
      if (!title.trim()) await window.api.deleteTodo(A.id);
      const back = [A, ...gone].map(({ title: t, notes, date, endDate, startTime, endTime, teamId, projectId, channel, status }) => ({ title: t, notes, date, endDate, startTime, endTime, teamId, projectId, channel, status }));
      undoToast(gone.length ? `${gone.length + 1}줄을 합쳤어요` : '글을 지웠어요', () => { if (title.trim()) { window.api.updateTodo(A.id, { title: A.title }); back.slice(1).forEach((t) => window.api.addTodo(t)); } else back.forEach((t) => window.api.addTodo(t)); });
      if (title.trim()) setTimeout(() => window.dispatchEvent(new CustomEvent('checker:edit-line', { detail: { id: A.id, caret: head.length + typed.length } })), 30);
    };
    const key = (e) => {
      const sel = live.current.selection;
      if (!typing(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const span = textSelection();
        if (span) {
          if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); cutSelection(span, ''); return; }
          if (e.key.length === 1) { e.preventDefault(); cutSelection(span, e.key); return; }
          if (e.key === 'Escape') { getSelection()?.removeAllRanges(); return; }
        }
      }
      if (!sel.size || typing(e.target)) return;
      if (e.key === 'Escape') { set([]); getSelection()?.removeAllRanges(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        trash(live.current.db.todos.filter((t) => sel.has(t.id))); set([]); getSelection()?.removeAllRanges();
      }
    };
    const cancel = () => { if (p) cleanup(); if (m) marqueeEnd(); };
    // While a row is being dragged the page must not scroll or open the long-press menu.
    const touchMove = (e) => { if (p?.held && p.touch) e.preventDefault(); };
    const contextMenu = (e) => { if (p?.touch) e.preventDefault(); };
    // Swallow the one click a drag or hold produces, so it doesn't also open/edit what is under it.
    const click = (e) => {
      if (Date.now() >= suppress.until || (suppress.el && !suppress.el.contains(e.target))) return;
      if (e.target instanceof Element && e.target.closest('.todo-undo-toast')) return;
      suppress = { until: 0, el: null };
      e.preventDefault(); e.stopImmediatePropagation();
    };

    window.addEventListener('pointerdown', down);
    const listeners = [['pointermove', move], ['pointerup', up], ['pointercancel', cancel], ['blur', cancel], ['contextmenu', contextMenu], ['keydown', key]];
    listeners.forEach(([n, fn]) => window.addEventListener(n, fn));
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('click', click, true);
    return () => {
      cancel(); line?.remove();
      window.removeEventListener('pointerdown', down);
      listeners.forEach(([n, fn]) => window.removeEventListener(n, fn));
      window.removeEventListener('touchmove', touchMove, { passive: false });
      window.removeEventListener('click', click, true);
    };
  }, []);
}
