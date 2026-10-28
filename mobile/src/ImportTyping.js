import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useDb, localTouches } from './store.js';
import { useTools } from './tools.js';
import { newWatch, watchJobs, arrivals, arrival, changes, explains, inScreenOrder, enqueue, finishOne, finishAll, head, current, inSession, EMPTY } from './import-typing.js';

// Watches the tool jobs and the to-dos, and keeps the queue of changes the day list plays (see import-typing.js): new
// lines, changed lines, moved lines and removed lines a Notion / Google Calendar job made. The day list attaches itself
// while it is on screen; with no list showing (or while the person is editing, selecting or moving lines) changes
// simply show (nothing waits to be played later).
const LOCAL_MS = 15_000;   // a line changed on this phone this recently is the person's, not the AI's
const LIMBO_MS = 15_000;   // a change no job explains yet may still be explained by the next poll of the jobs
const TypingContext = createContext({ item: null, current: null, items: [], reduced: false, session: false, done: () => {}, finishAll: () => {}, attach: () => () => {}, setBusy: () => {} });

export function ImportTypingProvider({ children }) {
  const { db } = useDb(), { state } = useTools();
  const watch = useRef(newWatch()), seen = useRef(new Set()), start = useRef(Date.now()), prev = useRef(null), limbo = useRef([]), busy = useRef(false);
  const [q, setQ] = useState(EMPTY), [stages, setStages] = useState(0), [reduced, setReduced] = useState(false), [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then((r) => { if (live) setReduced(!!r); }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', (r) => setReduced(!!r));
    return () => { live = false; sub?.remove?.(); };
  }, []);
  useEffect(() => { if (state) { watch.current = watchJobs(watch.current, state.jobs || []); setTick((n) => n + 1); } }, [state]);
  // Each new look at the data: new lines from a watched job, and what changed in the lines its tool brought in before.
  useEffect(() => {
    const now = Date.now(), todos = db.todos;
    const fresh = arrivals(watch.current, seen.current, todos, start.current).map(arrival);
    const touched = (id) => now - (localTouches.get(id) || 0) < LOCAL_MS;
    const found = prev.current && prev.current !== todos ? changes(prev.current, todos, touched).map((c) => ({ ...c, seenAt: now })) : [];
    prev.current = todos;
    const waiting = [...limbo.current, ...found].filter((c) => now - c.seenAt < LIMBO_MS && !touched(c.id));
    const take = waiting.filter((c) => explains(watch.current, c));
    limbo.current = waiting.filter((c) => !take.includes(c));
    const all = inScreenOrder([...fresh, ...take]);
    if (all.length && stages > 0 && !busy.current) setQ((cur) => enqueue(cur, all));
  }, [db.todos, tick]);
  useEffect(() => { if (!stages) setQ(finishAll()); }, [stages]);
  const value = {
    item: head(q),
    current: current(q),
    items: q.queue,
    reduced,
    session: inSession(state?.jobs || [], q),
    done: (key) => setQ((cur) => finishOne(cur, key)),
    finishAll: () => setQ((cur) => (cur.queue.length ? finishAll() : cur)),
    attach: () => { setStages((n) => n + 1); return () => setStages((n) => n - 1); },
    // While the person edits, selects or moves lines, nothing new is played (it just shows).
    setBusy: (on) => { busy.current = !!on; },
  };
  return <TypingContext.Provider value={value}>{children}</TypingContext.Provider>;
}

export const useImportTyping = () => useContext(TypingContext);
