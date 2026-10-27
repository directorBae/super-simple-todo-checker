// Flappy Bird with the pet in the bird's place. Space or ↑ flaps (one flap per press: an upward kick against
// steady gravity), green pipes with their caps come in pairs with a gap, the ground stripe scrolls underneath and
// the sky behind stays still, as in the original. Every pipe passed is one on the big white counter at the top
// (100 game points). A pipe or the ground costs a heart; the pet is put back in the next gap with the pipes just in
// front cleared and flies on. Passing N pipes (8 by day; 10 at dusk, some pipes sliding; 12 at night, narrower
// gaps) wins the pet its wings for the dino run (a double jump), and it glides back down to the road.
import { giveWings } from './runner.mjs';

export const ENTRY = 'right';
const W = 500, FLOOR = 250, START_X = 64, BIRD_X = 132;
// Scaled from the original (bird 24px tall in a 400px sky, gap ~4 birds, ~1.4s between pipes) to a ~24px pet.
const GRAVITY = 1150, FLAP = -315, MAX_FALL = 480, CEILING = -10, SCROLL = 132, SPACING = 196;
const PIPE_W = 46, CAP_H = 20, CAP_OUT = 3, EDGE = 34, PIPE_POINTS = 100;
// The pet is drawn at this size while flying (a big pet shrinks to it on the way in and grows back on landing).
const FLY_CELL = 1.5;
// "Get ready": the pet runs in along the road and takes off by itself if nobody flaps.
const READY = 1.3, OUTRO = 1.5, HOVER = 0.8, CLEAR_AHEAD = 170;
const STAGES = [
  { goal: 8, gap: 104, slide: 0, sky: 'day' },
  { goal: 10, gap: 98, slide: 24, sky: 'dusk' },
  { goal: 12, gap: 86, slide: 0, sky: 'night' },
];

const baseCell = (game) => (game?.runner?.big ? 2.1 : 1.5);
// The cell grows/shrinks with the walk between the road spot (START_X) and the flying spot (BIRD_X).
function cellAt(st, game) {
  const k = Math.max(0, Math.min(1, (st.pet.x - START_X) / (BIRD_X - START_X)));
  return baseCell(game) + (FLY_CELL - baseCell(game)) * k;
}

export function create(game, { stage = 0, lap = 0 } = {}) {
  const cfg = STAGES[Math.max(0, Math.min(2, stage))], harder = lap >= 3 ? 1 : 0;
  return {
    stage, time: 0, ground: 0, phase: 'ready', t: 0, held: false, hover: 0, passed: 0, made: 0, pipes: [], started: false, message: null,
    goal: cfg.goal, gap: cfg.gap - harder * 6, slide: cfg.slide, sky: cfg.sky, speed: SCROLL + harder * 14,
    pet: { x: START_X, bottom: FLOOR, vy: 0, onGround: true },
  };
}

// The pet's body for collisions (a bit inside the sprite, like the original's forgiving box).
function body(st, game) {
  const c = cellAt(st, game), p = st.pet;
  return { l: p.x + c, r: p.x + 15 * c, t: p.bottom - 17 * c, b: p.bottom - c };
}
export const gapCenter = (pipe, time) => pipe.base + (pipe.amp ? Math.sin(time * 1.7 + pipe.phase) * pipe.amp : 0);
// The two solid parts of a pipe pair (each with its wider cap at the gap side).
function pipeRects(st, pipe) {
  const c = gapCenter(pipe, st.time), top = c - st.gap / 2, bottom = c + st.gap / 2;
  return [
    { l: pipe.x, r: pipe.x + PIPE_W, t: -1000, b: top - CAP_H }, { l: pipe.x - CAP_OUT, r: pipe.x + PIPE_W + CAP_OUT, t: top - CAP_H, b: top },
    { l: pipe.x - CAP_OUT, r: pipe.x + PIPE_W + CAP_OUT, t: bottom, b: bottom + CAP_H }, { l: pipe.x, r: pipe.x + PIPE_W, t: bottom + CAP_H, b: FLOOR },
  ];
}
const overlaps = (a, b) => a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;

function addPipe(st, x, random) {
  // At dusk every other pipe slides up and down.
  const amp = st.slide && st.made++ % 2 === 1 ? st.slide : 0;
  const lo = st.gap / 2 + EDGE + amp, hi = FLOOR - st.gap / 2 - EDGE - amp;
  st.pipes.push({ x, base: lo + random() * Math.max(0, hi - lo), amp, phase: random() * Math.PI * 2, passed: false });
}
// Places a pipe pair for tests and for the hand-built start; returns it.
export function placePipe(st, x, center, amp = 0) {
  const pipe = { x, base: center, amp, phase: 0, passed: false };
  st.pipes.push(pipe); st.pipes.sort((a, b) => a.x - b.x);
  return pipe;
}

// After a hit: clear the pipes just in front and hold the pet still in the next gap until it flaps.
function recover(st) {
  st.pipes = st.pipes.filter((p) => p.passed || p.x > BIRD_X + CLEAR_AHEAD);
  const next = st.pipes.find((p) => !p.passed);
  const center = next ? gapCenter(next, st.time) : FLOOR / 2;
  Object.assign(st.pet, { bottom: center + 13, vy: 0, onGround: false });
  st.hover = HOVER;
}

export function step(st, dt, keys, game, random = Math.random) {
  if (st.phase === 'over') return null;
  st.time += dt; st.t += dt;
  const p = st.pet, press = keys.has('Space') || keys.has('ArrowUp'), flap = press && !st.held;
  st.held = press;
  st.ground = (st.ground + st.speed * dt) % 1e6;
  if (st.message) st.message.t += dt;
  // Pipes scroll with the ground once the pet is off.
  if (st.started) {
    for (const pipe of st.pipes) pipe.x -= st.speed * dt;
    st.pipes = st.pipes.filter((pipe) => pipe.x > -PIPE_W - 20);
  }

  if (st.phase === 'ready') {
    p.x = Math.min(BIRD_X, p.x + (BIRD_X - START_X) / READY * dt);
    if (flap || st.t >= READY) { st.phase = 'fly'; st.t = 0; st.started = true; p.vy = FLAP; p.onGround = false; }
    return null;
  }

  if (st.phase === 'outro') {
    // Wings won: glide back to the road spot and land on it, ready for the dino run.
    p.x = Math.max(START_X, p.x - (BIRD_X - START_X) / 0.9 * dt);
    if (!p.onGround) {
      p.vy = Math.min(220, p.vy + GRAVITY * dt);
      p.bottom = Math.max(30, p.bottom + p.vy * dt);
      if (p.bottom >= FLOOR) { p.bottom = FLOOR; p.vy = 0; p.onGround = true; }
    }
    if (st.t >= OUTRO && p.onGround && p.x <= START_X) { st.phase = 'over'; return 'done'; }
    return null;
  }

  // Flying
  p.x = Math.min(BIRD_X, p.x + 80 * dt);
  if (flap) { p.vy = FLAP; st.hover = 0; p.onGround = false; }
  if (st.hover > 0) { st.hover -= dt; p.vy = 0; p.bottom += Math.sin(st.time * 8) * 12 * dt; }
  else { p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt); p.bottom += p.vy * dt; }
  if (p.bottom - 26 < CEILING) { p.bottom = CEILING + 26; p.vy = Math.max(0, p.vy); }

  // Spawn the next pair one spacing behind the last, until there are enough to reach the goal.
  const ahead = st.pipes.filter((pipe) => !pipe.passed).length, last = st.pipes[st.pipes.length - 1];
  if (st.passed + ahead < st.goal && (!last || last.x <= W + 40 - SPACING)) addPipe(st, last ? last.x + SPACING : W + 80, random);

  const box = body(st, game), safe = game.runner?.invincible > 0;
  let hit = false;
  if (p.bottom >= FLOOR) {
    if (safe) { p.bottom = FLOOR; p.vy = 0; p.onGround = true; } else hit = true;
  } else p.onGround = false;
  for (const pipe of st.pipes) {
    if (!pipe.passed && pipe.x + PIPE_W < box.l) { pipe.passed = true; st.passed++; game.score += PIPE_POINTS; }
    if (!safe && !hit && pipeRects(st, pipe).some((r) => overlaps(box, r))) hit = true;
  }
  if (st.passed >= st.goal) {
    if (game.runner) giveWings(game.runner);
    st.phase = 'outro'; st.t = 0; st.message = { text: 'WINGS!', t: 0 };
    p.vy = FLAP * 0.8; p.onGround = false;
    return null;
  }
  if (hit) { recover(st); return 'hurt'; }
  return null;
}

// Exactly what paint passes to drawRunner, for the engine's crossings between games.
export function pose(st, game) {
  return { x: st.pet.x, bottom: st.pet.bottom, cell: cellAt(st, game), flip: false, onGround: st.pet.onGround };
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
const SKIES = {
  day: { sky: ['#4ec0ca'], cloud: '#e9fcd9', cloudEdge: '#d2f1c6', city: '#a6dcc5', cityEdge: '#8ccbb2', window: '#c8ede0', bush: '#5ee270', bushEdge: '#45bf58' },
  dusk: { sky: ['#e2606a', '#ec7d64', '#f59d68', '#f9bd73', '#fbd58b'], cloud: '#fde2c2', cloudEdge: '#f7c9a2', city: '#b9616e', cityEdge: '#9a4c5d', window: '#f7cf8a', bush: '#5f9e4c', bushEdge: '#4a8040' },
  night: { sky: ['#0b2238', '#0e2a44', '#11324f'], cloud: '#1d4a64', cloudEdge: '#173e56', city: '#0d2b3c', cityEdge: '#0a2130', window: '#f3d36b', bush: '#2f7a46', bushEdge: '#236238' },
};
// Puffy rows drawn as stepped half-circles (clouds and bushes), filled down to `bottom`.
function puffs(ctx, color, edge, baseY, bottom, spots) {
  for (const [cx, r] of spots) {
    for (let dy = 0; dy < r; dy += 2) { const half = Math.sqrt(r * r - dy * dy); px(ctx, color, cx - half, baseY - dy - 2, half * 2, 2); }
    px(ctx, edge, cx - r, baseY, r * 2, 1);
  }
  px(ctx, color, 0, baseY, W, bottom - baseY);
}
// Building heights and widths repeat like the original's tiled background.
const BUILDINGS = Array.from({ length: 22 }, (_, i) => ({ x: i * 24 - 6 + ((i * 7) % 5), w: 18 + ((i * 11) % 4) * 3, h: 26 + ((i * 37) % 7) * 6 }));
const STARS = Array.from({ length: 46 }, (_, i) => ({ x: (i * 97 + 31) % W, y: (i * 61 + 7) % 150, big: i % 7 === 0 }));
function background(ctx, st) {
  const s = SKIES[st.sky], bandH = 200 / s.sky.length;
  s.sky.forEach((c, i) => px(ctx, c, 0, i * bandH, W, i === s.sky.length - 1 ? FLOOR - i * bandH : bandH + 1));
  if (st.sky === 'night') for (const star of STARS) {
    const on = Math.sin(st.time * 2 + star.x) > -0.6;
    if (on) px(ctx, star.big ? '#ffffff' : '#bcd3ea', star.x, star.y, star.big ? 2 : 1, star.big ? 2 : 1);
  }
  if (st.sky === 'dusk') { px(ctx, '#fff1b8', 380, 150, 26, 26); px(ctx, '#fde58f', 376, 154, 34, 18); }
  if (st.sky === 'night') { px(ctx, '#f4f1d8', 410, 34, 14, 14); px(ctx, '#e3dfbf', 412, 36, 4, 4); }
  puffs(ctx, s.cloud, s.cloudEdge, 186, 216, Array.from({ length: 12 }, (_, i) => [i * 46 + 10, 12 + (i * 5) % 9]));
  for (const b of BUILDINGS) {
    const top = 226 - b.h;
    px(ctx, s.cityEdge, b.x - 1, top - 1, b.w + 2, b.h + 1); px(ctx, s.city, b.x, top, b.w, b.h);
    for (let y = top + 4; y < 220; y += 6) for (let x = b.x + 3; x < b.x + b.w - 3; x += 5) {
      if (st.sky !== 'night' || (x * 3 + y * 7) % 5 < 2) px(ctx, s.window, x, y, 2, 3);
    }
  }
  puffs(ctx, s.bush, s.bushEdge, 236, FLOOR, Array.from({ length: 16 }, (_, i) => [i * 34 + 6, 8 + (i * 3) % 6]));
}
// The classic pipe: dark outline, light stripe on the left, shade on the right, a wider cap at the gap.
function pipePart(ctx, x, y, w, h) {
  if (h <= 0) return;
  px(ctx, '#543847', x, y, w, h);
  px(ctx, '#73bf2e', x + 2, y, w - 4, h);
  px(ctx, '#9ce659', x + 5, y, 6, h); px(ctx, '#d4f78a', x + 7, y, 2, h);
  px(ctx, '#558022', x + w - 10, y, 8, h); px(ctx, '#3f6418', x + w - 4, y, 2, h);
}
function pipeCap(ctx, x, y) {
  const w = PIPE_W + CAP_OUT * 2;
  px(ctx, '#543847', x - CAP_OUT, y, w, CAP_H);
  pipePart(ctx, x - CAP_OUT, y + 2, w, CAP_H - 4);
}
function pipe(ctx, st, p) {
  const c = gapCenter(p, st.time), top = c - st.gap / 2, bottom = c + st.gap / 2;
  pipePart(ctx, p.x, 0, PIPE_W, top - CAP_H); pipeCap(ctx, p.x, top - CAP_H);
  pipeCap(ctx, p.x, bottom); pipePart(ctx, p.x, bottom + CAP_H, PIPE_W, FLOOR - bottom - CAP_H);
}
function ground(ctx, st) {
  px(ctx, '#543847', 0, FLOOR, W, 1);
  px(ctx, '#73bf2e', 0, FLOOR + 1, W, 10);
  const off = st.ground % 12;
  for (let r = 0; r < 10; r++) for (let x = -off - 12 + r; x < W; x += 12) px(ctx, '#9ce659', x, FLOOR + 1 + r, 6, 1);
  px(ctx, '#e4fd8b', 0, FLOOR + 1, W, 1);
  px(ctx, '#558022', 0, FLOOR + 11, W, 2); px(ctx, '#d7a84c', 0, FLOOR + 13, W, 2);
  px(ctx, '#ded895', 0, FLOOR + 15, W, 280 - FLOOR - 15);
}
// Flappy's chunky counter digits: white, with a dark outline.
const DIGITS = [
  ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'], ['..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '#####'],
  ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'], ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'], ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'], ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'], ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
];
function counter(ctx, n, cx, y, s = 3) {
  const text = String(n), w = text.length * 6 * s - s;
  for (const [color, grow] of [['#543847', s], ['#ffffff', 0]]) {
    [...text].forEach((d, i) => DIGITS[+d].forEach((row, j) => [...row].forEach((c, k) => {
      if (c === '#') px(ctx, color, cx - w / 2 + (i * 6 + k) * s - grow / 2, y + j * s - grow / 2, s + grow, s + grow);
    })));
  }
}

export function paint(ctx, st, game, drawRunner) {
  background(ctx, st);
  for (const p of st.pipes) pipe(ctx, st, p);
  ground(ctx, st);
  const at = pose(st, game);
  drawRunner(at.x, at.bottom, { onGround: at.onGround, flip: at.flip, cell: at.cell });
  if (st.started) counter(ctx, st.passed, W / 2, 16);
  if (st.phase === 'ready') {
    ctx.font = 'bold 16px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = '#543847'; ctx.strokeText('GET READY', W / 2, 70);
    ctx.fillStyle = '#fca048'; ctx.fillText('GET READY', W / 2, 70);
    ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.strokeText(`SPACE / ↑ · ${st.goal} PIPES`, W / 2, 88);
    ctx.fillStyle = '#ffffff'; ctx.fillText(`SPACE / ↑ · ${st.goal} PIPES`, W / 2, 88);
    ctx.textAlign = 'left';
  }
  if (st.message && st.message.t < OUTRO) {
    const rise = Math.min(1, st.message.t * 4);
    ctx.font = 'bold 22px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#543847'; ctx.strokeText(st.message.text, W / 2, 84 + (1 - rise) * 20);
    ctx.fillStyle = '#ffffff'; ctx.fillText(st.message.text, W / 2, 84 + (1 - rise) * 20);
    ctx.textAlign = 'left';
  }
}
