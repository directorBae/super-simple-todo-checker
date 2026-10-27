import test from 'node:test';
import assert from 'node:assert/strict';
import { workingJob, jobText, jobMood, finishedSince } from '../src/pet-jobs.mjs';

const now = Date.parse('2026-10-28T09:00:00Z'), at = (s) => new Date(now - s * 1000).toISOString();
const job = (id, state, ago, extra = {}) => ({ id, provider: 'notion', kind: 'import', state, summary: '노션 "주간 업무" 읽는 중', updated_at: at(ago), ...extra });

test('pet jobs: the newest running job, with its step in words', () => {
  assert.equal(workingJob([job('a', 'reading', 30), job('b', 'thinking', 5), job('c', 'done', 1)], now).id, 'b');
  assert.equal(workingJob([job('a', 'writing', 600)], now), null, 'a job stuck for minutes is not shown as running');
  assert.equal(jobText(job('a', 'reading', 0)), '노션 "주간 업무" 읽는 중');
  assert.equal(jobText(job('a', 'thinking', 0)), '노션 "주간 업무" 생각하는 중');
  assert.equal(jobText(job('a', 'writing', 0)), '노션 "주간 업무" 적는 중');
  assert.equal(jobText(job('a', 'done', 0, { summary: '노션 "주간 업무"에서 2개 추가' })), '노션 "주간 업무"에서 2개 추가');
  assert.equal(jobMood(job('a', 'error', 0)), 'error');
  assert.equal(jobMood(job('a', 'done', 0, { kind: 'push' })), 'push');
  assert.equal(jobMood(job('a', 'done', 0)), 'done');
});

test('pet jobs: only news is told — not what was already finished when the app opened', () => {
  const seen = new Map();
  assert.deepEqual(finishedSince(seen, [job('old', 'done', 300), job('run', 'thinking', 3)], true), []);
  assert.deepEqual(finishedSince(seen, [job('old', 'done', 300), job('run', 'thinking', 1)]), []);
  const later = [job('run', 'done', 0), job('push', 'done', 0, { kind: 'push' }), job('old', 'done', 300)];
  assert.deepEqual(finishedSince(seen, later).map((j) => j.id).sort(), ['push', 'run']);
  assert.deepEqual(finishedSince(seen, later), [], 'told once');
  assert.deepEqual(finishedSince(seen, [job('bad', 'error', 0)]).map((j) => j.id), ['bad']);
});
