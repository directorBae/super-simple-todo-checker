import React, { useEffect, useRef, useState } from 'react';
import { createGame, stepGame, skipStage, petPose, paintStage, worldOffsets, crossingPose, stageTitle } from './game-engine.mjs';
import { DEFAULT_PET } from './Pet.jsx';
import { drawPet, drawGear } from './pet-sprite.mjs';
import { setSoundOn, unlockSound, playSound, soundState, hearSounds } from './arcade-sound.mjs';

// One scene: each world is painted into its own buffer (without the pet), and the pet is drawn last on top, so
// while the camera crosses from one game into the next the pet stays a single figure moving between them.
function paintWorld(buffer, stage, state, g, onPet) {
  const ctx = buffer.getContext('2d');
  ctx.save(); ctx.clearRect(0, 0, 500, 280);
  paintStage(ctx, stage, state, g, onPet);
  ctx.restore();
}
function drawRunner(ctx, g, pet, x, bottom, options = {}) {
  // Blinks for a moment after a hit.
  if (g.runner.invincible > 0 && Math.floor(g.elapsed * 12) % 2 === 0 && !g.transition) return;
  const opts = { ...options, fire: g.runner.fire };
  drawPet(ctx, pet, x, bottom, opts, g.runner.big, g.elapsed);
  drawGear(ctx, x, bottom, { cell: options.cell ?? (g.runner.big ? 2.1 : 1.5), flip: options.flip, swing: options.swing }, g.runner, g.elapsed);
}
function paint(ctx, g, pet, buffers) {
  ctx.clearRect(0, 0, 500, 280);
  if (!g.transition) {
    // The stage draws the pet in its own place in the scene (between its layers).
    paintWorld(buffers[1], g.stage, g.state, g, (x, bottom, options) => drawRunner(buffers[1].getContext('2d'), g, pet, x, bottom, options));
    ctx.drawImage(buffers[1], 0, 0);
    return;
  }
  const { from, to } = worldOffsets(g), none = () => {};
  paintWorld(buffers[0], g.transition.stage, g.transition.state, g, none);
  paintWorld(buffers[1], g.stage, g.state, g, none);
  ctx.drawImage(buffers[0], Math.round(from.x), Math.round(from.y));
  ctx.drawImage(buffers[1], Math.round(to.x), Math.round(to.y));
  const p = crossingPose(g);
  drawRunner(ctx, g, pet, p.x, p.bottom, p);
}

// How to play, shown small and faint over the top of the game: at the very start (the dino road) and each time a
// game begins, until it has been played for HINT_SECONDS. Keys are drawn as little keycaps.
const HINT_SECONDS = 30;
const HINTS = {
  dino: (r) => [[['up'], '점프'], [['down'], '숙이기'], (r.fire || r.hammer > 0) && [['space'], r.fire ? '불꽃' : '망치']],
  mario: (r, g) => [[['left', 'right'], '이동'], [['up'], '점프'], r.fire && [['space'], '불꽃'], g.level === 1 && [['down'], '파이프']],
  galaga: () => [[['left', 'right'], '이동 · 자동 발사']],
  pacman: () => [[['up', 'down', 'left', 'right'], '이동']],
  donkeykong: () => [[['left', 'right'], '이동'], [['up'], '점프 · 사다리'], [['down'], '내려가기'], [['space'], '망치']],
  flappy: () => [[['up'], '날갯짓']],
  breakout: () => [[['left', 'right'], '이동'], [['space'], '공 발사']],
  tetris: () => [[['left', 'right'], '이동'], [['up'], '회전'], [['down'], '내리기'], [['space'], '바로 놓기']],
};
// The hint for this moment, or null (later dino legs have none; it goes after 30 s in the stage).
function hintOf(g, enteredAt) {
  if (g.gameOver || (g.stage === 'dino' && g.index > 0) || g.elapsed - enteredAt > HINT_SECONDS) return null;
  return HINTS[g.stage]?.(g.runner, g).filter(Boolean) ?? null;
}
const ARROW = { up: 'M8 3 13 10H3z', down: 'M8 13 3 6h10z', left: 'M3 8l7-5v10z', right: 'M13 8 6 3v10z' };
const Keycap = ({ k }) => k === 'space' ? <kbd className="key-cap space">Space</kbd>
  : <kbd className="key-cap" aria-label={{ up: '위', down: '아래', left: '왼쪽', right: '오른쪽' }[k]}><svg viewBox="0 0 16 16" aria-hidden="true"><path d={ARROW[k]} fill="currentColor" /></svg></kbd>;
function ControlsHint({ hint }) {
  return <div className={'arcade-hint' + (hint ? '' : ' gone')} aria-hidden={!hint}>
    {(hint || []).map(([keys, label]) => <span key={label} className="arcade-hint-item"><span className="key-caps">{keys.map((k) => <Keycap key={k} k={k} />)}</span>{label}</span>)}
  </div>;
}

// What the pet carries, for the score strip.
const gearOf = (r) => [r.fire && '🔥', r.wings && '🪽', r.shield && '🛡', r.hammer > 0 && '🔨' + r.hammer].filter(Boolean).join(' ');

export default function Arcade({ db, active = true }) {
  const canvas = useRef(null), game = useRef(createGame()), keys = useRef(new Set());
  const [running, setRunning] = useState(false), [stats, setStats] = useState({ score: 0, lives: 3, over: false, title: 'RUN', gear: '' }), [best, setBest] = useState(db.settings.arcadeBest || 0);
  const bestRef = useRef(best); bestRef.current = best;
  // When the current stop began (game time), for the controls hint; it stays put once the hint has gone.
  const entered = useRef({ index: 0, at: 0 }), [hint, setHint] = useState(() => hintOf(game.current, 0));
  const lastHint = useRef(hint);
  const sound = db.settings.arcadeSound !== false;
  useEffect(() => { setSoundOn(sound); }, [sound]);
  const pet = { ...DEFAULT_PET, ...db.settings.focusPet };
  const buffers = useRef(null);
  if (!buffers.current && typeof document !== 'undefined') buffers.current = [0, 1].map(() => Object.assign(document.createElement('canvas'), { width: 500, height: 280 }));
  useEffect(() => { if (!active) setRunning(false); }, [active]);
  useEffect(() => {
    const c = canvas.current, ctx = c.getContext('2d'); let frame, last = 0, report = 0;
    if (!running || !active) { paint(ctx, game.current, pet, buffers.current); keys.current.clear(); return; }
    const draw = time => {
      if (running && last) {
        const before = soundState(game.current, petPose(game.current));
        stepGame(game.current, (time - last) / 1000, keys.current);
        hearSounds(before, soundState(game.current, petPose(game.current)));
        const g = game.current;
        if (g.index !== entered.current.index) entered.current = { index: g.index, at: g.elapsed };
        if (time - report > 80 || game.current.gameOver) { report = time; const h = hintOf(g, entered.current.at); if (JSON.stringify(h) !== JSON.stringify(lastHint.current)) { lastHint.current = h; setHint(h); } setStats({ score: Math.floor(game.current.score), lives: game.current.runner.lives, over: game.current.gameOver, title: stageTitle(game.current), gear: gearOf(game.current.runner) }); }
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
  const start = () => { unlockSound(); playSound('start'); if (game.current.gameOver) { game.current = createGame(); entered.current = { index: 0, at: 0 }; lastHint.current = hintOf(game.current, 0); setHint(lastHint.current); setStats({ score: 0, lives: 3, over: false, title: 'RUN', gear: '' }); } setRunning(true); canvas.current.focus(); };
  // Like Chrome's dino: Space / ↑ (or a tap) starts and restarts the run.
  useEffect(() => { canvas.current?.focus(); }, []);
  const key = (e, down) => {
    if (down && !running && (e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat) { e.preventDefault(); start(); return; }
    if (down && running && !e.repeat) {
      // Sounds that come straight from a key: a fireball, a flap, a Tetris piece moving or turning.
      const g = game.current;
      if (e.code === 'Space' && g.runner.fire && (g.stage === 'mario' || g.stage === 'dino')) playSound('fire');
      else if (e.code === 'Space' && g.runner.hammer > 0 && g.stage === 'donkeykong') playSound('swing');
      else if (e.code === 'ArrowUp' && g.stage === 'flappy') playSound('flap');
      else if (g.stage === 'tetris' && e.code.startsWith('Arrow')) playSound('tick');
    }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) { e.preventDefault(); if (down) keys.current.add(e.code); else keys.current.delete(e.code); }
    if (down && e.code === 'KeyP') setRunning(v => !v);
    if (down && e.code === 'KeyM') toggleSound();
    if (down && e.code === 'KeyZ' && running && window.checkerDebug) { e.preventDefault(); skipStage(game.current); }
  };
  const toggleSound = () => { unlockSound(); window.api.updateSettings({ arcadeSound: !sound }); };
  // Just the game: the HUD sits on the score strip, controls are keyboard (touch buttons only on touch screens).
  return <section className="arcade-card" aria-label="오프라인 게임">
    <div className="arcade-score"><span>{'♥'.repeat(stats.lives)}{stats.gear && <i className="arcade-gear">{stats.gear}</i>}</span><span className="arcade-stage">{stats.title}</span><span><button className="arcade-sound" aria-label={sound ? '소리 끄기 (M)' : '소리 켜기 (M)'} title={sound ? '소리 끄기 (M)' : '소리 켜기 (M)'} aria-pressed={!sound} onClick={toggleSound}>{sound ? '🔊' : '🔇'}</button><em>HI {String(best).padStart(5, '0')}</em><b>{String(stats.score).padStart(5, '0')}</b></span></div>
    <div className="arcade-screen"><ControlsHint hint={hint} /><canvas ref={canvas} width="500" height="280" tabIndex="0" aria-label="게임" onKeyDown={e => key(e, true)} onKeyUp={e => key(e, false)} onBlur={() => { keys.current.clear(); }}
      onPointerDown={e => { if (!running) { start(); return; } keys.current.add('ArrowUp'); e.currentTarget.setPointerCapture(e.pointerId); }} onPointerUp={() => keys.current.delete('ArrowUp')} onPointerCancel={() => keys.current.delete('ArrowUp')} />
      {!running && <button className="arcade-start" aria-label={stats.over || stats.score ? '다시 시작' : '게임 시작'} onClick={start}>{stats.over ? '↻' : '▶'}</button>}
    </div>
    <div className="touch-controls">{[['ArrowLeft', '←'], ['ArrowUp', '↑ 점프'], ['ArrowDown', '↓'], ['ArrowRight', '→'], ['Space', '발사 / 망치']].map(([code, label]) => <button key={code} disabled={!running} aria-label={'게임 ' + label} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); keys.current.add(code); }} onPointerUp={() => keys.current.delete(code)} onPointerCancel={() => keys.current.delete(code)} onLostPointerCapture={() => keys.current.delete(code)}>{label}</button>)}</div>
  </section>;
}
