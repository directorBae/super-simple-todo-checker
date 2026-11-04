import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_PET, PetSprite } from './Pet.jsx';
import { PET_SPECIES, petGridSmooth, petLabel } from '../../../shared/pixel-pet.js';

// The pet studio (the pet button, bottom left): the pet is brought to the middle of the screen and shown big, smoothed
// to 96×96, going through a loop of little moves; a glass bar rises from the bottom to rename it and pick its animal
// and design, and the big pet changes (with a hop) on every pick. Closing shrinks it back to where it was roaming.
const SIZE = 96;
// The loop it performs: [pose, seconds, how it moves]. Walking is on the spot; a hop lifts it by `hop` × the jump height.
const MOTION = [
  ['idle', 1.4], ['blink', 0.18], ['idle', 0.5], ['walk', 1.1], ['jump', 0.55, { hop: 1 }], ['idle', 0.7],
  ['walk', 1.1, { flip: true }], ['idle', 0.6, { flip: true }], ['blink', 0.18, { flip: true }], ['idle', 0.4, { flip: true }],
  ['jump', 0.4, { hop: 0.55 }], ['jump', 0.4, { hop: 0.55 }], ['sleep', 1.2], ['idle', 0.4],
];
const LOOP = MOTION.reduce((n, m) => n + m[1], 0), HOP_AT = MOTION.slice(0, 4).reduce((n, m) => n + m[1], 0);
function motionAt(t) {
  let at = t % LOOP;
  for (const [pose, length, how = {}] of MOTION) {
    if (at < length) return { pose, how, part: at / length, at };
    at -= length;
  }
  return { pose: 'idle', how: {}, part: 0, at: 0 };
}

function BigPet({ pet, hopKey }) {
  const canvas = useRef(null), body = useRef(null), start = useRef(0);
  // A new pick jumps straight to the hop in the loop.
  useEffect(() => { start.current = performance.now() / 1000 - HOP_AT; }, [hopKey]);
  useEffect(() => {
    const ctx = canvas.current.getContext('2d'), still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    let frame, drawn = '';
    const tick = (now) => {
      const t = now / 1000 - start.current, m = still ? { pose: 'idle', how: {}, part: 0, at: 0 } : motionAt(t);
      const pose = m.pose === 'blink' ? 'idle' : m.pose, step = m.pose === 'blink' ? 9 : m.pose === 'walk' ? Math.floor(m.at * 8) : 0;
      const key = pose + step;
      if (key !== drawn) {
        drawn = key; ctx.clearRect(0, 0, SIZE, SIZE);
        petGridSmooth(pet, pose, step).forEach((row, y) => row.forEach((c, x) => { if (c) { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); } }));
      }
      // Breathing while it stands, a hop when it jumps, turned round for the flipped part of the loop.
      const hop = m.how.hop ? Math.sin(m.part * Math.PI) * 22 * m.how.hop : 0, breathe = pose === 'idle' || pose === 'sleep' ? 1 + Math.sin(t * 3.2) * 0.018 : 1;
      body.current.style.transform = `translateY(${(-hop).toFixed(2)}%) scaleX(${m.how.flip ? -1 : 1}) scaleY(${breathe.toFixed(4)})`;
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [pet.species, pet.design, pet.color]);
  return <div ref={body} className="pet-studio-body"><canvas ref={canvas} width={SIZE} height={SIZE} role="img" aria-label={`${pet.name} · ${petLabel(pet)}`} /></div>;
}

// from: where the roaming pet stood ({x, y, size} in window pixels) — the big pet grows out of it and shrinks back to it.
export default function PetStudio({ db, from, onClosed }) {
  const saved = { ...DEFAULT_PET, ...db.settings.focusPet };
  const [pet, setPet] = useState(saved), [name, setName] = useState(saved.name), [closing, setClosing] = useState(false), [hopKey, setHopKey] = useState(0);
  const fly = useRef(null), closed = useRef(false);
  const save = (patch) => { setPet((p) => ({ ...p, ...patch })); setHopKey((k) => k + 1); window.api.updateSettings({ focusPet: { ...db.settings.focusPet, ...patch } }); };
  const close = () => setClosing(true);
  const saveName = () => { const n = name.trim().slice(0, 12); if (n && n !== pet.name) window.api.updateSettings({ focusPet: { ...db.settings.focusPet, name: n } }), setPet((p) => ({ ...p, name: n })); else setName(pet.name); };
  // Grow out of (and shrink back into) the roaming pet's spot: the model box is mapped onto it.
  const toFrom = () => {
    const r = fly.current.getBoundingClientRect(), f = from || { x: 22, y: innerHeight - 50, size: 20 };
    return `translate(${f.x - r.left}px, ${f.y - r.top}px) scale(${f.size / r.width})`;
  };
  useLayoutEffect(() => {
    const el = fly.current; el.style.transition = 'none'; el.style.transform = toFrom();
    el.getBoundingClientRect();
    el.style.transition = ''; el.style.transform = '';
  }, []);
  useEffect(() => {
    if (!closing) return;
    fly.current.style.transform = toFrom();
    const done = () => { if (!closed.current) { closed.current = true; onClosed(); } };
    const t = setTimeout(done, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 480);
    return () => clearTimeout(t);
  }, [closing]);
  useEffect(() => {
    const key = (e) => { if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) close(); };
    const toggle = () => close();
    window.addEventListener('keydown', key); window.addEventListener('checker:pet-studio-close', toggle);
    return () => { window.removeEventListener('keydown', key); window.removeEventListener('checker:pet-studio-close', toggle); };
  }, []);
  const species = PET_SPECIES.find((s) => s.id === pet.species) || PET_SPECIES[0];
  return <div className={'pet-studio' + (closing ? ' closing' : '')} role="dialog" aria-modal="true" aria-label="펫 꾸미기">
    <div className="pet-studio-scrim" onMouseDown={close} />
    <div className="pet-studio-stage" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div ref={fly} className="pet-studio-model"><BigPet pet={pet} hopKey={hopKey} /></div>
    </div>
    <section className="pet-studio-bar">
      <div className="pet-studio-head">
        <input className="pet-studio-name" value={name} maxLength={12} aria-label="펫 이름" onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }} />
        <span className="pet-studio-kind">{petLabel(pet)}</span>
        <button className="icon-btn" aria-label="닫기" onClick={close}>✕</button>
      </div>
      <div className="pet-studio-animals" role="tablist" aria-label="동물">
        {PET_SPECIES.map((s) => <button key={s.id} role="tab" aria-selected={s.id === species.id} className={'pet-studio-animal' + (s.id === species.id ? ' active' : '')} onClick={() => s.id !== pet.species && save({ species: s.id, design: 0 })}>
          <PetSprite pet={{ name: s.name, species: s.id, design: 0 }} /><span>{s.name}</span>
        </button>)}
      </div>
      <div className="pet-studio-designs" aria-label={species.name + ' 디자인'}>
        {species.designs.map(([label], design) => {
          const on = pet.species === species.id && pet.design === design;
          return <button key={design} className={'pet-studio-design' + (on ? ' active' : '')} aria-pressed={on} onClick={() => !on && save({ species: species.id, design })}>
            <PetSprite pet={{ name: label, species: species.id, design }} /><span>{label}</span>
          </button>;
        })}
      </div>
    </section>
  </div>;
}
