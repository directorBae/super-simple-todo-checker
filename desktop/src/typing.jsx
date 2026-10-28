import React, { useEffect, useRef, useSyncExternalStore } from 'react';
import { useToolsState } from './tools-state.js';
import { compactTitle } from './focus-utils.mjs';
import { createTypingWatch, noteJobs, takeChanges, typeSteps, revealed, rewriteSteps, moveNote, TYPE_CAP, LOCAL_MS } from './typing-queue.mjs';

/*
 * 펫이 옮겨 적는 장면 — every change a tool import makes is played on screen one at a time, where it happens: the
 * notebook scrolls to the row and the pet hops over with its pencil. A new to-do is written out a letter at a time;
 * a renamed one is erased back (like Backspace) and the new ending typed; a moved one is lifted off its old day and
 * written on the new one (a "10/29 → 10/30" note in hand); a done one gets its box ticked; a removed one is erased,
 * struck out and folds away. The data is already there: only a mask over the titles and a short-lived stage (the
 * leaving copy, a row held back) — typing-queue.mjs picks the changes. Any press or key ends it all at once.
 */
const masks = new Map(); // id → 'q' (waiting) | 'f' (reduced motion: a brief light) | n (letters shown) | { show?, caret?, erase?, strike?, tick? }
const stage = new Map(); // real id → null (not written yet) | { patch } (shown as it was) ; id + '~was' → { row } (the leaving copy)
let queue = [], current = null, running = false, provider = null, version = 0, staged = 0, follow = true, owner = undefined, watch = createTypingWatch();
let note = null; // { text, x, y } — the note the pet holds up while it carries a to-do
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());
const restage = () => { staged++; notify(); };
const subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const find = (id) => document.querySelector(`.memo-wrap .memo-line[data-todo-id="${CSS.escape(id)}"], .memo-wrap .cal-chip[data-todo-id="${CSS.escape(id)}"]`);
const WAS = '~was';
const text = (t) => compactTitle(t.title);

export function finishTyping() {
  if (!running && !masks.size && !queue.length && !stage.size) return;
  queue = []; current = null; masks.clear(); stage.clear(); note = null; running = false; provider = null; version++; staged++;
  notify();
}

// What the notebook is given: the real to-dos, with the leaving copies in and the rows not written yet held back.
let cache = { todos: null, staged: -1, out: null };
function stagedTodos(todos) {
  if (!stage.size) return todos;
  if (cache.todos === todos && cache.staged === staged) return cache.out;
  const out = [];
  for (const t of todos) {
    const s = stage.get(t.id);
    if (s === undefined) out.push(t); else if (s) out.push({ ...t, ...s.patch });
  }
  for (const [id, s] of stage) if (s?.row) out.push(s.row);
  cache = { todos, staged, out };
  return out;
}

// Sets one change up the moment it is seen (so nothing shows early) and puts it in line.
function enqueue(c) {
  const after = c.after, before = c.before, item = { ...c, provider: (after || before).origin?.provider || null };
  if (c.kind === 'new') masks.set(c.id, 'q');
  if (c.kind === 'gone' || c.kind === 'move') stage.set(c.id + WAS, { row: { ...before, id: c.id + WAS } });
  if (c.kind === 'move') stage.set(c.id, null);
  if (c.kind === 'edit') {
    if (text(before) === text(after) && !c.tick) return;
    masks.set(c.id, { show: text(before) });
  }
  if (c.kind === 'done' || c.tick) stage.set(c.id, { patch: { status: before.status } });
  queue.push(item);
}
// A row that changes again while it waits its turn: that one simply shows as it is now.
function drop(id) {
  queue = queue.filter((c) => c.id !== id);
  masks.delete(id); masks.delete(id + WAS); stage.delete(id); stage.delete(id + WAS);
}

// Waits until a smooth scroll has come to rest (the row stops moving), at most ~1 s.
async function settle(el) {
  let last = null, still = 0;
  for (let i = 0; i < 60 && still < 4; i++) {
    await new Promise((r) => requestAnimationFrame(r));
    const top = Math.round(el.getBoundingClientRect().top);
    still = top === last ? still + 1 : 0; last = top;
  }
}
async function scrollTo(el, reduced) {
  if (!follow) return;
  const r = el.getBoundingClientRect(), top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
  if (r.top >= top + 12 && r.bottom <= innerHeight - 24) return;
  el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  await settle(el);
}
// A row that was only just put back on the stage: once the notebook has drawn it (at most ~0.4 s).
async function appear(id) {
  for (let t = 0; t < 400; t += 20) { const el = find(id); if (el) return el; await sleep(20); }
  return null;
}
// The pet stands right after the line's text, facing it (or before the line when there is no room on the right).
// side 'box': before the line, by its check box; `next`: the title about to be written there (it stands past the longer
// one, so a longer new title is never typed under it). Answers where it stands (or null: no pet, as on phones).
const pen = document.createElement('canvas').getContext('2d');
async function callPet(el, v, side, next) {
  const pet = document.querySelector('.roaming-pet');
  if (!pet || pet.closest('[hidden]')) return null;
  const title = el.querySelector('.memo-title, .cal-chip-title') || el, row = el.getBoundingClientRect(), txt = title.getBoundingClientRect();
  let end = txt.right;
  if (next) { pen.font = getComputedStyle(title).font; end = Math.min(row.right - 8, Math.max(end, txt.left + pen.measureText(next).width)); }
  const left = row.left - 76 >= 4, right = side === 'box' ? !left : end + 86 < innerWidth;
  const detail = { x: right ? end + 6 : Math.max(4, row.left - 76), y: row.top + row.height / 2 - 52, face: right ? -1 : 1 };
  window.dispatchEvent(new CustomEvent('checker:pet-goto', { detail }));
  besideAt = detail;
  // The work starts once it has landed (a hop and a dash), or after a moment if it is held up.
  for (let t = 0; t < 1600 && v === version; t += 80) {
    await sleep(80);
    if (t >= 240 && pet.dataset.phase === 'idle') break;
  }
  return detail;
}
// Folds a leaving copy away (height to nothing); `lift` takes it up off the page instead of just closing the gap.
function fold(el, { lift = false, ms = 320 } = {}) {
  const s = el.style;
  Object.assign(s, { height: el.getBoundingClientRect().height + 'px', overflow: 'hidden', boxSizing: 'border-box' });
  void el.offsetHeight;
  Object.assign(s, { transition: `height ${ms}ms ease, margin ${ms}ms ease, padding ${ms}ms ease, opacity ${ms * 0.8}ms ease, transform ${ms}ms ease`, height: '0px', marginTop: '0px', marginBottom: '0px', paddingTop: '0px', paddingBottom: '0px', opacity: '0', transform: lift ? 'translateY(-10px) rotate(-1deg)' : 'scaleY(0.6)' });
  return sleep(ms + 30);
}
async function write(id, steps, v) {
  for (const step of steps) {
    if (v !== version) return false;
    masks.set(id, step.show == null ? step.n : { show: step.show, caret: true, erase: step.erase }); notify();
    requestAnimationFrame(() => keepUp(id));
    await sleep(step.wait);
  }
  return v === version;
}
// The pet keeps up with the pencil: as letters are erased (or typed past it) it steps along to stay at the caret.
let besideAt = null;
function keepUp(id) {
  if (!besideAt || besideAt.face !== -1) return; // it stands before the line (no room on the right): nothing to follow
  const caret = find(id)?.querySelector('.type-caret');
  if (!caret) return;
  const x = Math.max(4, Math.min(innerWidth - 86, caret.getBoundingClientRect().right + 6));
  if (Math.abs(x - besideAt.x) < 12) return;
  besideAt = { ...besideAt, x };
  window.dispatchEvent(new CustomEvent('checker:pet-goto', { detail: besideAt }));
}

// The rows of one change, in turn. Each returns early (leaving cleanup to finishTyping) once v is stale.
async function playNew(c, v, flash, carried) {
  if (c.kind === 'move') { stage.delete(c.id); masks.set(c.id, flash ? 'f' : 'q'); restage(); }
  const el = c.kind === 'move' ? await appear(c.id) : find(c.id);
  if (!el) { masks.delete(c.id); notify(); return; }
  await scrollTo(el, flash);
  if (v !== version) return;
  if (flash) { masks.set(c.id, 'f'); notify(); await sleep(1100); masks.delete(c.id); notify(); return; }
  const at = await callPet(el, v);
  if (carried) { const r = el.getBoundingClientRect(); note = { text: carried, x: Math.max(64, Math.min(innerWidth - 64, at ? at.x + 36 : r.left + 90)), y: Math.max(40, at ? at.y + 4 : r.top - 4) }; notify(); }
  if (!(await write(c.id, typeSteps(text(c.after)), v))) return;
  await sleep(450);
  if (v !== version) return;
  masks.delete(c.id); note = null; notify();
  await sleep(180);
}
async function playEdit(c, v, flash) {
  const el = find(c.id);
  if (!el) { drop(c.id); restage(); return; }
  await scrollTo(el, flash);
  if (v !== version) return;
  if (flash) { masks.set(c.id, 'f'); stage.delete(c.id); restage(); await sleep(1100); masks.delete(c.id); notify(); return; }
  await callPet(el, v, null, text(c.after));
  if (!(await write(c.id, rewriteSteps(text(c.before), text(c.after)), v))) return;
  await sleep(c.tick ? 260 : 450);
  if (v !== version) return;
  masks.delete(c.id); notify();
  if (c.tick) await tick(c, v);
  await sleep(180);
}
async function playDone(c, v, flash) {
  const el = find(c.id);
  if (!el) { drop(c.id); restage(); return; }
  await scrollTo(el, flash);
  if (v !== version) return;
  if (flash) { masks.set(c.id, 'f'); stage.delete(c.id); restage(); await sleep(1100); masks.delete(c.id); notify(); return; }
  await callPet(el, v, 'box');
  await sleep(160);
  if (v === version) await tick(c, v);
}
// The box gets its tick (the check pops with a ring of light).
async function tick(c, v) {
  stage.delete(c.id); masks.set(c.id, { tick: true }); restage();
  await sleep(750);
  if (v !== version) return;
  masks.delete(c.id); notify();
}
// The old row of a removal or a move: erased back to nothing, struck out (removal), then folded away.
async function playLeave(c, v, flash) {
  const id = c.id + WAS, el = find(id);
  const gone = () => { stage.delete(id); masks.delete(id); restage(); };
  if (!el) { gone(); return; }
  if (flash && c.kind === 'move') { gone(); return; }
  await scrollTo(el, flash);
  if (v !== version) return;
  if (flash) {
    masks.set(id, 'f'); notify(); await sleep(450);
    if (v !== version) return;
    el.style.transition = 'opacity 0.25s ease'; el.style.opacity = '0'; await sleep(260);
    if (v === version) gone();
    return;
  }
  await callPet(el, v);
  if (!(await write(id, rewriteSteps(text(c.before), ''), v))) return;
  if (c.kind === 'gone') {
    masks.set(id, { show: '', strike: true }); notify();
    await sleep(420);
  } else await sleep(160);
  if (v !== version) return;
  await fold(el, { lift: c.kind === 'move' });
  if (v === version) gone();
}

async function play(c, v) {
  current = c; provider = c.provider; notify();
  const flash = c.mode === 'flash';
  if (c.kind === 'new') await playNew(c, v, flash);
  else if (c.kind === 'edit') await playEdit(c, v, flash);
  else if (c.kind === 'done') await playDone(c, v, flash);
  else if (c.kind === 'gone') await playLeave(c, v, flash);
  else if (c.kind === 'move') {
    await playLeave(c, v, flash);
    if (v === version) await playNew(c, v, flash, flash ? null : moveNote(c.before, c.after));
  }
  if (v === version) current = null;
}
async function run() {
  if (running) return;
  running = true; follow = true; notify();
  const v = version;
  while (queue.length && v === version) await play(queue.shift(), v);
  if (v !== version) return;
  running = false; provider = null; notify();
}

// Your own work on the notebook: the rows you press, type in or drag (and the day they are on), and undo/redo.
const local = { ids: new Map(), dates: new Map(), all: 0, held: [] };
function touch(e) {
  const now = Date.now(), at = e.target?.closest ? e.target : null;
  const row = at?.closest('[data-todo-id]'), day = at?.closest('.memo-day[id^="day-"]')?.id.slice(4) || at?.closest('[data-date]')?.dataset.date;
  const mark = (id, date) => { if (id) local.ids.set(id, now); if (date) local.dates.set(date, now); };
  mark(row?.dataset.todoId, day);
  if (e.type === 'pointerdown') local.held = [[row?.dataset.todoId, day]];
  if (e.type === 'pointerup') local.held.forEach(([id, date]) => mark(id, date)); // a drag that took a while
  if (e.type === 'keydown') {
    if ((e.ctrlKey || e.metaKey) && /^[zy]$/i.test(e.key)) local.all = now;
    if (e.key === 'Delete' || e.key === 'Backspace') document.querySelectorAll('.is-selected[data-todo-id]').forEach((r) => mark(r.dataset.todoId));
  }
}
function yours(now) {
  const recent = (m) => new Set([...m].filter(([, at]) => now - at < LOCAL_MS).map(([k]) => k));
  const ids = recent(local.ids), focus = document.activeElement?.closest?.('[data-todo-id]')?.dataset.todoId;
  if (focus) ids.add(focus);
  return { ids, dates: recent(local.dates), all: now - local.all < LOCAL_MS };
}

// In App: watches the tool jobs and the data, and plays what an import just did. `active` = someone signed in.
// Answers the db the notebook should draw (with the leaving copies and the rows not written yet).
export function useTypingRunner(db, active) {
  const tools = useToolsState(active);
  const jobs = tools?.ok ? tools.jobs || [] : null;
  const last = useRef({ todos: null, jobs: null }), shown = useRef({ from: null, todos: null, db: null });
  const who = active && db ? db.auth?.email || 'local' : null;
  useSyncExternalStore(subscribe, () => staged);
  if (owner !== who) { owner = who; watch = createTypingWatch(); last.current = { todos: null, jobs: null }; queue = []; masks.clear(); stage.clear(); staged++; }
  // Decided while rendering, so a changed row is masked from its very first paint (no flash of the new state).
  if (who && (last.current.todos !== db.todos || last.current.jobs !== jobs)) {
    if (jobs && last.current.jobs !== jobs) noteJobs(watch, jobs);
    last.current = { todos: db.todos, jobs };
    const now = Date.now();
    const { play } = takeChanges(watch, db.todos, now, { cap: TYPE_CAP - queue.length - (running ? 1 : 0), reduced: reducedMotion(), local: yours(now) });
    const busy = new Set([...queue.map((c) => c.id), current?.id]);
    for (const c of play) if (busy.has(c.id)) drop(c.id); else enqueue(c);
    if (play.length) staged++;
  }
  useEffect(() => { if (!who) finishTyping(); else if (queue.length && !running) run(); });
  // Editing or dragging takes over: everything is simply as it is. A wheel only stops the scrolling along.
  useEffect(() => {
    const press = (e) => { touch(e); if (running && !e.target.closest?.('.roaming-pet, .pet-call-button')) finishTyping(); };
    const key = (e) => { touch(e); if (running && !['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) finishTyping(); };
    const wheel = () => { follow = false; };
    window.addEventListener('pointerdown', press, true);
    window.addEventListener('pointerup', touch, true);
    window.addEventListener('input', touch, true);
    window.addEventListener('keydown', key, true);
    window.addEventListener('wheel', wheel, { passive: true });
    window.addEventListener('touchmove', wheel, { passive: true });
    return () => { window.removeEventListener('pointerdown', press, true); window.removeEventListener('pointerup', touch, true); window.removeEventListener('input', touch, true); window.removeEventListener('keydown', key, true); window.removeEventListener('wheel', wheel); window.removeEventListener('touchmove', wheel); finishTyping(); };
  }, []);
  if (!db) return db;
  const todos = stagedTodos(db.todos);
  if (todos === db.todos) return db;
  if (shown.current.from !== db || shown.current.todos !== todos) shown.current = { from: db, todos, db: { ...db, todos } };
  return shown.current.db;
}
// The tool whose changes are being played now ('notion' | 'google'), or null.
export const useTypingNow = () => useSyncExternalStore(subscribe, () => (running ? provider || 'notion' : null));

// A title as the pet writes it: the letters so far, a caret, and the rest kept invisible so the line never jumps.
// Rewriting / erasing shows the line as it stands; a tick or a strike-out marks the row for its flourish (glass.css).
export function Typed({ id, text }) {
  const m = useSyncExternalStore(subscribe, () => masks.get(id) ?? null);
  if (m == null) return text;
  if (m === 'f') return <span className="type-flash">{text}</span>;
  if (typeof m === 'object') return <>{m.show ?? text}{m.caret && <i className={'type-caret' + (m.erase ? ' erase' : '')} aria-hidden="true" />}{m.strike && <i className="type-strike" aria-hidden="true" />}{m.tick && <i className="type-tick" aria-hidden="true" />}</>;
  const shown = m === 'q' ? '' : revealed(text, m);
  return <>{shown}<i className={m === 'q' ? 'type-wait' : 'type-caret'} aria-hidden="true" /><span className="type-rest">{text.slice(shown.length)}</span></>;
}

// The note the pet holds up while it carries a to-do to another day or time.
export function MoveNote() {
  const n = useSyncExternalStore(subscribe, () => note);
  return n && <div className="type-move-note" aria-hidden="true" style={{ left: Math.round(n.x), top: Math.round(n.y) }}>{n.text}</div>;
}

// The window's edge glows in moving rainbow light while the AI is at work (a job running or the pet writing).
export function AiEdge({ on }) {
  return <div className={'ai-edge' + (on ? ' on' : '')} aria-hidden="true" data-on={on ? '1' : undefined}>
    <div className="ai-edge-glow"><i><b /></i></div>
    <i className="ai-edge-line"><b /></i>
  </div>;
}
