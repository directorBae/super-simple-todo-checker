import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { tools } from './store.js';

// One poll of the signed-in person's tool connections for the whole app: the 도구 연결 screen reads it, and so does
// the work toast. Every 4 s while the app is in front; every 2 s for up to 2 minutes while a connection is being
// made in the browser (until it shows up); every 20 s after a failure.
const ToolsContext = createContext({ client: null, state: null, error: '', waiting: null, refresh: async () => null, waitFor: () => {} });
const WAIT_MS = 120_000;

export function ToolsProvider({ children }) {
  const [state, setState] = useState(null), [error, setError] = useState(''), [waiting, setWaiting] = useState(null);
  const timer = useRef(null), running = useRef(null), wait = useRef(null), alive = useRef(true), loop = useRef(null);
  const refresh = () => {
    if (!tools) return Promise.resolve(null);
    if (running.current) return running.current;
    running.current = tools.state().then(
      (s) => { if (alive.current) { setState(s); setError(''); } return s; },
      (e) => { if (alive.current) setError(e.message); return null; },
    ).finally(() => { running.current = null; });
    return running.current;
  };
  const schedule = (ms) => { clearTimeout(timer.current); if (alive.current) timer.current = setTimeout(() => loop.current(), ms); };
  loop.current = async () => {
    let s = null;
    if (AppState.currentState !== 'background') s = await refresh();
    const w = wait.current;
    if (w && (Date.now() > w.until || s?.connections.some((c) => c.provider === w.provider))) { wait.current = null; setWaiting(null); }
    schedule(wait.current ? 2000 : s || AppState.currentState === 'background' ? 4000 : 20000);
  };
  // After opening the sign-in page: look again every 2 s until that tool shows up as connected.
  const waitFor = (provider) => { wait.current = { provider, until: Date.now() + WAIT_MS }; setWaiting(provider); schedule(2000); };
  useEffect(() => {
    if (!tools) return undefined;
    alive.current = true;
    loop.current();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') { clearTimeout(timer.current); loop.current(); } });
    return () => { alive.current = false; clearTimeout(timer.current); sub.remove(); };
  }, []);
  return <ToolsContext.Provider value={{ client: tools, state, error, waiting, refresh, waitFor }}>{children}</ToolsContext.Provider>;
}

export const useTools = () => useContext(ToolsContext);
