import test from 'node:test';
import assert from 'node:assert/strict';
import { reminders, localDate } from '../../shared/reminders.js';

const day = localDate(new Date(2026, 9, 26));
const ms = (h, m = 0) => new Date(2026, 9, 26, h, m).getTime();
const db = (settings = {}) => ({
  settings,
  todos: [
    { id: 'a', kind: 'todo', status: 'todo', title: '회의', date: day, startTime: '10:00', endTime: '11:00' },
    { id: 'b', kind: 'todo', status: 'done', title: '메일', date: day, startTime: '08:00' },
    { id: 'c', kind: 'todo', status: 'todo', title: '정리', date: day },
  ],
});

test('reminders: start/end of open to-dos, the morning count and the evening wrap-up, in time order', () => {
  const list = reminders(db(), ms(0), ms(23, 59));
  assert.deepEqual(list.map((r) => r.key), ['daily:' + day, 'a:start', 'a:end', 'wrapup:' + day]);
  assert.equal(list[0].body, '오늘 예정된 할 일이 2건 있어요.');
  assert.match(list[3].body, /완료 1건: 메일[\s\S]*남음 2건: 회의, 정리/);
  assert.equal(list[1].at, ms(10));
});

test('reminders respect the settings and the time window', () => {
  assert.deepEqual(reminders(db({ notifyEnd: false, dailySummary: false, dailyWrapup: false }), ms(0), ms(23)).map((r) => r.key), ['a:start']);
  assert.deepEqual(reminders(db(), ms(10), ms(10, 30)).map((r) => r.key), []); // exactly at `from` already went out
  assert.deepEqual(reminders(db(), ms(9, 59), ms(10)).map((r) => r.key), ['a:start']);
});

test('the morning note also lists what was left undone in the last three days (not older)', () => {
  const day = (k) => localDate(new Date(2026, 9, 26 - k));
  const base = { settings: {}, todos: [
    { id: 'y', status: 'todo', title: '어제 못 한 일', date: day(1) },
    { id: 'z', status: 'todo', title: '사흘 전 일', date: day(3) },
    { id: 'old', status: 'todo', title: '나흘 전 일', date: day(4) },
    { id: 'ok', status: 'done', title: '어제 한 일', date: day(1) },
  ] };
  const [note] = reminders(base, ms(0), ms(12)).filter((r) => r.key.startsWith('daily'));
  assert.ok(note, 'a morning note even with nothing planned today');
  assert.match(note.body, /지난 3일 동안 못 한 일 2건: 어제 못 한 일, 사흘 전 일/);
  assert.ok(!note.body.includes('나흘 전'));
});
