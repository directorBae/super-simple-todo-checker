// Chrome's offline runner, with trees for cacti and the person's pet as the runner (big after a mushroom).
// Speeds up the longer you run, birds come at three heights, ↓ ducks (and drops fast in the air),
// tapping jumps low and holding jumps high.
// ↑ jumps, Space acts (the same in every game). What the pet brought from the other games works here too: with the
// fire flower Space throws bouncing fireballs that burn trees and birds — but from then on bone birds fly as well, and
// fire doesn't touch them; with the hammer Space swings it (one swing per press), smashing whatever is just ahead
// (bone birds included); wings give a second jump in the air.
export const FLOOR = 250, START_X = 64;
const STAND = { w: 24, h: 28 }, DUCK = { w: 34, h: 16 }, BIG = { w: 30, h: 40 }, BIG_DUCK = { w: 44, h: 22 };
const sizeFor = (game, ducking) => (game?.runner?.big ? (ducking ? BIG_DUCK : BIG) : ducking ? DUCK : STAND);
const START_SPEED = 260, MAX_SPEED = 640, ACCELERATION = 5, BIRD_SPEED = 330;
const JUMP = -430, CUT = -250, GRAVITY = 1150, HOLD_GRAVITY = 0.55, DROP = 2600;
const TREES = { small: { w: 16, h: 26 }, large: { w: 22, h: 40 }, pair: { w: 34, h: 26 }, grove: { w: 48, h: 40 } };
// Bird bottoms: low must be jumped, mid must be ducked (or jumped high), high passes over a standing runner.
const BIRD_HEIGHTS = [FLOOR - 4, FLOOR - 26, FLOOR - 58];
// Fireballs run ahead of the pet and bounce along the ground like Mario's; two at a time.
export const MAX_FIRE = 2;
const FIRE_SPEED = 300, FIRE_BOUNCE = -270, FIRE_SIZE = 8, BURN = 0.5;
const POINTS = { tree: 50, bird: 100, smash: 300 };
// One hammer swing: down for this long, smashing what is within REACH px ahead of the pet.
export const SWING_TIME = 0.3;
const REACH = 26;
// Once bone birds fly, this share of the birds are bone.
const BONE_SHARE = 0.45;
const flying = (o) => o.kind === 'bird' || o.kind === 'bone';

export function create(game, carry) {
  return {
    speed: carry?.speed || START_SPEED, distance: 0, gap: 220, obstacles: [], clouds: [{ x: 120, y: 60 }, { x: 330, y: 40 }, { x: 470, y: 80 }], ending: false,
    fireballs: [], puffs: [], popups: [], fireHeld: false, jumpHeld: false, swing: 0,
    player: { x: START_X, y: FLOOR - sizeFor(game).h, ...sizeFor(game), vy: 0, onGround: true, held: false, ducking: false, doubled: false },
  };
}
// Where the pet is drawn (the engine walks it from game to game with this).
export const pose = (st) => ({ x: st.player.x, bottom: st.player.y + st.player.h, ducking: st.player.ducking, onGround: st.player.onGround });

function spawn(st, random, game) {
  const birdsAllowed = st.speed > BIRD_SPEED;
  if (birdsAllowed && random() < 0.28) {
    const bottom = BIRD_HEIGHTS[Math.floor(random() * BIRD_HEIGHTS.length)];
    const kind = game?.runner?.boneBirds && random() < BONE_SHARE ? 'bone' : 'bird';
    st.obstacles.push({ kind, x: 520, y: bottom - 18, w: 30, h: 18, flap: 0 });
  } else {
    const pool = st.speed > 420 ? ['small', 'large', 'pair', 'grove'] : st.speed > 320 ? ['small', 'large', 'pair'] : ['small', 'large'];
    const kind = pool[Math.floor(random() * pool.length)], size = TREES[kind];
    st.obstacles.push({ kind, x: 520, y: FLOOR - size.h, ...size });
  }
  // Like Chrome, the gap grows with speed so jumps stay possible.
  st.gap = (st.speed * 0.55 + 150) * (1 + random() * 0.65);
}

const award = (st, game, o, points) => { game.score += points; st.popups.push({ x: o.x, y: o.y - 6, t: 0, text: String(points) }); };

export function step(st, dt, keys, game, random = Math.random) {
  const p = st.player, runner = game.runner || {}, down = keys.has('ArrowDown');
  // ↑ jumps; Space throws a fireball (fire flower) and swings the hammer (if it has swings left), one per press.
  const jump = keys.has('ArrowUp'), act = keys.has('Space'), pressed = act && !st.fireHeld;
  const jumpPressed = jump && !st.jumpHeld; st.jumpHeld = jump;
  if (pressed && runner.fire && st.fireballs.length < MAX_FIRE) st.fireballs.push({ x: p.x + p.w - 4, y: p.y + p.h * 0.35, vy: 60, spin: 0 });
  if (pressed && runner.hammer > 0) { runner.hammer--; st.swing = SWING_TIME; }
  st.fireHeld = act;
  st.speed = Math.min(MAX_SPEED, st.speed + ACCELERATION * dt);
  st.distance += st.speed * dt;
  if (!st.ending) game.score += dt * st.speed * 0.11;
  // Jump / duck
  if (jump && p.onGround && !p.ducking) { p.vy = JUMP; p.held = true; p.onGround = false; p.doubled = false; }
  // Wings: one more flap in the air.
  else if (jumpPressed && !p.onGround && runner.wings && !p.doubled) { p.vy = JUMP * 0.85; p.held = true; p.doubled = true; }
  if (!jump) p.held = false;
  if (!p.held && p.vy < CUT) p.vy = CUT;
  p.vy += (GRAVITY * (p.held && p.vy < 0 ? HOLD_GRAVITY : 1) + (down && !p.onGround ? DROP : 0)) * dt;
  p.y += p.vy * dt;
  const ducking = down && p.onGround, size = sizeFor(game, ducking);
  if (p.y + p.h >= FLOOR || p.onGround) {
    p.onGround = p.y + p.h >= FLOOR - 0.5;
    if (p.onGround) { p.vy = 0; p.w = size.w; p.h = size.h; p.y = FLOOR - p.h; p.ducking = ducking; }
  }
  // Shrinking (or growing) in the air keeps the feet where they are.
  if (!p.onGround && p.h !== sizeFor(game, false).h) { const s = sizeFor(game, false); p.y += p.h - s.h; p.w = s.w; p.h = s.h; }
  // Obstacles and scenery
  st.gap -= st.speed * dt;
  if (st.gap <= 0 && !st.ending) spawn(st, random, game);
  let hurt = false;
  for (const o of st.obstacles) {
    o.x -= (flying(o) ? st.speed * 1.05 : st.speed) * dt;
    if (flying(o)) o.flap += dt;
    if (o.burn !== undefined) { o.burn += dt; continue; } // burning: harmless, gone in a moment
    const inset = 4;
    // A swing that is down smashes what is just ahead of (or on) the pet.
    if (st.swing > 0 && o.x < p.x + p.w + REACH && o.x + o.w > p.x && p.y < o.y + o.h && p.y + p.h > o.y) { o.hit = true; smash(st, o); award(st, game, o, POINTS.smash); continue; }
    if (!(runner.invincible > 0) && p.x + inset < o.x + o.w - inset && p.x + p.w - inset > o.x + inset && p.y + inset < o.y + o.h && p.y + p.h - 2 > o.y + inset) { o.hit = true; hurt = true; }
  }
  stepFire(st, dt, game);
  st.obstacles = st.obstacles.filter((o) => o.x > -70 && !o.hit && !(o.burn > BURN));
  for (const c of st.clouds) { c.x -= st.speed * 0.12 * dt; if (c.x < -60) { c.x = 540 + random() * 80; c.y = 30 + random() * 70; } }
  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < 0.8);
  return hurt ? 'hurt' : null;
}

function smash(st, o) {
  for (const [vx, vy] of [[-90, -240], [70, -280], [-30, -180], [120, -200]]) st.puffs.push({ x: o.x + o.w / 2, y: o.y + o.h / 2, vx, vy, t: 0, debris: o.kind });
}
// Fireballs bounce along the road; trees and birds catch fire, bone birds just put the fireball out.
function stepFire(st, dt, game) {
  for (const f of st.fireballs) {
    f.x += FIRE_SPEED * dt; f.spin += dt;
    f.vy += GRAVITY * dt; f.y += f.vy * dt;
    if (f.y + FIRE_SIZE >= FLOOR) { f.y = FLOOR - FIRE_SIZE; f.vy = FIRE_BOUNCE; }
    for (const o of st.obstacles) {
      if (f.out || o.burn !== undefined || o.hit || f.x + FIRE_SIZE < o.x || f.x > o.x + o.w || f.y + FIRE_SIZE < o.y || f.y > o.y + o.h) continue;
      f.out = true;
      if (o.kind === 'bone') st.puffs.push({ x: f.x, y: f.y, vx: 0, vy: 0, t: 0, fizzle: true });
      else { o.burn = 0; award(st, game, o, flying(o) ? POINTS.bird : POINTS.tree); }
    }
  }
  st.fireballs = st.fireballs.filter((f) => !f.out && f.x < 520);
  for (const q of st.puffs) { q.t += dt; if (!q.fizzle) { q.vy += GRAVITY * dt; q.x += q.vx * dt; q.y += q.vy * dt; } else q.x -= st.speed * dt; }
  st.puffs = st.puffs.filter((q) => q.t < (q.fizzle ? 0.35 : 0.9));
  st.swing = Math.max(0, (st.swing || 0) - dt);
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
// Bone bird: a bird skeleton — skull with a dark eye socket, beak, a spine and bare rib wings.
function boneBird(ctx, o) {
  const up = Math.floor(o.flap * 8) % 2 === 0, x = o.x, y = o.y, bone = '#ece6d6', shade = '#b8b09c';
  px(ctx, bone, x + 1, y + 5, 9, 7); px(ctx, '#0b1220', x + 3, y + 7, 3, 3); px(ctx, bone, x - 4, y + 8, 5, 2); px(ctx, shade, x - 2, y + 10, 3, 1);
  px(ctx, bone, x + 10, y + 9, 15, 2); for (const k of [12, 16, 20]) px(ctx, shade, x + k, y + 11, 2, 3);
  px(ctx, bone, x + 25, y + 7, 5, 2); px(ctx, bone, x + 25, y + 11, 5, 2);
  if (up) { px(ctx, bone, x + 12, y + 1, 2, 8); px(ctx, bone, x + 16, y - 3, 2, 12); px(ctx, bone, x + 20, y + 1, 2, 8); px(ctx, shade, x + 12, y - 3, 10, 1); }
  else { px(ctx, bone, x + 12, y + 11, 2, 8); px(ctx, bone, x + 16, y + 11, 2, 11); px(ctx, bone, x + 20, y + 11, 2, 7); }
}
// Flames over something burning: flickering tongues that sink as it burns away to charcoal.
function flames(ctx, o, time) {
  const k = 1 - Math.min(1, o.burn / BURN);
  for (let i = 0; i < Math.max(2, o.w / 6); i++) {
    const fx = o.x + (i * 6) % o.w, flick = Math.sin(time * 30 + i * 2) * 3, fh = (o.h * 0.7 + flick) * k + 3;
    px(ctx, '#ff6a1a', fx, o.y + o.h - fh, 5, fh); px(ctx, '#ffd23a', fx + 1, o.y + o.h - fh * 0.6, 3, fh * 0.6);
  }
  px(ctx, '#2a1a12', o.x + o.w * 0.3, o.y + o.h - 4, o.w * 0.4, 4);
}
function fireball(ctx, f) {
  const turn = Math.floor(f.spin * 16) % 4;
  px(ctx, '#ff6a1a', f.x, f.y + 1, FIRE_SIZE, FIRE_SIZE - 2); px(ctx, '#ff6a1a', f.x + 1, f.y, FIRE_SIZE - 2, FIRE_SIZE);
  px(ctx, '#ffd23a', f.x + (turn < 2 ? 2 : 4), f.y + (turn % 2 ? 2 : 4), 3, 3);
}
function obstacle(ctx, o) {
  if (o.kind === 'bone') boneBird(ctx, o);
  else if (o.kind === 'bird') bird(ctx, o);
  else if (o.kind === 'large') pine(ctx, o.x, o.y, o.w, o.h);
  else if (o.kind === 'small') tree(ctx, o.x, o.y, o.w, o.h);
  else if (o.kind === 'pair') { tree(ctx, o.x, o.y + 4, 16, o.h - 4); tree(ctx, o.x + 16, o.y, 18, o.h); }
  else { pine(ctx, o.x, o.y, 22, o.h); tree(ctx, o.x + 20, o.y + 12, 16, o.h - 12); pine(ctx, o.x + 30, o.y + 4, 18, o.h - 4); }
}
export function paint(ctx, st, game, drawRunner) {
  px(ctx, '#0f1828', 0, 0, 500, 280);
  ctx.fillStyle = '#26354d'; for (let i = 0; i < 34; i++) ctx.fillRect((i * 89 + 17) % 500, (i * 53 + 13) % 200, 2, 2);
  ctx.fillStyle = '#e8eef8'; ctx.beginPath(); ctx.arc(420, 46, 13, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#0f1828'; ctx.beginPath(); ctx.arc(426, 42, 11, 0, Math.PI * 2); ctx.fill();
  for (const c of st.clouds) { px(ctx, '#2b3b55', c.x, c.y, 46, 8); px(ctx, '#2b3b55', c.x + 8, c.y - 6, 24, 6); }
  px(ctx, '#3d5068', 0, FLOOR, 500, 2);
  const offset = st.distance % 40;
  ctx.fillStyle = '#2b3b55'; for (let i = 0; i < 14; i++) { ctx.fillRect(i * 40 - offset, FLOOR + 10, 12, 2); ctx.fillRect(i * 40 - offset + 22, FLOOR + 18, 4, 2); }
  const time = st.distance / 100;
  for (const o of st.obstacles) {
    // A burning tree shows through its flames for the first moments, then only flames and charcoal are left.
    if (o.burn === undefined || o.burn < BURN * 0.5) obstacle(ctx, o);
    if (o.burn !== undefined) flames(ctx, o, time);
  }
  for (const f of st.fireballs) fireball(ctx, f);
  for (const q of st.puffs) {
    if (q.fizzle) { const r = 3 + q.t * 28; ctx.globalAlpha = 1 - q.t / 0.35; px(ctx, '#9aa6b8', q.x - r / 2, q.y - r / 2, r, r); ctx.globalAlpha = 1; }
    else px(ctx, q.debris === 'bone' ? '#ece6d6' : q.debris === 'bird' ? '#c9d3e6' : '#2f8a55', q.x, q.y, 5, 5);
  }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
  for (const q of st.popups) ctx.fillText(q.text, q.x, q.y - q.t * 30);
  drawRunner(st.player.x, st.player.y + st.player.h, { ducking: st.player.ducking, onGround: st.player.onGround, swing: st.swing > 0 });
}
