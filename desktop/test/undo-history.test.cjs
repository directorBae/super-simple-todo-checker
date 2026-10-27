const test = require('node:test');
const assert = require('node:assert/strict');
const { createUndoHistory, applyChanges } = require('../electron/undo-history.cjs');

const clock = () => { let t = 1000; const now = () => t; now.add = (ms) => { t += ms; }; return now; };

test('undo puts edits, deletions and additions back; changes made together are one step; redo replays it', () => {
  const now = clock(), h = createUndoHistory({ now }), db = { todos: [{ id: 'a', title: '가', date: '2026-10-26', updatedAt: 1 }, { id: 'b', title: '나', updatedAt: 1 }], tombstones: [] };
  // Step 1: an edit. Step 2 (a moment later): a Backspace join = edit a + delete b, plus an addition, all together.
  h.record('a', db.todos[0], { ...db.todos[0], date: '2026-10-27' }); db.todos[0].date = '2026-10-27';
  now.add(500);
  h.record('a', db.todos[0], { ...db.todos[0], title: '가나' }); db.todos[0].title = '가나';
  h.record('b', db.todos[1], null); db.todos.splice(1, 1); db.tombstones.push({ coll: 'todos', id: 'b', deletedAt: 5 });
  h.record('c', null, { id: 'c', title: '다' }); db.todos.push({ id: 'c', title: '다' });
  assert.deepEqual(h.size, { undo: 2, redo: 0 });

  applyChanges(db, h.undo(), 2000);
  assert.deepEqual(db.todos.map((t) => [t.id, t.title]).sort(), [['a', '가'], ['b', '나']]);
  assert.equal(db.todos.find((t) => t.id === 'a').date, '2026-10-27', 'only the last step is undone');
  assert.ok(!db.tombstones.some((t) => t.id === 'b'), 'a restored to-do is no longer marked deleted');
  assert.ok(db.todos.find((t) => t.id === 'b').updatedAt >= 2000, 'restored to-dos are newer than their deletion, so sync keeps them');
  assert.ok(db.tombstones.some((t) => t.id === 'c'), 'an undone addition is deleted');

  applyChanges(db, h.undo(), 2001);
  assert.equal(db.todos.find((t) => t.id === 'a').date, '2026-10-26');
  assert.equal(h.undo(), null, 'nothing more to undo');

  applyChanges(db, h.redo(), 2002);
  assert.equal(db.todos.find((t) => t.id === 'a').date, '2026-10-27');
  // A new change clears what could be redone.
  h.record('a', db.todos[0], { ...db.todos[0], title: '새' });
  assert.equal(h.redo(), null);
});
