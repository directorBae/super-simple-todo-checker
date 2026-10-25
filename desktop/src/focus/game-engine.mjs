// Offline arcade: one run that strings real-feeling games together.
// Each stage module exports create / step / paint; this file keeps the score, lives and stage order,
// and blends one stage into the next (the runner is pushed back to the left edge between runs).
import * as dino from './dino.mjs';
import * as mario from './mario.mjs';
import * as galaga from './galaga.mjs';
import * as pacman from './pacman.mjs';
import * as bowser from './bowser.mjs';

export const STAGES = ['dino', 'mario', 'dino', 'galaga', 'dino', 'pacman', 'dino', 'bowser'];
const MODULES = { dino, mario, galaga, pacman, bowser };
// A dino leg lasts this many points before the next game starts.
export const DINO_GOAL = 1000;
export const RUNNER_X = dino.START_X;
const LIVES = 3, GRACE = 1.5, BLEND = 0.9;
// Stages whose player is the pet, so it can slide across the blend.
const RUNNER_STAGES = new Set(['dino', 'mario']);

export function createGame() {
  const g = { score: 0, lives: LIVES, elapsed: 0, invincible: 0, gameOver: false, index: 0, stageStart: 0, dinoSpeed: 0, transition: null };
  g.stage = STAGES[0]; g.state = dino.create(g);
  return g;
}

// Where the runner stands on screen (for the blend between runner stages).
const runnerX = (stage, state) => (stage === 'mario' ? state.player.x - state.level.cam : stage === 'dino' ? state.player.x : RUNNER_X);

function nextStage(g) {
  const from = { stage: g.stage, state: g.state };
  if (g.stage === 'dino') g.dinoSpeed = g.state.speed;
  g.index = (g.index + 1) % STAGES.length;
  g.stage = STAGES[g.index];
  g.state = MODULES[g.stage].create(g, { speed: g.dinoSpeed });
  g.stageStart = g.score;
  g.transition = { ...from, time: 0, startX: runnerX(from.stage, from.state), slide: RUNNER_STAGES.has(from.stage) && RUNNER_STAGES.has(g.stage) };
  if (g.transition.slide) setRunnerX(g, g.transition.startX);
}
function setRunnerX(g, x) {
  if (g.stage === 'dino' || g.stage === 'mario') g.state.player.x = x;
}
const ease = (k) => 1 - (1 - k) ** 3;

export function stepGame(g, dt, keys, random = Math.random) {
  if (g.gameOver) return;
  dt = Math.min(Math.max(dt, 0), 0.05);
  g.elapsed += dt;
  g.invincible = Math.max(0, g.invincible - dt);
  const t = g.transition;
  if (t) {
    // The next stage waits while the old one fades out and the runner is pushed back to its spot.
    t.time += dt;
    const k = Math.min(1, t.time / BLEND);
    if (t.slide) setRunnerX(g, t.startX + (RUNNER_X - t.startX) * ease(k));
    if (k >= 1) g.transition = null;
    return;
  }
  const result = MODULES[g.stage].step(g.state, dt, keys, g, random);
  if (result === 'fell' || (result === 'hurt' && g.invincible <= 0)) {
    g.lives--; g.invincible = GRACE;
    if (g.lives <= 0) { g.gameOver = true; return; }
  }
  // A dino leg stops sending obstacles at its goal and hands over once the road is clear.
  if (g.stage === 'dino' && g.score - g.stageStart >= DINO_GOAL) g.state.ending = true;
  if (result === 'done' || (g.stage === 'dino' && g.state.ending && !g.state.obstacles.length && g.state.player.onGround)) nextStage(g);
}

// Paints one stage. `drawRunner(x, ducking)` draws the pet at screen x on that stage's player.
export const paintStage = (ctx, stage, state, g, drawRunner) => MODULES[stage].paint(ctx, state, g, drawRunner);
// 0 → 1 while the next stage fades in.
export const blendAmount = (g) => (g.transition ? ease(Math.min(1, g.transition.time / BLEND)) : 1);
