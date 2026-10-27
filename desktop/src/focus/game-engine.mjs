// Offline arcade: one run that strings real-feeling games together, all played by the person's pet.
// Each stage module exports create / step / paint; this file keeps the score, the stage order and the pet
// itself (runner.mjs: size, hearts, blink — it carries over between games), and blends one stage into the next
// (the pet is pushed back to the left edge between runs).
import * as dino from './dino.mjs';
import * as mario from './mario.mjs';
import * as galaga from './galaga.mjs';
import * as pacman from './pacman.mjs';
import { createRunner, hurt, tick } from './runner.mjs';

export const STAGES = ['dino', 'mario', 'dino', 'galaga', 'dino', 'pacman'];
const MODULES = { dino, mario, galaga, pacman };
// A dino leg lasts this many points before the next game starts.
export const DINO_GOAL = 1000;
export const RUNNER_X = dino.START_X;
const BLEND = 0.9;
// Stages where the pet runs along the ground, so it can slide across the blend.
const RUNNER_STAGES = new Set(['dino', 'mario']);

export function createGame() {
  const g = { score: 0, elapsed: 0, gameOver: false, index: 0, stageStart: 0, dinoSpeed: 0, transition: null, runner: createRunner() };
  g.stage = STAGES[0]; g.state = dino.create(g);
  return g;
}

// Where the pet stands on screen (for the blend between running stages).
const runnerX = (stage, state) => (stage === 'mario' ? state.player.x - state.level.cam : stage === 'dino' ? state.player.x : RUNNER_X);

function nextStage(g) {
  const from = { stage: g.stage, state: g.state };
  if (g.stage === 'dino') g.dinoSpeed = g.state.speed;
  g.index = (g.index + 1) % STAGES.length;
  g.stage = STAGES[g.index];
  g.stageStart = g.score;
  g.state = MODULES[g.stage].create(g, { speed: g.dinoSpeed });
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
  tick(g.runner, dt);
  const t = g.transition;
  if (t) {
    // The next stage waits while the old one fades out and the pet is pushed back to its spot.
    t.time += dt;
    const k = Math.min(1, t.time / BLEND);
    if (t.slide) setRunnerX(g, t.startX + (RUNNER_X - t.startX) * ease(k));
    if (k >= 1) g.transition = null;
    return;
  }
  const result = MODULES[g.stage].step(g.state, dt, keys, g, random);
  if (result === 'fell' || result === 'hurt') {
    if (hurt(g.runner, { fall: result === 'fell' })) { g.gameOver = true; return; }
  }
  // A dino leg stops sending obstacles at its goal and hands over once the road is clear.
  if (g.stage === 'dino' && g.score - g.stageStart >= DINO_GOAL) g.state.ending = true;
  if (result === 'done' || (g.stage === 'dino' && g.state.ending && !g.state.obstacles.length && g.state.player.onGround)) nextStage(g);
}

// Paints one stage. `drawRunner(x, bottom, options)` draws the pet with its feet at (x, bottom).
export const paintStage = (ctx, stage, state, g, drawRunner) => MODULES[stage].paint(ctx, state, g, drawRunner);
// 0 → 1 while the next stage fades in.
export const blendAmount = (g) => (g.transition ? ease(Math.min(1, g.transition.time / BLEND)) : 1);
