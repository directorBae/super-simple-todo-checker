// Galaga with the pet as the fighter, three stages like the arcade's opening: a wave of 40 flies in along curved
// paths, settles into a breathing formation, then dives at the pet one by one while firing. The pet shoots by itself
// (two shots in the air at a time); ← → move. Boss Galagas take two hits. Every enemy is 100 points; wiping out the
// whole wave moves on to the next game (points never end a stage).
// Stage 1: the first wave. Stage 2: the second-stage entry (two lines from the top, then pairs flying side by
// side) and the Boss Galaga's tractor beam — a boss stops mid-screen and lowers a blue beam; a fighter caught in it
// is carried up (that ship is lost) and sits on top of the boss. Shoot that boss while it is out of formation and
// the fighter comes back down and docks beside the pet: the dual fighter, two ships firing side by side.
// Stage 3: the challenging stage — 40 enemies in 5 groups of 8 loop across the screen and leave without firing;
// 100 a hit, a bonus for a whole group, "PERFECT!" and 10000 for all 40, then the number of hits.
export const ENTRY = 'up';
const W = 500, H = 280, FLOOR = 270, SHIP_SPEED = 190, SHOT_SPEED = 430, ENEMY_SHOT = 190, KILL = 100, GAP = 2;
const SMALL = { w: 26, h: 30 }, BIG = { w: 34, h: 42 };
const sizeFor = (game) => (game?.runner?.big ? BIG : SMALL);
const cellFor = (game) => (game?.runner?.big ? 2.1 : 1.5);
const KINDS = { boss: { hp: 2 }, butterfly: { hp: 1 }, bee: { hp: 1 } };
// Tractor beam: where the boss hovers, how the beam unrolls (in steps, as in the arcade), holds and rolls back up.
const BEAM_Y = 138, BEAM_TOP = BEAM_Y + 12, BEAM_DOWN = 1, BEAM_HOLD = 1.6, BEAM_UP = 0.8;
const CAPTIVE_CELL = 0.75;
// Challenging stage: 100 a hit, a bonus for every whole group of 8, 10000 for all 40.
export const CHALLENGE = { hit: 100, group: 1000, perfect: 10000, results: 3.2 };

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
// Cubic Bézier for the first stage's fly-in loop.
const bezier = (p, t) => {
  const u = 1 - t;
  return { x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x, y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y };
};
// A smooth curve through waypoints (Catmull-Rom) for the longer looping flights.
function spline(pts, t) {
  const n = pts.length - 1, f = Math.max(0, Math.min(1, t)) * n, i = Math.min(n - 1, Math.floor(f)), u = f - i;
  const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
  const c = (a, b, d, e) => 0.5 * (2 * b + (-a + d) * u + (2 * a - 5 * b + 4 * d - e) * u * u + (-a + 3 * b - 3 * d + e) * u * u * u);
  return { x: c(p0.x, p1.x, p2.x, p3.x), y: c(p0.y, p1.y, p2.y, p3.y) };
}
const along = (e, t) => (e.bez ? bezier(e.path, t) : spline(e.path, t));
const mirror = (pts) => pts.map((p) => ({ x: W - p.x, y: p.y }));
const shift = (pts, dx) => pts.map((p) => ({ x: p.x + dx, y: p.y }));
const P = (...xy) => xy.reduce((out, v, i) => (i % 2 ? (out[out.length - 1].y = v, out) : [...out, { x: v, y: 0 }]), []);

// Stage 1: eight at a time from alternating sides along one swooping curve.
function firstWave() {
  return formation().map((slot, i) => {
    const group = Math.floor(i / 8), fromLeft = group % 2 === 0;
    const sx = fromLeft ? 120 : 380;
    return { ...slot, ...KINDS[slot.kind], id: i, state: 'waiting', delay: group * 1.1 + (i % 8) * 0.09, t: 0, x: sx, y: -20, dur: 1.9, bez: true,
      path: [{ x: sx, y: -20 }, { x: sx, y: 170 }, { x: fromLeft ? 360 : 140, y: 210 }, { x: W / 2, y: 110 }] };
  });
}
// Stage 2, the arcade's second-stage entry: the arcade's five groups (centre butterflies and bees; bosses with their
// butterflies; the outer butterflies; the two halves of the bees). The first group comes down from the top in two
// single-file lines at once, one each side; the rest fly in pairs, side by side, looping before they settle.
function secondWave() {
  const slots = formation(), at = (row, col) => slots.findIndex((s) => s.row === row && s.col === col);
  const TOP = P(150, -20, 170, 50, 215, 120, 250, 178, 292, 150, 282, 104, 240, 92);
  const LOW = P(-20, 236, 70, 216, 150, 172, 186, 112, 162, 70, 114, 84, 118, 136, 172, 142);
  const SIDE = P(-20, 56, 62, 88, 150, 158, 232, 186, 292, 150, 272, 100, 220, 88);
  const cols = (rows, list) => rows.flatMap((r) => list.map((c) => [r, c]));
  const plan = [
    { start: 0.3, line: true, members: [[1, 4], [1, 5], [2, 4], [2, 5]], path: TOP },
    { start: 0.3, line: true, members: [[3, 4], [3, 5], [4, 4], [4, 5]], path: mirror(TOP) },
    { start: 2.6, members: [[0, 3], [1, 3], [0, 4], [2, 3], [0, 5], [1, 6], [0, 6], [2, 6]], path: LOW },
    { start: 4.9, members: cols([1, 2], [1, 2, 7, 8]), path: mirror(LOW) },
    { start: 7.2, members: cols([3, 4], [6, 7, 8, 9]), path: SIDE },
    { start: 9.5, members: cols([3, 4], [0, 1, 2, 3]), path: mirror(SIDE) },
  ];
  const enemies = [];
  for (const g of plan) g.members.forEach(([row, col], k) => {
    const i = at(row, col), slot = slots[i];
    const path = g.line ? g.path : shift(g.path, k % 2 ? 7 : -7);
    const delay = g.start + (g.line ? k * 0.16 : Math.floor(k / 2) * 0.22);
    enemies.push({ ...slot, ...KINDS[slot.kind], id: i, state: 'waiting', delay, t: 0, x: path[0].x, y: path[0].y, dur: 2.4, path });
  });
  return enemies.sort((a, b) => a.id - b.id);
}
// Stage 3, the challenging stage: five groups of eight, each on its own scripted loop, in and out again.
function challengeWave() {
  const SPLIT = P(240, -20, 225, 50, 180, 120, 120, 160, 70, 130, 80, 80, 130, 90, 150, 150, 100, 198, -30, 190);
  const RISE = P(-30, 200, 80, 190, 180, 150, 250, 90, 310, 70, 340, 120, 300, 160, 250, 130, 300, 60, 400, 20, 530, -10);
  const SWEEP = P(-30, 30, 80, 60, 170, 110, 220, 168, 270, 190, 320, 150, 290, 100, 240, 120, 300, 170, 420, 140, 530, 110);
  const groups = [
    { start: 0.8, kinds: () => 'bee', paths: [SPLIT, mirror(SPLIT)] },
    { start: 4.6, kinds: (k) => (k % 2 ? 'butterfly' : 'boss'), paths: [RISE] },
    { start: 8.4, kinds: () => 'butterfly', paths: [mirror(RISE)] },
    { start: 12.2, kinds: () => 'bee', paths: [SWEEP] },
    { start: 16.0, kinds: () => 'bee', paths: [mirror(SWEEP)] },
  ];
  const enemies = [];
  groups.forEach((g, n) => {
    for (let k = 0; k < 8; k++) {
      // Two lines split the group in half; one line takes all eight single file.
      const lines = g.paths.length, path = g.paths[k % lines], place = lines > 1 ? Math.floor(k / lines) : k, kind = g.kinds(k);
      enemies.push({ kind, ...KINDS[kind], id: n * 8 + k, group: n, row: 0, col: 0, state: 'waiting', delay: g.start + place * 0.16, t: 0, x: path[0].x, y: path[0].y, dur: 4.2, path });
    }
  });
  return enemies;
}

export function create(game, { stage = 0, lap = 0 } = {}) {
  stage = Math.max(0, Math.min(2, stage));
  const size = sizeFor(game);
  const enemies = stage === 2 ? challengeWave() : stage === 1 ? secondWave() : firstWave();
  const st = { stage, hard: 1 + 0.1 * Math.min(4, Math.floor(lap / 3)), time: 0, ship: { x: W / 2 - size.w / 2, ...size, alive: true, respawn: 0 }, shots: [], bullets: [], enemies, diveTimer: 3,
    stars: Array.from({ length: 60 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % H, s: 20 + (i % 3) * 25 })), booms: [], ending: false,
    dual: false, captive: null, hits: 0, groupHits: [0, 0, 0, 0, 0], result: null,
    banner: { text: stage === 2 ? 'CHALLENGING STAGE' : `STAGE ${stage + 1}`, t: 0, color: '#9fd6ff' } };
  for (const e of enemies) e.dur /= st.hard;
  return st;
}

// The ships the pet flies: one, or two side by side once a captured fighter has been rescued.
const shipXs = (st) => (st.dual ? [st.ship.x, st.ship.x + st.ship.w + GAP] : [st.ship.x]);
const span = (st) => (st.dual ? st.ship.w * 2 + GAP : st.ship.w);
// How far the tractor beam reaches (0 → 1), unrolling and rolling up in steps.
function beamLength(e) {
  if (e.pulling) return 1;
  const t = e.bt;
  if (t < BEAM_DOWN) return Math.floor(t / BEAM_DOWN * 8) / 8;
  if (t < BEAM_DOWN + BEAM_HOLD) return 1;
  return Math.max(0, Math.ceil((1 - (t - BEAM_DOWN - BEAM_HOLD) / BEAM_UP) * 8) / 8);
}
const beamHalf = (y) => 8 + (y - BEAM_TOP) / (FLOOR - BEAM_TOP) * 22;
const BEAM_TIME = BEAM_DOWN + BEAM_HOLD + BEAM_UP;
function glide(e, to, v) {
  const dx = to.x - e.x, dy = to.y - e.y, d = Math.hypot(dx, dy);
  if (d <= v) { e.x = to.x; e.y = to.y; return true; }
  e.x += dx / d * v; e.y += dy / d * v; return false;
}

export function step(st, dt, keys, game, random = Math.random) {
  st.time += dt;
  for (const star of st.stars) { star.y += star.s * dt; if (star.y > H) { star.y = 0; star.x = random() * W; } }
  if (st.banner) { st.banner.t += dt; if (st.banner.t > 1.8) st.banner = null; }
  const ship = st.ship;
  Object.assign(ship, sizeFor(game));
  const top = FLOOR - ship.h, safe = game.runner?.invincible > 0;
  let result = null, captured = false;
  if (!ship.alive) { ship.respawn -= dt; if (ship.respawn <= 0) { ship.alive = true; ship.x = W / 2 - ship.w / 2; } }
  else {
    ship.x = Math.max(8, Math.min(W - span(st) - 8, ship.x + (Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft'))) * SHIP_SPEED * dt));
    // The pet fires by itself: as in the arcade, two shots in the air at most — per ship, so the dual fighter
    // fires pairs, four shots at most.
    st.cool = (st.cool || 0) - dt;
    const xs = shipXs(st);
    if (st.cool <= 0 && xs.every((_, k) => st.shots.filter((s) => (s.ship || 0) === k).length < 2)) {
      xs.forEach((x, k) => st.shots.push({ x: x + ship.w / 2 - 1, y: top - 6, ship: k }));
      st.cool = 0.14;
    }
  }
  for (const s of st.shots) s.y -= SHOT_SPEED * dt;
  st.shots = st.shots.filter((s) => s.y > -10);
  for (const b of st.booms) b.t += dt;
  st.booms = st.booms.filter((b) => b.t < 0.7);
  if (st.stage === 2) return stepChallenge(st, dt, game);

  // Which ship (0 or 1) a box overlaps, or -1.
  const hitShip = (x0, x1, y0, y1, inset = 0) => (ship.alive ? shipXs(st).findIndex((sx) => x1 > sx + inset && x0 < sx + ship.w - inset && y1 > top + inset && y0 < FLOOR) : -1);
  // A hit on one of the dual fighters only loses that ship (the heart went when it was captured).
  const hit = (k) => {
    if (!st.dual) { result = 'hurt'; return; }
    const xs = shipXs(st);
    st.booms.push({ x: xs[k] + ship.w / 2, y: top + ship.h / 2, t: 0, big: true });
    if (k === 0) ship.x = xs[1];
    st.dual = false;
  };

  // Enemies
  st.diveTimer -= dt;
  const settled = st.enemies.filter((e) => e.state === 'formation');
  if (st.diveTimer <= 0 && settled.length && ship.alive && !st.ending) {
    let pick = settled[Math.floor(random() * settled.length)], beam = false;
    if (st.stage === 1) {
      // The boss holding a captured fighter comes down with it often; otherwise a boss may come down to beam.
      const holder = settled.find((e) => e.holding), bosses = settled.filter((e) => e.kind === 'boss');
      const beaming = st.enemies.some((e) => e.state === 'beamDive' || e.state === 'beam' || e.holding);
      if (holder && random() < 0.5) pick = holder;
      else if (bosses.length && !beaming && !st.dual && !st.captive && random() < 0.35) { pick = bosses[Math.floor(random() * bosses.length)]; beam = true; }
    }
    pick.t = 0; pick.fired = 0; pick.dir = pick.x < W / 2 ? 1 : -1; pick.vx = 0;
    if (beam) { pick.state = 'beamDive'; pick.tx = Math.max(30, Math.min(W - 46, ship.x + ship.w / 2 - 8)); }
    else pick.state = 'diving';
    st.diveTimer = Math.max(0.7, 2.2 - (40 - st.enemies.length) * 0.03) * (0.7 + random() * 0.6) / st.hard;
  }
  const captive = st.captive;
  for (const e of st.enemies) {
    const home = slotPos(st, e);
    if (e.state === 'waiting') { e.delay -= dt; if (e.delay <= 0) e.state = 'entering'; continue; }
    if (e.state === 'entering') {
      e.t += dt / e.dur;
      const p = along(e, Math.min(1, e.t)); e.x = p.x; e.y = p.y;
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
        const dx = target - e.x, dy = top - e.y, d = Math.hypot(dx, dy) || 1, speed = ENEMY_SHOT * st.hard;
        st.bullets.push({ x: e.x + 7, y: e.y + 10, vx: dx / d * speed * 0.6, vy: speed });
      }
      if (e.y > H + 10) { e.y = -20; e.state = 'returning'; }
    } else if (e.state === 'beamDive') {
      // The boss peels off, then heads straight for its spot above the fighter and stops there.
      e.t += dt;
      if (e.t < 0.5) { e.x += e.dir * 90 * dt; e.y -= 40 * dt; }
      else if (glide(e, { x: e.tx, y: BEAM_Y }, 140 * dt)) { e.state = 'beam'; e.bt = 0; }
    } else if (e.state === 'beam') {
      e.bt += dt;
      if (!e.pulling && e.bt >= BEAM_TIME) e.state = 'falling';
      // Caught: the fighter is lost and carried up into the boss.
      const reach = BEAM_TOP + beamLength(e) * (FLOOR - BEAM_TOP), cx = ship.x + ship.w / 2;
      if (!e.pulling && ship.alive && !st.dual && !st.captive && !safe && reach >= top + 4 && Math.abs(cx - (e.x + 8)) < beamHalf(top + 4)) {
        e.pulling = true; result = 'hurt'; captured = true;
        ship.alive = false; ship.respawn = 2.8; st.bullets = [];
        st.captive = { mode: 'rising', boss: e, x: cx, y: FLOOR, from: FLOOR, cell: cellFor(game) };
        st.banner = { text: 'FIGHTER CAPTURED', t: 0, color: '#e8402e' };
      }
    } else if (e.state === 'falling') {
      // A beam that caught nothing: the boss drops away below and comes back in from the top.
      e.y += 150 * dt;
      if (e.y > H + 10) { e.y = -20; e.state = 'returning'; }
    }
    // Shots hit enemies
    for (const s of st.shots) {
      if (s.y < e.y + 14 && s.y + 8 > e.y && s.x > e.x - 2 && s.x < e.x + 18 && e.state !== 'waiting') {
        s.y = -100; e.hp--;
        if (e.hp <= 0) {
          game.score += KILL; e.dead = true;
          st.booms.push({ x: e.x + 8, y: e.y + 7, t: 0, text: String(KILL) });
          // A boss shot while it carries the fighter away from the formation lets it go: it comes back down to dock.
          // Shot while sitting in formation, the captured fighter flies off and is gone.
          if ((e.holding || e.pulling) && st.captive?.boss === e) st.captive.mode = e.state === 'formation' ? 'leaving' : 'rescue';
        }
      }
    }
    // Ramming the fighter
    if (!safe && !e.dead && (e.state === 'diving' || e.state === 'falling')) {
      const k = hitShip(e.x, e.x + 16, e.y, e.y + 14);
      if (k >= 0) { e.dead = true; hit(k); }
    }
  }
  st.enemies = st.enemies.filter((e) => !e.dead);
  if (captive && st.captive === captive) stepCaptive(st, dt, top);
  for (const b of st.bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (safe || b.y >= H + 10) continue;
    const k = hitShip(b.x, b.x, b.y, b.y, 3);
    if (k >= 0 && b.y > top + 4) { b.y = H + 50; hit(k); }
  }
  st.bullets = st.bullets.filter((b) => b.y < H + 10);
  // Either way the hit costs a heart (in the engine); a big pet shrinks and keeps flying, a small one is knocked out for a moment.
  if (result === 'hurt' && !captured && !game.runner?.big) {
    st.booms.push({ x: ship.x + ship.w / 2, y: top + ship.h / 2, t: 0, big: true });
    ship.alive = false; ship.respawn = 1.2; st.bullets = [];
  }
  if (!st.enemies.length && st.captive?.mode !== 'rescue' && !st.ending) { st.ending = true; return 'done'; }
  return result;
}

// The captured fighter: carried up the beam, held on top of its boss, set free (down to dock as the second ship),
// or flying off when its boss was shot in formation. It can be shot down while held, and then it is gone.
function stepCaptive(st, dt, top) {
  const c = st.captive, ship = st.ship, boss = c.boss;
  c.spin = (c.spin || 0) + dt;
  if (c.mode === 'rising') {
    const to = { x: boss.x + 8, y: boss.y - 1 };
    c.x += Math.max(-60 * dt, Math.min(60 * dt, to.x - c.x));
    c.y = Math.max(to.y, c.y - 70 * dt);
    if (c.y <= to.y + 0.01) { c.mode = 'held'; boss.pulling = false; boss.holding = true; boss.state = 'homing'; c.spin = 0; }
  } else if (c.mode === 'held') {
    c.x = boss.x + 8; c.y = boss.y - 1;
    for (const s of st.shots) {
      if (s.x > c.x - 8 && s.x < c.x + 8 && s.y < c.y && s.y + 8 > c.y - 14) {
        s.y = -100; boss.holding = false; st.captive = null;
        st.booms.push({ x: c.x, y: c.y - 7, t: 0 });
        return;
      }
    }
  } else if (c.mode === 'rescue') {
    ship.x = Math.min(ship.x, W - 8 - (ship.w * 2 + GAP));
    const dock = { x: (ship.alive ? ship.x : W / 2 - ship.w / 2) + ship.w + GAP + ship.w / 2, y: FLOOR };
    if (glide(c, dock, 150 * dt) && ship.alive) { st.dual = true; st.captive = null; }
  } else if (c.mode === 'leaving') {
    c.y -= 120 * dt;
    if (c.y < -10) st.captive = null;
  }
}

// Challenging stage: the groups fly their loops and leave; nothing fires and nothing dives at the pet.
function stepChallenge(st, dt, game) {
  for (const e of st.enemies) {
    if (e.state === 'waiting') { e.delay -= dt; if (e.delay > 0) continue; e.state = 'flying'; }
    e.t += dt / e.dur;
    const p = along(e, Math.min(1, e.t)); e.x = p.x; e.y = p.y;
    if (e.t >= 1) { e.gone = true; continue; }
    for (const s of st.shots) {
      if (s.y < e.y + 14 && s.y + 8 > e.y && s.x > e.x - 2 && s.x < e.x + 18) {
        s.y = -100; e.hp--;
        if (e.hp > 0) continue;
        e.dead = true; st.hits++; game.score += CHALLENGE.hit;
        st.booms.push({ x: e.x + 8, y: e.y + 7, t: 0, text: String(CHALLENGE.hit) });
        if (++st.groupHits[e.group] === 8) { game.score += CHALLENGE.group; st.booms.push({ x: e.x + 8, y: e.y - 6, t: 0, text: String(CHALLENGE.group) }); }
        break;
      }
    }
  }
  st.enemies = st.enemies.filter((e) => !e.dead && !e.gone);
  if (!st.enemies.length && !st.result) {
    const perfect = st.hits === 40;
    if (perfect) game.score += CHALLENGE.perfect;
    st.result = { t: 0, perfect };
  }
  if (st.result) {
    st.result.t += dt;
    if (st.result.t >= CHALLENGE.results && !st.ending) { st.ending = true; return 'done'; }
  }
  return null;
}

// Where the pet is drawn right now (the drawRunner arguments): the fighter at the bottom, or — while it is being
// carried up the tractor beam — the captured ship on its way to the boss.
export function pose(st, game) {
  const c = st.captive, ship = st.ship, size = sizeFor(game);
  if (!ship.alive && c?.mode === 'rising') {
    const k = Math.min(1, (c.from - c.y) / Math.max(1, c.from - (c.boss.y - 1))), cell = c.cell + (CAPTIVE_CELL - c.cell) * k;
    return { x: c.x - 8.5 * cell, bottom: c.y, cell, flip: Math.floor(c.spin * 10) % 2 === 1, onGround: false };
  }
  const x = ship.alive ? ship.x : W / 2 - size.w / 2;
  return { x: x + 3, bottom: FLOOR, cell: cellFor(game), flip: false, onGround: true };
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
// The tractor beam: bands that widen toward the ground, flickering blue and cyan.
function paintBeam(ctx, st, e) {
  const reach = BEAM_TOP + beamLength(e) * (FLOOR - BEAM_TOP), cx = e.x + 8, shades = ['#3c6be8', '#5fd0ff', '#a7e8ff'];
  for (let y = BEAM_TOP, i = 0; y < reach; y += 3, i++) {
    const half = beamHalf(y);
    ctx.globalAlpha = 0.75;
    px(ctx, shades[(i + Math.floor(st.time * 12)) % 3], cx - half, y, half * 2, 2);
  }
  ctx.globalAlpha = 1;
}
const text = (ctx, s, x, y, color, size = 11) => {
  ctx.fillStyle = color; ctx.font = `bold ${size}px ui-monospace, Consolas, monospace`;
  ctx.fillText(s, Math.round(x - s.length * size * 0.3), y);
};
export function paint(ctx, st, game, drawRunner) {
  px(ctx, '#05060f', 0, 0, W, H);
  for (const star of st.stars) px(ctx, ['#5b6b9a', '#9fb1e8', '#e9edf8'][star.s > 60 ? 2 : star.s > 40 ? 1 : 0], star.x, star.y, 1, star.s > 40 ? 2 : 1);
  for (const e of st.enemies) if (e.state === 'beam') paintBeam(ctx, st, e);
  for (const e of st.enemies) {
    if (e.state === 'waiting') continue;
    const flap = Math.floor(st.time * 3 + e.id) % 2 === 0 && e.state === 'formation' ? 0 : 1;
    const tint = e.kind === 'boss' && e.hp === 1 ? { g: '#9b5cf6' } : null;
    sprite(ctx, SPRITES[e.kind], e.x - (flap ? 0 : 0.5), e.y, 1.5, tint);
  }
  for (const s of st.shots) { px(ctx, '#f2f4f8', s.x, s.y, 2, 8); px(ctx, '#e8402e', s.x, s.y + 6, 2, 2); }
  for (const b of st.bullets) { px(ctx, '#f2f4f8', b.x - 1, b.y - 3, 2, 6); px(ctx, '#e8402e', b.x - 1, b.y + 1, 2, 2); }
  const cell = cellFor(game);
  if (st.ship.alive) for (const x of shipXs(st)) drawRunner?.(x + 3, FLOOR, { onGround: true, cell, flip: false });
  // The captured fighter is the pet too: spinning up the beam, red while the boss holds it, itself again when freed.
  const c = st.captive;
  if (c) {
    const p = c.mode === 'rising' ? pose(st, game) : null, size = p ? p.cell : c.mode === 'rescue' ? cell : CAPTIVE_CELL;
    const x = p ? p.x : c.x - 8.5 * size, flip = Math.floor((c.spin || 0) * 10) % 2 === 1 && c.mode !== 'held';
    drawRunner?.(x, c.y, { onGround: false, cell: size, flip });
    if (c.mode === 'held' || c.mode === 'leaving') {
      ctx.save(); ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = '#ff5a48';
      ctx.fillRect(x - 4 * size, c.y - 23 * size, 24 * size, 24 * size); ctx.restore();
    }
  }
  for (const b of st.booms) {
    const r = (b.big ? 20 : 10) * Math.min(1, b.t * 5);
    ctx.globalAlpha = 1 - b.t / 0.7;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; px(ctx, k % 2 ? '#f5d23c' : '#e8402e', b.x + Math.cos(a) * r, b.y + Math.sin(a) * r, 3, 3); }
    if (b.text) { ctx.fillStyle = '#9fd6ff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.fillText(b.text, b.x - 10, b.y - 8 - b.t * 20); }
    ctx.globalAlpha = 1;
  }
  if (st.banner) text(ctx, st.banner.text, W / 2, 150, st.banner.color, 12);
  // The challenging stage's tally, as the arcade shows it.
  if (st.result) {
    text(ctx, 'NUMBER OF HITS', W / 2 - 24, 120, '#5fd0ff', 12);
    text(ctx, String(st.hits), W / 2 + 76, 120, '#f2f4f8', 12);
    if (st.result.perfect && st.result.t > 0.8) {
      text(ctx, 'PERFECT !', W / 2, 146, '#e8402e', 14);
      text(ctx, `SPECIAL BONUS ${CHALLENGE.perfect} PTS`, W / 2, 170, '#f5d23c', 12);
    }
  }
}
