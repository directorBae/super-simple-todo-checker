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

test('desktop: a heads-up 30 minutes before a timed to-do starts, on unless turned off, never shown after the start', () => {
  const at = (h, m) => new Date(2026, 10, 2, h, m).getTime();
  const db = (settings) => ({ notifLog: [], settings: { notifyStart: true, notifyEnd: true, ...settings }, todos: [
    { id: 'a', status: 'todo', date: '2026-11-02', startTime: '10:00', title: '회의' },
    { id: 'b', status: 'todo', date: '2026-11-02', title: '시간 없는 일' },
    { id: 'c', status: 'done', date: '2026-11-02', startTime: '10:00', title: '끝난 일' },
  ] });
  const types = (list) => list.map((d) => d.key + (d.stale ? ' (stale)' : ''));
  assert.deepEqual(types(collectDue(db({}), at(9, 29))), [], 'not yet');
  const due = collectDue(db({}), at(9, 30));
  assert.deepEqual(types(due), ['a:before@2026-11-02 10:00'], 'older settings (no notifyBefore) count as on');
  assert.equal(due[0].due, at(9, 30)); assert.equal(due[0].time, '10:00');
  assert.deepEqual(types(collectDue(db({ notifyBefore: false }), at(9, 30))), [], 'turned off');
  assert.deepEqual(types(collectDue(db({}), at(10, 0))), ['a:before@2026-11-02 10:00 (stale)', 'a:start@2026-11-02 10:00'], 'once it has started, only noted');
  const shown = db({}); shown.notifLog.push({ key: 'a:before@2026-11-02 10:00' });
  assert.deepEqual(types(collectDue(shown, at(9, 45))), [], 'once');
});

test('desktop: a time changed on another device goes off again; the log from before the change still counts; old ones never flood', () => {
  const at = (d, h, m) => new Date(2026, 10, d, h, m).getTime();
  const db = { notifLog: [], settings: { notifyBefore: false, notifyStart: true, notifyEnd: false }, todos: [{ id: 'a', status: 'todo', date: '2026-11-02', startTime: '10:00', title: '회의' }] };
  assert.deepEqual(collectDue(db, at(2, 10, 0)).map((d) => d.key), ['a:start@2026-11-02 10:00']);
  db.notifLog.push({ key: 'a:start@2026-11-02 10:00', due: at(2, 10, 0) });
  // The phone moves it to 15:00 (synced in; nothing on this computer cleared the log).
  db.todos[0].startTime = '15:00';
  assert.deepEqual(collectDue(db, at(2, 14, 59)).map((d) => d.key), []);
  assert.deepEqual(collectDue(db, at(2, 15, 0)).map((d) => d.key), ['a:start@2026-11-02 15:00']);
  // The log written before keys had the day and time ('a:start') still covers that same moment.
  const old = { ...db, notifLog: [{ key: 'a:start', due: at(2, 15, 0) }] };
  assert.deepEqual(collectDue(old, at(2, 15, 1)).map((d) => d.key), []);
  // A to-do from days ago that is not in the log (or is, under an old key) is not dug up as missed.
  const stale = { ...db, notifLog: [], todos: [{ id: 'b', status: 'todo', date: '2026-10-30', startTime: '09:00', title: '지난 일' }] };
  assert.deepEqual(collectDue(stale, at(2, 15, 1)).map((d) => d.key), []);
});
