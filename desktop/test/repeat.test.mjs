import test from 'node:test';
import assert from 'node:assert/strict';
import repeat from '../../shared/repeat.cjs';

const { plan, setRepeat, occurrence, describe, cleanRule } = repeat;
const base = (extra) => ({ id: 'a', kind: 'todo', title: '운동', notes: '', date: '2026-10-29', status: 'todo', teamId: 't1', startTime: '07:00', endTime: null, createdAt: 1, updatedAt: 1, ...extra });
const turnOn = (todos, id, rule, now = 1000) => { const r = setRepeat(todos, id, rule, now); return [...todos.filter((t) => !r.changed.some((c) => c.id === t.id) && !r.removed.includes(t.id)), ...r.changed]; };

test('repeat: dates step by days, weeks, months (keeping the day, or the month end) and years', () => {
  assert.equal(occurrence({ unit: 'day', every: 3, start: '2026-10-30' }, 1), '2026-11-02');
  assert.equal(occurrence({ unit: 'week', every: 2, start: '2026-10-29' }, 1), '2026-11-12');
  assert.equal(occurrence({ unit: 'month', every: 1, start: '2026-01-31' }, 1), '2026-02-28');
  assert.equal(occurrence({ unit: 'month', every: 1, start: '2026-01-31' }, 2), '2026-03-31');
  assert.equal(occurrence({ unit: 'month', every: 5, start: '2026-10-15' }, 1), '2027-03-15');
  assert.equal(occurrence({ unit: 'year', every: 1, start: '2028-02-29' }, 1), '2029-02-28');
  assert.equal(describe({ unit: 'day', every: 1 }), '매일'); assert.equal(describe({ unit: 'week', every: 2 }), '2주마다');
  assert.equal(cleanRule({ unit: 'hour', every: 1 }), null); assert.equal(cleanRule({ unit: 'day', every: 0 }), null);
});

test('repeat: turning it on makes the occurrences ahead, copying the to-do; the same input always makes the same rows', () => {
  const todos = turnOn([base()], 'a', { every: 1, unit: 'week' });
  const a = todos.find((t) => t.id === 'a');
  assert.deepEqual({ every: a.repeat.every, unit: a.repeat.unit, start: a.repeat.start }, { every: 1, unit: 'week', start: '2026-10-29' });
  const made = plan(todos, [], '2026-10-29');
  assert.deepEqual(made.map((t) => t.date).slice(0, 3), ['2026-11-05', '2026-11-12', '2026-11-19']);
  assert.ok(made.length >= 8 && made.length <= 10, 'about two months ahead: ' + made.length);
  assert.deepEqual({ title: made[0].title, teamId: made[0].teamId, startTime: made[0].startTime, status: made[0].status, seriesId: made[0].seriesId }, { title: '운동', teamId: 't1', startTime: '07:00', status: 'todo', seriesId: a.seriesId });
  assert.equal(made[0].id, `${a.seriesId}@2026-11-05`); assert.equal(made[0].updatedAt, 1000, 'stamped with the rule, not the clock');
  // Another device planning from the same data makes exactly the same rows.
  assert.deepEqual(plan(todos, [], '2026-10-29'), made);
  // Nothing more to make once they exist; a deleted one is not made again.
  const all = [...todos, ...made];
  assert.deepEqual(plan(all, [], '2026-10-29'), []);
  assert.deepEqual(plan(all.filter((t) => t.id !== made[1].id), [{ coll: 'todos', id: made[1].id }], '2026-10-29'), []);
});

test('repeat: monthly and yearly always have the next one, however far; missed past ones are not made', () => {
  const yearly = turnOn([base()], 'a', { every: 1, unit: 'year' });
  assert.deepEqual(plan(yearly, [], '2026-10-29').map((t) => t.date), ['2027-10-29']);
  // Opened again two and a half years later: only from today on.
  assert.deepEqual(plan(yearly, [], '2029-05-01').map((t) => t.date), ['2029-10-29']);
  const daily = turnOn([base()], 'a', { every: 1, unit: 'day' });
  const later = plan(daily, [], '2026-12-01');
  assert.equal(later[0].date, '2026-12-01'); assert.ok(later.every((t) => t.date >= '2026-12-01'));
  // Long gaps still land on the right dates (no skipping past today).
  const monthly = turnOn([base({ date: '2020-01-31' })], 'a', { every: 1, unit: 'month' });
  assert.equal(plan(monthly, [], '2026-10-29')[0].date, '2026-10-31');
});

test('repeat: turning it off on one occurrence deletes the open ones after it and clears the rule before it', () => {
  let todos = turnOn([base()], 'a', { every: 1, unit: 'day' });
  todos = [...todos, ...plan(todos, [], '2026-10-29')];
  const third = todos.find((t) => t.date === '2026-11-01');
  todos.find((t) => t.date === '2026-11-03').status = 'done';
  const { changed, removed } = setRepeat(todos, third.id, null, 2000);
  assert.ok(removed.length > 50 && removed.every((id) => todos.find((t) => t.id === id).date > '2026-11-01'));
  assert.ok(!removed.includes(todos.find((t) => t.date === '2026-11-03').id), 'done ones stay');
  assert.ok(changed.every((t) => t.repeat === null && t.updatedAt === 2000));
  assert.ok(changed.some((t) => t.id === third.id) && changed.some((t) => t.id === 'a'));
  const left = [...todos.filter((t) => !removed.includes(t.id) && !changed.some((c) => c.id === t.id)), ...changed];
  assert.deepEqual(plan(left, removed.map((id) => ({ coll: 'todos', id })), '2026-10-29'), [], 'nothing comes back');
});

test('repeat: changing the rule starts a new series from that day; the old future ones go', () => {
  let todos = turnOn([base()], 'a', { every: 1, unit: 'day' }, 1000);
  todos = [...todos, ...plan(todos, [], '2026-10-29')];
  const fifth = todos.find((t) => t.date === '2026-11-02');
  const r = setRepeat(todos, fifth.id, { every: 1, unit: 'week' }, 3000);
  const now = r.changed.find((t) => t.id === fifth.id);
  assert.notEqual(now.seriesId, todos[0].seriesId); assert.equal(now.repeat.start, '2026-11-02');
  const left = [...todos.filter((t) => !r.removed.includes(t.id) && !r.changed.some((c) => c.id === t.id)), ...r.changed];
  const made = plan(left, r.removed.map((id) => ({ coll: 'todos', id })), '2026-10-29');
  assert.deepEqual(made.slice(0, 2).map((t) => t.date), ['2026-11-09', '2026-11-16']);
  assert.ok(made.every((t) => t.seriesId === now.seriesId));
  // A to-do without a date can't repeat.
  assert.deepEqual(setRepeat([base({ date: null })], 'a', { every: 1, unit: 'day' }), { changed: [], removed: [] });
});
