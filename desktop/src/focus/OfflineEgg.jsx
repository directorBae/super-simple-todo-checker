import React, { useEffect, useRef, useState } from 'react';
import Arcade from './Arcade.jsx';
import { FLOOR, START_X } from './dino.mjs';

// Where the game draws its pet before the first run (the dino stage, sprite cell 1.5): the sprite's top-left
// corner and size in canvas pixels, as drawPet lays it out.
const GAME_PET = { x: START_X - 6, y: FLOOR - 23 * 1.5, size: 24 * 1.5 };
const petGame = (step, more) => window.dispatchEvent(new CustomEvent('checker:pet-game', { detail: { step, ...more } }));

// Opening the game: the screen fades to black while the roaming pet runs to the spot where the game draws it,
// then the game fades in around it and its own pet takes over. Closing runs it back: the game fades away and the
// pet hops home from where it was playing.
//   phase: null (closed) → 'enter' (curtain, pet on its way) → 'open' (game showing) → 'leave' (fading out) → null
export default function OfflineEgg({ db }) {
  const [offline, setOffline] = useState(navigator.onLine === false);
  const [phase, setPhase] = useState(null);
  const screen = useRef(null);
  const quick = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const close = () => setPhase(p => p && p !== 'leave' ? 'leave' : p);
  useEffect(() => {
    const disconnected = () => setOffline(true);
    const connected = () => { setOffline(false); close(); };
    // Esc closes the game; on a computer Ctrl+G opens (or closes) it any time, online or not.
    const key = e => {
      if (e.key === 'Escape') { close(); return; }
      if (!e.ctrlKey || e.altKey || e.metaKey || e.code !== 'KeyG') return;
      if (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
      e.preventDefault(); setPhase(p => p === null ? 'enter' : p === 'leave' ? p : 'leave');
    };
    window.addEventListener('offline', disconnected); window.addEventListener('online', connected); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('offline', disconnected); window.removeEventListener('online', connected); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => {
    const timers = [], later = (ms, f) => timers.push(setTimeout(f, quick() ? 0 : ms));
    if (phase === 'enter') {
      // The game is already laid out (invisible), so the pet's spot in it can be measured.
      const canvas = screen.current?.querySelector('canvas'), r = canvas?.getBoundingClientRect(), k = r ? r.width / 500 : 1;
      let curtain = false, arrived = !document.querySelector('.roaming-pet') || !r; // no pet on screen (phone layout): just the curtain
      const next = () => { if (curtain && arrived) setPhase(p => p === 'enter' ? 'open' : p); };
      const onArrive = () => { arrived = true; next(); };
      window.addEventListener('checker:pet-game-arrived', onArrive);
      if (r) petGame('enter', { x: r.left + GAME_PET.x * k, y: r.top + GAME_PET.y * k, size: GAME_PET.size * k });
      later(650, () => { curtain = true; next(); });
      later(2500, onArrive); // never wait on a pet that got stuck
      return () => { timers.forEach(clearTimeout); window.removeEventListener('checker:pet-game-arrived', onArrive); };
    }
    // The game has faded in over the pet: the game's own pet (drawn in the same place) takes over.
    if (phase === 'open') later(380, () => petGame('hide'));
    if (phase === 'leave') { petGame('show'); later(420, () => { setPhase(null); petGame('leave'); }); }
    return () => timers.forEach(clearTimeout);
  }, [phase]);
  if (!offline && !phase) return null;
  return <>
    {offline && <button className="offline-egg" aria-label="오프라인 공룡게임" title="오프라인 공룡게임" onClick={() => setPhase(p => p ?? 'enter')}>🦕</button>}
    {/* Full-window game, like a browser's offline page. */}
    {phase && <div ref={screen} className={'offline-game ' + phase} role="dialog" aria-modal="true" aria-label="오프라인 공룡게임"><button className="icon-btn offline-close" aria-label="게임 닫기" onClick={close}>✕</button><Arcade db={db} active={phase === 'open'} /></div>}
  </>;
}
