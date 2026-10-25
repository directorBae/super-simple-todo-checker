// Galaga: a wave of 40 flies in along curved paths, settles into a breathing formation, then dives
// at the fighter one by one while firing. Boss Galagas take two hits. Clearing the wave ends the stage.
// Points follow the arcade: bee 50 (100 diving), butterfly 80 (160), boss 150 (400 diving).
const W = 500, H = 280, SHIP_Y = 252, SHIP_SPEED = 190, SHOT_SPEED = 430, ENEMY_SHOT = 190;
const KINDS = { boss: { hp: 2, points: [150, 400] }, butterfly: { hp: 1, points: [80, 160] }, bee: { hp: 1, points: [50, 100] } };

function formation() {
  const slots = [];
  const row = (y, cols, kind) => cols.forEach((col) => slots.push({ kind, col, row: y }));
  row(0, [3, 4, 5, 6], 'boss');
  row(1, [1, 2, 3, 4, 5, 6, 7, 8], 'butterfly');
  row(2, [1, 2, 3, 4, 5, 6, 7, 8], 'butterfly');
  row(3, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'bee');
  row(4, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 'bee');
  return slots;
}
const slotPos = (st, e) => {
  const spread = 1 + Math.sin(st.time * 1.6) * 0.06;
  return { x: W / 2 + (e.col - 4.5) * 22 * spread + Math.sin(st.time * 0.7) * 18, y: 34 + e.row * 18 };
};
// Cubic Bézier for the fly-in loop.
const bezier = (p, t) => {
  const u = 1 - t;
  return { x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x, y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y };
};

export function create() {
  const enemies = formation().map((slot, i) => {
    const group = Math.floor(i / 8), fromLeft = group % 2 === 0;
    const sx = fromLeft ? 120 : 380;
    return { ...slot, ...KINDS[slot.kind], id: i, state: 'waiting', delay: group * 1.1 + (i % 8) * 0.09, t: 0, x: sx, y: -20,
      path: [{ x: sx, y: -20 }, { x: sx, y: 170 }, { x: fromLeft ? 360 : 140, y: 210 }, { x: W / 2, y: 110 }] };
  });
  return { time: 0, ship: { x: W / 2 - 8, w: 16, h: 14, alive: true, respawn: 0 }, shots: [], bullets: [], enemies, diveTimer: 3, stars: Array.from({ length: 60 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % H, s: 20 + (i % 3) * 25 })), booms: [], ending: false };
}

export function step(st, dt, keys, game, random = Math.random) {
  st.time += dt;
  for (const star of st.stars) { star.y += star.s * dt; if (star.y > H) { star.y = 0; star.x = random() * W; } }
  const ship = st.ship;
  let result = null;
  if (!ship.alive) { ship.respawn -= dt; if (ship.respawn <= 0) { ship.alive = true; ship.x = W / 2 - 8; } }
  else {
    ship.x = Math.max(8, Math.min(W - 24, ship.x + (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * SHIP_SPEED * dt));
    // Like the arcade, at most two shots in the air; a fresh press fires.
    const fire = keys.has('Space') || keys.has('ArrowUp');
    if (fire && !st.fireHeld && st.shots.length < 2) st.shots.push({ x: ship.x + 7, y: SHIP_Y - 8 });
    st.fireHeld = fire;
  }
  for (const s of st.shots) s.y -= SHOT_SPEED * dt;
  st.shots = st.shots.filter((s) => s.y > -10);

  // Enemies
  st.diveTimer -= dt;
  const settled = st.enemies.filter((e) => e.state === 'formation');
  if (st.diveTimer <= 0 && settled.length && ship.alive && !st.ending) {
    const pick = settled[Math.floor(random() * settled.length)];
    pick.state = 'diving'; pick.t = 0; pick.fired = 0; pick.dir = pick.x < W / 2 ? 1 : -1; pick.vx = 0;
    st.diveTimer = Math.max(0.7, 2.2 - (40 - st.enemies.length) * 0.03) * (0.7 + random() * 0.6);
  }
  for (const e of st.enemies) {
    const home = slotPos(st, e);
    if (e.state === 'waiting') { e.delay -= dt; if (e.delay <= 0) e.state = 'entering'; continue; }
    if (e.state === 'entering') {
      e.t += dt / 1.9;
      const p = bezier(e.path, Math.min(1, e.t)); e.x = p.x; e.y = p.y;
      if (e.t >= 1) e.state = 'homing';
    } else if (e.state === 'homing' || e.state === 'returning') {
      const dx = home.x - e.x, dy = home.y - e.y, d = Math.hypot(dx, dy), v = 220 * dt;
      if (d <= v) { e.x = home.x; e.y = home.y; e.state = 'formation'; } else { e.x += dx / d * v; e.y += dy / d * v; }
    } else if (e.state === 'formation') { e.x = home.x; e.y = home.y; }
    else if (e.state === 'diving') {
      e.t += dt;
      // Swoop: a loop out to the side, then sweep down toward where the fighter is.
      const target = ship.x + 8;
      if (e.t < 0.6) { e.x += e.dir * 90 * dt; e.y -= 40 * dt; }
      else { e.vx += Math.sign(target - e.x) * 260 * dt; e.vx = Math.max(-150, Math.min(150, e.vx)); e.x += e.vx * dt + Math.sin(e.t * 5) * 40 * dt; e.y += (e.kind === 'boss' ? 120 : 150) * dt; }
      if (e.fired < 2 && e.y > 80 && e.y < 170 && random() < dt * 2.2) {
        e.fired++;
        const dx = target - e.x, dy = SHIP_Y - e.y, d = Math.hypot(dx, dy) || 1;
        st.bullets.push({ x: e.x + 7, y: e.y + 10, vx: dx / d * ENEMY_SHOT * 0.6, vy: ENEMY_SHOT });
      }
      if (e.y > H + 10) { e.y = -20; e.state = 'returning'; }
    }
    // Shots hit enemies
    for (const s of st.shots) {
      if (s.y < e.y + 14 && s.y + 8 > e.y && s.x > e.x - 2 && s.x < e.x + 18 && e.state !== 'waiting') {
        s.y = -100; e.hp--;
        if (e.hp <= 0) {
          const diving = e.state === 'diving';
          const points = e.points[diving ? 1 : 0]; game.score += points; e.dead = true;
          st.booms.push({ x: e.x + 8, y: e.y + 7, t: 0, text: diving ? String(points) : '' });
        }
      }
    }
    // Ramming the fighter
    if (ship.alive && !(game.invincible > 0) && !e.dead && e.state === 'diving' && e.x < ship.x + ship.w && e.x + 16 > ship.x && e.y + 14 > SHIP_Y && e.y < SHIP_Y + ship.h) { e.dead = true; result = 'hurt'; }
  }
  st.enemies = st.enemies.filter((e) => !e.dead);
  for (const b of st.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; if (ship.alive && !(game.invincible > 0) && b.x > ship.x && b.x < ship.x + ship.w && b.y > SHIP_Y && b.y < SHIP_Y + ship.h) { b.y = H + 50; result = 'hurt'; } }
  st.bullets = st.bullets.filter((b) => b.y < H + 10);
  for (const b of st.booms) b.t += dt;
  st.booms = st.booms.filter((b) => b.t < 0.7);
  if (result === 'hurt') {
    st.booms.push({ x: ship.x + 8, y: SHIP_Y + 7, t: 0, big: true });
    ship.alive = false; ship.respawn = 1.2; st.bullets = [];
  }
  if (!st.enemies.length && !st.ending) return 'done';
  return result;
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const SPRITES = {
  ship: ['.......w.......', '.......w.......', '......www......', '......www......', '...r..www..r...', '...r.wwwww.r...', 'r..wwwwrwwww..r', 'r.wwwwrrrwwww.r', 'wwwwwrrwrrwwwww', 'www.wwwwwww.www', 'ww...wwwww...ww', 'w.....w.w.....w'],
  bee: ['....y.y....', '.b..yyy..b.', 'bbb.yyy.bbb', 'bbbyrrrybbb', '.byyrrryyb.', '..yyyyyyy..', '..y.yyy.y..', '.y...y...y.'],
  butterfly: ['...r...r...', '.rrw.w.wrr.', 'rrrwwwwwrrr', 'rr.wbwbw.rr', 'r..wwwww..r', '...wwwww...', '..w..w..w..'],
  boss: ['..g.....g..', '...g...g...', '.ggyyyyygg.', 'gggyoyoyggg', 'ggg.yyy.ggg', 'g.ggggggg.g', 'g.g.....g.g', '..g.....g..'],
};
const COLORS = { w: '#f2f4f8', r: '#e8402e', y: '#f5d23c', b: '#3c6be8', g: '#2fb36a', o: '#e8402e', p: '#9b5cf6' };
function sprite(ctx, rows, x, y, scale, tint) {
  rows.forEach((line, j) => [...line].forEach((c, i) => { if (c !== '.') px(ctx, tint?.[c] || COLORS[c], x + i * scale, y + j * scale, scale, scale); }));
}
export function paint(ctx, st, game) {
  px(ctx, '#05060f', 0, 0, W, H);
  for (const star of st.stars) px(ctx, ['#5b6b9a', '#9fb1e8', '#e9edf8'][star.s > 60 ? 2 : star.s > 40 ? 1 : 0], star.x, star.y, 1, star.s > 40 ? 2 : 1);
  for (const e of st.enemies) {
    if (e.state === 'waiting') continue;
    const flap = Math.floor(st.time * 3 + e.id) % 2 === 0 && e.state === 'formation' ? 0 : 1;
    const tint = e.kind === 'boss' && e.hp === 1 ? { g: '#9b5cf6' } : null;
    sprite(ctx, SPRITES[e.kind], e.x - (flap ? 0 : 0.5), e.y, 1.5, tint);
  }
  for (const s of st.shots) { px(ctx, '#f2f4f8', s.x, s.y, 2, 8); px(ctx, '#e8402e', s.x, s.y + 6, 2, 2); }
  for (const b of st.bullets) { px(ctx, '#f2f4f8', b.x - 1, b.y - 3, 2, 6); px(ctx, '#e8402e', b.x - 1, b.y + 1, 2, 2); }
  if (st.ship.alive && (!(game?.invincible > 0) || Math.floor(st.time * 12) % 2)) sprite(ctx, SPRITES.ship, st.ship.x - 3, SHIP_Y - 4, 1.5);
  for (const b of st.booms) {
    const r = (b.big ? 20 : 10) * Math.min(1, b.t * 5);
    ctx.globalAlpha = 1 - b.t / 0.7;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; px(ctx, k % 2 ? '#f5d23c' : '#e8402e', b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 3, 3); }
    if (b.text) { ctx.fillStyle = '#9fd6ff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.fillText(b.text, b.x - 10, b.y - 8 - b.t * 20); }
    ctx.globalAlpha = 1;
  }
}
