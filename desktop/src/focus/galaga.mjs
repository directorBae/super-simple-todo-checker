// Galaga with the pet as the fighter: a wave of 40 flies in along curved paths, settles into a breathing
// formation, then dives at the pet one by one while firing. The pet shoots by itself (two shots in the air at
// a time); ← → move. Boss Galagas take two hits. Every enemy is 100 points; wiping out the whole wave
// moves on to the next game.
const W = 500, H = 280, FLOOR = 270, SHIP_SPEED = 190, SHOT_SPEED = 430, ENEMY_SHOT = 190, KILL = 100;
const SMALL = { w: 26, h: 30 }, BIG = { w: 34, h: 42 };
const sizeFor = (game) => (game?.runner?.big ? BIG : SMALL);
const KINDS = { boss: { hp: 2 }, butterfly: { hp: 1 }, bee: { hp: 1 } };

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

export function create(game) {
  const enemies = formation().map((slot, i) => {
    const group = Math.floor(i / 8), fromLeft = group % 2 === 0;
    const sx = fromLeft ? 120 : 380;
    return { ...slot, ...KINDS[slot.kind], id: i, state: 'waiting', delay: group * 1.1 + (i % 8) * 0.09, t: 0, x: sx, y: -20,
      path: [{ x: sx, y: -20 }, { x: sx, y: 170 }, { x: fromLeft ? 360 : 140, y: 210 }, { x: W / 2, y: 110 }] };
  });
  return { time: 0, ship: { x: W / 2 - 13, ...sizeFor(game), alive: true, respawn: 0 }, shots: [], bullets: [], enemies, diveTimer: 3, stars: Array.from({ length: 60 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % H, s: 20 + (i % 3) * 25 })), booms: [], ending: false };
}

export function step(st, dt, keys, game, random = Math.random) {
  st.time += dt;
  for (const star of st.stars) { star.y += star.s * dt; if (star.y > H) { star.y = 0; star.x = random() * W; } }
  const ship = st.ship;
  Object.assign(ship, sizeFor(game));
  const top = FLOOR - ship.h;
  let result = null;
  if (!ship.alive) { ship.respawn -= dt; if (ship.respawn <= 0) { ship.alive = true; ship.x = W / 2 - ship.w / 2; } }
  else {
    ship.x = Math.max(8, Math.min(W - ship.w - 8, ship.x + (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * SHIP_SPEED * dt));
    // The pet fires by itself: as in the arcade, two shots in the air at most.
    st.cool = (st.cool || 0) - dt;
    if (st.shots.length < 2 && st.cool <= 0) { st.shots.push({ x: ship.x + ship.w / 2 - 1, y: top - 6 }); st.cool = 0.14; }
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
      const target = ship.x + ship.w / 2;
      if (e.t < 0.6) { e.x += e.dir * 90 * dt; e.y -= 40 * dt; }
      else { e.vx += Math.sign(target - e.x) * 260 * dt; e.vx = Math.max(-150, Math.min(150, e.vx)); e.x += e.vx * dt + Math.sin(e.t * 5) * 40 * dt; e.y += (e.kind === 'boss' ? 120 : 150) * dt; }
      if (e.fired < 2 && e.y > 80 && e.y < 170 && random() < dt * 2.2) {
        e.fired++;
        const dx = target - e.x, dy = top - e.y, d = Math.hypot(dx, dy) || 1;
        st.bullets.push({ x: e.x + 7, y: e.y + 10, vx: dx / d * ENEMY_SHOT * 0.6, vy: ENEMY_SHOT });
      }
      if (e.y > H + 10) { e.y = -20; e.state = 'returning'; }
    }
    // Shots hit enemies
    for (const s of st.shots) {
      if (s.y < e.y + 14 && s.y + 8 > e.y && s.x > e.x - 2 && s.x < e.x + 18 && e.state !== 'waiting') {
        s.y = -100; e.hp--;
        if (e.hp <= 0) {
          game.score += KILL; e.dead = true;
          st.booms.push({ x: e.x + 8, y: e.y + 7, t: 0, text: String(KILL) });
        }
      }
    }
    // Ramming the fighter
    if (ship.alive && !(game.runner?.invincible > 0) && !e.dead && e.state === 'diving' && e.x < ship.x + ship.w && e.x + 16 > ship.x && e.y + 14 > top && e.y < FLOOR) { e.dead = true; result = 'hurt'; }
  }
  st.enemies = st.enemies.filter((e) => !e.dead);
  for (const b of st.bullets) { b.x += b.vx * dt; b.y += b.vy * dt; if (ship.alive && !(game.runner?.invincible > 0) && b.x > ship.x + 3 && b.x < ship.x + ship.w - 3 && b.y > top + 4 && b.y < FLOOR) { b.y = H + 50; result = 'hurt'; } }
  st.bullets = st.bullets.filter((b) => b.y < H + 10);
  for (const b of st.booms) b.t += dt;
  st.booms = st.booms.filter((b) => b.t < 0.7);
  // Either way the hit costs a heart (in the engine); a big pet shrinks and keeps flying, a small one is knocked out for a moment.
  if (result === 'hurt' && !game.runner?.big) {
    st.booms.push({ x: ship.x + ship.w / 2, y: top + ship.h / 2, t: 0, big: true });
    ship.alive = false; ship.respawn = 1.2; st.bullets = [];
  }
  if (!st.enemies.length && !st.ending) { st.ending = true; return 'done'; }
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
export function paint(ctx, st, game, drawRunner) {
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
  if (st.ship.alive) drawRunner?.(st.ship.x + 3, FLOOR, { onGround: true });
  for (const b of st.booms) {
    const r = (b.big ? 20 : 10) * Math.min(1, b.t * 5);
    ctx.globalAlpha = 1 - b.t / 0.7;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; px(ctx, k % 2 ? '#f5d23c' : '#e8402e', b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 3, 3); }
    if (b.text) { ctx.fillStyle = '#9fd6ff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.fillText(b.text, b.x - 10, b.y - 8 - b.t * 20); }
    ctx.globalAlpha = 1;
  }
}
