const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
// scheduler.cjs needs Electron's Notification only to show alerts; the due-list logic is plain.
const load = Module._load;
Module._load = (request, ...rest) => (request === 'electron' ? { Notification: { isSupported: () => false } } : load(request, ...rest));
const { collectDue, recentDays } = require('../electron/scheduler.cjs');
Module._load = load;

test('desktop morning alert: today plus the last three days left undone, older days ignored', () => {
  assert.deepEqual(recentDays('2026-10-26'), ['2026-10-25', '2026-10-24', '2026-10-23']);
  const db = { notifLog: [], settings: { dailySummary: true, dailySummaryTime: '09:00' }, todos: [
    { id: 'a', status: 'todo', date: '2026-10-26', title: '오늘' },
    { id: 'b', status: 'todo', date: '2026-10-25', title: '어제' },
    { id: 'c', status: 'todo', date: '2026-10-22', title: '나흘 전' },
    { id: 'd', status: 'done', date: '2026-10-24', title: '이틀 전 끝냄' },
  ] };
  const daily = collectDue(db, new Date(2026, 9, 26, 9, 1).getTime()).find((d) => d.type === 'daily');
  assert.equal(daily.count, 1);
  assert.deepEqual(daily.overdue.map((t) => t.id), ['b']);
});
