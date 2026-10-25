// Chrome's offline runner, with trees for cacti and the person's pet as the runner.
// Speeds up the longer you run, birds come at three heights, ↓ ducks (and drops fast in the air),
// tapping jumps low and holding jumps high.
export const FLOOR = 250, START_X = 64;
const STAND = { w: 24, h: 28 }, DUCK = { w: 34, h: 16 };
const START_SPEED = 260, MAX_SPEED = 640, ACCELERATION = 5, BIRD_SPEED = 330;
const JUMP = -430, CUT = -250, GRAVITY = 1150, HOLD_GRAVITY = 0.55, DROP = 2600;
const TREES = { small: { w: 16, h: 26 }, large: { w: 22, h: 40 }, pair: { w: 34, h: 26 }, grove: { w: 48, h: 40 } };
// Bird bottoms: low must be jumped, mid must be ducked (or jumped high), high passes over a standing runner.
const BIRD_HEIGHTS = [FLOOR - 4, FLOOR - 26, FLOOR - 58];

export function create(game, carry) {
  return {
    speed: carry?.speed || START_SPEED, distance: 0, gap: 220, obstacles: [], clouds: [{ x: 120, y: 60 }, { x: 330, y: 40 }, { x: 470, y: 80 }], ending: false,
    player: { x: START_X, y: FLOOR - STAND.h, ...STAND, vy: 0, onGround: true, held: false, ducking: false },
  };
}

function spawn(st, random) {
  const birdsAllowed = st.speed > BIRD_SPEED;
  if (birdsAllowed && random() < 0.28) {
    const bottom = BIRD_HEIGHTS[Math.floor(random() * BIRD_HEIGHTS.length)];
    st.obstacles.push({ kind: 'bird', x: 520, y: bottom - 18, w: 30, h: 18, flap: 0 });
  } else {
    const pool = st.speed > 420 ? ['small', 'large', 'pair', 'grove'] : st.speed > 320 ? ['small', 'large', 'pair'] : ['small', 'large'];
    const kind = pool[Math.floor(random() * pool.length)], size = TREES[kind];
    st.obstacles.push({ kind, x: 520, y: FLOOR - size.h, ...size });
  }
  // Like Chrome, the gap grows with speed so jumps stay possible.
  st.gap = (st.speed * 0.55 + 150) * (1 + random() * 0.65);
}

export function step(st, dt, keys, game, random = Math.random) {
  const p = st.player, jump = keys.has('Space') || keys.has('ArrowUp'), down = keys.has('ArrowDown');
  st.speed = Math.min(MAX_SPEED, st.speed + ACCELERATION * dt);
  st.distance += st.speed * dt;
  if (!st.ending) game.score += dt * st.speed * 0.11;
  // Jump / duck
  if (jump && p.onGround && !p.ducking) { p.vy = JUMP; p.held = true; p.onGround = false; }
  if (!jump) p.held = false;
  if (!p.held && p.vy < CUT) p.vy = CUT;
  p.vy += (GRAVITY * (p.held && p.vy < 0 ? HOLD_GRAVITY : 1) + (down && !p.onGround ? DROP : 0)) * dt;
  p.y += p.vy * dt;
  const ducking = down && p.onGround, size = ducking ? DUCK : STAND;
  if (p.y + p.h >= FLOOR || p.onGround) {
    p.onGround = p.y + p.h >= FLOOR - 0.5;
    if (p.onGround) { p.vy = 0; p.w = size.w; p.h = size.h; p.y = FLOOR - p.h; p.ducking = ducking; }
  }
  // Obstacles and scenery
  st.gap -= st.speed * dt;
  if (st.gap <= 0 && !st.ending) spawn(st, random);
  let hurt = false;
  for (const o of st.obstacles) {
    o.x -= (o.kind === 'bird' ? st.speed * 1.05 : st.speed) * dt;
    if (o.kind === 'bird') o.flap += dt;
    const inset = 4;
    if (!(game.invincible > 0) && p.x + inset < o.x + o.w - inset && p.x + p.w - inset > o.x + inset && p.y + inset < o.y + o.h && p.y + p.h - 2 > o.y + inset) { hurt = true; o.hit = true; }
  }
  st.obstacles = st.obstacles.filter((o) => o.x > -70 && !o.hit);
  for (const c of st.clouds) { c.x -= st.speed * 0.12 * dt; if (c.x < -60) { c.x = 540 + random() * 80; c.y = 30 + random() * 70; } }
  return hurt ? 'hurt' : null;
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function tree(ctx, x, y, w, h) {
  // Pixel tree: trunk, layered round canopy with a lit side.
  const trunkW = Math.max(4, Math.round(w * 0.25)), trunkH = Math.round(h * 0.32);
  px(ctx, '#5a3a22', x + (w - trunkW) / 2, y + h - trunkH, trunkW, trunkH);
  px(ctx, '#7a5233', x + (w - trunkW) / 2, y + h - trunkH, 1, trunkH);
  const canopyH = h - trunkH + 2;
  px(ctx, '#1f5c3a', x, y + canopyH * 0.35, w, canopyH * 0.55);
  px(ctx, '#1f5c3a', x + w * 0.15, y + canopyH * 0.1, w * 0.7, canopyH * 0.85);
  px(ctx, '#1f5c3a', x + w * 0.3, y, w * 0.4, canopyH * 0.3);
  px(ctx, '#2f8a55', x + w * 0.2, y + canopyH * 0.15, w * 0.35, canopyH * 0.35);
  px(ctx, '#3fae6a', x + w * 0.28, y + canopyH * 0.2, w * 0.15, canopyH * 0.15);
}
function pine(ctx, x, y, w, h) {
  const trunkW = 4, trunkH = 7;
  px(ctx, '#5a3a22', x + w / 2 - trunkW / 2, y + h - trunkH, trunkW, trunkH);
  const tiers = 4, tierH = (h - trunkH) / tiers;
  for (let i = 0; i < tiers; i++) {
    const tw = w * (0.4 + 0.6 * (i + 1) / tiers);
    px(ctx, '#1f5c3a', x + (w - tw) / 2, y + i * tierH + tierH * 0.2, tw, tierH * 0.95);
    px(ctx, '#2f8a55', x + (w - tw) / 2 + 2, y + i * tierH + tierH * 0.25, tw * 0.35, tierH * 0.5);
  }
  px(ctx, '#3fae6a', x + w / 2 - 1, y, 2, 4);
}
function bird(ctx, o) {
  const up = Math.floor(o.flap * 8) % 2 === 0, x = o.x, y = o.y;
  px(ctx, '#c9d3e6', x + 6, y + 8, 18, 6); px(ctx, '#c9d3e6', x, y + 6, 8, 4); px(ctx, '#c9d3e6', x + 24, y + 9, 6, 3);
  px(ctx, '#0b1220', x + 3, y + 7, 2, 2);
  if (up) { px(ctx, '#aab6cc', x + 10, y, 8, 8); px(ctx, '#aab6cc', x + 12, y - 4, 5, 4); }
  else { px(ctx, '#aab6cc', x + 10, y + 13, 8, 6); px(ctx, '#aab6cc', x + 12, y + 18, 5, 3); }
}
export function paint(ctx, st, game, drawRunner) {
  px(ctx, '#0f1828', 0, 0, 500, 280);
  ctx.fillStyle = '#26354d'; for (let i = 0; i < 34; i++) ctx.fillRect((i * 89 + 17) % 500, (i * 53 + 13) % 200, 2, 2);
  ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(420, 46, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0f1828'; ctx.beginPath(); ctx.arc(426, 42, 11, 0, Math.PI * 2); ctx.fill();
  for (const c of st.clouds) { px(ctx, '#2b3b55', c.x, c.y, 46, 8); px(ctx, '#2b3b55', c.x + 8, c.y - 6, 24, 6); }
  px(ctx, '#3d5068', 0, FLOOR, 500, 2);
  const offset = st.distance % 40;
  ctx.fillStyle = '#2b3b55'; for (let i = 0; i < 14; i++) { ctx.fillRect(i * 40 - offset, FLOOR + 10, 12, 2); ctx.fillRect(i * 40 - offset + 22, FLOOR + 18, 4, 2); }
  for (const o of st.obstacles) {
    if (o.kind === 'bird') bird(ctx, o);
    else if (o.kind === 'large') pine(ctx, o.x, o.y, o.w, o.h);
    else if (o.kind === 'small') tree(ctx, o.x, o.y, o.w, o.h);
    else if (o.kind === 'pair') { tree(ctx, o.x, o.y + 4, 16, o.h - 4); tree(ctx, o.x + 16, o.y, 18, o.h); }
    else { pine(ctx, o.x, o.y, 22, o.h); tree(ctx, o.x + 20, o.y + 12, 16, o.h - 12); pine(ctx, o.x + 30, o.y + 4, 18, o.h - 4); }
  }
  drawRunner(st.player.x, st.player.ducking);
}
