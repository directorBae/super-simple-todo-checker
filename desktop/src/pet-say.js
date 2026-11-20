import { useEffect, useState } from 'react';

// Anything in the app can have the pet work on something or say something (App.jsx hands these to the pet, after the
// tool connections' own jobs):
//   window.dispatchEvent(new CustomEvent('checker:pet-work', { detail: { id, state: 'reading' | 'thinking' | 'writing', text } | null }))
//   window.dispatchEvent(new CustomEvent('checker:pet-say',  { detail: { id, mood: 'done' | 'error' | 'memo', text, name?, tail?, onOpen? } }))
// A bubble stays a while — longer when it can be clicked (mood 'memo', with onOpen) — and a new one replaces it.
export const SAY_MS = { memo: 20000, error: 9000, done: 7000, push: 3500 };

export function usePetSay() {
  const [working, setWorking] = useState(null), [bubble, setBubble] = useState(null);
  useEffect(() => {
    const work = (e) => setWorking(e.detail ? { ...e.detail, id: 'say-' + (e.detail.id || 'x') } : null);
    const say = (e) => { if (e.detail) setBubble({ ...e.detail, id: 'say-' + (e.detail.id || 'x') + '-' + Date.now() }); };
    window.addEventListener('checker:pet-work', work); window.addEventListener('checker:pet-say', say);
    return () => { window.removeEventListener('checker:pet-work', work); window.removeEventListener('checker:pet-say', say); };
  }, []);
  useEffect(() => {
    if (!bubble) return undefined;
    const t = setTimeout(() => setBubble(null), SAY_MS[bubble.mood] || 7000);
    return () => clearTimeout(t);
  }, [bubble]);
  return { working, bubble };
}
