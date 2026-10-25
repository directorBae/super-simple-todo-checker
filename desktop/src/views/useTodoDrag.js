import { useEffect, useRef } from 'react';
import { compactTitle } from '../focus-utils.mjs';
import { dropPatches, selectRange } from '../../../shared/todo-drop.js';

const HOLD_MS = 450, EDGE = 56, EDGE_DWELL = 420;
// Parts of a row that keep their own click (editing, checkbox, buttons, team picker).
const OWN_CLICK = 'input,button,a,select,textarea,label,.suggest-pop,.todo-editor';

const openRoom = () => (document.querySelector('.clock-dock.is-open') ? 1 : document.querySelector('.manage-dock.is-open') ? -1 : 0);
const goRoom = (room) => window.dispatchEvent(new CustomEvent('checker:room', { detail: { room } }));

/*
 * Drag notebook rows from anywhere but their text and buttons, and select several at once.
 * Mouse: press and move to drag; Shift+click selects a range, Ctrl/⌘+click toggles one.
 * Touch: long-press turns on selection mode (taps then toggle) and the same press can drag the selection.
 * Drops: between lines (order, day and team), onto a team (sidebar, notebook header or the teams room),
 * onto a day header (out of its team), onto a calendar cell (date) and onto the clock (time for all).
 */
export function useTodoDrag({ rootRef, db, selection, setSelection, selectMode, setSelectMode }) {
  const live = useRef({});
  live.current = { db, selection, selectMode };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let p = null, ghost = null, line = null, marked = null, edge = null, suppress = { until: 0, el: null }, anchor = null;
    const order = () => [...root.querySelectorAll('.memo-line[data-todo-id]')].map((el) => el.dataset.todoId);
    const set = (ids) => setSelection(new Set(ids));

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
      else if (!p.chip) set([p.id]);
      p.ids = ids; p.started = true;
      const todo = live.current.db.todos.find((t) => t.id === p.id);
      ghost = document.createElement('div');
      ghost.className = 'todo-drag-ghost';
      ghost.textContent = compactTitle(todo?.title || '', 24);
      if (ids.length > 1) { const b = document.createElement('b'); b.textContent = String(ids.length); ghost.appendChild(b); }
      document.body.appendChild(ghost);
      document.body.classList.add('todo-dragging');
      getSelection()?.removeAllRanges();
      p.sources = p.chip ? [p.el] : ids.map((id) => root.querySelector(`.memo-line[data-todo-id="${CSS.escape(id)}"]`)).filter(Boolean);
      p.sources.forEach((el) => el.classList.add('is-drag-source'));
    };
    const track = (x, y) => {
      ghost.style.transform = `translate(${x + 14}px, ${y + 10}px)`;
      // Holding at the right/left edge slides to the next room (clock / teams), like a swipe.
      const side = x > innerWidth - EDGE ? 1 : x < EDGE ? -1 : 0;
      if (side !== (edge?.side || 0)) {
        clearTimeout(edge?.timer); edge = null;
        if (side) edge = { side, timer: setTimeout(() => { const next = Math.max(-1, Math.min(1, openRoom() + side)); goRoom(next); edge = { side, timer: null }; }, EDGE_DWELL) };
      }
      const t = targetAt(x, y);
      p.drop = t;
      window.dispatchEvent(new CustomEvent('checker:clock-pointer-move', { detail: t?.kind === 'clock' ? { x, y } : null }));
      if (t?.kind === 'line') { mark(null); showLine(t.rect, t.after); } else { hideLine(); mark(t?.el || null); }
    };
    const finish = async (x, y) => {
      const t = p.drop, ids = p.ids;
      cleanup();
      if (!t) return;
      if (t.kind === 'clock') { window.dispatchEvent(new CustomEvent('checker:clock-pointer-drop', { detail: { ids, id: ids[0], x, y } })); return; }
      const patches = dropPatches(live.current.db, ids, t);
      await Promise.all(patches.map(({ id, patch }) => window.api.updateTodo(id, patch)));
    };
    const cleanup = () => {
      clearTimeout(p?.timer); clearTimeout(edge?.timer); edge = null;
      ghost?.remove(); ghost = null; hideLine(); mark(null);
      p?.el.classList.remove('is-pressing');
      p?.sources?.forEach((el) => el.classList.remove('is-drag-source'));
      window.dispatchEvent(new CustomEvent('checker:clock-pointer-move', { detail: null }));
      // Other window listeners (room swipes) run after this one in the same event; let them see the drag.
      setTimeout(() => document.body.classList.remove('todo-dragging'), 0);
      p = null;
    };

    const down = (e) => {
      if (e.button !== 0) return;
      const target = e.target instanceof Element ? e.target : null;
      const main = target?.closest('.memo-line-main, .cal-chip');
      if (!main || !root.contains(main)) {
        if (target && root.contains(target) && !target.closest(OWN_CLICK) && e.pointerType === 'mouse' && !e.shiftKey && !e.ctrlKey && !e.metaKey) set([]);
        return;
      }
      const chip = main.classList.contains('cal-chip');
      const touch = e.pointerType !== 'mouse';
      if (target.closest(OWN_CLICK)) return;
      // On a computer the title text keeps its click-to-edit; on touch the whole row can be held.
      if (!touch && target.closest('.memo-title')) return;
      const el = main.closest('[data-todo-id]');
      p = { id: el.dataset.todoId, el, chip, touch, x: e.clientX, y: e.clientY, armed: !touch, started: false, held: false, pointerId: e.pointerId,
        shift: e.shiftKey, toggle: e.ctrlKey || e.metaKey };
      if (!touch) return;
      el.classList.add('is-pressing');
      p.timer = setTimeout(() => {
        if (!p) return;
        p.armed = true; p.held = true;
        navigator.vibrate?.(12);
        if (!chip) {
          setSelectMode(true);
          const sel = live.current.selection;
          if (!sel.has(p.id)) set([...sel, p.id]);
        }
      }, HOLD_MS);
    };
    const move = (e) => {
      if (!p) return;
      const dist = Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y);
      if (!p.armed) { if (dist > 10) { p.el.classList.remove('is-pressing'); clearTimeout(p.timer); p = null; } return; }
      if (!p.started) {
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
      const { id, el, chip, touch, held, shift, toggle } = p;
      const quiet = () => { suppress = { until: Date.now() + 350, el }; }; // only the click this tap makes on its own row
      p.el.classList.remove('is-pressing'); clearTimeout(p.timer); p = null;
      if (chip) { if (held) quiet(); return; }
      const sel = live.current.selection;
      if (touch) {
        if (held) { quiet(); return; }
        if (!live.current.selectMode) return; // a plain tap keeps doing what it did (edit, open)
        const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id);
        setSelection(next); quiet();
        if (!next.size) setSelectMode(false);
        return;
      }
      if (shift && anchor) { set(selectRange(order(), anchor, id)); return; }
      if (toggle) { const next = new Set(sel); next.has(id) ? next.delete(id) : next.add(id); setSelection(next); }
      else set([id]);
      anchor = id;
    };
    const cancel = () => { if (p) cleanup(); };
    // While a held row is being dragged the page must not scroll or open the long-press menu.
    const touchMove = (e) => { if (p?.armed) e.preventDefault(); };
    const contextMenu = (e) => { if (p?.touch) e.preventDefault(); };
    // Swallow the one click a drag or hold produces, so it doesn't also open/edit what is under it.
    const click = (e) => {
      if (Date.now() >= suppress.until || (suppress.el && !suppress.el.contains(e.target))) return;
      suppress = { until: 0, el: null };
      e.preventDefault(); e.stopImmediatePropagation();
    };
    const key = (e) => {
      if (e.key !== 'Escape' || !live.current.selection.size) return;
      if (e.target instanceof Element && e.target.closest('input,textarea,select')) return;
      set([]); setSelectMode(false);
    };

    root.addEventListener('pointerdown', down);
    const listeners = [['pointermove', move], ['pointerup', up], ['pointercancel', cancel], ['blur', cancel], ['contextmenu', contextMenu], ['keydown', key]];
    listeners.forEach(([n, fn]) => window.addEventListener(n, fn));
    window.addEventListener('touchmove', touchMove, { passive: false });
    window.addEventListener('click', click, true);
    return () => {
      cancel(); line?.remove();
      root.removeEventListener('pointerdown', down);
      listeners.forEach(([n, fn]) => window.removeEventListener(n, fn));
      window.removeEventListener('touchmove', touchMove, { passive: false });
      window.removeEventListener('click', click, true);
    };
  }, []);
}
