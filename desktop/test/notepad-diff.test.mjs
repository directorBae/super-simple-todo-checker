import test from 'node:test';
import assert from 'node:assert/strict';
import { dayText, parseDay, planDay } from '../../shared/notepad-diff.js';

const D = '2026-10-26';
const todo = (id, title, extra = {}) => ({ id, title, kind: 'todo', status: 'todo', date: D, teamId: null, projectId: null, sortOrder: Number(id.slice(1)) * 1024, ...extra });
const db = () => ({
  teams: [{ id: 'A', name: '엔터테크' }, { id: 'B', name: '1W1P' }], projects: [],
  todos: [todo('t1', '메일'), todo('t2', 'Threads 1', { teamId: 'A' }), todo('t3', 'X 1', { teamId: 'A', startTime: '09:00' }), todo('t4', 'Reels', { teamId: 'B' }), todo('t5', '다른 날', { date: '2026-10-27' })],
});
const lines = (...l) => l.join('\n');

test('the day reads as text: lines without a team first, then each team name with its lines under it', () => {
  const { text, starts } = dayText(db(), D);
  assert.equal(text, lines('메일', '엔터테크', 'Threads 1', 'X 1', '1W1P', 'Reels'));
  assert.equal(text.slice(starts.t3, starts.t3 + 3), 'X 1');
  assert.deepEqual(parseDay(db(), text).map((l) => [l.title, l.teamId]), [['메일', null], ['Threads 1', 'A'], ['X 1', 'A'], ['Reels', 'B']]);
});

test('unchanged text changes nothing; an edited line keeps its to-do (and its time)', () => {
  const base = db(), { text } = dayText(base, D);
  assert.deepEqual(planDay(base, D, text), { adds: [], updates: [], deletes: [] });
  const plan = planDay(base, D, text.replace('X 1', 'X 1 — 마감'));
  assert.deepEqual(plan.updates, [{ id: 't3', patch: { title: 'X 1 — 마감' } }]);
  assert.deepEqual([plan.adds, plan.deletes], [[], []]);
});

test('moved lines keep their to-do, deleted lines go, typed lines are new, joined lines keep one to-do', () => {
  const base = db();
  // Threads 1 moved under 1W1P keeps its to-do; X 1 was replaced in place by 새 일 (same to-do, new text).
  const plan = planDay(base, D, lines('메일', '새 일', '1W1P', 'Reels', 'Threads 1'));
  assert.equal(plan.updates.find((u) => u.id === 't2').patch.teamId, 'B');
  assert.deepEqual(plan.updates.find((u) => u.id === 't3').patch, { title: '새 일', teamId: null, sortOrder: 2048 });
  assert.deepEqual([plan.adds, plan.deletes], [[], []]);
  // A selection of lines deleted, and a new line typed at the end.
  const cut = planDay(base, D, lines('메일', '1W1P', 'Reels', '마지막'));
  assert.deepEqual(cut.deletes.sort(), ['t2', 't3']);
  assert.deepEqual(cut.adds.map((a) => [a.title, a.teamId]), [['마지막', 'B']]);
  // Two lines joined by Backspace: one to-do keeps the joined text, the other goes.
  const joined = planDay(base, D, lines('메일', '엔터테크', 'Threads 1X 1', '1W1P', 'Reels'));
  assert.equal(joined.deletes.length, 1); assert.equal(joined.adds.length, 0);
  assert.ok(joined.updates.some((u) => u.patch.title === 'Threads 1X 1'));
});

test('blank lines are ignored, titles are capped at 50 characters, other days are untouched', () => {
  const base = db(), long = 'ㄱ'.repeat(60);
  const plan = planDay(base, D, lines('', '', '메일', '', long, ''));
  const longTitle = [...plan.updates.map((u) => u.patch.title), ...plan.adds.map((a) => a.title)].find(Boolean);
  assert.equal(Array.from(longTitle).length, 50);
  assert.ok(!plan.deletes.includes('t5'));
  assert.equal(plan.deletes.length + plan.updates.filter((u) => u.patch.title).length, 3);
});

test('a to-do that arrives from another device while the notepad is open is left alone', () => {
  const base = db(), { text } = dayText(base, D), known = new Set(base.todos.map((t) => t.id));
  base.todos.push(todo('t9', '다른 기기에서 추가'));
  assert.deepEqual(planDay(base, D, text, known), { adds: [], updates: [], deletes: [] });
});

test('a line whose team was deleted shows with the lines without a team (and is never lost)', () => {
  const base = db(); base.todos.push(todo('t8', '옛 팀 일', { teamId: 'gone' }));
  const { text } = dayText(base, D);
  assert.ok(text.startsWith('메일\n옛 팀 일\n'), text);
  assert.ok(!planDay(base, D, text).deletes.includes('t8'));
});
