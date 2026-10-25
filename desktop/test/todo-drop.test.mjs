import test from 'node:test';
import assert from 'node:assert/strict';
import { dropPatches, lineSort, selectRange } from '../../shared/todo-drop.js';

const todo = (id, extra = {}) => ({ id, title: id, kind: 'todo', status: 'todo', date: '2026-10-26', teamId: null, projectId: null, createdAt: Number(id.slice(1)), ...extra });
const apply = (db, patches) => ({ ...db, todos: db.todos.map((t) => ({ ...t, ...(patches.find((p) => p.id === t.id)?.patch || {}) })) });
const shown = (db, date, teamId = null) => db.todos.filter((t) => t.date === date && t.teamId === teamId && t.status !== 'bucket').sort(lineSort).map((t) => t.id);

test('dropping a line between others reorders that day', () => {
  const db = { teams: [], projects: [], todos: [todo('a1'), todo('a2'), todo('a3')] };
  const next = apply(db, dropPatches(db, ['a3'], { kind: 'line', targetId: 'a1', after: false }));
  assert.deepEqual(shown(next, '2026-10-26'), ['a3', 'a1', 'a2']);
  const back = apply(next, dropPatches(next, ['a3'], { kind: 'line', targetId: 'a2', after: true }));
  assert.deepEqual(shown(back, '2026-10-26'), ['a1', 'a2', 'a3']);
});

test('a selection dropped next to a team line joins that team and day in order', () => {
  const db = { teams: [{ id: 'T' }], projects: [], todos: [todo('a1'), todo('a2'), todo('a3'), todo('b1', { teamId: 'T', date: '2026-10-27' }), todo('b2', { teamId: 'T', date: '2026-10-27' })] };
  const patches = dropPatches(db, ['a1', 'a3'], { kind: 'line', targetId: 'b1', after: true });
  const next = apply(db, patches);
  assert.deepEqual(shown(next, '2026-10-27', 'T'), ['b1', 'a1', 'a3', 'b2']);
  assert.deepEqual(shown(next, '2026-10-26'), ['a2']);
  assert.ok(!patches.some((p) => p.id === 'a2'), 'untouched rows are not rewritten');
});

test('team drops move every selected row; a day drop takes them out of the team', () => {
  const db = { teams: [{ id: 'T' }, { id: 'U' }], projects: [{ id: 'P', teamId: 'U' }], todos: [todo('a1'), todo('a2', { projectId: 'P' }), todo('a3', { teamId: 'T' })] };
  const toTeam = dropPatches(db, ['a1', 'a2'], { kind: 'team', teamId: 'T' });
  assert.deepEqual(toTeam, [{ id: 'a1', patch: { teamId: 'T' } }, { id: 'a2', patch: { teamId: 'T', projectId: null } }]);
  const out = apply(db, dropPatches(db, ['a3'], { kind: 'day', date: '2026-10-28' }));
  assert.equal(out.todos.find((t) => t.id === 'a3').teamId, null);
  assert.equal(out.todos.find((t) => t.id === 'a3').date, '2026-10-28');
  assert.deepEqual(dropPatches(db, ['a1'], { kind: 'date', date: '2026-11-01' }), [{ id: 'a1', patch: { date: '2026-11-01' } }]);
  assert.deepEqual(dropPatches(db, ['a1'], { kind: 'line', targetId: 'a1' }), []);
});

test('shift selects the range between the anchor and the clicked row in screen order', () => {
  assert.deepEqual(selectRange(['a', 'b', 'c', 'd'], 'd', 'b'), ['b', 'c', 'd']);
  assert.deepEqual(selectRange(['a', 'b'], 'x', 'b'), ['b']);
});
