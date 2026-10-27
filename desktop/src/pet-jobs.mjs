// What the pet shows for the tool connections' jobs (pet_jobs): reading → thinking → writing → done | error.
export const WORKING = ['reading', 'thinking', 'writing'];
const VERBS = { reading: '읽는 중', thinking: '생각하는 중', writing: '적는 중' };
const STALE = 3 * 60_000; // a job that has not moved for this long is not shown as running any more
const time = (job) => Date.parse(job?.updated_at) || 0;

// The newest job still running (the pet works on one thing at a time).
export function workingJob(jobs = [], now = Date.now()) {
  return jobs.filter((j) => WORKING.includes(j.state) && now - time(j) < STALE).sort((a, b) => time(b) - time(a))[0] || null;
}
// "노션 "주간 업무" 읽는 중" → the same with this step's verb; a finished job says its summary.
export function jobText(job) {
  if (!job) return '';
  if (!WORKING.includes(job.state)) return job.summary || (job.state === 'error' ? '읽지 못했어요' : '다 했어요');
  return (job.summary || '').replace(/\s*읽는 중$/, '') + ' ' + VERBS[job.state];
}
export const jobMood = (job) => (job.state === 'error' ? 'error' : job.kind === 'push' ? 'push' : 'done');
export const MOOD_MS = { done: 6000, error: 7000, push: 3500 };

// Jobs that just finished, oldest first. The first look only remembers what is there (old news is not replayed).
// `seen` (id → state) is kept by the caller between polls.
export function finishedSince(seen, jobs = [], first = false) {
  const news = [];
  for (const job of [...jobs].sort((a, b) => time(a) - time(b))) {
    const before = seen.get(job.id), finished = job.state === 'done' || job.state === 'error';
    if (!first && finished && before !== job.state) news.push(job);
    seen.set(job.id, job.state);
  }
  return news;
}
