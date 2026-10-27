import React, { useEffect, useRef, useState } from 'react';
import { createGame, stepGame, paintStage, blendAmount } from './game-engine.mjs';
import { DEFAULT_PET } from './Pet.jsx';
import { drawPet } from './pet-sprite.mjs';

// Paints a stage into its own buffer so two stages can cross-fade cleanly.
function paintInto(buffer, stage, state, g, pet) {
  const ctx = buffer.getContext('2d');
  ctx.save(); ctx.clearRect(0, 0, 500, 280);
  const runner = (x, bottom, options) => {
    // Blinks for a moment after a hit.
    if (g.runner.invincible > 0 && Math.floor(g.elapsed * 12) % 2 === 0 && !g.transition) return;
    drawPet(ctx, pet, x, bottom, options, g.runner.big, g.elapsed);
  };
  paintStage(ctx, stage, state, g, runner);
  ctx.restore();
}
function paint(ctx, g, pet, buffers) {
  ctx.globalAlpha = 1;
  if (g.transition) {
    paintInto(buffers[0], g.transition.stage, g.transition.state, g, pet);
    ctx.drawImage(buffers[0], 0, 0);
  }
  paintInto(buffers[1], g.stage, g.state, g, pet);
  ctx.globalAlpha = blendAmount(g);
  ctx.drawImage(buffers[1], 0, 0);
  ctx.globalAlpha = 1;
}

export default function Arcade({ db, active = true }) {
  const canvas = useRef(null), game = useRef(createGame()), keys = useRef(new Set());
  const [running, setRunning] = useState(false), [stats, setStats] = useState({ score: 0, lives: 3, over: false }), [best, setBest] = useState(db.settings.arcadeBest || 0);
  const bestRef = useRef(best); bestRef.current = best;
  const pet = { ...DEFAULT_PET, ...db.settings.focusPet };
  const buffers = useRef(null);
  if (!buffers.current && typeof document !== 'undefined') buffers.current = [0, 1].map(() => Object.assign(document.createElement('canvas'), { width: 500, height: 280 }));
  useEffect(() => { if (!active) setRunning(false); }, [active]);
  useEffect(() => {
    const c = canvas.current, ctx = c.getContext('2d'); let frame, last = 0, report = 0;
    if (!running || !active) { paint(ctx, game.current, pet, buffers.current); keys.current.clear(); return; }
    const draw = time => {
      if (running && last) {
        stepGame(game.current, (time - last) / 1000, keys.current);
        if (time - report > 80 || game.current.gameOver) { report = time; setStats({ score: Math.floor(game.current.score), lives: game.current.runner.lives, over: game.current.gameOver }); }
        if (game.current.gameOver) { setRunning(false); const value = Math.floor(game.current.score); if (value > bestRef.current) { setBest(value); window.api.updateSettings({ arcadeBest: value }); } }
      }
      last = time; paint(ctx, game.current, pet, buffers.current); frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); keys.current.clear(); };
  }, [running, active]);
  useEffect(() => {
    const pause = () => { keys.current.clear(); setRunning(false); };
    window.addEventListener('blur', pause); document.addEventListener('visibilitychange', pause);
    return () => { window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', pause); };
  }, []);
  const start = () => { if (game.current.gameOver) { game.current = createGame(); setStats({ score: 0, lives: 3, over: false }); } setRunning(true); canvas.current.focus(); };
  // Like Chrome's dino: Space / ↑ (or a tap) starts and restarts the run.
  useEffect(() => { canvas.current?.focus(); }, []);
  const key = (e, down) => {
    if (down && !running && (e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) { e.preventDefault(); start(); return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) { e.preventDefault(); if (down) keys.current.add(e.code); else keys.current.delete(e.code); }
    if (down && e.code === 'KeyP') setRunning(v => !v);
  };
  // Just the game: the HUD sits on the score strip, controls are keyboard (touch buttons only on touch screens).
  return <section className="arcade-card" aria-label="오프라인 게임">
    <div className="arcade-score"><span>{'♥'.repeat(stats.lives)}</span><span><em>HI {String(best).padStart(5, '0')}</em><b>{String(stats.score).padStart(5, '0')}</b></span></div>
    <div className="arcade-screen"><canvas ref={canvas} width="500" height="280" tabIndex="0" aria-label="게임" onKeyDown={e => key(e, true)} onKeyUp={e => key(e, false)} onBlur={() => { keys.current.clear(); }}
      onPointerDown={e => { if (!running) { start(); return; } keys.current.add('Space'); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={() => keys.current.delete('Space')} onPointerCancel={() => keys.current.delete('Space')} />
      {!running && <button className="arcade-start" aria-label={stats.over || stats.score ? '다시 시작' : '게임 시작'} onClick={start}>{stats.over ? '↻' : '▶'}</button>}
    </div>
    <div className="touch-controls">{[['ArrowLeft', '←'], ['ArrowUp', '↑'], ['ArrowDown', '↓'], ['ArrowRight', '→'], ['Space', '점프 / 발사']].map(([code, label]) => <button key={code} disabled={!running} aria-label={'게임 ' + label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(code); }} onPointerUp={() => keys.current.delete(code)} onPointerCancel={() => keys.current.delete(code)} onLostPointerCapture={() => keys.current.delete(code)}>{label}</button>)}</div>
  </section>;
}
