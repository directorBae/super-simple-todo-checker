import React, { useEffect, useState } from 'react';
import Arcade from './Arcade.jsx';

export default function OfflineEgg({ db }) {
  const [offline, setOffline] = useState(navigator.onLine === false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const disconnected = () => setOffline(true);
    const connected = () => { setOffline(false); setOpen(false); };
    const escape = e => { if (e.key === 'Escape') setOpen(false); };
    // Testing: the menu can open the game while online (normally it only appears offline).
    const requested = () => setOpen(true);
    window.addEventListener('offline', disconnected); window.addEventListener('online', connected); window.addEventListener('keydown', escape); window.addEventListener('checker:open-game', requested);
    return () => { window.removeEventListener('offline', disconnected); window.removeEventListener('online', connected); window.removeEventListener('keydown', escape); window.removeEventListener('checker:open-game', requested); };
  }, []);
  if (!offline && !open) return null;
  return <>
    {offline && <button className="offline-egg" aria-label="오프라인 공룡게임" title="오프라인 공룡게임" onClick={() => setOpen(true)}>🦕</button>}
    {/* Full-window game, like a browser's offline page. */}
    {open && <div className="offline-game" role="dialog" aria-modal="true" aria-label="오프라인 공룡게임"><button className="icon-btn offline-close" aria-label="게임 닫기" onClick={() => setOpen(false)}>✕</button><Arcade db={db} /></div>}
  </>;
}
