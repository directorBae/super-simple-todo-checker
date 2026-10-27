// What the phone shows of the tool connections' work (no pet here): the toast text for a job, which jobs just
// finished between two polls, and the status line of a watched page or calendar. Pure, so node --test can run it.
export const PROVIDER_NAMES = { notion: '노션', google: '구글 캘린더' };
const ACTIVE = { reading: ['📄', '읽는 중'], thinking: ['💭', '생각하는 중'], writing: ['✏️', '적는 중'] };
const STALE_MS = 3 * 60_000; // a job stuck this long in one step was cut off; don't keep showing it
const FINISHED = ['done', 'error'];

export const isActive = (job, now = Date.now()) => !!ACTIVE[job?.state] && job.kind !== 'push' && now - Date.parse(job.updated_at || 0) < STALE_MS;

// { icon, text, active } while the job runs; { icon, text, ms, error } once it has finished.
export function toastOf(job) {
  const name = PROVIDER_NAMES[job.provider] || '도구', summary = String(job.summary || '').trim();
  if (ACTIVE[job.state]) {
    const [icon, label] = ACTIVE[job.state];
    return { icon, text: `${summary.replace(/\s*읽는 중…?$/, '') || name} ${label}…`, active: true };
  }
  if (job.state === 'error') return { icon: '⚠️', text: summary || `${name}에서 문제가 생겼어요`, ms: 6000, error: true };
  if (job.kind === 'push') return { icon: '🔄', text: summary || `${name}에 반영했어요`, ms: 3000 };
  return { icon: '✅', text: summary || `${name} 다 읽었어요`, ms: 5000 };
}

// Between two polls: the job to show as running (newest first), and the jobs that finished since the last poll.
// `known` is { [jobId]: state } from the previous poll, null on the first one (old finished jobs are not news then).
export function followJobs(known, jobs = [], now = Date.now()) {
  const next = {}, finished = [];
  for (const job of jobs) {
    next[job.id] = job.state;
    if (known && FINISHED.includes(job.state) && known[job.id] !== job.state) finished.push(job);
  }
  return { known: next, active: jobs.find((j) => isActive(j, now)) || null, finished };
}

export function ago(iso, now = Date.now()) {
  const at = Date.parse(iso || '');
  if (!at) return '';
  const min = Math.floor((now - at) / 60_000);
  if (min < 1) return '방금';
  if (min < 60) return `${min}분 전`;
  if (min < 24 * 60) return `${Math.floor(min / 60)}시간 전`;
  const t = new Date(at);
  return `${t.getMonth() + 1}월 ${t.getDate()}일`;
}

// 지켜보는 중 · 5분 전 읽음 / 읽는 중… / 오류: …
export function subscriptionLine(sub, now = Date.now()) {
  if (sub.state === 'syncing') return { text: '읽는 중…' };
  if (sub.state === 'error') return { text: '오류: ' + (sub.last_error || '알 수 없는 문제'), error: true };
  const when = ago(sub.last_synced_at, now);
  return { text: '지켜보는 중' + (when ? ` · ${when} 읽음` : '') };
}
