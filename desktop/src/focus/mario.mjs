// A compact take on Super Mario Bros. World 1-1, played by the pet in a Mario cap: hand-driven running,
// ? blocks (coins, and mushrooms that add a heart and make the pet big), bricks that a big pet breaks,
// pipes (shape only), pits, goombas, staircases and a flagpole. Tiles are 20px on a 500×280 canvas.
export const TILE = 20, ROWS = 14, GROUND = 12, VIEW = 500;
const EMPTY = 0, SOLID = 1, BRICK = 2, QUESTION = 3, USED = 4, PIPE = 5, HARD = 6;
const WIDTH = 212;
export const FLAG_X = 198;
const SOLIDS = new Set([SOLID, BRICK, QUESTION, USED, PIPE, HARD]);

// Positions follow the original 1-1 (x in tiles; blocks sit 4 or 8 tiles above the ground).
const LOW = GROUND - 4, HIGH = GROUND - 8;
const QUESTIONS = [[16, LOW], [21, LOW], [23, LOW], [22, HIGH], [78, LOW], [94, HIGH], [106, LOW], [109, LOW], [112, LOW], [109, HIGH], [129, HIGH], [130, HIGH], [170, LOW]];
const BRICKS = [[20, LOW], [22, LOW], [24, LOW], [77, LOW], [79, LOW], ...[80, 81, 82, 83, 84, 85, 86, 87].map((x) => [x, HIGH]), [91, HIGH], [92, HIGH], [93, HIGH], [94, LOW], [100, LOW], [101, LOW], [118, LOW], [121, HIGH], [122, HIGH], [123, HIGH], [128, HIGH], [131, HIGH], [129, LOW], [130, LOW], [168, LOW], [169, LOW], [171, LOW]];
export const PIPES = [[28, 2], [38, 3], [46, 4], [57, 4], [163, 2], [179, 2]];
const PITS = [[69, 70], [86, 88], [153, 154]];
const STAIRS = [[134, [1, 2, 3, 4]], [140, [4, 3, 2, 1]], [148, [1, 2, 3, 4, 4]], [155, [4, 3, 2, 1]], [181, [1, 2, 3, 4, 5, 6, 7, 8, 8]]];
const GOOMBAS = [22, 40, 51, 53, 97, 99, 114, 116, 124, 126, 128, 130, 174, 176];
// The ? blocks that hold a mushroom instead of a coin, as in the original.
const MUSHROOMS = new Set([`21,${LOW}`, `78,${LOW}`, `109,${HIGH}`]);
import { powerUp, fitBox } from './runner.mjs';

export function createLevel() {
  const grid = new Uint8Array(WIDTH * ROWS);
  const set = (x, y, type) => { if (x >= 0 && x < WIDTH && y >= 0 && y < ROWS) grid[y * WIDTH + x] = type; };
  for (let x = 0; x < WIDTH; x++) if (!PITS.some(([a, b]) => x >= a && x <= b)) { set(x, GROUND, SOLID); set(x, GROUND + 1, SOLID); }
  QUESTIONS.forEach(([x, y]) => set(x, y, QUESTION));
  BRICKS.forEach(([x, y]) => set(x, y, BRICK));
  PIPES.forEach(([x, h]) => { for (let y = GROUND - h; y < GROUND; y++) { set(x, y, PIPE); set(x + 1, y, PIPE); } });
  STAIRS.forEach(([x0, heights]) => heights.forEach((h, i) => { for (let y = GROUND - h; y < GROUND; y++) set(x0 + i, y, HARD); }));
  set(FLAG_X, GROUND - 1, HARD);
  return {
    grid, width: WIDTH, cam: 0, bumps: [], popups: [], items: [], debris: [], combo: 0, coins: 0, done: false, flagY: 2 * TILE + 14,
    goombas: GOOMBAS.map((x) => ({ x: x * TILE, y: (GROUND - 1) * TILE + 2, w: 18, h: 18, vx: -40, vy: 0, alive: true, squashed: 0, active: false })),
  };
}
export const tileAt = (level, tx, ty) => (tx < 0 || tx >= level.width || ty >= ROWS ? (ty >= ROWS ? EMPTY : SOLID) : ty < 0 ? EMPTY : level.grid[ty * level.width + tx]);
const solidAt = (level, px, py) => SOLIDS.has(tileAt(level, Math.floor(px / TILE), Math.floor(py / TILE)));

// Moves a box by (dx, dy) against solid tiles; returns which sides it hit and the tile hit from below.
function move(level, b, dx, dy) {
  const hit = { left: false, right: false, top: null, bottom: false };
  b.x += dx;
  for (const y of [b.y + 1, b.y + b.h / 2, b.y + b.h - 1]) {
    if (dx > 0 && solidAt(level, b.x + b.w, y)) { b.x = Math.floor((b.x + b.w) / TILE) * TILE - b.w - 0.01; hit.right = true; }
    if (dx < 0 && solidAt(level, b.x, y)) { b.x = (Math.floor(b.x / TILE) + 1) * TILE + 0.01; hit.left = true; }
  }
  b.y += dy;
  for (const x of [b.x + 2, b.x + b.w - 2]) {
    if (dy > 0 && solidAt(level, x, b.y + b.h)) { b.y = Math.floor((b.y + b.h) / TILE) * TILE - b.h; hit.bottom = true; }
    if (dy < 0 && solidAt(level, x, b.y)) { const ty = Math.floor(b.y / TILE); b.y = (ty + 1) * TILE; hit.top = hit.top || { tx: Math.floor(x / TILE), ty }; }
  }
  return hit;
}

const ACCEL = 620, MAX_RUN = 150, FRICTION = 760, GRAVITY = 1150, HOLD_GRAVITY = 0.55, JUMP = -440, CUT = -250, MAX_FALL = 620;

const SMALL = { w: 18, h: 28 }, BIG = { w: 22, h: 38 };
const sizeFor = (game) => (game?.runner?.big ? BIG : SMALL);

// Stage module: the pet starts where the dino run left it (x = 64) and the camera scrolls with it.
export function create(game) {
  const size = sizeFor(game);
  return { level: createLevel(), player: { x: 64, y: GROUND * TILE - size.h, ...size, vx: 0, vy: 0, onGround: true, held: false }, outro: null, ending: false };
}

// The flag pays by how high the runner grabs the pole, as in the original.
const POLE_TOP = 2 * TILE + 8, POLE_BOTTOM = (GROUND - 1) * TILE;
const flagBonus = (y) => { const k = (POLE_BOTTOM - y) / (POLE_BOTTOM - POLE_TOP); return k > 0.9 ? 5000 : k > 0.65 ? 2000 : k > 0.4 ? 800 : k > 0.15 ? 400 : 100; };
const DOOR_X = (FLAG_X + 6) * TILE + 3;

// After the flag: slide down the pole, hop off, walk into the castle. Returns 'done' at the door.
function stepOutro(st, dt) {
  const level = st.level, p = st.player, o = st.outro;
  o.t += dt;
  if (o.phase === 'slide') {
    p.x = FLAG_X * TILE + 9 - p.w; p.vx = 0;
    p.y = Math.min(POLE_BOTTOM - p.h, p.y + 160 * dt);
    level.flagY = Math.min(POLE_BOTTOM - 18, level.flagY + 160 * dt);
    if (p.y >= POLE_BOTTOM - p.h && level.flagY >= POLE_BOTTOM - 18) { o.phase = 'walk'; o.t = 0; }
  } else if (o.phase === 'walk') {
    p.vx = 90; p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    const hit = move(level, p, p.vx * dt, p.vy * dt);
    if (hit.bottom) { p.vy = 0; p.onGround = true; } else p.onGround = false;
    if (p.x >= DOOR_X) { o.phase = 'inside'; o.t = 0; }
  } else if (o.t > 0.5) return 'done';
  level.cam = Math.max(level.cam, Math.min(p.x - 200, level.width * TILE - VIEW));
  for (const q of level.popups) q.t += dt;
  level.popups = level.popups.filter((q) => q.t < 1.2);
  return null;
}

// Returns 'hurt' | 'fell' | 'done' | null; the engine handles lives and stage changes.
export function step(st, dt, keys, game) {
  if (st.outro) return stepOutro(st, dt);
  const result = stepMario(st, dt, keys, game);
  if (result === 'fell') respawn(st);
  return result;
}

function stepMario(s, dt, keys, game) {
  const level = s.level, p = s.player;
  fitBox(p, sizeFor(game)); // grew from a mushroom, or shrank from a hit
  const left = keys.has('ArrowLeft'), right = keys.has('ArrowRight'), action = keys.has('Space') || keys.has('ArrowUp');
  const dir = Number(right) - Number(left);
  if (dir) p.vx = Math.max(-MAX_RUN, Math.min(MAX_RUN, p.vx + dir * ACCEL * dt));
  else p.vx = Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - FRICTION * dt);
  if (action && p.onGround) { p.vy = JUMP; p.held = true; p.onGround = false; }
  if (!action) p.held = false;
  if (!p.held && p.vy < CUT) p.vy = CUT;
  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * (p.held && p.vy < 0 ? HOLD_GRAVITY : 1) * dt);
  const hit = move(level, p, p.vx * dt, p.vy * dt);
  if (hit.left || hit.right) p.vx = 0;
  if (hit.bottom) { p.vy = 0; p.onGround = true; level.combo = 0; } else p.onGround = false;
  if (hit.top) {
    p.vy = 40;
    const { tx, ty } = hit.top, type = tileAt(level, tx, ty);
    if (type === QUESTION) {
      level.grid[ty * level.width + tx] = USED;
      if (MUSHROOMS.has(`${tx},${ty}`)) level.items.push({ x: tx * TILE + 1, y: ty * TILE, w: 18, h: 18, vx: 0, vy: 0, rise: TILE, top: ty * TILE - TILE });
      else { level.coins++; game.score += 100; level.popups.push({ x: tx * TILE + 4, y: ty * TILE - 6, t: 0, coin: true, text: '100' }); }
    }
    // A big pet breaks bricks; a small one only bumps them.
    if (type === BRICK && game.runner?.big) {
      level.grid[ty * level.width + tx] = EMPTY; game.score += 50;
      for (const [dx, dy] of [[-60, -260], [60, -260], [-40, -180], [40, -180]]) level.debris.push({ x: tx * TILE + 10, y: ty * TILE + 10, vx: dx, vy: dy, t: 0 });
    } else if (type === BRICK || type === QUESTION) level.bumps.push({ tx, ty, t: 0 });
    // Anything standing on a bumped block gets knocked out, like in the original.
    for (const g of level.goombas) if (g.alive && !g.squashed && Math.abs(g.x + g.w / 2 - (tx * TILE + 10)) < 16 && Math.abs(g.y + g.h - ty * TILE) < 4) { g.alive = false; game.score += 100; level.popups.push({ x: g.x, y: g.y - 10, t: 0, text: '100' }); }
  }
  // The camera only moves forward, and the runner cannot walk back off screen.
  level.cam = Math.max(level.cam, Math.min(p.x - 200, level.width * TILE - VIEW));
  if (p.x < level.cam) { p.x = level.cam; p.vx = Math.max(0, p.vx); }

  // Mushrooms rise out of their block, then slide along and bounce off walls; touching one powers the pet up.
  for (const m of level.items) {
    if (m.rise > 0) { const d = Math.min(m.rise, 30 * dt); m.y -= d; m.rise -= d; if (m.rise <= 0) m.vx = 70; continue; }
    m.vy = Math.min(MAX_FALL, m.vy + GRAVITY * dt);
    const mh = move(level, m, m.vx * dt, m.vy * dt);
    if (mh.left || mh.right) m.vx = -m.vx;
    if (mh.bottom) m.vy = 0;
    if (m.y > ROWS * TILE + 40) m.gone = true;
    if (!m.gone && p.x < m.x + m.w && p.x + p.w > m.x && p.y < m.y + m.h && p.y + p.h > m.y) {
      m.gone = true; game.score += 1000;
      const hearts = game.runner?.lives;
      if (game.runner) { powerUp(game.runner); fitBox(p, sizeFor(game)); }
      level.popups.push({ x: m.x, y: m.y - 8, t: 0, text: game.runner?.lives > hearts ? '♥ +1' : '1000' });
    }
  }
  level.items = level.items.filter((m) => !m.gone);
  for (const d of level.debris) { d.t += dt; d.vy += GRAVITY * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
  level.debris = level.debris.filter((d) => d.t < 1.2);

  let result = null;
  for (const g of level.goombas) {
    if (!g.alive) continue;
    if (g.squashed) { g.squashed -= dt; if (g.squashed <= 0) g.alive = false; continue; }
    if (!g.active) { if (g.x < level.cam + VIEW + 40) g.active = true; else continue; }
    g.vy = Math.min(MAX_FALL, g.vy + GRAVITY * dt);
    const gh = move(level, g, g.vx * dt, g.vy * dt);
    if (gh.left || gh.right) g.vx = -g.vx;
    if (gh.bottom) g.vy = 0;
    if (g.y > ROWS * TILE + 40 || g.x < level.cam - 80) { g.alive = false; continue; }
    if (p.x < g.x + g.w && p.x + p.w > g.x && p.y < g.y + g.h && p.y + p.h > g.y) {
      if (p.vy > 0 && p.y + p.h - g.y < 12) {
        // Chained stomps without touching the ground double: 100, 200, 400, 800 …
        const points = 100 * 2 ** Math.min(level.combo, 6); level.combo++;
        game.score += points; g.squashed = 0.45; p.vy = p.held ? -380 : -260;
        level.popups.push({ x: g.x, y: g.y - 10, t: 0, text: String(points) });
      } else if (!(game.runner?.invincible > 0)) result = 'hurt';
    }
  }
  for (const b of level.bumps) b.t += dt;
  for (const q of level.popups) q.t += dt;
  level.bumps = level.bumps.filter((b) => b.t < 0.2);
  level.popups = level.popups.filter((q) => q.t < 0.8);
  if (p.y > ROWS * TILE + 20) result = 'fell';
  if (!level.done && p.x + p.w >= FLAG_X * TILE + 8) {
    const bonus = flagBonus(p.y); level.done = true; game.score += bonus;
    level.popups.push({ x: FLAG_X * TILE + 14, y: p.y, t: 0, text: String(bonus) });
    s.outro = { phase: 'slide', t: 0 }; p.vy = 0;
  }
  return result;
}

// Puts the runner back on solid ground at the left edge of the view after a fall.
export function respawn(s) {
  const level = s.level, p = s.player;
  let tx = Math.floor((level.cam + 40) / TILE);
  while (tx < level.width && !SOLIDS.has(tileAt(level, tx, GROUND))) tx++;
  Object.assign(p, { x: tx * TILE + 2, y: (GROUND - 2) * TILE, vx: 0, vy: 0, onGround: false });
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
function block(ctx, type, x, y, bump) {
  y -= bump;
  if (type === SOLID) { px(ctx, '#c84c0c', x, y, 20, 20); px(ctx, '#e8a070', x, y, 20, 2); px(ctx, '#5c1c00', x, y + 18, 20, 2); px(ctx, '#5c1c00', x + 9, y + 2, 2, 7); px(ctx, '#5c1c00', x, y + 9, 20, 2); px(ctx, '#5c1c00', x + 3, y + 11, 2, 7); px(ctx, '#5c1c00', x + 15, y + 11, 2, 7); }
  else if (type === BRICK) { px(ctx, '#c84c0c', x, y, 20, 20); px(ctx, '#f8b090', x, y, 20, 1); for (const r of [0, 5, 10, 15]) px(ctx, '#2c0c00', x, y + r + 4, 20, 1); for (const r of [0, 10]) { px(ctx, '#2c0c00', x + 9, y + r, 1, 5); px(ctx, '#2c0c00', x + 4, y + r + 5, 1, 5); px(ctx, '#2c0c00', x + 14, y + r + 5, 1, 5); } }
  else if (type === QUESTION) {
    px(ctx, '#f8b800', x, y, 20, 20); px(ctx, '#fcf0a0', x, y, 20, 2); px(ctx, '#9c4a00', x, y + 18, 20, 2); px(ctx, '#9c4a00', x + 18, y, 2, 20);
    for (const [a, b] of [[6, 4], [8, 4], [10, 4], [12, 6], [12, 8], [10, 9], [8, 10], [8, 12], [8, 15]]) px(ctx, '#9c4a00', x + a, y + b, 3, 2);
    for (const [a, b] of [[2, 2], [16, 2], [2, 16], [16, 16]]) px(ctx, '#9c4a00', x + a, y + b, 2, 2);
  } else if (type === USED) { px(ctx, '#9c4a00', x, y, 20, 20); px(ctx, '#c86c20', x + 1, y + 1, 18, 18); for (const [a, b] of [[2, 2], [16, 2], [2, 16], [16, 16]]) px(ctx, '#5c1c00', x + a, y + b, 2, 2); }
  else if (type === HARD) { px(ctx, '#c84c0c', x, y, 20, 20); px(ctx, '#f0a070', x, y, 20, 3); px(ctx, '#f0a070', x, y, 3, 20); px(ctx, '#5c1c00', x, y + 17, 20, 3); px(ctx, '#5c1c00', x + 17, y, 3, 20); }
}
function pipe(ctx, x, top, h) {
  const body = '#00a800', light = '#80d010', dark = '#005800';
  px(ctx, dark, x - 2, top, 44, 18); px(ctx, body, x, top + 2, 40, 14); px(ctx, light, x + 6, top + 2, 6, 14); px(ctx, light, x + 14, top + 2, 2, 14);
  px(ctx, dark, x + 2, top + 18, 36, h * TILE - 18); px(ctx, body, x + 4, top + 18, 32, h * TILE - 18); px(ctx, light, x + 9, top + 18, 5, h * TILE - 18); px(ctx, light, x + 16, top + 18, 2, h * TILE - 18);
}
function goomba(ctx, g, x) {
  if (g.squashed) { px(ctx, '#b45000', x, g.y + g.h - 7, g.w, 5); px(ctx, '#000', x + 2, g.y + g.h - 2, g.w - 4, 2); return; }
  const step = Math.floor(x / 6) % 2;
  px(ctx, '#b45000', x + 2, g.y, g.w - 4, 4); px(ctx, '#b45000', x, g.y + 4, g.w, 7); px(ctx, '#fcd8a8', x + 5, g.y + 11, g.w - 10, 4);
  px(ctx, '#fff', x + 3, g.y + 5, 4, 4); px(ctx, '#fff', x + g.w - 7, g.y + 5, 4, 4); px(ctx, '#000', x + 4, g.y + 6, 2, 3); px(ctx, '#000', x + g.w - 6, g.y + 6, 2, 3);
  px(ctx, '#000', x + 4, g.y + 3, 4, 1); px(ctx, '#000', x + g.w - 8, g.y + 3, 4, 1);
  px(ctx, '#000', x + (step ? 0 : 2), g.y + 15, 7, 3); px(ctx, '#000', x + g.w - (step ? 9 : 7), g.y + 15, 7, 3);
}
// Super Mushroom: red cap with white spots over a pale stem; `shown` is how much has risen out of the block.
function mushroom(ctx, x, y, shown) {
  ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, 24, Math.max(0, shown) + 2); ctx.clip();
  px(ctx, '#e8402e', x + 2, y, 14, 4); px(ctx, '#e8402e', x, y + 3, 18, 7);
  px(ctx, '#fff', x + 3, y + 3, 4, 4); px(ctx, '#fff', x + 11, y + 3, 4, 4); px(ctx, '#fff', x + 7, y, 4, 3);
  px(ctx, '#f6d8a8', x + 4, y + 10, 10, 8); px(ctx, '#000', x + 6, y + 12, 2, 3); px(ctx, '#000', x + 10, y + 12, 2, 3);
  ctx.restore();
}
function scenery(ctx, cam) {
  // Hills, bushes and clouds repeat every 48 tiles, as in the original.
  for (let base = Math.floor(cam / 960) * 960 - 960; base < cam + VIEW + 960; base += 960) {
    const hill = (hx, w, h) => { ctx.fillStyle = '#00a800'; ctx.beginPath(); ctx.ellipse(hx - cam, GROUND * TILE, w, h, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = '#005800'; ctx.fillRect(hx - cam - 6, GROUND * TILE - h + 14, 3, 6); ctx.fillRect(hx - cam + 4, GROUND * TILE - h + 22, 3, 6); };
    hill(base + 40, 80, 56); hill(base + 340, 50, 34);
    const bush = (bx, n) => { ctx.fillStyle = '#80d010'; for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(bx - cam + i * 16, GROUND * TILE - 4, 12, Math.PI, 0); ctx.fill(); } };
    bush(base + 230, 3); bush(base + 470, 1); bush(base + 820, 2);
    const cloud = (cx, cy, n) => { ctx.fillStyle = '#fff'; for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(cx - cam + i * 18, cy, 14, Math.PI, 0); ctx.fill(); } ctx.fillRect(cx - cam - 14, cy, n * 18 + 10, 8); };
    cloud(base + 170, 54, 1); cloud(base + 380, 34, 1); cloud(base + 560, 54, 3); cloud(base + 720, 40, 2);
  }
}
export function paint(ctx, s, game, drawRunner) {
  const level = s.level, cam = level.cam;
  px(ctx, '#5c94fc', 0, 0, VIEW, ROWS * TILE);
  scenery(ctx, cam);
  const first = Math.floor(cam / TILE), last = Math.min(level.width - 1, Math.ceil((cam + VIEW) / TILE));
  for (let ty = 0; ty < ROWS; ty++) for (let tx = first; tx <= last; tx++) {
    const type = tileAt(level, tx, ty); if (type === EMPTY || type === PIPE) continue;
    const bump = level.bumps.find((b) => b.tx === tx && b.ty === ty);
    block(ctx, type, tx * TILE - cam, ty * TILE, bump ? Math.sin(bump.t / 0.2 * Math.PI) * 6 : 0);
  }
  for (const [x, h] of PIPES) if (x * TILE + 44 > cam && x * TILE < cam + VIEW) pipe(ctx, x * TILE - cam, (GROUND - h) * TILE, h);
  // Flagpole and castle
  const fx = FLAG_X * TILE - cam + 9;
  if (fx > -120 && fx < VIEW + 20) {
    px(ctx, '#80d010', fx, 2 * TILE + 8, 2, (GROUND - 3) * TILE + 12 - 8); ctx.fillStyle = '#00a800'; ctx.beginPath(); ctx.arc(fx + 1, 2 * TILE + 6, 5, 0, Math.PI * 2); ctx.fill();
    const fy = level.flagY; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - 22, fy + 9); ctx.lineTo(fx, fy + 18); ctx.fill(); px(ctx, '#00a800', fx - 10, fy + 6, 6, 6);
    const cx = (FLAG_X + 4) * TILE - cam, cy = (GROUND - 5) * TILE;
    for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (r >= 2 || (c >= 1 && c <= 3)) block(ctx, BRICK, cx + c * TILE, cy + r * TILE, 0);
    for (const c of [0, 2, 4]) block(ctx, BRICK, cx + c * TILE, cy + TILE * 2 - 10, 0);
    px(ctx, '#000', cx + 2 * TILE + 3, cy + 3 * TILE, 14, 2 * TILE); px(ctx, '#000', cx + 2 * TILE + 3, cy + TILE + 2, 4, 10); px(ctx, '#000', cx + 2 * TILE + 13, cy + TILE + 2, 4, 10);
  }
  for (const m of level.items) mushroom(ctx, m.x - cam, m.y, m.rise > 0 ? m.top + TILE - m.y : m.h);
  for (const d of level.debris) { px(ctx, '#c84c0c', d.x - cam, d.y, 7, 7); px(ctx, '#5c1c00', d.x - cam + 5, d.y + 5, 2, 2); }
  for (const g of level.goombas) if (g.alive && g.active) goomba(ctx, g, g.x - cam);
  for (const q of level.popups) {
    const y = q.y - q.t * 40;
    if (q.coin && q.t < 0.35) { px(ctx, '#f8b800', q.x - cam + 3, y - q.t * 60, 8, 14); px(ctx, '#fcf0a0', q.x - cam + 5, y - q.t * 60 + 2, 2, 10); }
    else { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.fillText(q.text, q.x - cam, y); }
  }
  if (s.outro?.phase !== 'inside') drawRunner(s.player.x - cam, s.player.y + s.player.h, { hat: true, onGround: s.player.onGround, flip: s.player.vx < -10 });
}
