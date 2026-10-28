import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { tools, useDb } from './store.js';
import { tidy, localList, seedFrom, createSaver } from './playlist.js';

// My playlist. Signed in: the account's list (same on PC, web and phone), cached on the phone so it shows offline,
// loaded at start and whenever the music opens (reload), saved 0.5 s after each change. Not signed in: settings.music.
// The shell remounts per account, so this state never mixes two people's lists.
export function usePlaylist() {
  const { db, api, account } = useDb();
  const owner = tools && account?.id ? account.id : null;
  const [remote, setRemote] = useState(() => (owner && db.settings.musicCache?.owner === owner ? tidy(db.settings.musicCache.list) : null));
  const list = owner ? remote || [] : localList(db.settings.music);
  const latest = useRef(null);
  latest.current = { list, db, api, owner };
  const version = useRef(0), saver = useRef(null);
  if (!saver.current) saver.current = createSaver((l) => tools.savePlaylist(l), 500);

  const keep = (next) => { setRemote(next); latest.current.api.updateSettings({ musicCache: { owner: latest.current.owner, list: next } }); };
  // set(list) or set(list => newList)
  const set = (change) => {
    const L = latest.current, next = tidy(typeof change === 'function' ? change(L.list) : change);
    L.list = next; version.current++;
    if (L.owner) { keep(next); saver.current.push(next); } else L.api.updateSettings({ music: next });
  };
  const reload = async () => {
    if (!latest.current.owner) return;
    if (saver.current.busy()) { saver.current.flush(); return; } // my unsaved change wins (and is retried)
    const v = version.current;
    try {
      const got = tidy(await tools.playlist());
      if (v !== version.current || saver.current.busy()) return;
      const { db: now, api: a } = latest.current;
      const seed = seedFrom(got, now.settings.music, now.settings.musicSeeded);
      if (!now.settings.musicSeeded) a.updateSettings({ musicSeeded: true });
      if (seed) set(seed);
      else if (JSON.stringify(got) !== JSON.stringify(latest.current.list)) keep(got);
    } catch {}
  };
  useEffect(() => { reload(); }, [owner]);
  // Leaving the app or signing out: what is waiting goes up now.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => { if (s !== 'active') saver.current.flush(); });
    return () => { sub.remove(); saver.current.flush(); };
  }, []);
  return { list, set, reload };
}
