import React, { useEffect, useState } from 'react';
import Arcade from './Arcade.jsx';

export default function OfflineEgg({ db }) {
  const [offline, setOffline] = useState(navigator.onLine === false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const disconnected = () => setOffline(true);
    const connected = () => { setOffline(false); setOpen(false); };
    // Esc closes the game; on a computer Ctrl+G opens (or closes) it any time, online or not.
    const key = e => {
      if (e.key === 'Escape') { setOpen(false); return; }
      if (!e.ctrlKey || e.altKey || e.metaKey || e.code !== 'KeyG') return;
      if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
      e.preventDefault(); setOpen(v => !v);
    };
    window.addEventListener('offline', disconnected); window.addEventListener('online', connected); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('offline', disconnected); window.removeEventListener('online', connected); window.removeEventListener('keydown', key); };
  }, []);
  if (!offline && !open) return null;
  return <>
    {offline && <button className="offline-egg" aria-label="오프라인 공룡게임" title="오프라인 공룡게임" onClick={() => setOpen(true)}>🦕</button>}
    {/* Full-window game, like a browser's offline page. */}
    {open && <div className="offline-game" role="dialog" aria-modal="true" aria-label="오프라인 공룡게임"><button className="icon-btn offline-close" aria-label="게임 닫기" onClick={() => setOpen(false)}>✕</button><Arcade db={db} /></div>}
  </>;
}
