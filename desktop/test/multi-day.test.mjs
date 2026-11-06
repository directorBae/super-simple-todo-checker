// Multi-day to-dos (n일차): every day shows its part, times split per day, each day checked on its own, and a move
// carries the whole span.
import test from 'node:test';
import assert from 'node:assert/strict';
import { onDay, todosOn, spanDates, dayTitle, toggleDayPatch, moveToDate, spanPatch } from '../../shared/multi-day.js';
import { dropPatches } from '../../shared/todo-drop.js';

const conf = { id: 'c', title: '학회', date: '2026-11-03', endDate: '2026-11-05', startTime: '22:00', endTime: '02:00', status: 'todo', kind: 'todo' };

test('a three-day to-do shows on each day as its part, with the time split per day', () => {
  assert.deepEqual(spanDates(conf), ['2026-11-03', '2026-11-04', '2026-11-05']);
  const parts = spanDates(conf).map((d) => onDay(conf, d));
  assert.deepEqual(parts.map(dayTitle), ['학회 (1일차)', '학회 (2일차)', '학회 (3일차)']);
  assert.deepEqual(parts.map((p) => [p.startTime, p.endTime, p.span.allDay]), [['22:00', '24:00', false], [null, null, true], ['00:00', '02:00', false]]);
  assert.equal(onDay(conf, '2026-11-06'), null);
  assert.equal(todosOn([conf, { id: 'x', date: '2026-11-04' }], '2026-11-04').length, 2);
  // No times: just the day number.
  const plain = onDay({ ...conf, startTime: null, endTime: null }, '2026-11-04');
  assert.deepEqual([plain.startTime, plain.endTime, plain.span.allDay], [null, null, false]);
  // A one-day to-do is itself.
  const one = { id: 'o', date: '2026-11-04' };
  assert.equal(onDay(one, '2026-11-04'), one);
});

test('each day is checked on its own; all days checked makes the to-do done', () => {
  let t = { ...conf };
  t = { ...t, ...toggleDayPatch(t, '2026-11-04') };
  assert.deepEqual([t.doneDays, t.status], [['2026-11-04'], 'todo']);
  assert.equal(onDay(t, '2026-11-04').status, 'done'); assert.equal(onDay(t, '2026-11-03').status, 'todo');
  t = { ...t, ...toggleDayPatch(t, '2026-11-03') }; t = { ...t, ...toggleDayPatch(t, '2026-11-05') };
  assert.equal(t.status, 'done');
  t = { ...t, ...toggleDayPatch(t, '2026-11-03') };
  assert.deepEqual([t.doneDays, t.status], [['2026-11-04', '2026-11-05'], 'todo']);
});

test('moving a part moves the whole span so that part lands on the target day', () => {
  const t = { ...conf, doneDays: ['2026-11-04'] };
  assert.deepEqual(moveToDate(t, '2026-11-10', '2026-11-04'), { date: '2026-11-09', endDate: '2026-11-11', doneDays: ['2026-11-10'] });
  assert.deepEqual(moveToDate(t, '2026-11-10'), { date: '2026-11-10', endDate: '2026-11-12', doneDays: ['2026-11-11'] });
  // Through the shared drop rules (calendar cell), with the dragged part's day.
  const db = { todos: [t], teams: [], projects: [] };
  assert.deepEqual(dropPatches(db, ['c'], { kind: 'date', date: '2026-11-10' }, undefined, { c: '2026-11-05' })[0].patch, { date: '2026-11-08', endDate: '2026-11-10', doneDays: ['2026-11-09'] });
  // Changing the span keeps only checks still inside it.
  assert.deepEqual(spanPatch(t, { date: '2026-11-04', endDate: '2026-11-04', startTime: '10:00', endTime: '11:00' }), { date: '2026-11-04', endDate: null, startTime: '10:00', endTime: '11:00', doneDays: ['2026-11-04'] });
});
