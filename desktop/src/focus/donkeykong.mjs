// Donkey Kong (1981) with the pet as Jumpman: three boards, each ending the arcade's way.
//   25m  — slanted girders, broken ladders, DK rolling barrels (some take ladders), the blue barrel that lights
//          the oil drum and lets fireballs out, two hammers. Reach Pauline at the top.
//   75m  — the elevators: lifts rising in one shaft and sinking in the other, springs DK bounces along the top
//          girder that drop down the right side, foxfires, Pauline's hat / purse / umbrella. Reach Pauline.
//   100m — rivets: walk (or jump) over all eight yellow rivets; each leaves a gap you must jump from then on.
//          The last one brings the structure down and DK falls on his head.
// The arcade board is portrait (224 px wide), so x is doubled to 448 px and the floors are ~40 px apart.
// ← → walk, ↑ ↓ climb, Space jumps (committed arcade jump; falling more than about a girder = 'fell').
// A hit costs a heart (the engine blinks the pet) and whatever hit it bursts; the pet carries on from the
// same spot. A fall puts the pet back at the start and clears the barrels / springs (rivets stay pulled).
import { giveHammer } from './runner.mjs';

export const ENTRY = 'right';
export const W = 500, H = 280, X0 = 26, X1 = 474;
const THICK = 7, WALK = 80, CLIMB = 42, GRAVITY = 800, JUMP_V = 185, MAX_FALL = 420;
// Falls longer than this (from the top of the arc to the landing) are deadly — a jump on flat ground falls ~21,
// stepping off any girder end ~30.
export const FALL_LIMIT = 26;
export const HAMMER_TIME = 8;
const BARREL_SPEED = 100, BARREL_LADDER = 70, FIRE_SPEED = 28, FOX_SPEED = 34, SPRING_HOP = 190, SPRING_RUN = 85;
// The arcade's bonus timer: counts down 100 every 2 s; what is left is paid when the board is cleared.
export const BONUS_START = 5000, BONUS_STEP = 100, BONUS_EVERY = 2;
const GAP = 5; // half-width of the hole a pulled rivet leaves
// Hammers hang just above head height: walking under one misses it, a jump grabs it (as in the arcade).
const HAMMER_HANG = 22;
// Hammer smashes pay one of these at random, as in the arcade; jumping over 1 / 2 / 3+ things in one jump.
const SMASH_POINTS = [300, 500, 800], JUMP_POINTS = [0, 100, 300, 500];
const ITEM_POINTS = [300, 500, 800, 800];

// ---------- geometry ----------
// A girder piece: top surface from (x0, y0) to (x1, y1); `roll` is the way barrels roll on it (to the low end).
const seg = (level, x0, x1, y0, y1 = y0, roll = 0) => ({ level, x0, x1, y0, y1, roll, gaps: [] });
export const surfaceAt = (s, x) => s.y0 + (s.y1 - s.y0) * (x - s.x0) / (s.x1 - s.x0 || 1);
const holds = (s, x) => !!s && !s.gone && !s.wrapped && x >= s.x0 && x <= s.x1 && !s.gaps.some((g) => Math.abs(x - g) < GAP);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const supports = (st, lifts = true) => (lifts && st.lifts.length ? st.girders.concat(st.lifts) : st.girders);
function supportNear(st, x, y, tol, lifts = true) {
  let best = null, d = tol;
  for (const s of supports(st, lifts)) if (holds(s, x)) { const e = Math.abs(surfaceAt(s, x) - y); if (e <= d) { d = e; best = s; } }
  return best;
}
// The highest surface crossed while moving down from prevY to y.
function landing(st, x, prevY, y, lifts = true) {
  let best = null, by = Infinity;
  for (const s of supports(st, lifts)) if (holds(s, x)) { const sy = surfaceAt(s, x); if (prevY <= sy + 3 && y >= sy && sy < by) { by = sy; best = s; } }
  return best;
}
const levelY = (girders, level, x) => { const s = girders.find((g) => g.level === level && x >= g.x0 - 0.01 && x <= g.x1 + 0.01); return s ? surfaceAt(s, x) : null; };
const overlap = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

// ---------- the three boards ----------
// Ladders are [x, from level, to level, broken]. Positions follow the arcade boards (arcade x × 2 + 26).
const BOARDS = {
  // 25m: each girder tilts toward the gap at its low end, so barrels zig-zag all the way down to the oil drum.
  '25m': {
    girders: () => [
      seg(0, 26, 250, 272, 272, -1), seg(0, 250, 474, 272, 264, -1),
      seg(1, 26, 442, 226, 234, 1),
      seg(2, 58, 474, 196, 188, -1),
      seg(3, 26, 442, 148, 156, 1),
      seg(4, 58, 474, 116, 108, -1),
      seg(5, 26, 250, 72, 72, 1), seg(5, 250, 442, 72, 78, 1),
      seg(6, 200, 300, 38),
    ],
    ladders: [[186, 0, 1, true], [394, 0, 1], [90, 1, 2], [218, 1, 2], [362, 1, 2, true], [154, 2, 3, true], [250, 2, 3], [394, 2, 3],
      [90, 3, 4], [170, 3, 4], [362, 3, 4, true], [154, 4, 5, true], [394, 4, 5], [282, 5, 6]],
    // The two tall ladders DK climbed up with Pauline (scenery: they lead nowhere).
    deco: [[154, 72, 4], [186, 72, 4]],
    hammers: [[400, 1], [98, 4]], goal: 6, pauline: 214, dk: [98, 72], start: 94, colors: { girder: '#e8285c', ladder: '#3cd8f0' },
  },
  // 75m: the left shaft lifts go up, the right shaft lifts go down; the springs fall past the right-hand ladders.
  '75m': {
    girders: () => [
      seg(0, 26, 474, 272), seg(1, 26, 120, 200), seg(2, 26, 96, 140), seg(3, 178, 270, 150), seg(4, 200, 256, 104),
      seg(5, 330, 400, 214), seg(6, 360, 474, 172), seg(7, 400, 474, 130), seg(8, 26, 440, 72), seg(9, 200, 300, 38),
    ],
    ladders: [[100, 0, 1], [40, 1, 2], [228, 3, 4], [380, 5, 6], [460, 6, 7], [432, 7, 8], [250, 8, 9]],
    deco: [], hammers: [], goal: 9, pauline: 214, dk: [40, 72], start: 34, colors: { girder: '#e8602c', ladder: '#f8c838' },
    shafts: [{ x0: 137, x1: 167, top: 100, bottom: 262, dir: -1 }, { x0: 285, x1: 315, top: 100, bottom: 262, dir: 1 }],
    items: [['hat', 222, 4], ['purse', 52, 2], ['umbrella', 456, 7]],
    foxes: [[240, 3], [420, 6]],
  },
  // 100m: floors narrow toward the top; two rivets per floor on the four upper floors.
  '100m': {
    girders: () => [seg(0, 26, 474, 272), seg(1, 42, 458, 232), seg(2, 58, 442, 192), seg(3, 74, 426, 152), seg(4, 90, 410, 112), seg(5, 196, 304, 66)],
    ladders: [[66, 0, 1], [250, 0, 1], [434, 0, 1], [82, 1, 2], [418, 1, 2], [98, 2, 3], [250, 2, 3], [402, 2, 3], [114, 3, 4], [194, 3, 4], [306, 3, 4], [386, 3, 4]],
    deco: [], hammers: [[450, 1], [80, 3]], goal: null, pauline: 236, dk: [230, 112], start: 34, colors: { girder: '#2c48e0', ladder: '#f8c838' },
    rivets: [130, 370],
  },
};
const KINDS = ['25m', '75m', '100m'];

// ---------- the pet ----------
// The pet is drawn at cell 1.0 (1.2 when big) so it fits between the girders; x is drawRunner's x, y its feet.
const dims = (game) => { const cell = game?.runner?.big ? 1.2 : 1; return { cell, w: 18 * cell, h: 20 * cell }; };
const invincible = (game) => game?.runner?.invincible > 0;
function placePet(st, game) {
  const { w } = dims(game), x = st.board.start, s = supportNear(st, x + w / 2, 272, 20, false);
  st.pet = { x, y: surfaceAt(s, x + w / 2), on: s, mode: 'walk', vx: 0, vy: 0, face: 1, peak: 0, takeoff: 0, ladder: null, hammer: 0, walking: false, jumpHeld: false, cleared: new Set() };
}

export function create(game, { stage = 0, lap = 0 } = {}) {
  const kind = KINDS[((stage % 3) + 3) % 3], board = BOARDS[kind];
  const tier = Math.min(3, Math.floor(Math.max(0, lap) / 3)); // every pass through the three boards is a level up
  const girders = board.girders();
  const st = {
    kind, board, tier, hard: 1 + 0.12 * tier, time: 0, girders, lifts: [], hazards: [], popups: [], puffs: [],
    ladders: [
      ...board.ladders.map(([x, lo, hi, broken = false]) => ({ x, lo, hi, broken, bot: levelY(girders, lo, x), top: levelY(girders, hi, x) })),
      ...board.deco.map(([x, bot, top]) => ({ x, bot, top, deco: true })),
    ],
    hammers: board.hammers.map(([x, level]) => ({ x, y: levelY(girders, level, x) - HAMMER_HANG, taken: false })),
    items: (board.items || []).map(([item, x, level]) => ({ item, x, y: levelY(girders, level, x), taken: false })),
    rivets: (board.rivets || []).flatMap((x) => [1, 2, 3, 4].map((level) => ({ x, level, y: levelY(girders, level, x), pulled: false, armed: 0 }))),
    bonus: BONUS_START + 1000 * tier, bonusClock: 0, thrown: 0, spawnClock: 3,
    dk: { x: board.dk[0], y: board.dk[1], w: 40, h: 32, phase: 'idle', t: 0, wait: 0.8, vy: 0, beat: 0 },
    oil: kind === '25m' ? { x: 42, y: 272, w: 24, h: 24, lit: false, flare: 0 } : null,
    outro: null,
  };
  st.bonusStart = st.bonus;
  for (const sh of board.shafts || []) for (let i = 0; i < 3; i++) {
    const y = sh.top + i * (sh.bottom - sh.top) / 3;
    st.lifts.push({ level: -1, lift: true, shaft: sh, x0: sh.x0, x1: sh.x1, y0: y, y1: y, gaps: [], dy: 0, wrapped: false });
  }
  for (const [x, level] of board.foxes || []) st.hazards.push(fire(st, x, levelY(girders, level, x), true));
  placePet(st, game);
  return st;
}

// Exactly what paint() hands drawRunner for the pet right now (the engine slides the pet in and out with it).
export function pose(st, game) {
  const p = st.pet;
  return { x: p.x, bottom: p.y, cell: dims(game).cell, flip: p.face < 0, onGround: p.mode === 'walk' || p.mode === 'climb' };
}

function startFall(p) { Object.assign(p, { mode: 'fall', vy: 0, vx: 0, peak: p.y, on: null }); }

function stepPet(st, dt, keys, game) {
  const p = st.pet, { w } = dims(game), cx = () => p.x + w / 2;
  const dir = Number(keys.has('ArrowRight')) - Number(keys.has('ArrowLeft')), up = keys.has('ArrowUp'), down = keys.has('ArrowDown');
  const jump = keys.has('Space') && !p.jumpHeld; p.jumpHeld = keys.has('Space');
  p.hammer = Math.max(0, p.hammer - dt);
  p.walking = false;
  if (p.mode === 'walk') {
    if (p.on?.lift) { if (p.on.wrapped) { startFall(p); return null; } p.y += p.on.dy; }
    const armed = p.hammer > 0; // with the hammer the pet can't climb or jump, as in the arcade
    if (!armed && (up || down)) {
      const l = st.ladders.find((l) => !l.deco && Math.abs(cx() - l.x) <= 6 && (up ? Math.abs(p.y - l.bot) <= 4 : !l.broken && Math.abs(p.y - l.top) <= 4));
      if (l) { Object.assign(p, { mode: 'climb', ladder: l, on: null, x: l.x - w / 2, y: up ? l.bot : l.top }); return null; }
    }
    if (!armed && jump) { Object.assign(p, { mode: 'jump', vy: -JUMP_V, vx: dir * WALK, peak: p.y, takeoff: p.y, on: null, cleared: new Set() }); if (dir) p.face = dir; return null; }
    if (dir) { p.face = dir; p.walking = true; }
    p.x = clamp(p.x + dir * WALK * dt, X0, X1 - w);
    const s = holds(p.on, cx()) && Math.abs(surfaceAt(p.on, cx()) - p.y) <= 5 ? p.on : supportNear(st, cx(), p.y, 5);
    if (s) { p.on = s; p.y = surfaceAt(s, cx()); } else startFall(p); // walking off an edge drops straight down
  } else if (p.mode === 'climb') {
    const l = p.ladder, highest = l.broken ? l.bot - (l.bot - l.top) * 0.35 : l.top;
    if (up) p.y = Math.max(highest, p.y - CLIMB * dt);
    else if (down) p.y = Math.min(l.bot, p.y + CLIMB * dt);
    p.walking = up || down;
    if (up && !l.broken && p.y <= l.top + 0.01) Object.assign(p, { mode: 'walk', on: supportNear(st, l.x, l.top, 2, false), y: l.top });
    else if (down && p.y >= l.bot - 0.01) Object.assign(p, { mode: 'walk', on: supportNear(st, l.x, l.bot, 2, false), y: l.bot });
    if (p.mode === 'walk' && !p.on) startFall(p);
  } else {
    const prev = p.y;
    p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    p.x += p.vx * dt;
    if (p.x < X0 || p.x > X1 - w) { p.x = clamp(p.x, X0, X1 - w); p.vx = -p.vx; } // bounces off the cabinet sides
    p.y += p.vy * dt; p.peak = Math.min(p.peak, p.y);
    if (p.vy > 0) {
      const s = landing(st, cx(), prev, p.y);
      if (s) {
        p.y = surfaceAt(s, cx());
        if (p.y - p.peak > FALL_LIMIT) return 'fell';
        const n = Math.min(3, p.mode === 'jump' ? p.cleared.size : 0);
        if (n) { game.score += JUMP_POINTS[n]; st.popups.push({ x: p.x, y: p.y - 24, t: 0, text: String(JUMP_POINTS[n]) }); }
        Object.assign(p, { mode: 'walk', on: s, vx: 0, vy: 0 });
      }
    }
    if (p.y > H + 30) return 'fell';
  }
  return null;
}

// ---------- hazards ----------
const barrel = (x, y, extra) => ({ kind: 'barrel', x, y, w: 14, h: 11, mode: 'roll', on: null, vx: 0, vy: 0, spin: 0, bounced: false, skip: new Set(), blue: false, ...extra });
function fire(st, x, y, fox, extra) {
  const s = supportNear(st, x + 6, y, 3, false);
  return { kind: 'fire', fox, x, y, w: 12, h: 14, mode: s ? 'walk' : 'hop', on: s, dir: 1, vx: 0, vy: 0, think: 0, ladder: null, target: 0, ...extra };
}

function throwThing(st, random) {
  const dk = st.dk, n = st.thrown++;
  if (st.kind === '25m') {
    if (st.hazards.filter((h) => h.kind === 'barrel').length >= 8) return;
    // The first barrel of the board is the wild blue one: straight down through the girders into the oil drum.
    if (n === 0) st.hazards.push(barrel(74, dk.y, { mode: 'wild', blue: true }));
    else st.hazards.push(barrel(dk.x + dk.w + 2, dk.y, { on: supportNear(st, dk.x + dk.w + 9, dk.y, 2, false), blue: n % 6 === 0 }));
  } else if (st.kind === '75m') {
    st.hazards.push({ kind: 'spring', x: dk.x + dk.w + 2, y: dk.y, w: 16, h: 12, vx: SPRING_RUN * st.hard, vy: -SPRING_HOP, mode: 'bounce', squash: 0 });
  }
}
function stepDK(st, dt, random) {
  const dk = st.dk; dk.t += dt; dk.beat += dt;
  if (st.kind === '100m') return; // on the rivets DK only beats his chest
  if (dk.phase === 'idle' && dk.t >= dk.wait) { dk.phase = 'grab'; dk.t = 0; }
  else if (dk.phase === 'grab' && dk.t >= 0.3) { dk.phase = 'hold'; dk.t = 0; }
  else if (dk.phase === 'hold' && dk.t >= 0.3) {
    dk.phase = 'idle'; dk.t = 0;
    dk.wait = (st.kind === '25m' ? 1.3 + random() * 1.7 : 2.0 + random() * 1.2) / st.hard;
    throwThing(st, random);
  }
}

function stepBarrel(st, b, dt, random) {
  const speed = BARREL_SPEED * st.hard, p = st.pet;
  if (b.mode === 'wild') {
    b.y += 110 * dt; b.spin += dt * 8;
    const floor = levelY(st.girders, 0, b.x + b.w / 2);
    if (b.y >= floor) { b.y = floor; b.mode = 'roll'; b.on = supportNear(st, b.x + b.w / 2, floor, 2, false); }
  } else if (b.mode === 'roll') {
    const dir = b.on.roll || -1, prevC = b.x + b.w / 2;
    b.x += dir * speed * dt; b.spin += dir * dt * 10;
    const c = b.x + b.w / 2;
    // At the top of a ladder a barrel sometimes goes down it — more often when the pet is below.
    for (const l of st.ladders) {
      if (l.deco || l.hi !== b.on.level || b.skip.has(l) || (prevC - l.x) * (c - l.x) > 0) continue;
      b.skip.add(l);
      const below = p.y > b.y + 20 && Math.abs(p.x + 9 - l.x) < 90;
      if (random() < 0.22 + 0.06 * st.tier + (below ? 0.3 : 0)) { Object.assign(b, { mode: 'ladder', ladder: l, x: l.x - b.w / 2 }); return; }
    }
    if (st.oil && b.on.level === 0 && c <= st.oil.x + st.oil.w + 4) {
      // Into the oil drum: a blue barrel sets it alight and lets a fireball out.
      b.dead = true; st.oil.flare = 0.6;
      if (b.blue) { st.oil.lit = true; if (st.hazards.filter((h) => h.kind === 'fire').length < 5) st.hazards.push(fire(st, st.oil.x + 6, st.oil.y - st.oil.h, false, { mode: 'hop', on: null, vx: 40, vy: -170 })); }
      return;
    }
    if (holds(b.on, c)) b.y = surfaceAt(b.on, c);
    else { const s = supportNear(st, c, b.y, 4, false); if (s) { b.on = s; b.y = surfaceAt(s, c); } else Object.assign(b, { mode: 'drop', vx: dir * 40, vy: 0, on: null }); }
  } else if (b.mode === 'ladder') {
    b.y += BARREL_LADDER * st.hard * dt;
    if (b.y >= b.ladder.bot) { b.y = b.ladder.bot; b.on = supportNear(st, b.ladder.x, b.y, 3, false); b.mode = 'roll'; b.skip.clear(); }
  } else {
    const prev = b.y;
    b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt); b.x = clamp(b.x + b.vx * dt, X0, X1 - b.w); b.y += b.vy * dt;
    const s = b.vy > 0 && landing(st, b.x + b.w / 2, prev, b.y, false);
    // A dropped barrel bounces once on the girder below, then rolls the way that girder tilts.
    if (s) { b.y = surfaceAt(s, b.x + b.w / 2); if (!b.bounced) Object.assign(b, { vy: -90, vx: (s.roll || -1) * 30, bounced: true }); else Object.assign(b, { mode: 'roll', on: s, bounced: false }); b.skip.clear(); }
    if (b.y > H + 20) b.dead = true;
  }
}

// Fireballs and foxfires drift along the floors, lean toward the pet, and take whole ladders toward it.
function stepFire(st, f, dt, random) {
  const p = st.pet, petY = p.y, speed = (f.fox ? FOX_SPEED : FIRE_SPEED) * st.hard;
  if (f.mode === 'hop') {
    const prev = f.y;
    f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * dt); f.x += f.vx * dt; f.y += f.vy * dt;
    const s = f.vy > 0 && landing(st, f.x + f.w / 2, prev, f.y, false);
    if (s) Object.assign(f, { mode: 'walk', on: s, y: surfaceAt(s, f.x + f.w / 2), dir: 1 });
    if (f.y > H + 20) f.dead = true;
  } else if (f.mode === 'walk') {
    f.think -= dt;
    if (f.think <= 0) { f.think = 0.8 + random() * 1.4; f.dir = random() < 0.65 ? Math.sign(p.x + 9 - (f.x + f.w / 2)) || f.dir : random() < 0.5 ? -1 : 1; }
    const prevC = f.x + f.w / 2;
    f.x += f.dir * speed * dt;
    const c = f.x + f.w / 2;
    for (const l of st.ladders) {
      if (l.deco || l.broken || (prevC - l.x) * (c - l.x) > 0) continue;
      if (l.lo === f.on.level && petY < f.y - 12 && random() < 0.5) { Object.assign(f, { mode: 'climb', ladder: l, target: l.top, x: l.x - f.w / 2 }); return; }
      if (l.hi === f.on.level && petY > f.y + 12 && random() < 0.5) { Object.assign(f, { mode: 'climb', ladder: l, target: l.bot, x: l.x - f.w / 2 }); return; }
    }
    const s = holds(f.on, c) ? f.on : supportNear(st, c, f.y, 4, false);
    if (s && c > X0 && c < X1) { f.on = s; f.y = surfaceAt(s, c); } else { f.x -= f.dir * speed * dt; f.dir = -f.dir; } // ends and rivet gaps turn it round
  } else {
    const d = f.target - f.y, v = 24 * st.hard * dt;
    if (Math.abs(d) <= v) { f.y = f.target; f.on = supportNear(st, f.ladder.x, f.y, 2, false); f.mode = f.on ? 'walk' : 'hop'; f.vy = 0; f.vx = 0; }
    else f.y += Math.sign(d) * v;
  }
}

// Springs hop along the top girder, then drop straight down past the right-hand ladders.
const SPRING_EDGE = 440;
function stepSpring(st, s, dt) {
  const top = levelY(st.girders, 8, 100), prev = s.y;
  s.squash = Math.max(0, s.squash - dt);
  s.vy = Math.min(MAX_FALL, s.vy + GRAVITY * 0.78 * dt); s.x += s.vx * dt; s.y += s.vy * dt;
  if (s.mode === 'bounce' && s.vy > 0 && prev <= top && s.y >= top) {
    if (s.x + s.w / 2 > SPRING_EDGE) { s.mode = 'drop'; s.vx = 0; s.x = SPRING_EDGE - s.w / 2; }
    else { s.y = top; s.vy = -SPRING_HOP; s.squash = 0.08; }
  }
  if (s.y > H + 20) s.dead = true;
}

function stepLifts(st, dt) {
  for (const l of st.lifts) {
    const sh = l.shaft, prev = l.y0;
    l.wrapped = false;
    let y = prev + sh.dir * 30 * st.hard * dt;
    if (sh.dir < 0 && y < sh.top) { y += sh.bottom - sh.top; l.wrapped = true; }
    if (sh.dir > 0 && y > sh.bottom) { y -= sh.bottom - sh.top; l.wrapped = true; }
    l.y0 = l.y1 = y; l.dy = l.wrapped ? 0 : y - prev;
  }
}

// ---------- rules ----------
function respawn(st, game) {
  placePet(st, game);
  st.hazards = st.hazards.filter((h) => h.kind === 'fire');
}

const petBox = (st, game) => { const p = st.pet, { w, h } = dims(game); return { x0: p.x + 2, x1: p.x + w - 2, y0: p.y - h + 3, y1: p.y }; };
const box = (o) => ({ x0: o.x + 2, x1: o.x + o.w - 2, y0: o.y - o.h + 2, y1: o.y });

function pullRivets(st, game) {
  const p = st.pet, cx = p.x + dims(game).w / 2;
  for (const r of st.rivets) {
    if (r.pulled) continue;
    const onFloor = (p.mode === 'walk' && p.on?.level === r.level) || (p.mode === 'jump' && Math.abs(p.takeoff - r.y) < 6);
    if (!onFloor) { r.armed = 0; continue; }
    const side = Math.abs(cx - r.x) >= 7 ? Math.sign(cx - r.x) : 0;
    if (!side) continue;
    // Passing right over it (walking or jumping) pops it out; the hole opens behind the pet.
    if (r.armed && side !== r.armed) {
      r.pulled = true; game.score += 100;
      st.girders.find((g) => g.level === r.level).gaps.push(r.x);
      st.popups.push({ x: r.x - 8, y: r.y - 26, t: 0, text: '100' });
    }
    r.armed = side;
  }
}

function startOutro(st, game) {
  st.outro = { t: 0 };
  game.score += st.bonus;
  st.popups.push({ x: st.pet.x, y: st.pet.y - 30, t: 0, text: String(st.bonus) });
  st.hazards = [];
  st.pet.walking = false;
}

function stepOutro(st, dt) {
  const o = st.outro, dk = st.dk;
  o.t += dt;
  if (st.kind === '100m') {
    // DK tumbles head first to the bottom floor.
    if (dk.y < 272) { dk.vy += GRAVITY * 0.6 * dt; dk.y = Math.min(272, dk.y + dk.vy * dt); }
  } else if (o.t > 1) dk.y -= 50 * dt; // grabs Pauline and climbs off the top
  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < 1.2);
  return o.t >= (st.kind === '100m' ? 3 : 2.4) ? 'done' : null;
}

// Returns 'hurt' | 'fell' | 'done' | null; the engine handles hearts and stage changes.
export function step(st, dt, keys, game, random = Math.random) {
  st.time += dt;
  if (st.outro) return stepOutro(st, dt);
  let result = null;
  // Bonus timer; when it runs out the pet loses a heart (the arcade's time-out death) and it starts over.
  st.bonusClock += dt;
  while (st.bonusClock >= BONUS_EVERY) { st.bonusClock -= BONUS_EVERY; st.bonus = Math.max(0, st.bonus - BONUS_STEP); }
  if (st.bonus <= 0) { st.bonus = st.bonusStart; if (!invincible(game)) result = 'hurt'; }

  stepDK(st, dt, random);
  if (st.kind === '100m') {
    st.spawnClock -= dt;
    if (st.spawnClock <= 0) {
      st.spawnClock = 5 / st.hard;
      if (st.hazards.length < Math.min(5, 3 + st.tier)) {
        const level = Math.floor(random() * 4), g = st.girders.find((s) => s.level === level);
        let x = random() < 0.5 ? g.x0 + 4 : g.x1 - 16;
        if (st.pet.on?.level === level && Math.abs(st.pet.x - x) < 80) x = x < 250 ? g.x1 - 16 : g.x0 + 4;
        st.hazards.push(fire(st, x, g.y0, true));
      }
    }
  }
  stepLifts(st, dt);
  const moved = stepPet(st, dt, keys, game);
  if (moved === 'fell') { respawn(st, game); return 'fell'; }

  for (const h of st.hazards) (h.kind === 'barrel' ? stepBarrel : h.kind === 'fire' ? stepFire : stepSpring)(st, h, dt, random);
  if (st.oil) st.oil.flare = Math.max(0, st.oil.flare - dt);

  const p = st.pet, { w } = dims(game), me = petBox(st, game), cx = p.x + w / 2;
  // Hammer: swinging in front of the pet; things that run into it are smashed.
  const reach = p.hammer > 0 ? { x0: p.face > 0 ? cx : cx - w / 2 - 14, x1: p.face > 0 ? cx + w / 2 + 14 : cx, y0: me.y0 - 14, y1: me.y1 } : null;
  for (const h of st.hazards) {
    if (h.dead) continue;
    const hb = box(h);
    if (p.mode === 'jump' && h.kind !== 'spring' && h.x + h.w / 2 > p.x && h.x + h.w / 2 < p.x + w && p.y < hb.y0 && Math.abs(h.y - p.takeoff) < 12) p.cleared.add(h);
    if (reach && h.kind !== 'spring' && overlap(reach, hb)) {
      h.dead = true;
      const pts = SMASH_POINTS[Math.floor(random() * SMASH_POINTS.length)];
      game.score += pts; st.puffs.push({ x: h.x + h.w / 2, y: h.y - h.h / 2, t: 0 });
      st.popups.push({ x: h.x, y: h.y - 16, t: 0, text: String(pts) });
    } else if (overlap(me, hb) && !invincible(game) && !result) {
      result = 'hurt'; h.dead = true; st.puffs.push({ x: h.x + h.w / 2, y: h.y - h.h / 2, t: 0 });
    }
  }
  st.hazards = st.hazards.filter((h) => !h.dead);
  // Touching DK himself hurts too; the pet is knocked back off him.
  const dk = st.dk, dkBox = { x0: dk.x + 4, x1: dk.x + dk.w - 4, y0: dk.y - dk.h + 4, y1: dk.y };
  if (overlap(me, dkBox) && !invincible(game) && !result) {
    result = 'hurt';
    if (p.mode === 'walk') { const away = cx > dk.x + dk.w / 2 ? dk.x + dk.w + 2 : dk.x - w - 2, s = supportNear(st, away + w / 2, p.y, 6, false); if (s) { p.x = away; p.y = surfaceAt(s, away + w / 2); p.on = s; } }
  }

  for (const hm of st.hammers) {
    if (hm.taken || !overlap(me, { x0: hm.x - 6, x1: hm.x + 6, y0: hm.y - 10, y1: hm.y })) continue;
    hm.taken = true; p.hammer = HAMMER_TIME;
    if (game.runner) giveHammer(game.runner);
  }
  for (const it of st.items) {
    if (it.taken || !overlap(me, { x0: it.x - 6, x1: it.x + 6, y0: it.y - 12, y1: it.y })) continue;
    it.taken = true; const pts = ITEM_POINTS[st.tier];
    game.score += pts; st.popups.push({ x: it.x - 8, y: it.y - 18, t: 0, text: String(pts) });
  }
  if (st.rivets.length) pullRivets(st, game);

  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < 1);
  for (const q of st.puffs) q.t += dt;
  st.puffs = st.puffs.filter((q) => q.t < 0.4);

  const won = st.kind === '100m' ? st.rivets.every((r) => r.pulled) : p.mode === 'walk' && p.on?.level === st.board.goal;
  if (won) startOutro(st, game);
  return result;
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
function sprite(ctx, rows, x, y, scale, colors, flipX = false, flipY = false) {
  const n = rows.length;
  rows.forEach((line, j) => [...line].forEach((c, i) => {
    if (c === '.') return;
    const gx = flipX ? line.length - 1 - i : i, gy = flipY ? n - 1 - j : j;
    px(ctx, colors[c], x + gx * scale, y + gy * scale, scale, scale);
  }));
}
// DK: arms down, and arms up (beating his chest / about to throw). 20×16 cells at 2 px.
const DK_DOWN = [
  '......bbbbbbbb......', '.....bbbbbbbbbb.....', '....bbttttttttbb....', '....btwkttttkwtb....', '....bttttttttttb....', '...bbbttkkkkttbbb...',
  '..bbbbbbttttbbbbbb..', '.bbbbbbttttttbbbbbb.', 'bbbbbbttttttttbbbbbb', 'bbtbbbttttttttbbbtbb', 'bttbbbbttttttbbbbttb', 'btt.bbbbbbbbbbbb.ttb',
  'tt..bbbbbbbbbbbb..tt', '....bbbbb..bbbbb....', '...bbbbbb..bbbbbb...', '..tttttt....tttttt..',
];
const DK_UP = [
  'tt....bbbbbbbb....tt', 'bb...bbbbbbbbbb...bb', 'bb..bbttttttttbb..bb', 'bb..btwkttttkwtb..bb', 'bb..bttttttttttb..bb', 'bbbbbbttkkkkttbbbbbb',
  '.bbbbbbbttttbbbbbbb.', '..bbbbbttttttbbbbb..', '..bbbbttttttttbbbb..', '..bbbbttttttttbbbb..', '...bbbbttttttbbbb...', '....bbbbbbbbbbbb....',
  '....bbbbbbbbbbbb....', '....bbbbb..bbbbb....', '...bbbbbb..bbbbbb...', '..tttttt....tttttt..',
];
const DK_COLORS = { b: '#a84c10', t: '#f8b070', w: '#fff', k: '#000' };
const PAULINE = ['..ooooo..', '.ooooooo.', '.oofffoo.', 'oofkfkfoo', 'oofffffoo', '.oo.f.oo.', '..ppppp..', '.pwpppwp.', 'f.ppppp.f', '..ppppp..', '.ppppppp.', '.ppppppp.', 'ppppppppp', '..f...f..', '..w...w..'];
const PAULINE_COLORS = { o: '#f87818', f: '#ffc8a0', k: '#000', p: '#ff70c8', w: '#fff' };
const FIRE = ['...y....', '..yy.y..', '.yyoyy..', '.yoooy.y', 'yooooooy', 'owkoowko', 'oooooooo', '.rooooor', '..rrrr..'];
const HEART = ['.pp...pp.', 'pppp.pppp', 'ppppppppp', 'ppppppppp', '.ppppppp.', '..ppppp..', '...ppp...', '....p....'];
const BROKEN = ['.pp....pp.', 'ppp....ppp', 'pppp..pppp', 'ppp....ppp', '.pp....pp.', '..p....p..'];

function girder(ctx, s, color, rivets) {
  for (let x = s.x0; x < s.x1; x += 16) {
    const w = Math.min(16, s.x1 - x), y = Math.round(surfaceAt(s, x + w / 2));
    px(ctx, color, x, y, w, 2); px(ctx, color, x, y + 5, w, 2);
    for (let i = 0; i < w; i += 2) px(ctx, color, x + i, y + [2, 3, 4, 3][(i / 2) % 4], 2, 1); // the lattice between the rails
  }
  for (const g of s.gaps) px(ctx, '#000', g - GAP, surfaceAt(s, g) - 1, GAP * 2, THICK + 2);
  for (const r of rivets) if (!r.pulled) { px(ctx, '#f8d838', r.x - 4, r.y - 1, 8, THICK + 2); px(ctx, '#a07800', r.x - 1, r.y, 2, THICK); }
}
function ladder(ctx, l, color) {
  const part = (y0, y1) => {
    px(ctx, color, l.x - 7, y0, 2, y1 - y0); px(ctx, color, l.x + 5, y0, 2, y1 - y0);
    for (let y = y1 - 4; y > y0; y -= 5) px(ctx, color, l.x - 7, y, 14, 1);
  };
  const top = l.top + THICK, bot = l.bot;
  if (l.broken) { part(top, top + (bot - top) * 0.22); part(bot - (bot - top) * 0.4, bot); } else part(top, bot);
}
function drawBarrel(ctx, b) {
  const x = b.x, y = b.y - b.h, body = b.blue ? '#3c78f8' : '#c8641c', dark = b.blue ? '#1c2c88' : '#5c2c08', light = b.blue ? '#9cc8ff' : '#f0a050';
  if (b.mode === 'ladder' || b.mode === 'wild') {
    // Seen from the front while going down a ladder: a wide drum with its hoops.
    px(ctx, body, x, y + 1, 14, 9); px(ctx, dark, x, y + 2, 14, 1); px(ctx, dark, x, y + 8, 14, 1); px(ctx, light, x + 3, y + 3, 2, 4);
    return;
  }
  px(ctx, body, x + 2, y, 10, 11); px(ctx, body, x, y + 2, 14, 7);
  px(ctx, dark, x + 1, y + 1, 1, 9); px(ctx, dark, x + 12, y + 1, 1, 9);
  const f = ((Math.floor(b.spin) % 4) + 4) % 4; // the staves turn as it rolls
  px(ctx, dark, x + 3 + f * 2, y + 1, 2, 9); px(ctx, light, x + 4, y + 2, 1, 2);
}
function drawFire(ctx, f, time) {
  const colors = f.fox ? { y: '#fff070', o: '#f83c28', r: '#a01818', w: '#fff', k: '#000' } : { y: '#fff070', o: '#f8a020', r: '#e84010', w: '#fff', k: '#000' };
  const flick = Math.floor(time * 10 + f.x) % 2;
  sprite(ctx, FIRE, f.x + (flick ? 0.5 : 0), f.y - 13.5, 1.5, colors, f.dir < 0);
}
function drawSpring(ctx, s) {
  const x = s.x, sq = s.squash > 0 ? 4 : 0, top = s.y - s.h + sq;
  px(ctx, '#3cd8f0', x, top, 16, 2); px(ctx, '#3cd8f0', x, s.y - 2, 16, 2);
  const rows = s.h - 4 - sq;
  for (let i = 0; i < rows; i += 2) px(ctx, '#c8d0e0', x + ((i / 2) % 2 ? 4 : 2), top + 2 + i, 10, 1);
}
function drawHammer(ctx, x, y, down, flash) {
  // Head and handle; `down` is the swing in front of the pet, otherwise it is raised above the head.
  const head = flash ? '#f8f8f8' : '#d8a050';
  if (down) { px(ctx, '#7a4a20', x, y - 3, 10, 2); px(ctx, head, x + 8, y - 8, 7, 11); }
  else { px(ctx, '#7a4a20', x + 4, y - 10, 2, 10); px(ctx, head, x - 1, y - 16, 12, 7); }
}
function drawItem(ctx, it) {
  const x = it.x - 6, y = it.y - 12;
  if (it.item === 'hat') { px(ctx, '#ff70c8', x + 3, y + 4, 7, 5); px(ctx, '#ff70c8', x, y + 8, 13, 3); px(ctx, '#3cd8f0', x + 3, y + 7, 7, 1); }
  else if (it.item === 'purse') { px(ctx, '#ff70c8', x + 1, y + 5, 11, 7); px(ctx, '#a03080', x + 4, y + 2, 1, 3); px(ctx, '#a03080', x + 8, y + 2, 1, 3); px(ctx, '#a03080', x + 4, y + 2, 5, 1); px(ctx, '#f8d838', x + 5, y + 6, 3, 2); }
  else { px(ctx, '#ff70c8', x, y + 2, 13, 3); px(ctx, '#ff70c8', x + 3, y, 7, 2); px(ctx, '#a07850', x + 6, y + 5, 1, 7); px(ctx, '#a07850', x + 4, y + 11, 3, 1); }
}
function drawOil(ctx, oil, time) {
  const x = oil.x, y = oil.y - oil.h;
  px(ctx, '#2848c8', x, y + 2, oil.w, oil.h - 2); px(ctx, '#7090f8', x, y, oil.w, 3); px(ctx, '#7090f8', x, y + oil.h - 4, oil.w, 2); px(ctx, '#7090f8', x + 2, y + 5, 2, 12);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 8px ui-monospace, Consolas, monospace'; ctx.fillText('OIL', x + 5, y + 15);
  if (!oil.lit && !oil.flare) return;
  const tall = oil.flare > 0 ? 14 : 8;
  for (let i = 0; i < 6; i++) {
    const h = tall * (0.5 + 0.5 * Math.abs(Math.sin(time * 9 + i * 1.7)));
    px(ctx, i % 2 ? '#f8d038' : '#f86818', x + 2 + i * 3.5, y - h, 3, h);
  }
}
function drawStack(ctx) { // DK's pile of barrels beside him on 25m
  for (const [x, y] of [[30, 57], [44, 57], [30, 42], [44, 42]]) { px(ctx, '#c8641c', x, y, 13, 15); px(ctx, '#5c2c08', x, y + 2, 13, 1); px(ctx, '#5c2c08', x, y + 12, 13, 1); px(ctx, '#f0a050', x + 3, y + 4, 2, 6); }
}
function drawShafts(ctx, st, color) {
  for (const sh of st.board.shafts || []) {
    px(ctx, '#f8c838', sh.x0 + 4, sh.top - 10, 1, sh.bottom - sh.top + 10); px(ctx, '#f8c838', sh.x1 - 5, sh.top - 10, 1, sh.bottom - sh.top + 10);
    px(ctx, '#c84c0c', sh.x0 + 2, sh.top - 14, sh.x1 - sh.x0 - 4, 8); px(ctx, '#c84c0c', sh.x0 + 2, sh.bottom + 2, sh.x1 - sh.x0 - 4, 8);
  }
  for (const l of st.lifts) girder(ctx, l, color, []);
}

export function paint(ctx, st, game, drawRunner) {
  const { colors } = st.board, o = st.outro;
  px(ctx, '#000', 0, 0, W, H);
  for (const l of st.ladders) ladder(ctx, l, colors.ladder);
  drawShafts(ctx, st, colors.girder);
  // In the rivet collapse the middle of each floor drops away (except under the pet).
  const fallOff = o && st.kind === '100m' ? 0.5 * GRAVITY * o.t * o.t : 0;
  for (const s of st.girders) {
    const rivets = st.rivets.filter((r) => r.level === s.level);
    if (fallOff && s.level >= 1 && s.level <= 4 && !(st.pet.on === s && st.pet.x > 130 && st.pet.x < 370)) {
      girder(ctx, { ...s, x1: 130 - GAP }, colors.girder, []); girder(ctx, { ...s, x0: 370 + GAP }, colors.girder, []);
      if (fallOff < H) girder(ctx, { ...s, x0: 130 + GAP, x1: 370 - GAP, y0: s.y0 + fallOff, y1: s.y1 + fallOff, gaps: [] }, colors.girder, []);
    } else girder(ctx, s, colors.girder, rivets);
  }
  if (st.oil) drawOil(ctx, st.oil, st.time);
  if (st.kind === '25m') drawStack(ctx);
  for (const it of st.items) if (!it.taken) drawItem(ctx, it);
  for (const hm of st.hammers) if (!hm.taken) { px(ctx, '#7a4a20', hm.x - 1, hm.y - 6, 2, 6); px(ctx, '#d8a050', hm.x - 5, hm.y - 11, 10, 5); }

  // Pauline (carried off by DK after the heart on 25m / 75m).
  const pl = st.girders.find((g) => g.level === (st.kind === '100m' ? 5 : st.board.goal)), pyl = surfaceAt(pl, st.board.pauline);
  const carried = o && st.kind !== '100m' && o.t > 1;
  if (!carried) {
    sprite(ctx, PAULINE, st.board.pauline, pyl - 22.5, 1.5, PAULINE_COLORS);
    if (!o && Math.floor(st.time * 2) % 2 === 0) { ctx.fillStyle = '#3cd8f0'; ctx.font = 'bold 9px ui-monospace, Consolas, monospace'; ctx.fillText('HELP!', st.board.pauline + 16, pyl - 18); }
  }
  // Donkey Kong
  const dk = st.dk, up = dk.phase === 'hold' || (st.kind === '100m' && Math.floor(dk.beat * 3) % 2 === 0) || carried;
  const upside = o && st.kind === '100m';
  sprite(ctx, up && !upside ? DK_UP : DK_DOWN, dk.x, dk.y - dk.h, 2, DK_COLORS, false, upside);
  if (carried) sprite(ctx, PAULINE, dk.x + 30, dk.y - dk.h - 6, 1.5, PAULINE_COLORS);
  if (dk.phase === 'grab' && st.kind === '25m') drawBarrel(ctx, { x: dk.x - 10, y: dk.y - 4, h: 11, mode: 'roll', spin: 0, blue: st.thrown === 0 || st.thrown % 6 === 0 });
  if (dk.phase === 'hold' && st.kind === '25m') drawBarrel(ctx, { x: dk.x + 13, y: dk.y - dk.h - 2, h: 11, mode: 'ladder', spin: 0, blue: st.thrown === 0 || st.thrown % 6 === 0 });
  if (dk.phase === 'hold' && st.kind === '75m') drawSpring(ctx, { x: dk.x + 12, y: dk.y - dk.h - 2, h: 12, squash: 0 });

  for (const h of st.hazards) (h.kind === 'barrel' ? drawBarrel(ctx, h) : h.kind === 'fire' ? drawFire(ctx, h, st.time) : drawSpring(ctx, h));

  // The pet, swinging the hammer while it has one (it flashes in the last two seconds).
  const pz = pose(st, game), p = st.pet, { w, h } = dims(game);
  drawRunner(pz.x, pz.bottom, { onGround: pz.onGround, flip: pz.flip, cell: pz.cell });
  if (p.hammer > 0) {
    const down = Math.floor(st.time / 0.14) % 2 === 0, flash = p.hammer < 2 && Math.floor(st.time * 8) % 2 === 0;
    if (down) drawHammer(ctx, p.face > 0 ? p.x + w - 4 : p.x - 11, p.y, true, flash);
    else drawHammer(ctx, p.x + w / 2 - 5 + p.face * 4, p.y - h + 4, false, flash);
  }
  for (const q of st.puffs) { const r = 4 + q.t * 30; for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; px(ctx, k % 2 ? '#fff' : '#f8d038', q.x + Math.cos(a) * r, q.y + Math.sin(a) * r, 2, 2); } }

  if (o) {
    // The heart: whole when the pet reaches Pauline, broken once DK takes her away again.
    const hx = st.kind === '100m' ? st.board.pauline - 16 : (p.x + st.board.pauline) / 2, hy = pyl - 38;
    sprite(ctx, carried ? BROKEN : HEART, hx, hy, 1.5, { p: '#ff4070' });
  }
  ctx.font = 'bold 10px ui-monospace, Consolas, monospace';
  for (const q of st.popups) { ctx.fillStyle = '#fff'; ctx.fillText(q.text, q.x, q.y - q.t * 20); }
  // The arcade's bonus box and the board's height.
  px(ctx, '#3c50f0', 420, 4, 72, 26); px(ctx, '#000', 422, 6, 68, 22);
  ctx.fillStyle = '#3cd8f0'; ctx.font = 'bold 8px ui-monospace, Consolas, monospace'; ctx.fillText('BONUS', 440, 14);
  ctx.fillStyle = st.bonus <= 1000 && Math.floor(st.time * 4) % 2 ? '#f83c28' : '#fff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.fillText(String(st.bonus).padStart(4, '0'), 442, 25);
  ctx.fillStyle = '#3cd8f0'; ctx.font = 'bold 9px ui-monospace, Consolas, monospace'; ctx.fillText(st.kind, 6, 12);
}
