// Arkanoid with the pet riding the Vaus: ← → move the paddle and the pet stands on top of it (the ball bounces off
// the pet's head too). The ball sits on the Vaus until Space (or ↑) launches it, or by itself after 1.5s. Where the
// ball lands on the Vaus sets its angle (steep in the middle, shallow at the ends) and it speeds up as the round
// goes on. Bricks pay by color as in the arcade, silver ones take two hits (50 × round) and gold ones never break.
// Capsules fall from some bricks: E widens the Vaus, S slows the ball, C catches it, P is one more heart.
// A lost ball costs a heart and a new one is served. Clearing every breakable brick wins the pet a shield for the
// dino run (one free hit). So the hunt for the last bricks can't drag on, after a while the next brick the ball
// touches drops a B (break) capsule, as in the arcade: it opens the warp gate in the right wall, and riding the
// Vaus into it (10,000 points) counts as clearing the round.
import { giveShield, MUSHROOM_CAP } from './runner.mjs';

export const ENTRY = 'up';
const W = 500, H = 280, COLS = 13;
export const BRICK_W = 26, BRICK_H = 10, FIELD_L = 81, FIELD_R = FIELD_L + COLS * BRICK_W, FIELD_T = 14;
export const PADDLE_Y = 258;
const PADDLE_H = 8, PADDLE_W = 52, WIDE_W = 78, PADDLE_SPEED = 270, BALL_R = 3;
// The pet is drawn a little smaller here so it fits on the Vaus; its head is part of the bat.
const CELL = 1.2, PET_HALF = 7 * CELL, PET_TOP = PADDLE_Y - 18 * CELL;
const SERVE = 1.5, CATCH_HOLD = 1.5, OUTRO = 1.4, CAPSULE_SPEED = 70, CAPSULE_POINTS = 1000, DROP = 0.22;
// Capsules are about a brick in size, as in the arcade.
const CAP_W = 24, CAP_H = 10;
const BASE_SPEED = 190, MAX_SPEED = 340, SPEEDUP = 3;
export const BREAK_AFTER = 75;
const WARP_POINTS = 10000;

// Arkanoid's brick colors and points; silver pays 50 × the round number and gold can't be broken.
export const BRICKS = {
  w: { color: '#fcfcfc', points: 50 }, o: { color: '#fc9838', points: 60 }, c: { color: '#3cbcfc', points: 70 }, g: { color: '#80d010', points: 80 },
  r: { color: '#d82800', points: 90 }, b: { color: '#0070ec', points: 100 }, p: { color: '#f878f8', points: 110 }, y: { color: '#fce020', points: 120 },
  s: { color: '#bcbcbc' }, G: { color: '#e8b830' },
};
// Rounds 1–3 of the arcade, one string per brick row from the top ('.' empty); `skip` empty rows above them.
const STAIR = ['w', 'o', 'c', 'g', 'r', 'b', 'p', 'y'];
const ROUNDS = [
  { skip: 3, rows: ['sssssssssssss', 'rrrrrrrrrrrrr', 'yyyyyyyyyyyyy', 'bbbbbbbbbbbbb', 'ppppppppppppp', 'ggggggggggggg'] },
  { skip: 1, rows: [...Array.from({ length: 12 }, (_, i) => STAIR[i % 8].repeat(i + 1).padEnd(COLS, '.')), 'ssssssssssssr'] },
  { skip: 1, rows: ['ggggggggggggg', '', 'wwwGGGGGGGGGG', '', 'rrrrrrrrrrrrr', '', 'GGGGGGGGGGwww', '', 'ppppppppppppp', '', 'bbbGGGGGGGGGG', '', 'ccccccccccccc'] },
];
// Capsules: E (enlarge), S (slow), C (catch), P (player: a heart), B (break), with the arcade's colors.
export const CAPSULES = { E: '#0070ec', S: '#fc9838', C: '#80d010', P: '#bcbcbc', B: '#f878f8' };
const CAPSULE_ODDS = [['E', 0.3], ['S', 0.3], ['C', 0.25], ['P', 0.15]];

export function create(game, { stage = 0, lap = 0 } = {}) {
  const round = Math.max(0, Math.min(2, stage)), layout = ROUNDS[round], bricks = [];
  layout.rows.forEach((line, j) => [...line].forEach((kind, i) => {
    if (kind === '.') return;
    bricks.push({ kind, x: FIELD_L + i * BRICK_W, y: FIELD_T + (layout.skip + j) * BRICK_H, hits: kind === 's' ? 2 : 1, flash: 0 });
  }));
  const base = BASE_SPEED * (lap >= 3 ? 1.15 : 1) + round * 10;
  const st = {
    stage, round: round + 1, time: 0, bricks, base, capsules: [], popups: [], effect: null, held: false, flip: false, outro: null, done: false,
    paddle: { cx: (FIELD_L + FIELD_R) / 2, w: PADDLE_W },
    ball: null,
  };
  serve(st);
  return st;
}

const paddleWidth = (st) => (st.effect === 'E' ? WIDE_W : PADDLE_W);
// Where a ball resting on the bat at this x sits: on the pet's head in the middle, on the Vaus elsewhere.
const surfaceAt = (st, x) => (Math.abs(x - st.paddle.cx) < PET_HALF + BALL_R ? PET_TOP : PADDLE_Y);
const breakable = (b) => b.kind !== 'G';
export const bricksLeft = (st) => st.bricks.filter(breakable).length;

// A new ball on the Vaus (after a lost one too): power-ups go, the speed starts over.
function serve(st) {
  st.effect = null; st.capsules = []; st.gate = false;
  st.ball = { x: st.paddle.cx + 14, y: PADDLE_Y - BALL_R, vx: 0, vy: 0, speed: st.base, stuck: true, offset: 14, hold: SERVE, serving: true };
}
function launch(ball) {
  const a = (ball.offset >= 0 ? 1 : -1) * Math.PI / 6;
  ball.vx = Math.sin(a) * ball.speed; ball.vy = -Math.cos(a) * ball.speed;
  ball.stuck = false; ball.serving = false;
}
// Off the Vaus: 20° from straight up in the middle out to 65° at the very ends, like the arcade's zones.
function bounceOff(st, ball) {
  const half = st.paddle.w / 2, k = Math.max(-1, Math.min(1, (ball.x - st.paddle.cx) / half));
  const side = Math.abs(k) < 0.05 ? Math.sign(ball.vx) || 1 : Math.sign(k), a = (20 + 45 * Math.abs(k)) * Math.PI / 180;
  ball.vx = side * Math.sin(a) * ball.speed; ball.vy = -Math.cos(a) * ball.speed;
  if (st.effect === 'C') { ball.stuck = true; ball.offset = ball.x - st.paddle.cx; ball.hold = CATCH_HOLD; }
}

function hitBrick(st, b, game, random) {
  b.flash = 0.12;
  // Taking too long: this brick lets the break capsule out (any brick, even a gold one).
  if (st.time >= BREAK_AFTER && !st.gate && !st.capsules.length) st.capsules.push({ type: 'B', x: b.x + (BRICK_W - CAP_W) / 2, y: b.y + 1, t: 0 });
  if (b.kind === 'G') return;
  if (--b.hits > 0) return;
  b.gone = true;
  const points = b.kind === 's' ? 50 * st.round : BRICKS[b.kind].points;
  game.score += points;
  st.popups.push({ x: b.x + 4, y: b.y + 8, t: 0, text: String(points) });
  // One capsule at a time, from colored bricks, and never from the last one.
  if (b.kind !== 's' && !st.capsules.length && bricksLeft(st) > 1 && random() < DROP) {
    let roll = random(), type = 'E';
    for (const [name, odds] of CAPSULE_ODDS) { if (roll < odds) { type = name; break; } roll -= odds; }
    st.capsules.push({ type, x: b.x + (BRICK_W - CAP_W) / 2, y: b.y + 1, t: 0 });
  }
}
// Drops a capsule (for tests and for the hand-built start).
export function dropCapsule(st, type, x = st.paddle.cx - CAP_W / 2, y = PADDLE_Y - 30) { st.capsules.push({ type, x, y, t: 0 }); }

function collect(st, c, game) {
  game.score += CAPSULE_POINTS;
  let text = String(CAPSULE_POINTS);
  if (c.type === 'P') {
    const runner = game.runner;
    if (runner && runner.lives < MUSHROOM_CAP) { runner.lives++; text = '♥ +1'; }
  } else if (c.type === 'B') st.gate = true;
  else {
    st.effect = c.type;
    if (c.type === 'S') st.ball.speed = Math.max(st.base * 0.75, st.ball.speed * 0.6);
  }
  st.popups.push({ x: c.x, y: c.y - 6, t: 0, text: c.type === 'P' ? text : `${c.type} ${text}` });
}

const brickAt = (st, ball) => st.bricks.find((q) => !q.gone && ball.x + BALL_R > q.x && ball.x - BALL_R < q.x + BRICK_W && ball.y + BALL_R > q.y && ball.y - BALL_R < q.y + BRICK_H);
// Moves the ball in small steps so it never skips a brick; returns true when it falls out of the bottom.
function moveBall(st, dt, game, random) {
  const ball = st.ball, dist = Math.hypot(ball.vx, ball.vy) * dt, n = Math.max(1, Math.ceil(dist / 3)), h = dt / n;
  for (let i = 0; i < n; i++) {
    // Across, then up/down: a brick met on one axis sends the ball back along that axis, set just outside it.
    ball.x += ball.vx * h;
    let b = ball.vx ? brickAt(st, ball) : null;
    if (b) { ball.x = ball.vx > 0 ? b.x - BALL_R - 0.01 : b.x + BRICK_W + BALL_R + 0.01; ball.vx = -ball.vx; hitBrick(st, b, game, random); }
    if (ball.x - BALL_R < FIELD_L) { ball.x = FIELD_L + BALL_R; ball.vx = Math.abs(ball.vx); }
    if (ball.x + BALL_R > FIELD_R) { ball.x = FIELD_R - BALL_R; ball.vx = -Math.abs(ball.vx); }
    ball.y += ball.vy * h;
    b = brickAt(st, ball);
    if (b) { ball.y = ball.vy > 0 ? b.y - BALL_R - 0.01 : b.y + BRICK_H + BALL_R + 0.01; ball.vy = -ball.vy; hitBrick(st, b, game, random); }
    if (ball.y - BALL_R < FIELD_T) { ball.y = FIELD_T + BALL_R; ball.vy = Math.abs(ball.vy); }
    st.bricks = st.bricks.filter((q) => !q.gone);
    // The bat: the pet's head in the middle, the Vaus on both sides of it.
    if (ball.vy > 0) {
      const pad = st.paddle, dx = ball.x - pad.cx;
      if (Math.abs(dx) < PET_HALF + BALL_R && ball.y + BALL_R >= PET_TOP && ball.y + BALL_R <= PET_TOP + 6) { ball.y = PET_TOP - BALL_R; bounceOff(st, ball); }
      else if (Math.abs(dx) < PET_HALF + BALL_R && ball.y + BALL_R > PET_TOP + 6 && ball.y - BALL_R < PADDLE_Y) {
        // Off the pet's side: pushed away from it, still falling toward the Vaus.
        ball.x = pad.cx + Math.sign(dx || 1) * (PET_HALF + BALL_R); ball.vx = Math.sign(dx || 1) * Math.abs(ball.vx);
      } else if (Math.abs(dx) < pad.w / 2 + BALL_R && ball.y + BALL_R >= PADDLE_Y && ball.y + BALL_R <= PADDLE_Y + PADDLE_H) { ball.y = PADDLE_Y - BALL_R; bounceOff(st, ball); }
    }
    if (ball.stuck) return false;
    if (ball.y - BALL_R > H) return true;
  }
  return false;
}

export function step(st, dt, keys, game, random = Math.random) {
  if (st.done) return null;
  st.time += dt;
  const press = keys.has('Space') || keys.has('ArrowUp'), tap = press && !st.held;
  st.held = press;
  for (const b of st.bricks) b.flash = Math.max(0, b.flash - dt);
  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < (q.big ? OUTRO : 0.8));

  // The Vaus (and the pet on it); E grows it smoothly.
  const pad = st.paddle, dir = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  const target = paddleWidth(st);
  pad.w = pad.w < target ? Math.min(target, pad.w + 120 * dt) : Math.max(target, pad.w - 120 * dt);
  if (dir) st.flip = dir < 0;
  if (!st.outro) pad.cx += dir * PADDLE_SPEED * dt;
  pad.cx = Math.max(FIELD_L + pad.w / 2, Math.min(FIELD_R - pad.w / 2, pad.cx));

  if (st.outro) {
    st.outro.t += dt;
    if (st.outro.t >= OUTRO) { st.done = true; return 'done'; }
    return null;
  }

  const ball = st.ball;
  if (ball.stuck) {
    ball.x = pad.cx + ball.offset; ball.y = surfaceAt(st, ball.x) - BALL_R;
    ball.hold -= dt;
    if (tap || ball.hold <= 0) launch(ball);
  } else {
    ball.speed = Math.min(MAX_SPEED, ball.speed + SPEEDUP * dt);
    const v = Math.hypot(ball.vx, ball.vy) || 1;
    ball.vx *= ball.speed / v; ball.vy *= ball.speed / v;
    // Never let it settle into a flat back-and-forth: at least ~15° off horizontal.
    if (Math.abs(ball.vy) < ball.speed * 0.26) { ball.vy = Math.sign(ball.vy || -1) * ball.speed * 0.26; ball.vx = Math.sign(ball.vx) * Math.sqrt(ball.speed ** 2 - ball.vy ** 2); }
    if (moveBall(st, dt, game, random)) {
      serve(st);
      if (!(game.runner?.invincible > 0)) return 'hurt';
      return null;
    }
  }

  // Capsules fall and are caught by the Vaus or the pet.
  for (const c of st.capsules) {
    c.y += CAPSULE_SPEED * dt; c.t += dt;
    const onPet = Math.abs(c.x + CAP_W / 2 - pad.cx) < PET_HALF + CAP_W / 2 && c.y + CAP_H >= PET_TOP && c.y <= PADDLE_Y;
    const onVaus = c.x + CAP_W > pad.cx - pad.w / 2 && c.x < pad.cx + pad.w / 2 && c.y + CAP_H >= PADDLE_Y && c.y <= PADDLE_Y + PADDLE_H;
    if (onPet || onVaus) { c.gone = true; collect(st, c, game); }
    if (c.y > H) c.gone = true;
  }
  st.capsules = st.capsules.filter((c) => !c.gone);

  // Into the open warp gate: the round counts as cleared.
  const warp = st.gate && dir > 0 && pad.cx + pad.w / 2 >= FIELD_R - 0.5;
  if (warp) { game.score += WARP_POINTS; st.popups.push({ x: FIELD_R - 40, y: PADDLE_Y - 30, t: 0, text: String(WARP_POINTS) }); }
  if (!bricksLeft(st) || warp) {
    if (game.runner) giveShield(game.runner);
    st.outro = { t: 0 }; st.capsules = []; st.effect = null;
    st.popups.push({ x: W / 2, y: 200, t: 0, text: 'SHIELD!', big: true });
  }
  return null;
}

// Exactly what paint passes to drawRunner: the pet standing on the middle of the Vaus.
export function pose(st) {
  return { x: st.paddle.cx - 8 * CELL, bottom: PADDLE_Y, cell: CELL, flip: st.flip, onGround: true };
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
// Each round has its own backdrop tile, like the arcade's patterned playfields.
const BACKDROPS = [['#0a1a5c', '#132a86', '#1b3aa8'], ['#073a22', '#0d5634', '#147046'], ['#3a0c40', '#561460', '#6e1d7a']];
function backdrop(ctx, st) {
  const [bg, mid, light] = BACKDROPS[st.round - 1];
  px(ctx, bg, FIELD_L, FIELD_T, FIELD_R - FIELD_L, H - FIELD_T);
  for (let y = FIELD_T; y < H; y += 16) for (let x = FIELD_L; x < FIELD_R; x += 16) {
    const odd = ((x - FIELD_L) / 16 + (y - FIELD_T) / 16) % 2;
    px(ctx, mid, x + 2, y + 6, 12, 4); px(ctx, mid, x + 6, y + 2, 4, 12);
    if (odd) px(ctx, light, x + 7, y + 7, 2, 2);
  }
}
// The metal frame: silver pipes with darker joints and blue gates.
function frame(ctx) {
  const pipeV = (x) => {
    px(ctx, '#5c5c6c', x, FIELD_T - 8, 8, H); px(ctx, '#a4a4b4', x + 1, FIELD_T - 8, 3, H); px(ctx, '#e4e4ec', x + 2, FIELD_T - 8, 1, H);
    for (let y = FIELD_T + 20; y < H; y += 48) { px(ctx, '#2c2c3c', x, y, 8, 2); px(ctx, '#2050d8', x, y + 6, 8, 10); px(ctx, '#6c9cfc', x + 1, y + 7, 2, 8); px(ctx, '#2c2c3c', x, y + 18, 8, 2); }
  };
  pipeV(FIELD_L - 8); pipeV(FIELD_R);
  px(ctx, '#5c5c6c', FIELD_L - 8, FIELD_T - 8, FIELD_R - FIELD_L + 16, 8); px(ctx, '#a4a4b4', FIELD_L - 8, FIELD_T - 7, FIELD_R - FIELD_L + 16, 3); px(ctx, '#e4e4ec', FIELD_L - 8, FIELD_T - 6, FIELD_R - FIELD_L + 16, 1);
  for (const x of [FIELD_L + 60, FIELD_R - 100]) { px(ctx, '#2050d8', x, FIELD_T - 8, 40, 8); px(ctx, '#6c9cfc', x + 2, FIELD_T - 7, 36, 2); }
}
function brick(ctx, b) {
  const color = b.flash > 0 ? '#ffffff' : BRICKS[b.kind].color;
  px(ctx, '#000000', b.x, b.y, BRICK_W, BRICK_H);
  px(ctx, color, b.x, b.y, BRICK_W - 1, BRICK_H - 1);
  if (b.kind === 's' || b.kind === 'G') {
    // Metal bricks shine along the top and darken at the bottom.
    px(ctx, b.kind === 's' ? '#ececec' : '#fcf0a0', b.x + 1, b.y + 1, BRICK_W - 3, 2);
    px(ctx, b.kind === 's' ? '#8c8c8c' : '#a07010', b.x + 1, b.y + BRICK_H - 3, BRICK_W - 3, 2);
  } else px(ctx, 'rgba(255,255,255,0.35)', b.x, b.y, BRICK_W - 1, 1);
}
// The Vaus: silver body, cyan glints and red ends.
function vaus(ctx, pad) {
  const x = pad.cx - pad.w / 2, y = PADDLE_Y, w = pad.w;
  px(ctx, '#881400', x, y + 1, 10, PADDLE_H - 2); px(ctx, '#d82800', x + 1, y + 1, 8, PADDLE_H - 4); px(ctx, '#fc7460', x + 2, y + 2, 4, 1);
  px(ctx, '#881400', x + w - 10, y + 1, 10, PADDLE_H - 2); px(ctx, '#d82800', x + w - 9, y + 1, 8, PADDLE_H - 4); px(ctx, '#fc7460', x + w - 7, y + 2, 4, 1);
  px(ctx, '#3cbcfc', x + 10, y, 3, PADDLE_H); px(ctx, '#3cbcfc', x + w - 13, y, 3, PADDLE_H);
  px(ctx, '#7c7c7c', x + 13, y, w - 26, PADDLE_H); px(ctx, '#bcbcbc', x + 13, y + 1, w - 26, PADDLE_H - 3); px(ctx, '#fcfcfc', x + 13, y + 1, w - 26, 1);
}
// 3×5 letters for the capsules.
const LETTERS = { B: ['##.', '#.#', '##.', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], S: ['###', '#..', '###', '..#', '###'], C: ['###', '#..', '#..', '#..', '###'], P: ['##.', '#.#', '##.', '#..', '#..'] };
function capsule(ctx, c) {
  const color = CAPSULES[c.type], x = c.x, y = c.y;
  px(ctx, '#000000', x + 2, y, CAP_W - 4, CAP_H); px(ctx, '#000000', x, y + 2, CAP_W, CAP_H - 4); px(ctx, '#000000', x + 1, y + 1, CAP_W - 2, CAP_H - 2);
  px(ctx, color, x + 2, y + 1, CAP_W - 4, CAP_H - 2); px(ctx, color, x + 1, y + 2, CAP_W - 2, CAP_H - 4);
  // The capsule rolls as it falls: a light band sweeps across it.
  const band = Math.floor(c.t * 10) % 4;
  px(ctx, 'rgba(255,255,255,0.45)', x + 2, y + 1 + band * 2, CAP_W - 4, 1);
  LETTERS[c.type].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') px(ctx, '#fcf0a0', x + CAP_W / 2 - 2 + i, y + 2 + j, 1, 1); }));
}

export function paint(ctx, st, game, drawRunner) {
  px(ctx, '#000000', 0, 0, W, H);
  backdrop(ctx, st);
  frame(ctx);
  if (st.gate) {
    // The warp gate: an opening in the right wall at the Vaus's height, flickering.
    px(ctx, '#000000', FIELD_R, PADDLE_Y - 18, 8, 32);
    for (let y = PADDLE_Y - 16; y < PADDLE_Y + 12; y += 4) px(ctx, Math.floor(st.time * 12 + y / 4) % 2 ? '#f878f8' : '#fce020', FIELD_R + 2, y, 4, 2);
  }
  for (const b of st.bricks) brick(ctx, b);
  for (const c of st.capsules) capsule(ctx, c);
  vaus(ctx, st.paddle);
  const at = pose(st);
  drawRunner(at.x, at.bottom, { onGround: at.onGround, flip: at.flip, cell: at.cell });
  const ball = st.ball;
  if (ball && !st.outro) { px(ctx, '#fcfcfc', ball.x - 2, ball.y - 3, 4, 6); px(ctx, '#fcfcfc', ball.x - 3, ball.y - 2, 6, 4); px(ctx, '#7c7c7c', ball.x + 1, ball.y + 1, 1, 1); }
  // Side panel, as in the arcade.
  ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center';
  ctx.fillStyle = '#d82800'; ctx.fillText('ROUND', (FIELD_R + 8 + W) / 2, 40);
  ctx.fillStyle = '#fcfcfc'; ctx.fillText(String(st.round), (FIELD_R + 8 + W) / 2, 54);
  ctx.fillStyle = '#d82800'; ctx.fillText('BRICKS', (FIELD_R + 8 + W) / 2, 80);
  ctx.fillStyle = '#fcfcfc'; ctx.fillText(String(bricksLeft(st)), (FIELD_R + 8 + W) / 2, 94);
  if (ball?.serving && st.time < 2.5 && !st.outro) {
    ctx.font = 'bold 12px ui-monospace, Consolas, monospace';
    ctx.fillStyle = '#fcfcfc'; ctx.fillText(`ROUND ${st.round}`, (FIELD_L + FIELD_R) / 2, 196);
    ctx.fillStyle = '#fce020'; ctx.fillText('READY', (FIELD_L + FIELD_R) / 2, 212);
  }
  for (const q of st.popups) {
    if (q.big) {
      ctx.font = 'bold 22px ui-monospace, Consolas, monospace'; ctx.lineWidth = 4; ctx.strokeStyle = '#0a1a5c';
      ctx.strokeText(q.text, q.x, q.y - Math.min(1, q.t * 4) * 20); ctx.fillStyle = '#7fe3ff'; ctx.fillText(q.text, q.x, q.y - Math.min(1, q.t * 4) * 20);
    } else { ctx.font = 'bold 9px ui-monospace, Consolas, monospace'; ctx.fillStyle = '#fcfcfc'; ctx.fillText(q.text, q.x + 8, q.y - q.t * 24); }
  }
  ctx.textAlign = 'left';
}
