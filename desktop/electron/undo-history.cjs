'use strict';
/*
 * Ctrl+Z / Ctrl+Shift+Z for to-dos, kept by whoever owns them (the Electron main process, the web server).
 * Each change is recorded as the to-do before and after it (null = it did not exist). Changes that arrive within
 * a moment of each other (a drag of several lines, a multi-delete, a Backspace that joins two lines) are one step.
 */
const clone = (x) => (x ? JSON.parse(JSON.stringify(x)) : null);

function createUndoHistory({ windowMs = 80, limit = 100, now = Date.now } = {}) {
  let done = [], undone = [], open = null;
  return {
    record(id, before, after) {
      const t = now();
      if (!open || t - open.at > windowMs) { open = { at: t, changes: [] }; done.push(open); if (done.length > limit) done.shift(); }
      open.at = t;
      const same = open.changes.find((c) => c.id === id);
      if (same) same.after = clone(after); else open.changes.push({ id, before: clone(before), after: clone(after) });
      undone = [];
    },
    // Returns what to put back — [{ id, to }] (to = null: remove it) — or null when there is nothing to undo/redo.
    undo() {
      const step = done.pop(); open = null;
      if (!step) return null;
      undone.push(step);
      return step.changes.map((c) => ({ id: c.id, to: clone(c.before) })).reverse();
    },
    redo() {
      const step = undone.pop(); open = null;
      if (!step) return null;
      done.push(step);
      return step.changes.map((c) => ({ id: c.id, to: clone(c.after) }));
    },
    get size() { return { undo: done.length, redo: undone.length }; },
  };
}

// Puts changes back into a { todos, tombstones } store: re-adds or restores to-dos with their own ids (newer than any
// deletion, so sync keeps them) and removes the ones that should not exist. Returns the ids that changed.
function applyChanges(db, changes, now = Date.now()) {
  db.tombstones ||= [];
  for (const { id, to } of changes) {
    const at = db.todos.findIndex((t) => t.id === id);
    if (!to) {
      if (at >= 0) db.todos.splice(at, 1);
      db.tombstones.push({ coll: 'todos', id, deletedAt: now });
      continue;
    }
    const restored = { ...to, updatedAt: Math.max(now, (db.todos[at]?.updatedAt || 0) + 1, (to.updatedAt || 0) + 1) };
    if (at >= 0) db.todos[at] = restored; else db.todos.push(restored);
    db.tombstones = db.tombstones.filter((t) => !(t.coll === 'todos' && t.id === id));
  }
  return changes.map((c) => c.id);
}

module.exports = { createUndoHistory, applyChanges };
