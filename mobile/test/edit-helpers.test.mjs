import test from 'node:test';
import assert from 'node:assert/strict';
import { fillRepeats, applyRepeat } from '../src/edit-helpers.js';
import repeatEngine from '../../shared/repeat.cjs';

test('repeat on the phone: turning on fills the occurrences once; turning off removes the later ones with tombstones', () => {
  const d = { todos: [{ id: 'x', title: '운동', date: '2026-10-29', status: 'todo', updatedAt: 1 }], tombstones: [] };
  applyRepeat(d, repeatEngine.setRepeat(d.todos, 'x', { every: 1, unit: 'week' }, 500));
  assert.ok(d.todos[0].repeat && d.todos[0].seriesId);
  const n = fillRepeats(d, '2026-10-29');
  assert.ok(n >= 8); assert.equal(fillRepeats(d, '2026-10-29'), 0, 'nothing twice');
  const before = d.todos.length;
  applyRepeat(d, repeatEngine.setRepeat(d.todos, 'x', null, 900), 900);
  assert.equal(d.todos.length, before - n); assert.equal(d.tombstones.length, n);
  assert.equal(d.todos[0].repeat, null); assert.equal(fillRepeats(d, '2026-10-29'), 0);
});
