import test from 'node:test';
import assert from 'node:assert/strict';
import { createTypingWatch, noteJobs, takeChanges, changeKind, typeSteps, revealed, rewriteSteps, moveNote, TYPE_CAP, JUST_DONE } from '../src/typing-queue.mjs';

const now = Date.parse('2026-10-28T09:00:00Z'), iso = (ms) => new Date(ms).toISOString();
const job = (id, state, extra = {}) => ({ id, provider: 'notion', kind: 'import', state, summary: '노션 "주간 업무" 읽는 중', updated_at: iso(now), ...extra });
const todo = (id, extra = {}) => ({ id, title: '할 일 ' + id, kind: 'todo', status: 'todo', date: '2026-10-28', createdAt: now, origin: { type: 'external', provider: 'notion', subscription: 's1', id: 'row-' + id }, ...extra });
// The new rows of a look, in the { type, instant } shape these first tests were written in.
const takeNew = (...a) => { const r = takeChanges(...a); return { type: r.play.filter((c) => c.kind === 'new').map(({ id, mode }) => ({ id, mode })), instant: r.instant }; };
const ids = (r) => r.type.map((x) => x.id);
// A window that opened with `old` on screen and has watched one job start.
function session(old = [todo('old')], state = 'writing') {
  const w = createTypingWatch();
  noteJobs(w, [], now - 10_000);
  takeNew(w, old, now - 10_000);
  noteJobs(w, [job('j1', state)], now - 5000);
  return w;
}

test('typing queue: the first look only remembers what is there', () => {
  const w = createTypingWatch();
  noteJobs(w, [job('j1', 'writing')], now);
  assert.deepEqual(takeNew(w, [todo('a'), todo('b')], now), { type: [], instant: [] });
  assert.deepEqual(takeNew(w, [todo('a'), todo('b')], now), { type: [], instant: [] }, 'nothing new');
});

test('typing queue: new imports of a running or just-finished job are typed, in screen order, once', () => {
  const w = session();
  const list = [todo('old'), todo('c', { date: '2026-10-30' }), todo('b', { startTime: '10:00' }), todo('a', { startTime: '09:00' }), todo('mine', { origin: { type: 'app' } }), todo('kept', { status: 'bucket' })];
  assert.deepEqual(ids(takeNew(w, list, now)), ['a', 'b', 'c']);
  assert.deepEqual(takeNew(w, list, now), { type: [], instant: [] }, 'never twice');
  noteJobs(w, [job('j1', 'done')], now + 1000);
  assert.deepEqual(ids(takeNew(w, [...list, todo('d')], now + 2000)), ['d'], 'rows synced right after the job is done still count');
  assert.deepEqual(ids(takeNew(w, [...list, todo('d'), todo('e')], now + 1000 + JUST_DONE + 1)), [], 'but not long after');
});

test('typing queue: only to-dos of the job’s tool, made after it started', () => {
  const w = session();
  const google = todo('g', { origin: { type: 'external', provider: 'google', subscription: 's2', id: 'ev' } });
  const older = todo('o', { createdAt: now - 60 * 60_000 });
  assert.deepEqual(ids(takeNew(w, [google, older, todo('n')], now)), ['n']);
  // With the job's subscription known, it must be that one.
  const v = createTypingWatch();
  takeNew(v, [], now);noteJobs(v, [], now);
  noteJobs(v, [job('j2', 'writing', { subscription_id: 's9', created_at: iso(now - 1000) })], now);
  assert.deepEqual(ids(takeNew(v, [todo('x'), todo('y', { origin: { type: 'external', provider: 'notion', subscription: 's9' } })], now)), ['y']);
});

test('typing queue: a job already done when the window opened, or a push, plays nothing', () => {
  const w = createTypingWatch();
  noteJobs(w, [job('old', 'done'), job('p', 'done', { kind: 'push' })], now);
  takeNew(w, [], now);
  assert.deepEqual(takeNew(w, [todo('a')], now + 1000), { type: [], instant: [] });
  // One that finished between two looks is news.
  noteJobs(w, [job('old', 'done'), job('fast', 'done')], now + 4000);
  assert.deepEqual(ids(takeNew(w, [todo('a'), todo('b')], now + 5000)), ['b']);
});

test('typing queue: a cap, the rest just appear; reduced motion only flashes', () => {
  const w = session([]);
  const many = Array.from({ length: 11 }, (_, i) => todo('t' + String(i).padStart(2, '0')));
  const r = takeNew(w, many, now);
  assert.equal(r.type.length, TYPE_CAP);
  assert.deepEqual(r.instant, ['t08', 't09', 't10']);
  assert.ok(r.type.every((x) => x.mode === 'type'));
  const q = session([]);
  const s = takeNew(q, many.slice(0, 3), now, { cap: 2, reduced: true });
  assert.deepEqual(s.type, [{ id: 't00', mode: 'flash' }, { id: 't01', mode: 'flash' }]);
  assert.deepEqual(s.instant, ['t02']);
  assert.deepEqual(takeNew(session([]), many, now, { cap: 0 }).type, [], 'a full queue takes no more');
});

test('typing queue: Korean titles are typed a syllable at a time', () => {
  const steps = typeSteps('회의 준비, 👍', () => 0.5);
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map((s) => s.n), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.ok(steps.every((s) => s.wait >= 30 && s.wait <= 90));
  assert.equal(steps[0].wait, 48);
  assert.equal(revealed('회의 준비, 👍', 2), '회의');
  assert.equal(revealed('회의 준비, 👍', 8), '회의 준비, 👍');
  assert.equal(revealed('👍👍', 1), '👍');
});

// Changes to rows already on screen: an import renames, moves, ticks or removes them.
const kinds = (r) => r.play.map((c) => c.id + ':' + c.kind);
test('typing queue: a renamed, moved, done or removed import is played, in screen order', () => {
  const rows = [todo('a', { startTime: '09:00' }), todo('b', { date: '2026-10-29' }), todo('c'), todo('d', { date: '2026-10-27' }), todo('e')];
  const w = session(rows);
  const next = [todo('a', { startTime: '10:30' }), todo('b', { date: '2026-10-29', title: '이름 바뀐 일' }), todo('c', { status: 'done' }), todo('e', { color: 'x' })];
  const r = takeChanges(w, next, now);
  assert.deepEqual(kinds(r), ['d:gone', 'a:move', 'c:done', 'b:edit'], 'the pet starts at the old row of a move or a removal; timed lines first');
  const gone = r.play[0], moved = r.play[1];
  assert.equal(gone.before.title, '할 일 d', 'the removed row is kept for the animation');
  assert.equal(moved.before.startTime, '09:00');
  assert.equal(moved.after.startTime, '10:30');
  assert.ok(r.play.every((c) => c.mode === 'type'));
  assert.deepEqual(takeChanges(w, next, now), { play: [], instant: [] }, 'never twice');
});

test('typing queue: a day move, a rename that is also done, and to the bucket', () => {
  const w = session([todo('a'), todo('b'), todo('c')]);
  const r = takeChanges(w, [todo('a', { date: '2026-10-30', title: '새 이름' }), todo('b', { title: '할 일 b!', status: 'done' }), todo('c', { status: 'bucket' })], now);
  assert.deepEqual(kinds(r), ['a:move', 'b:edit', 'c:gone']);
  assert.equal(r.play[1].tick, true, 'ticked once the new title is written');
  assert.equal(changeKind(todo('x'), todo('x', { status: 'todo', endTime: '11:00' })), null, 'what the screen hardly shows just happens');
  assert.equal(changeKind(todo('x', { status: 'done' }), todo('x', { status: 'todo' })), null);
});

test('typing queue: changes outside an import, of other tools, or of your own rows just happen', () => {
  const rows = [todo('a'), todo('b'), todo('mine', { origin: { type: 'app' } }), todo('g', { origin: { type: 'external', provider: 'google', subscription: 's2', id: 'ev' } })];
  const w = session(rows);
  const edit = (t) => ({ ...t, title: t.title + ' 수정' });
  assert.deepEqual(kinds(takeChanges(w, rows.map(edit), now, { local: { ids: new Set(['a']) } })), ['b:edit'], 'a is yours (focused or just edited)');
  const v = session(rows);
  assert.deepEqual(kinds(takeChanges(v, rows.map(edit), now, { local: { dates: new Set(['2026-10-28']) } })), [], 'you are writing on that day');
  const u = session(rows);
  assert.deepEqual(kinds(takeChanges(u, rows.slice(1), now, { local: { all: true } })), [], 'an undo / redo is yours');
  const old = session(rows);
  noteJobs(old, [job('j1', 'done')], now);
  assert.deepEqual(kinds(takeChanges(old, rows.slice(1).map(edit), now + JUST_DONE + 1)), [], 'long after the job: plain sync');
  const stale = session(rows);
  assert.deepEqual(kinds(takeChanges(stale, [edit({ ...rows[0], updatedAt: now - 60 * 60_000 })], now)).filter((k) => k.startsWith('a')), [], 'a change older than the job is not its doing');
});

test('typing queue: the cap counts every kind; reduced motion only flashes', () => {
  const rows = Array.from({ length: 6 }, (_, i) => todo('r' + i, { startTime: '1' + i + ':00' }));
  const w = session(rows);
  const r = takeChanges(w, [...rows.slice(2).map((t) => ({ ...t, title: t.title + '!' })), todo('n1'), todo('n2')], now, { cap: 5, reduced: true });
  assert.deepEqual(kinds(r), ['r0:gone', 'r1:gone', 'r2:edit', 'r3:edit', 'r4:edit']);
  assert.deepEqual(r.instant, ['r5', 'n1', 'n2'], 'the rest (untimed new lines come last on the day) just happen');
  assert.ok(r.play.every((c) => c.mode === 'flash'));
});

test('typing queue: rewriting erases back to the shared start, then types the rest', () => {
  const steps = rewriteSteps('회의 자료 정리', '회의 준비', () => 0.5);
  assert.deepEqual(steps.map((s) => s.show), ['회의 자료 정', '회의 자료 ', '회의 자료', '회의 자', '회의 ', '회의 준', '회의 준비']);
  assert.deepEqual(steps.map((s) => s.erase), [true, true, true, true, true, false, false]);
  assert.ok(steps[4].wait > steps[3].wait + 100, 'a breath between erasing and typing');
  assert.ok(steps[0].wait < 40, 'erasing is quicker than typing');
  assert.deepEqual(rewriteSteps('👍👍 끝', '').map((s) => s.show), ['👍👍 ', '👍👍', '👍', ''], 'a removal erases it all, emoji whole');
  assert.deepEqual(rewriteSteps('같음', '같음'), []);
});

test('typing queue: the note a carried to-do shows', () => {
  assert.equal(moveNote(todo('a', { date: '2026-10-29' }), todo('a', { date: '2026-10-30' })), '10/29 → 10/30');
  assert.equal(moveNote(todo('a', { startTime: '09:00' }), todo('a', { startTime: '10:30' })), '09:00 → 10:30');
  assert.equal(moveNote(todo('a', { date: '2026-10-29', startTime: '09:00' }), todo('a', { date: '2026-11-02', startTime: '14:00' })), '10/29 09:00 → 11/2 14:00');
});
