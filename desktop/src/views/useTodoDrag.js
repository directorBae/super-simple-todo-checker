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
 * or drag-select text across lines. A selected row drags the whole selection; Delete removes it (with undo);
 * Esc or a press outside the to-dos lets go.
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
    let p = null, ghost = null, line = null, marked = null, edge = null, suppress = { until: 0, el: null }, anchor = null;
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
        return { kind: 'line', targetId: row.dataset.todoId, after: y > r.top + r.height / 2, rect: r };
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
      const t = p.drop, ids = p.ids;
      cleanup();
      if (!t) return;
      if (t.kind === 'trash') { trash(live.current.db.todos.filter((x) => ids.includes(x.id))); if (ids.length > 1) set([]); return; }
      if (t.kind === 'clock') { window.dispatchEvent(new CustomEvent('checker:clock-pointer-drop', { detail: { ids, id: ids[0], x, y } })); return; }
      const patches = dropPatches(live.current.db, ids, t);
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
      if (!target?.closest('.memo-line[data-todo-id], .cal-chip[data-todo-id], .todo-drop-strip, .todo-undo-toast')) { if (!modifier) clear(); return; }
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
    const move = (e) => {
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
    // Dragging the mouse across several lines' text selects those lines.
    const selectionChange = () => {
      if (p?.started) return;
      const range = getSelection()?.rangeCount ? getSelection().getRangeAt(0) : null;
      if (!range || range.collapsed || !root.contains(range.commonAncestorContainer)) return;
      const rows = [...root.querySelectorAll('.memo-line[data-todo-id]')].filter((row) => range.intersectsNode(row));
      if (rows.length < 2) return;
      anchor = rows[0].dataset.todoId;
      const ids = rows.map((row) => row.dataset.todoId), sel = live.current.selection;
      if (ids.length !== sel.size || ids.some((x) => !sel.has(x))) set(ids);
    };
    const key = (e) => {
      const sel = live.current.selection;
      if (!sel.size || typing(e.target)) return;
      if (e.key === 'Escape') { set([]); getSelection()?.removeAllRanges(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        trash(live.current.db.todos.filter((t) => sel.has(t.id))); set([]); getSelection()?.removeAllRanges();
      }
    };
    const cancel = () => { if (p) cleanup(); };
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
    document.addEventListener('selectionchange', selectionChange);
    return () => {
      document.removeEventListener('selectionchange', selectionChange);
      cancel(); line?.remove();
      window.removeEventListener('pointerdown', down);
      listeners.forEach(([n, fn]) => window.removeEventListener(n, fn));
      window.removeEventListener('touchmove', touchMove, { passive: false });
      window.removeEventListener('click', click, true);
    };
  }, []);
}
