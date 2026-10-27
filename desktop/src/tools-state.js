import { useEffect, useRef, useState } from 'react';
import { workingJob, finishedSince, jobMood, jobText, MOOD_MS } from './pet-jobs.mjs';

/*
 * 노션 · 구글 캘린더 연결 상태 — one poll for the whole window (settings tab and pet share it).
 * Every 4 s while someone is signed in and the window is visible; refreshTools() right after an action.
 */
let latest = null, timer = null, users = 0, inFlight = null;
const listeners = new Set();
export function refreshTools() {
  if (!window.api.tools) return Promise.resolve(null);
  if (!inFlight) inFlight = window.api.tools('state').then((r) => { latest = r; listeners.forEach((fn) => fn(r)); return r; }, () => latest).finally(() => { inFlight = null; });
  return inFlight;
}
export function useToolsState(active = true) {
  const [state, setState] = useState(latest);
  useEffect(() => {
    if (!active) return undefined;
    listeners.add(setState); users++;
    if (!timer) timer = setInterval(() => { if (!document.hidden) refreshTools(); }, 4000);
    refreshTools();
    return () => { listeners.delete(setState); if (!--users) { clearInterval(timer); timer = null; } };
  }, [active]);
  return active ? state : null;
}
// Runs a tool action; answers { ok, error?, ... } and polls again so the screen catches up at once.
export async function toolAction(action, payload) {
  const r = await window.api.tools(action, payload).catch((e) => ({ ok: false, error: e.message }));
  refreshTools();
  return r;
}

// For the pet: the job it is working on, and the bubble it is saying (one at a time, each for a few seconds).
export function usePetJobs(active = true) {
  const state = useToolsState(active);
  const seen = useRef(null), queue = useRef([]), shown = useRef(null), [bubble, setBubble] = useState(null);
  const show = (b) => { shown.current = b; setBubble(b); };
  const jobs = state?.ok ? state.jobs || [] : null;
  useEffect(() => {
    if (!jobs) return;
    const first = !seen.current;
    if (first) seen.current = new Map();
    const news = finishedSince(seen.current, jobs, first);
    if (!news.length) return;
    queue.current.push(...news.map((j) => ({ id: j.id, text: jobText(j), mood: jobMood(j), provider: j.provider })));
    queue.current = queue.current.slice(-3);
    if (!shown.current) show(queue.current.shift());
  }, [jobs && jobs.map((j) => j.id + j.state).join()]);
  useEffect(() => {
    if (!bubble) return undefined;
    const t = setTimeout(() => show(queue.current.shift() || null), MOOD_MS[bubble.mood]);
    return () => clearTimeout(t);
  }, [bubble]);
  const job = jobs ? workingJob(jobs) : null;
  return { working: job && { id: job.id, state: job.state, provider: job.provider, text: jobText(job) }, bubble };
}
