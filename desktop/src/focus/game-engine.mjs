// Offline arcade: one run that strings real-feeling games together, all played by the person's pet.
// The dino road runs between every game: 1000 points of it, then the next game, then the road again.
// Each game has three stages — the first lap through the games plays stage 1 of each, the second lap stage 2,
// the third lap stage 3 (Mario 1-1, 1-2, Bowser's castle) — and later laps repeat them a little harder.
// Each stage module exports create / step / paint / pose and ENTRY; this file keeps the score, the order and the
// pet itself (runner.mjs: size, hearts, items — they carry over between games), and carries the pet from one game
// into the next without a cut: the old world scrolls away, the new one scrolls in, and the pet keeps moving
// (running, hopping, flying, shrinking) from where it was to where it starts.
import * as dino from './dino.mjs';
import * as mario from './mario.mjs';
import * as galaga from './galaga.mjs';
import * as pacman from './pacman.mjs';
import * as donkeykong from './donkeykong.mjs';
import * as flappy from './flappy.mjs';
import * as breakout from './breakout.mjs';
import * as tetris from './tetris.mjs';
import { createRunner, hurt, tick } from './runner.mjs';

export const GAMES = ['mario', 'galaga', 'pacman', 'donkeykong', 'flappy', 'breakout', 'tetris'];
const MODULES = { dino, mario, galaga, pacman, donkeykong, flappy, breakout, tetris };
export const STAGE_COUNT = 3;
// A dino leg lasts this many points before the next game starts.
export const DINO_GOAL = 1000;
export const RUNNER_X = dino.START_X;
// How long the pet takes to cross from one game into the next.
export const CROSSING = 1.1;

// The index-th stop of the run: even stops are the dino road, odd ones the games in turn.
export function stopAt(index) {
  if (index % 2 === 0) return { name: 'dino', stage: 0, lap: Math.floor(index / 2 / GAMES.length) };
  const n = (index - 1) / 2, lap = Math.floor(n / GAMES.length);
  return { name: GAMES[n % GAMES.length], stage: lap % STAGE_COUNT, lap };
}
// The pet's size as drawn at a pose: stages give `cell`, otherwise it follows the runner's size.
const cellOf = (pose, runner) => pose.cell ?? (runner.big ? 2.1 : 1.5);

export function createGame() {
  const g = { score: 0, elapsed: 0, gameOver: false, index: 0, stageStart: 0, dinoSpeed: 0, transition: null, runner: createRunner() };
  Object.assign(g, { stage: 'dino', level: 0, lap: 0 });
  g.state = dino.create(g);
  return g;
}

function nextStage(g) {
  const from = { stage: g.stage, state: g.state, pose: MODULES[g.stage].pose(g.state, g) };
  if (g.stage === 'dino') g.dinoSpeed = g.state.speed;
  g.index++;
  const stop = stopAt(g.index);
  // Into a game the camera goes the game's way; back to the road it goes on the same way (right) or comes down.
  const way = g.stage === 'dino' ? MODULES[stop.name].ENTRY || 'right' : (MODULES[g.stage].ENTRY || 'right') === 'up' ? 'down' : 'right';
  Object.assign(g, { stage: stop.name, level: stop.stage, lap: stop.lap, stageStart: g.score });
  g.state = MODULES[g.stage].create(g, { stage: stop.stage, lap: stop.lap, speed: g.dinoSpeed });
  g.transition = { ...from, time: 0, way, to: MODULES[g.stage].pose(g.state, g) };
}
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function stepGame(g, dt, keys, random = Math.random) {
  if (g.gameOver) return;
  dt = Math.min(Math.max(dt, 0), 0.05);
  g.elapsed += dt;
  tick(g.runner, dt);
  if (g.transition) {
    // Both worlds hold still while the camera moves between them and the pet crosses over.
    g.transition.time += dt;
    if (g.transition.time >= CROSSING) g.transition = null;
    return;
  }
  const result = MODULES[g.stage].step(g.state, dt, keys, g, random);
  if (result === 'fell' || result === 'hurt') {
    if (hurt(g.runner, { fall: result === 'fell' })) { g.gameOver = true; return; }
  }
  // A dino leg stops sending obstacles at its goal and hands over once the road is clear.
  if (g.stage === 'dino' && g.score - g.stageStart >= DINO_GOAL) g.state.ending = true;
  const clear = g.stage === 'dino' && g.state.ending && !g.state.obstacles.length && g.state.player.onGround;
  if (result === 'done' || clear) nextStage(g);
}

// How far along the crossing is (0 → 1), eased.
export const crossing = (g) => (g.transition ? ease(Math.min(1, g.transition.time / CROSSING)) : 1);
// Where each world is drawn during a crossing: the old one leaves as the new one arrives.
export function worldOffsets(g, width = 500, height = 280) {
  const k = crossing(g), way = g.transition?.way;
  if (way === 'up') return { from: { x: 0, y: k * height }, to: { x: 0, y: -(1 - k) * height } };
  if (way === 'down') return { from: { x: 0, y: -k * height }, to: { x: 0, y: (1 - k) * height } };
  return { from: { x: -k * width, y: 0 }, to: { x: (1 - k) * width, y: 0 } };
}
// The pet during a crossing: from its last spot in the old game to its first spot in the new one, along a hop
// (or a climb into the sky, or a drop back to the road), changing size on the way, legs moving all along.
export function crossingPose(g) {
  const t = g.transition, k = crossing(g), a = t.pose, b = t.to;
  const lift = t.way === 'right' ? Math.sin(k * Math.PI) * 46 : Math.sin(k * Math.PI) * 24;
  return {
    x: a.x + (b.x - a.x) * k,
    bottom: a.bottom + (b.bottom - a.bottom) * k - lift,
    cell: cellOf(a, g.runner) + (cellOf(b, g.runner) - cellOf(a, g.runner)) * k,
    flip: false, onGround: k > 0.92, hat: k < 0.5 ? a.hat : b.hat,
  };
}

// Paints one stage. `drawRunner(x, bottom, options)` draws the pet with its feet at (x, bottom).
export const paintStage = (ctx, stage, state, g, drawRunner) => MODULES[stage].paint(ctx, state, g, drawRunner);
// For the HUD: "MARIO 1-2" and the like.
const TITLES = { mario: ['1-1', '1-2', '1-4'], galaga: ['STAGE 1', 'STAGE 2', 'CHALLENGING'], pacman: ['MAZE 1', 'MAZE 2', 'MAZE 3'], donkeykong: ['25M', '75M', '100M'], flappy: ['DAY', 'DUSK', 'NIGHT'], breakout: ['ROUND 1', 'ROUND 2', 'ROUND 3'], tetris: ['A-TYPE', 'A-TYPE LV5', 'B-TYPE'] };
const NAMES = { dino: 'RUN', mario: 'MARIO', galaga: 'GALAGA', pacman: 'PAC-MAN', donkeykong: 'DONKEY KONG', flappy: 'FLAPPY', breakout: 'BREAKOUT', tetris: 'TETRIS' };
export const stageTitle = (g) => (g.stage === 'dino' ? NAMES.dino : `${NAMES[g.stage]} ${TITLES[g.stage][g.level]}`);
