import test from 'node:test';
import assert from 'node:assert/strict';
import { newWatch, watchJobs, arrivals, enqueue, finishOne, finishAll, current, chars, typedAt, typingMs, inSession, rainbow, hsl, screenCorner, EMPTY, MAX_ANIMATED, GRACE_MS } from '../src/import-typing.js';
import { classify, changes, explains, inScreenOrder, arrival, head, lookOf, ghostsOf, chipOf, stepsOf, stepMs, rewriteAt, rewriteMs, commonPrefix, ERASE_MS, CHAR_MS } from '../src/import-typing.js';

const now = Date.parse('2026-10-28T09:00:00Z');
const iso = (ms) => new Date(ms).toISOString();
const job = (o) => ({ id: 'j1', provider: 'notion', kind: 'import', state: 'reading', updated_at: iso(now - 1000), ...o });
const todo = (o) => ({ id: 't1', title: '회의 준비', date: '2026-10-28', status: 'todo', createdAt: now + 2000, origin: { type: 'external', provider: 'notion', subscription: 's1', id: 'p1' }, ...o });

test('a job seen running is watched until a while after it ends', () => {
  let w = watchJobs(newWatch(), [job()], now);
  assert.equal(w.jobs.j1.until, Infinity);
  w = watchJobs(w, [job({ state: 'writing', updated_at: iso(now + 3000) })], now + 4000);
  assert.equal(w.jobs.j1.from, now - 1000 - 60_000); // the earliest look counts
  w = watchJobs(w, [job({ state: 'done', updated_at: iso(now + 6000) })], now + 8000);
  assert.equal(w.jobs.j1.until, now + 8000 + GRACE_MS);
  w = watchJobs(w, [job({ state: 'done' })], now + 8000 + GRACE_MS + 1);
  assert.equal(w.jobs.j1, undefined);
});

test('old finished jobs on the first look are not news; one that ran between two looks is', () => {
  let w = watchJobs(newWatch(), [job({ id: 'old', state: 'done' })], now);
  assert.deepEqual(w.jobs, {});
  w = watchJobs(w, [job({ id: 'old', state: 'done' }), job({ id: 'quick', state: 'done', updated_at: iso(now) })], now + 4000);
  assert.deepEqual(Object.keys(w.jobs), ['quick']);
  assert.ok(w.jobs.quick.from < now);
  assert.deepEqual(watchJobs(newWatch(), [job({ kind: 'push', state: 'done' })], now).jobs, {});
});

test('only new imported lines a watched job explains are typed, in day order, once', () => {
  const w = watchJobs(newWatch(), [job()], now), seen = new Set(), start = now - 10 * 60_000;
  const todos = [
    todo({ id: 'b', date: '2026-10-29' }),
    todo({ id: 'a', startTime: '10:00' }),
    todo({ id: 'mine', origin: { type: 'app' } }),
    todo({ id: 'old', createdAt: now - 60 * 60_000 }),              // there before the job began
    todo({ id: 'cal', origin: { type: 'external', provider: 'google', subscription: 's2' } }), // another tool
    todo({ id: 'bucket', status: 'bucket' }),
  ];
  assert.deepEqual(arrivals(w, seen, todos, start).map((t) => t.id), ['a', 'b']);
  assert.deepEqual(arrivals(w, seen, todos, start), []); // seen
  assert.ok(seen.has('mine') && seen.has('old') && seen.has('bucket'));
  assert.ok(!seen.has('cal')); // may still be explained by a Google job seen on the next poll
  const w2 = watchJobs(w, [job(), job({ id: 'j2', provider: 'google', state: 'thinking' })], now + 4000);
  assert.deepEqual(arrivals(w2, seen, todos, start).map((t) => t.id), ['cal']);
});

test('lines from before this app session are never replayed', () => {
  const w = { first: false, known: {}, jobs: { j: { provider: 'notion', subscription: null, from: 0, until: Infinity } } };
  assert.deepEqual(arrivals(w, new Set(), [todo({ createdAt: now - 5 * 60_000 })], now), []);
});

test('the subscription narrows the match when the job carries it', () => {
  const w = watchJobs(newWatch(), [job({ subscription_id: 's9' })], now);
  assert.deepEqual(arrivals(w, new Set(), [todo()], 0), []);
  assert.equal(arrivals(w, new Set(), [todo({ origin: { type: 'external', provider: 'notion', subscription: 's9' } })], 0).length, 1);
});

test('the queue types at most a handful in one go and empties cleanly', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: 'n' + i }));
  let q = enqueue(EMPTY, many.slice(0, 5), now);
  assert.equal(current(q), 'n0');
  q = finishOne(q, 'n0');
  assert.equal(q.played, 1);
  q = enqueue(q, many.slice(1), now); // n1–n4 already queued; room for 8 - 1 - 4 = 3 more
  assert.equal(q.queue.length, MAX_ANIMATED - 1);
  assert.deepEqual(q.queue.map((x) => x.id), ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7']);
  assert.equal(finishOne(q, 'nope'), q);
  for (const { id } of q.queue) q = finishOne(q, id);
  assert.deepEqual(q, EMPTY); // played resets once it is empty
  assert.deepEqual(finishAll(), EMPTY);
  assert.equal(current(EMPTY), null);
});

test('the typewriter counts Korean syllables and emoji as one character', () => {
  assert.deepEqual(chars('회의 ✅'), ['회', '의', ' ', '✅']);
  assert.equal(typedAt('회의 준비', 0), '회');
  assert.equal(typedAt('회의 준비', 40), '회의');
  assert.equal(typedAt('회의 준비', 10_000), '회의 준비');
  assert.equal(typingMs('회의 준비'), 5 * 40);
  assert.equal(typedAt('', 100), '');
});

test('the rainbow edge is on while a job runs or lines are still being typed', () => {
  assert.equal(inSession([job()], EMPTY, now), true);
  assert.equal(inSession([job({ state: 'done' })], EMPTY, now), false);
  assert.equal(inSession([job({ updated_at: iso(now - 10 * 60_000) })], EMPTY, now), false); // stuck
  assert.equal(inSession([], enqueue(EMPTY, [{ id: 'x' }], now), now), true);
});

test('rainbow colours and screen corners', () => {
  assert.equal(hsl(0, 100, 50), '#ff0000');
  assert.equal(hsl(120, 100, 50), '#00ff00');
  assert.equal(hsl(600, 100, 50), '#0000ff');
  const c = rainbow(30);
  assert.equal(c.length, 7);
  assert.equal(c[0], c[6]); // the band closes on itself
  assert.match(c[3], /^#[0-9a-f]{6}$/);
  assert.equal(screenCorner('ios', { width: 393, height: 852 }), 44);
  assert.equal(screenCorner('ios', { width: 375, height: 667 }), 0);
  assert.equal(screenCorner('ios', { width: 820, height: 1180 }), 18);
  assert.equal(screenCorner('web', { width: 400, height: 900 }), 0);
});

// ── Every change a job makes, not only new lines ──

test('what a change is, as the day list sees it', () => {
  const t = todo();
  assert.equal(classify(null, t), 'add');
  assert.equal(classify(todo({ status: 'bucket' }), t), 'add');
  assert.equal(classify(t, null), 'remove');
  assert.equal(classify(t, todo({ status: 'bucket' })), 'remove');
  assert.equal(classify(t, todo({ date: '2026-10-30' })), 'move');
  assert.equal(classify(t, todo({ title: '회의 정리' })), 'edit');
  assert.equal(classify(t, todo({ startTime: '10:00' })), 'edit');
  assert.equal(classify(t, todo({ status: 'done' })), 'edit');
  assert.equal(classify(t, todo({ updatedAt: 99, notes: 'x' })), null); // nothing the list shows
  assert.equal(classify(null, null), null);
});

test('changes between two snapshots: imported lines only, never what the person just changed here', () => {
  const prev = [todo({ id: 'a' }), todo({ id: 'b' }), todo({ id: 'c' }), todo({ id: 'mine', origin: { type: 'app' } }), todo({ id: 'held' })];
  const next = [todo({ id: 'a', title: '회의 정리' }), todo({ id: 'c', date: '2026-10-30' }), todo({ id: 'mine', title: '바뀜', origin: { type: 'app' } }), todo({ id: 'held', title: '고치는 중' }), todo({ id: 'new' })];
  const got = changes(prev, next, (id) => id === 'held');
  assert.deepEqual(got.map((c) => [c.id, c.kind]), [['a', 'edit'], ['b', 'remove'], ['c', 'move']]);
  assert.equal(got[1].after, null);
  assert.equal(got[1].before.title, '회의 준비'); // the removed line can still be shown from the old snapshot
  assert.deepEqual(changes(prev, [], () => false), []); // a wiped phone is not a job deleting everything
  assert.deepEqual(changes([], next), []);
});

test('a change counts when a running or just-finished job of that tool and page explains it', () => {
  const c = changes([todo()], [todo({ title: '바뀐 제목' })])[0];
  assert.equal(explains(newWatch(), c), false);
  assert.equal(explains(watchJobs(newWatch(), [job()], now), c), true);
  assert.equal(explains(watchJobs(newWatch(), [job({ subscription_id: 's1' })], now), c), true);
  assert.equal(explains(watchJobs(newWatch(), [job({ subscription_id: 's9' })], now), c), false);
  assert.equal(explains(watchJobs(newWatch(), [job({ provider: 'google' })], now), c), false);
  let w = watchJobs(newWatch(), [job()], now);
  w = watchJobs(w, [job({ state: 'done' })], now + 1000);
  assert.equal(explains(w, c), true); // just finished
  w = watchJobs(w, [job({ state: 'done' })], now + 1000 + GRACE_MS + 1);
  assert.equal(explains(w, c), false); // 90 s later: old news
});

test('changes play in screen order: removed and moved lines from where they were', () => {
  const list = [
    { id: 'e', kind: 'edit', before: todo({ id: 'e', date: '2026-10-29' }), after: todo({ id: 'e', date: '2026-10-29', title: 'x' }) },
    { id: 'm', kind: 'move', before: todo({ id: 'm', date: '2026-10-27' }), after: todo({ id: 'm', date: '2026-11-02' }) },
    { id: 'r', kind: 'remove', before: todo({ id: 'r', date: '2026-10-28' }), after: null },
    arrival(todo({ id: 'n', date: '2026-10-31' })),
  ];
  assert.deepEqual(inScreenOrder(list).map((c) => c.id), ['m', 'r', 'e', 'n']);
});

test('the queue folds later changes to a waiting line into it, and keeps the cap', () => {
  const a0 = todo({ id: 'a' }), a1 = todo({ id: 'a', title: '회의 정리' }), a2 = todo({ id: 'a', title: '회의 정리 끝' });
  const playing = arrival(todo({ id: 'p' }));
  let q = enqueue(EMPTY, [playing, { id: 'a', kind: 'edit', before: a0, after: a1, origin: a1.origin }], now);
  assert.equal(head(q).key, 'p');
  q = enqueue(q, [{ id: 'a', kind: 'edit', before: a1, after: a2, origin: a2.origin }], now);
  assert.equal(q.queue.length, 2);
  assert.equal(q.queue[1].before.title, '회의 준비'); // from what the screen still shows…
  assert.equal(q.queue[1].after.title, '회의 정리 끝'); // …to the newest
  q = enqueue(q, [{ id: 'a', kind: 'edit', before: a2, after: a0, origin: a0.origin }], now);
  assert.deepEqual(q.queue.map((x) => x.id), ['p']); // back to how it was: nothing to play
  q = enqueue(q, [{ id: 'a', kind: 'remove', before: a0, after: null, origin: a0.origin }], now);
  q = enqueue(q, [{ id: 'p', kind: 'edit', before: todo({ id: 'p' }), after: todo({ id: 'p', title: '다시' }) }], now);
  assert.deepEqual(q.queue.map((x) => [x.key, x.kind]), [['p', 'add'], ['a', 'remove'], ['p·2', 'edit']]); // the playing line plays again after
  q = finishOne(q, 'p');
  assert.equal(head(q).key, 'a');
  // a new line removed again before its turn simply never shows
  let r = enqueue(EMPTY, [playing, arrival(todo({ id: 'n' }))], now);
  r = enqueue(r, [{ id: 'n', kind: 'remove', before: todo({ id: 'n' }), after: null }], now);
  assert.deepEqual(r.queue.map((x) => x.id), ['p']);
  // the cap counts every kind of change; extras just show
  const many = Array.from({ length: 12 }, (_, i) => ({ id: 'm' + i, kind: 'remove', before: todo({ id: 'm' + i }), after: null }));
  assert.equal(enqueue(EMPTY, many, now).queue.length, MAX_ANIMATED);
});

test('until its turn a line looks as it did; removed and moved lines stay at their old place', () => {
  const b = todo({ id: 'e', status: 'todo', startTime: '09:00' });
  const q = enqueue(EMPTY, [
    arrival(todo({ id: 'n' })),
    { id: 'e', kind: 'edit', before: b, after: todo({ id: 'e', title: '새 제목', status: 'done' }) },
    { id: 'm', kind: 'move', before: todo({ id: 'm', date: '2026-10-29' }), after: todo({ id: 'm', date: '2026-10-30' }) },
    { id: 'r', kind: 'remove', before: todo({ id: 'r' }), after: null },
  ], now).queue;
  assert.deepEqual(lookOf(q, 'n'), { mode: 'wait' });
  assert.equal(lookOf(q, 'n', true), null); // Reduce Motion: nothing hides
  assert.deepEqual(lookOf(q, 'e'), { mode: 'hold', look: { title: '회의 준비', status: 'todo', startTime: '09:00', endTime: null } });
  assert.deepEqual(lookOf(q, 'm'), { mode: 'wait' });
  assert.equal(lookOf(q, 'x'), null);
  const g = ghostsOf(q);
  assert.deepEqual(g.map((x) => [x.id, x.ghost, x.date]), [['ghost:m', 'm', '2026-10-29'], ['ghost:r', 'r', '2026-10-28']]);
  assert.deepEqual(ghostsOf(q, { left: 'm' }).map((x) => x.ghost), ['r']); // the moved line has left its old day
  assert.deepEqual(ghostsOf(q, { reduced: true }).map((x) => x.ghost), ['r']);
});

test('the day / time chip', () => {
  const b = todo({ date: '2026-10-29' });
  assert.equal(chipOf(b, todo({ date: '2026-10-30' })), '10/29 → 10/30');
  assert.equal(chipOf(todo({ startTime: '09:00' }), todo({ startTime: '10:30' })), '9:00 → 10:30');
  assert.equal(chipOf(todo({ date: '2026-10-29', startTime: '09:00' }), todo({ date: '2026-11-01', startTime: '14:00' })), '10/29 9:00 → 11/1 14:00');
  assert.equal(chipOf(todo({ startTime: '09:00' }), todo()), '9:00 → 시간 없음');
  assert.equal(chipOf(b, todo({ date: '2026-10-29', title: 'x' })), null);
  assert.equal(chipOf(null, b), null);
});

test('the steps of each kind of change, with and without Reduce Motion', () => {
  const b = todo({ title: '회의 준비', date: '2026-10-29' });
  const step = (kind, after, reduced) => stepsOf({ kind, before: kind === 'add' ? null : b, after }, reduced);
  assert.deepEqual(step('add', b), [{ at: 'row', date: '2026-10-29', show: { mode: 'write', from: '', to: '회의 준비' } }]);
  assert.deepEqual(step('add', b, true)[0].show, { mode: 'glow' });
  const edit = step('edit', todo({ title: '회의 정리', date: '2026-10-29', status: 'done' }))[0];
  assert.equal(edit.at, 'row');
  assert.deepEqual([edit.show.mode, edit.show.from, edit.show.to, edit.show.tick, edit.show.chip], ['write', '회의 준비', '회의 정리', true, null]);
  assert.equal(edit.show.look.status, 'todo'); // the checkbox shows the old state until it ticks
  const move = step('move', todo({ date: '2026-10-30' }));
  assert.deepEqual(move.map((s) => [s.at, s.date, s.show.mode]), [['ghost', '2026-10-29', 'leave'], ['row', '2026-10-30', 'write']]);
  assert.equal(move[0].show.strike, undefined);
  assert.equal(move[1].show.chip, '10/29 → 10/30');
  assert.deepEqual(step('move', todo({ date: '2026-10-30' }), true).map((s) => [s.at, s.show.mode, s.show.chip]), [['row', 'glow', '10/29 → 10/30']]);
  assert.deepEqual(step('remove', null), [{ at: 'ghost', date: '2026-10-29', show: { mode: 'leave', from: '회의 준비', strike: true } }]);
  assert.deepEqual(step('remove', null, true)[0].show, { mode: 'fade' });
  assert.ok(stepMs(step('remove', null)[0].show) > rewriteMs('회의 준비', ''));
  assert.ok(stepMs(edit.show) > stepMs({ mode: 'write', from: '회의 준비', to: '회의 정리' }));
  assert.equal(stepMs({ mode: 'glow' }), 1000);
});

test('rewriting erases back to the shared start, then types the rest', () => {
  assert.equal(commonPrefix('회의 준비', '회의 정리'), 3);
  assert.equal(commonPrefix('✅ 보고', '✅ 보고서'), 4);
  const f = '회의 준비', t = '회의 정리';
  assert.deepEqual(rewriteAt(f, t, 0), { text: '회의 준', erasing: true, done: false });
  assert.deepEqual(rewriteAt(f, t, ERASE_MS), { text: '회의 ', erasing: true, done: false });
  assert.deepEqual(rewriteAt(f, t, 2 * ERASE_MS), { text: '회의 정', erasing: false, done: false });
  assert.deepEqual(rewriteAt(f, t, 2 * ERASE_MS + CHAR_MS), { text: '회의 정리', erasing: false, done: true });
  assert.equal(rewriteMs(f, t), 2 * ERASE_MS + 2 * CHAR_MS);
  assert.deepEqual(rewriteAt('지울 것', '', 0), { text: '지울 ', erasing: true, done: false });
  assert.deepEqual(rewriteAt('지울 것', '', 10_000), { text: '', erasing: false, done: true });
  assert.deepEqual(rewriteAt('', '새 줄', 0), { text: '새', erasing: false, done: false });
  assert.deepEqual(rewriteAt('같음', '같음', 0), { text: '같음', erasing: false, done: true }); // only the time or the tick changed
  assert.deepEqual(rewriteAt('🍎🍏', '🍎🍊', 0), { text: '🍎', erasing: true, done: false }); // emoji erased whole
});
