// Reverse Mario: you are Bowser on the castle bridge over lava, guarding the axe.
// Heroes run in from the left, hop over low flames, and fire heroes throw bouncing fireballs back.
// ← → walk, ↑ jump (landing on a hero stomps it), Space breathes fire at mouth height. Ten heroes ends the stage.
const W = 500, BRIDGE_Y = 214, LEFT = 230, RIGHT = 430, AXE_X = 452, HEROES = 10;
const GRAVITY = 1150, JUMP = -400, WALK = 120;
const FIRE_SPEED = 230, FIRE_COOLDOWN = 0.55;

export function create() {
  return {
    time: 0, spawn: 1.2, sent: 0, beaten: 0, flames: [], balls: [], heroes: [], popups: [], fireHeld: false, cooldown: 0, ending: false,
    bowser: { x: 360, y: BRIDGE_Y - 40, w: 36, h: 40, vy: 0, onGround: true, mouth: 0, face: -1 },
  };
}

function spawnHero(st, random) {
  const fire = st.sent >= 3 && random() < 0.35;
  st.heroes.push({ x: -20, y: BRIDGE_Y - (fire ? 28 : 20), w: 14, h: fire ? 28 : 20, vx: 70 + random() * 30 + st.sent * 3, vy: 0, onGround: true, fire, throwIn: 1 + random() * 1.5, step: 0, brave: random() });
  st.sent++;
  st.spawn = Math.max(1.1, 2.6 - st.sent * 0.12) * (0.75 + random() * 0.5);
}

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export function step(st, dt, keys, game, random = Math.random) {
  st.time += dt;
  const b = st.bowser;
  let result = null;
  // Bowser
  const dir = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'));
  b.x = Math.max(LEFT, Math.min(RIGHT, b.x + dir * WALK * dt));
  if (keys.has('ArrowUp') && b.onGround) { b.vy = JUMP; b.onGround = false; }
  const prevBottom = b.y + b.h;
  b.vy += GRAVITY * dt; b.y += b.vy * dt;
  if (b.y + b.h >= BRIDGE_Y) { b.y = BRIDGE_Y - b.h; b.vy = 0; b.onGround = true; }
  st.cooldown -= dt; b.mouth = Math.max(0, b.mouth - dt);
  const fire = keys.has('Space');
  if (fire && !st.fireHeld && st.cooldown <= 0 && st.flames.length < 2) {
    st.flames.push({ x: b.x - 26, y: b.y + 20, w: 26, h: 8, t: 0 }); st.cooldown = FIRE_COOLDOWN; b.mouth = 0.25;
  }
  st.fireHeld = fire;
  for (const f of st.flames) { f.x -= FIRE_SPEED * dt; f.t += dt; }
  st.flames = st.flames.filter((f) => f.x > -40);

  // Heroes
  st.spawn -= dt;
  if (st.spawn <= 0 && st.sent < HEROES && !st.ending) spawnHero(st, random);
  for (const h of st.heroes) {
    // Hop over a low flame coming at them (high flames are run under); braver heroes leave it later.
    if (h.onGround) {
      const threat = st.flames.find((f) => f.x - (h.x + h.w) < 46 + h.brave * 30 && f.x + f.w > h.x && f.y + f.h > h.y + 4);
      if (threat && random() < 0.92) { h.vy = -380; h.onGround = false; }
      // Close to Bowser, some try to vault him.
      else if (b.x - (h.x + h.w) < 34 && b.x > h.x && h.brave > 0.55) { h.vy = -470; h.onGround = false; }
    }
    h.vy += GRAVITY * dt; h.y += h.vy * dt; h.x += h.vx * dt; h.step += dt;
    if (h.y + h.h >= BRIDGE_Y) { h.y = BRIDGE_Y - h.h; h.vy = 0; h.onGround = true; }
    if (h.fire) {
      h.throwIn -= dt;
      if (h.throwIn <= 0 && b.x - h.x < 260) { st.balls.push({ x: h.x + h.w, y: h.y + 8, vx: 200, vy: 0 }); h.throwIn = 1.6 + random(); }
    }
    for (const f of st.flames) if (!h.dead && overlap(f, h)) {
      h.dead = true; f.x = -100;
      const points = h.fire ? 200 : 100; game.score += points; st.beaten++;
      st.popups.push({ x: h.x, y: h.y - 8, t: 0, text: String(points) });
    }
    if (h.dead) continue;
    if (overlap(b, h)) {
      // Coming down on a hero squashes it; any other touch hurts Bowser.
      if (b.vy > 0 && prevBottom <= h.y + 6) { h.dead = true; b.vy = -260; game.score += 200; st.beaten++; st.popups.push({ x: h.x, y: h.y - 8, t: 0, text: '200' }); }
      else { h.dead = true; st.beaten++; result = 'hurt'; }
    }
    if (!h.dead && h.x > AXE_X) { h.dead = true; st.beaten++; result = 'hurt'; }
  }
  st.heroes = st.heroes.filter((h) => !h.dead);
  // Fireballs bounce along the bridge.
  for (const ball of st.balls) {
    ball.vy += GRAVITY * 0.8 * dt; ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    if (ball.y + 6 >= BRIDGE_Y) { ball.y = BRIDGE_Y - 6; ball.vy = -220; }
    if (overlap({ x: ball.x, y: ball.y, w: 6, h: 6 }, b)) { ball.x = W + 50; result = 'hurt'; }
    for (const f of st.flames) if (overlap({ x: ball.x, y: ball.y, w: 6, h: 6 }, f)) ball.x = W + 50;
  }
  st.balls = st.balls.filter((ball) => ball.x < W + 20);
  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < 0.8);
  if (st.beaten >= HEROES && !st.heroes.length && !st.ending) return 'done';
  return result;
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function sprite(ctx, rows, colors, x, y, scale, flip) {
  const width = rows[0].length;
  rows.forEach((line, j) => [...line].forEach((c, i) => { if (c !== '.') px(ctx, colors[c], x + (flip ? width - 1 - i : i) * scale, y + j * scale, scale, scale); }));
}
const BOWSER = [
  '......hh..hh....',
  '.....hhhhhhh....',
  '...ggggghhh.....',
  '..gwgggggg.sss..',
  'ggggggggg.sssss.',
  'gggrr.gg.sssssss',
  '.ggggggg.ssssss.',
  '..yyyy..ssssssss',
  '..yyyyy.ssssssss',
  '.gyyyy.sssssss..',
  '.ggyy..ggsssss..',
  '..gg...gg.ss....',
  '.ggg..ggg.......',
];
const BOWSER_COLORS = { g: '#2fa84f', h: '#f2e2b4', w: '#ffffff', r: '#e8402e', y: '#f5d23c', s: '#2c7a3a' };
const HERO = ['..rrrrr..', '.rrrrrrrr', '.bbbsss..', 'bsbssssss', 'bsbbssss.', '..ssssss.', '.rrbrr...', 'rrrbbrrr.', 'ssbybby..', '..bbbbb..', '.bb..bb..'];
const HERO_COLORS = { r: '#e8402e', b: '#6b3a10', s: '#f4b880', y: '#f5d23c' };
const FIRE_HERO_COLORS = { r: '#ffffff', b: '#e8402e', s: '#f4b880', y: '#f5d23c' };

export function paint(ctx, st, game) {
  px(ctx, '#000', 0, 0, W, 280);
  // Castle bricks
  for (let y = 0; y < 120; y += 16) for (let x = (y / 16) % 2 ? -10 : 0; x < W; x += 20) { px(ctx, '#3a3a3a', x, y, 19, 15); px(ctx, '#565656', x, y, 19, 2); }
  for (let y = 120; y < BRIDGE_Y - 60; y += 16) for (let x = 0; x < 40; x += 20) px(ctx, '#3a3a3a', x, y, 19, 15);
  // Bridge (chain-linked planks) and the axe
  for (let x = 0; x < AXE_X + 8; x += 12) { px(ctx, '#c84c0c', x, BRIDGE_Y, 11, 8); px(ctx, '#f0a070', x, BRIDGE_Y, 11, 2); }
  for (let x = 6; x < AXE_X; x += 24) px(ctx, '#9aa3ad', x, BRIDGE_Y - 4, 3, 4);
  px(ctx, '#3a3a3a', AXE_X + 8, BRIDGE_Y, W - AXE_X - 8, 66);
  px(ctx, '#6b3a10', AXE_X + 18, BRIDGE_Y - 34, 3, 34);
  px(ctx, '#c9d3e6', AXE_X + 10, BRIDGE_Y - 36, 10, 12); px(ctx, '#ffffff', AXE_X + 10, BRIDGE_Y - 36, 3, 12);
  // Lava
  for (let x = 0; x < AXE_X + 8; x += 4) {
    const wave = Math.sin(x / 18 + st.time * 3) * 3;
    px(ctx, '#e8402e', x, BRIDGE_Y + 30 + wave, 4, 60);
    px(ctx, '#f5a33c', x, BRIDGE_Y + 30 + wave, 4, 3);
  }
  // Heroes
  for (const h of st.heroes) {
    const frame = h.onGround ? Math.floor(h.step * 10) % 2 : 1;
    sprite(ctx, HERO, h.fire ? FIRE_HERO_COLORS : HERO_COLORS, h.x - 1, h.y + (h.fire ? 6 : -2) + (frame ? 0 : 1), 2);
  }
  // Bowser (blinks while recovering)
  const b = st.bowser;
  if (!(game?.invincible > 0) || Math.floor(st.time * 12) % 2) {
    sprite(ctx, BOWSER, BOWSER_COLORS, b.x - 4, b.y + 1, 3, false);
    if (b.mouth > 0) px(ctx, '#f5a33c', b.x - 6, b.y + 20, 6, 6);
  }
  // Fire breath and fireballs
  for (const f of st.flames) {
    const flick = Math.floor(f.t * 16) % 2;
    px(ctx, '#e8402e', f.x, f.y + 1, f.w, f.h - 2); px(ctx, '#f5a33c', f.x + 4, f.y + (flick ? 0 : 2), f.w - 8, 4); px(ctx, '#fff2a8', f.x + 2, f.y + 3, 6, 2);
  }
  for (const ball of st.balls) { px(ctx, '#f5a33c', ball.x, ball.y, 6, 6); px(ctx, '#fff2a8', ball.x + 1, ball.y + 1, 2, 2); }
  ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
  for (const q of st.popups) ctx.fillText(q.text, q.x, q.y - q.t * 30);
  // Remaining heroes, like the arcade's enemy tally
  for (let i = 0; i < HEROES - st.beaten; i++) px(ctx, '#e8402e', W - 16 - i * 8, 268, 5, 5);
}
