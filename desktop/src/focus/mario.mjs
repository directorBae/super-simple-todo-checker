// A compact take on Super Mario Bros., played by the pet in a Mario cap, in three stages:
// World 1-1 (overworld), World 1-2 (underground: blue bricks, Koopa Troopas, lifts, out through the side pipe to the
// flagpole) and Bowser's castle like 1-4 (lava, firebars, Podoboos, the fire flower, Bowser on the bridge and the axe).
// Hand-driven running, ? blocks (coins, mushrooms that add a heart and make the pet big, the castle's fire flower),
// bricks that a big pet breaks, pipes, pits, goombas, koopas and their shells, staircases and flagpoles. With the fire
// flower Space throws bouncing fireballs and ↑ jumps. Tiles are 20px on a 500×280 canvas; layouts are tables below.
import { powerUp, fireUp, fitBox } from './runner.mjs';

export const TILE = 20, ROWS = 14, GROUND = 12, VIEW = 500;
// The camera travels right from the dino road into this game.
export const ENTRY = 'right';
const EMPTY = 0, SOLID = 1, BRICK = 2, QUESTION = 3, USED = 4, PIPE = 5, HARD = 6, COIN = 7, BRIDGE = 8;
const SOLIDS = new Set([SOLID, BRICK, QUESTION, USED, PIPE, HARD, BRIDGE]);
// Blocks sit 4 or 8 tiles above the ground, as in the original.
const LOW = GROUND - 4, HIGH = GROUND - 8;
const span = (x0, x1, y) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y]);

// ---------- World 1-1: positions follow the original (x in tiles) ----------
const WIDTH = 212;
export const FLAG_X = 198;
const QUESTIONS = [[16, LOW], [21, LOW], [23, LOW], [22, HIGH], [78, LOW], [94, HIGH], [106, LOW], [109, LOW], [112, LOW], [109, HIGH], [129, HIGH], [130, HIGH], [170, LOW]];
const BRICKS = [[20, LOW], [22, LOW], [24, LOW], [77, LOW], [79, LOW], ...[80, 81, 82, 83, 84, 85, 86, 87].map((x) => [x, HIGH]), [91, HIGH], [92, HIGH], [93, HIGH], [94, LOW], [100, LOW], [101, LOW], [118, LOW], [121, HIGH], [122, HIGH], [123, HIGH], [128, HIGH], [131, HIGH], [129, LOW], [130, LOW], [168, LOW], [169, LOW], [171, LOW]];
export const PIPES = [[28, 2], [38, 3], [46, 4], [57, 4], [163, 2], [179, 2]];
const PITS = [[69, 70], [86, 88], [153, 154]];
const STAIRS = [[134, [1, 2, 3, 4]], [140, [4, 3, 2, 1]], [148, [1, 2, 3, 4, 4]], [155, [4, 3, 2, 1]], [181, [1, 2, 3, 4, 5, 6, 7, 8, 8]]];
const GOOMBAS = [22, 40, 51, 53, 97, 99, 114, 116, 124, 126, 128, 130, 174, 176];
// The ? blocks that hold a mushroom instead of a coin, as in the original.
const MUSHROOMS = new Set([`21,${LOW}`, `78,${LOW}`, `109,${HIGH}`]);
// 1-1's one Koopa Troopa walks under the ? blocks at 106-112.
const W11 = { theme: 'over', width: WIDTH, pits: PITS, questions: QUESTIONS, bricks: BRICKS, pipes: PIPES, stairs: STAIRS, goombas: GOOMBAS, koopas: [107], mushrooms: MUSHROOMS, flag: FLAG_X };

// ---------- World 1-2: underground, the original's run compressed (no warp zone above the ceiling) ----------
// Brick wall at the start, brick ceiling, five ? blocks (the first a mushroom), stepping pillars, brick ledges with
// coins, three pipes, two columns of lifts over a pit (one going up, one down) and the side pipe out.
const W12 = {
  theme: 'under', width: 180,
  pits: [[86, 87], [138, 148]],
  fills: [[0, 0, 1, 11, BRICK], [6, 137, 1, 1, BRICK], [149, 166, 1, 1, BRICK], [169, 179, 1, 11, BRICK],
    [39, 44, LOW, LOW, BRICK], [52, 53, 8, 11, BRICK], [54, 59, 8, 8, BRICK], [64, 65, 2, 6, BRICK], [66, 72, 6, 6, BRICK],
    [76, 76, 9, 11, BRICK], [84, 85, 9, 11, BRICK], [88, 89, 9, 11, BRICK], [96, 101, LOW, LOW, BRICK], [121, 124, LOW, LOW, BRICK]],
  questions: [...span(10, 14, LOW), [98, LOW]],
  bricks: [[29, LOW]],
  coins: [...span(40, 43, LOW - 1), ...span(55, 58, LOW - 1), ...span(67, 71, 5), ...span(122, 123, LOW - 1)],
  // [x, height, no lip]: the last one is the tall pipe that the side pipe joins, running up out of sight.
  pipes: [[103, 3], [109, 4], [115, 2], [167, 12, true]],
  stairs: [[17, [1]], [19, [2]], [21, [3]], [23, [4]], [25, [4]], [27, [3]], [31, [3]], [33, [2]], [130, [1, 2, 3, 4, 4, 4, 4, 4]]],
  goombas: [16, 18, 29, 36, 48, 50, 70, 72, 74, 92, 94, 118, 120],
  koopas: [44, 46, 58, 100, 126],
  mushrooms: new Set([`10,${LOW}`]),
  // Two platforms per column, looping through the pit: [x, speed (− = up), starting tops].
  lifts: [[139, -55, [40, 200]], [144, 55, [0, 160]]],
  sidePipe: { x: 163, len: 4, y: GROUND - 2 },
};
// Out of the pipe: the short outside run to the staircase, flagpole and castle.
const W12_OUT = { theme: 'over', width: 37, pipes: [[2, 2]], stairs: [[6, [1, 2, 3, 4, 5, 6, 7, 8, 8]]], flag: 23, entryPipe: 2 };

// ---------- Bowser's castle, like 1-4 ----------
// Grey castle, lava pits with Podoboos, firebars on empty blocks, a low corridor, the ? block with the fire flower,
// then the bridge over lava with Bowser and the axe, and Toad's room behind it.
const W14 = {
  theme: 'castle', width: 160,
  pits: [[14, 16], [30, 33], [63, 65], [78, 81], [100, 103], [112, 114], [128, 140]],
  fills: [[0, 159, 0, 1, SOLID], [40, 62, 2, 6, SOLID], [86, 92, 10, 11, SOLID], [117, 124, 9, 11, SOLID], [159, 159, 2, 11, SOLID]],
  questions: [[21, LOW]],
  // The user's request: the fire flower comes from the castle's ? block, whatever the pet's size.
  flowers: new Set([`21,${LOW}`]),
  // [x, y, turn]: +1 clockwise, −1 counter-clockwise.
  firebars: [[25, LOW, 1], [45, GROUND - 1, -1], [51, 6, 1], [57, GROUND - 1, -1], [71, LOW, 1], [89, 9, -1], [108, LOW, 1], [120, 8, -1]],
  podoboos: [15, 31.5, 64, 79.5, 101.5, 113],
  bridge: [128, 140], bowser: { x: 136, range: [131, 138] }, axe: 141, toad: 152,
};
const WORLDS = [{ name: '1-1', main: W11 }, { name: '1-2', main: W12, exit: W12_OUT }, { name: '1-4', main: W14 }];
export const WORLD_NAMES = WORLDS.map((w) => w.name);

// The lava's surface in the castle (a pit's bottom); touching it is a fall.
const LAVA_Y = GROUND * TILE + 12;

export function createLevel(area = W11, hard = false) {
  const width = area.width, grid = new Uint8Array(width * ROWS);
  const set = (x, y, type) => { if (x >= 0 && x < width && y >= 0 && y < ROWS) grid[y * width + x] = type; };
  const pits = area.pits ?? [];
  for (let x = 0; x < width; x++) if (!pits.some(([a, b]) => x >= a && x <= b)) { set(x, GROUND, SOLID); set(x, GROUND + 1, SOLID); }
  (area.fills ?? []).forEach(([x0, x1, y0, y1, type]) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set(x, y, type); });
  (area.questions ?? []).forEach(([x, y]) => set(x, y, QUESTION));
  (area.bricks ?? []).forEach(([x, y]) => set(x, y, BRICK));
  (area.coins ?? []).forEach(([x, y]) => set(x, y, COIN));
  (area.pipes ?? []).forEach(([x, h]) => { for (let y = GROUND - h; y < GROUND; y++) { set(x, y, PIPE); set(x + 1, y, PIPE); } });
  (area.stairs ?? []).forEach(([x0, heights]) => heights.forEach((h, i) => { for (let y = GROUND - h; y < GROUND; y++) set(x0 + i, y, HARD); }));
  if (area.flag != null) set(area.flag, GROUND - 1, HARD);
  const side = area.sidePipe;
  if (side) for (let x = side.x; x < side.x + side.len; x++) { set(x, side.y, PIPE); set(x, side.y + 1, PIPE); }
  if (area.bridge) for (let x = area.bridge[0]; x <= area.bridge[1]; x++) set(x, GROUND, BRIDGE);
  (area.firebars ?? []).forEach(([x, y]) => set(x, y, USED));
  const k = hard ? 1.25 : 1, b = area.bowser;
  return {
    area, theme: area.theme, grid, width, cam: 0, bumps: [], popups: [], items: [], debris: [], fireballs: [], flames: [],
    combo: 0, coins: 0, done: false, hard, flagX: area.flag ?? null, flagY: 2 * TILE + 14,
    goombas: (area.goombas ?? []).map((x) => ({ x: x * TILE, y: (GROUND - 1) * TILE + 2, w: 18, h: 18, vx: -40 * k, vy: 0, alive: true, squashed: 0, active: false })),
    koopas: (area.koopas ?? []).map((x) => ({ kind: 'koopa', x: x * TILE, y: GROUND * TILE - 26, w: 18, h: 26, vx: -40 * k, vy: 0, alive: true, squashed: 0, active: false, shell: false, wake: 0, kickT: 0, chain: 0 })),
    lifts: (area.lifts ?? []).flatMap(([x, vy, tops]) => tops.map((y) => ({ x: x * TILE, y, w: 3 * TILE, h: 10, vy }))),
    firebars: (area.firebars ?? []).map(([x, y, turn], i) => ({ x: x * TILE + 10, y: y * TILE + 10, turn, phase: i * 5 })),
    podoboos: (area.podoboos ?? []).map((x, i) => ({ x: x * TILE + 10, y: LAVA_Y + 30, vy: 0, wait: 0.4 + i * 0.35 })),
    bowser: b ? { x: b.x * TILE, y: GROUND * TILE - 36, w: 36, h: 36, vx: 0, vy: 0, dir: -1, x0: b.range[0] * TILE, x1: b.range[1] * TILE, hp: 5, dead: false, gone: false, active: false, moveT: 1, jumpT: 2.5, fireT: 1.2, mouth: 0 } : null,
    bridge: area.bridge ?? null,
    axe: area.axe != null ? { x: area.axe * TILE + 2, y: (GROUND - 2) * TILE, w: 16, h: 36, taken: false } : null,
    toad: area.toad != null ? { x: area.toad * TILE, y: GROUND * TILE - 24 } : null,
    sidePipe: side ?? null, entryPipe: area.entryPipe ?? null,
  };
}
export const tileAt = (level, tx, ty) => (tx < 0 || tx >= level.width || ty >= ROWS ? (ty >= ROWS ? EMPTY : SOLID) : ty < 0 ? EMPTY : level.grid[ty * level.width + tx]);
const solidAt = (level, px, py) => SOLIDS.has(tileAt(level, Math.floor(px / TILE), Math.floor(py / TILE)));
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

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
// Fireballs fly fast and skip along the floor about a tile high; two at a time, as in SMB.
const FIRE_SPEED = 300, FIRE_BOUNCE = -230, MAX_FIRE = 2;
// A kicked shell, and what it pays for each enemy it knocks over in a row (then it stays at 8000).
const SHELL_SPEED = 270, SHELL_CHAIN = [500, 800, 1000, 2000, 4000, 5000, 8000];
// A firebar: six fireballs on a stick, turning in 32 steps per revolution.
const BAR_BALLS = 6, BAR_GAP = 9, BAR_REV = 2.6;

const SMALL = { w: 18, h: 28 }, BIG = { w: 22, h: 38 };
const sizeFor = (game) => (game?.runner?.big ? BIG : SMALL);

// Stage module: the pet starts where the dino run left it (x = 64, on the ground) and the camera scrolls with it.
// stage 0 = 1-1, 1 = 1-2, 2 = Bowser's castle; from the fourth lap on the enemies and hazards are a little quicker.
export function create(game, { stage = 0, lap = 0 } = {}) {
  const index = ((Math.floor(stage) || 0) % WORLDS.length + WORLDS.length) % WORLDS.length, world = WORLDS[index], hard = lap >= 3;
  const size = sizeFor(game);
  return {
    stage: index, world: world.name, hard, level: createLevel(world.main, hard),
    player: { x: 64, y: GROUND * TILE - size.h, ...size, vx: 0, vy: 0, onGround: true, held: false, face: 1, lift: null },
    outro: null, warp: null, ending: false, time: 0, fireHeld: false,
  };
}

// Where and how the pet is drawn right now (screen coordinates): what paint passes to drawRunner.
export function pose(s) {
  const p = s.player;
  return { x: p.x - s.level.cam, bottom: p.y + p.h, hat: true, onGround: p.onGround, flip: p.face < 0, hidden: s.outro?.phase === 'inside' };
}

// The flag pays by how high the runner grabs the pole, as in the original.
const POLE_TOP = 2 * TILE + 8, POLE_BOTTOM = (GROUND - 1) * TILE;
const flagBonus = (y) => { const k = (POLE_BOTTOM - y) / (POLE_BOTTOM - POLE_TOP); return k > 0.9 ? 5000 : k > 0.65 ? 2000 : k > 0.4 ? 800 : k > 0.15 ? 400 : 100; };

const followCam = (level, p) => { level.cam = Math.max(level.cam, Math.min(p.x - 200, level.width * TILE - VIEW)); };
function agePopups(level, dt, life = 0.8) {
  for (const q of level.popups) q.t += dt;
  level.popups = level.popups.filter((q) => q.t < life);
}
const popup = (level, x, y, text) => level.popups.push({ x, y, t: 0, text: String(text) });

// After the flag: slide down the pole, hop off, walk into the castle. Returns 'done' at the door.
function stepFlagOutro(st, dt) {
  const level = st.level, p = st.player, o = st.outro, flagX = level.flagX;
  o.t += dt;
  if (o.phase === 'slide') {
    p.x = flagX * TILE + 9 - p.w; p.vx = 0;
    p.y = Math.min(POLE_BOTTOM - p.h, p.y + 160 * dt);
    level.flagY = Math.min(POLE_BOTTOM - 18, level.flagY + 160 * dt);
    if (p.y >= POLE_BOTTOM - p.h && level.flagY >= POLE_BOTTOM - 18) { o.phase = 'walk'; o.t = 0; }
  } else if (o.phase === 'walk') {
    p.vx = 90; p.face = 1; p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    const hit = move(level, p, p.vx * dt, p.vy * dt);
    if (hit.bottom) { p.vy = 0; p.onGround = true; } else p.onGround = false;
    if (p.x >= (flagX + 6) * TILE + 3) { o.phase = 'inside'; o.t = 0; }
  } else if (o.t > 0.5) return 'done';
  followCam(level, p);
  agePopups(level, dt, 1.2);
  return null;
}

// After the axe: the bridge falls away from the axe end, Bowser drops into the lava, the pet walks on to Toad,
// who says his line; then the stage is done.
function stepAxeOutro(st, dt) {
  const level = st.level, p = st.player, o = st.outro, b = level.bowser;
  o.t += dt;
  if (o.phase === 'collapse') {
    o.clock += dt;
    while (o.clock >= 0.07 && o.col >= level.bridge[0]) { o.clock -= 0.07; level.grid[GROUND * level.width + o.col] = EMPTY; o.col--; }
    if (o.col < level.bridge[0]) { o.phase = 'fall'; o.t = 0; }
  } else if (o.phase === 'fall') {
    if (o.t > (b && !b.gone ? 1.4 : 0.4)) { o.phase = 'walk'; o.t = 0; }
  } else if (o.phase === 'walk') {
    p.vx = 90; p.face = 1; p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * dt);
    const hit = move(level, p, p.vx * dt, p.vy * dt);
    if (hit.bottom) { p.vy = 0; p.onGround = true; } else p.onGround = false;
    if (p.x + p.w >= level.toad.x - 16) { p.vx = 0; o.phase = 'toad'; o.t = 0; }
  } else if (o.phase === 'toad' && o.t > 3.6) return 'done';
  if (b && !b.gone && o.phase !== 'collapse') { b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt); b.y += b.vy * dt; if (b.y > ROWS * TILE + 60) b.gone = true; }
  followCam(level, p);
  agePopups(level, dt, 1.2);
  return null;
}

// 1-2's exit: the pet walks into the side pipe and comes up out of a pipe outside.
function stepWarp(st, dt, game) {
  const w = st.warp, p = st.player;
  w.t += dt;
  if (w.phase === 'in') {
    p.x += 40 * dt; p.vx = 0;
    if (w.t > 0.8) {
      st.level = createLevel(WORLDS[st.stage].exit, st.hard);
      const [x, h] = st.level.area.pipes.find(([px]) => px === st.level.entryPipe);
      fitBox(p, sizeFor(game));
      w.top = (GROUND - h) * TILE; w.phase = 'out'; w.t = 0;
      Object.assign(p, { x: x * TILE + TILE - p.w / 2, y: w.top + 2, vx: 0, vy: 0, face: 1, onGround: false, lift: null });
    }
  } else {
    p.y -= 45 * dt;
    if (p.y + p.h <= w.top) { p.y = w.top - p.h; p.onGround = true; st.warp = null; }
  }
  agePopups(st.level, dt);
  return null;
}

// Returns 'hurt' | 'fell' | 'done' | null; the engine handles hearts and stage changes.
export function step(st, dt, keys, game, random = Math.random) {
  st.time = (st.time ?? 0) + dt;
  if (st.outro) return st.outro.kind === 'axe' ? stepAxeOutro(st, dt) : stepFlagOutro(st, dt);
  if (st.warp) return stepWarp(st, dt, game);
  const result = stepMario(st, dt, keys, game, random);
  if (result === 'fell') respawn(st);
  return result;
}

// Knocks an enemy over: it flips upside down and drops off the screen, as in the original.
function knock(level, g, points, from) {
  g.flipped = true; g.vy = -240; g.vx = (g.x + g.w / 2 >= from ? 1 : -1) * 60; g.squashed = 0;
  popup(level, g.x, g.y - 10, points);
}

function throwFireball(level, p) {
  if (level.fireballs.filter((f) => !f.pop).length >= MAX_FIRE) return;
  level.fireballs.push({ x: p.face > 0 ? p.x + p.w - 4 : p.x - 4, y: p.y + Math.min(10, p.h / 3), w: 8, h: 8, vx: FIRE_SPEED * p.face, vy: 150, t: 0, pop: 0 });
}

function stepMario(s, dt, keys, game, random) {
  const level = s.level, p = s.player, runner = game.runner, safe = runner?.invincible > 0;
  fitBox(p, sizeFor(game)); // grew from a mushroom, or shrank from a hit
  // With the fire flower Space throws (one per press) and ↑ jumps; otherwise both jump.
  const fire = !!runner?.fire, space = keys.has('Space'), up = keys.has('ArrowUp');
  const left = keys.has('ArrowLeft'), right = keys.has('ArrowRight'), action = fire ? up : space || up;
  const dir = Number(right) - Number(left);
  if (dir) p.face = dir;
  if (fire && space && !s.fireHeld) throwFireball(level, p);
  s.fireHeld = fire && space;

  // Lifts carry whoever stands on them; they loop through the pit (going up, or going down).
  for (const L of level.lifts) {
    const dy = L.vy * dt; L.y += dy;
    if (p.lift === L) p.y += dy;
    if (L.vy < 0 && L.y < -20) { L.y += ROWS * TILE + 40; if (p.lift === L) p.lift = null; }
    if (L.vy > 0 && L.y > ROWS * TILE + 20) { L.y -= ROWS * TILE + 40; if (p.lift === L) p.lift = null; }
  }

  if (dir) p.vx = Math.max(-MAX_RUN, Math.min(MAX_RUN, p.vx + dir * ACCEL * dt));
  else p.vx = Math.sign(p.vx) * Math.max(0, Math.abs(p.vx) - FRICTION * dt);
  if (action && p.onGround) { p.vy = JUMP; p.held = true; p.onGround = false; p.lift = null; }
  if (!action) p.held = false;
  if (!p.held && p.vy < CUT) p.vy = CUT;
  p.vy = Math.min(MAX_FALL, p.vy + GRAVITY * (p.held && p.vy < 0 ? HOLD_GRAVITY : 1) * dt);
  const feet = p.y + p.h;
  const hit = move(level, p, p.vx * dt, p.vy * dt);
  if (hit.left || hit.right) p.vx = 0;
  if (hit.bottom) { p.vy = 0; p.onGround = true; level.combo = 0; } else p.onGround = false;
  p.lift = null;
  if (!hit.bottom && p.vy >= 0) for (const L of level.lifts) {
    if (p.x + p.w > L.x + 2 && p.x < L.x + L.w - 2 && feet <= L.y + 3 && p.y + p.h >= L.y) { p.y = L.y - p.h; p.vy = 0; p.onGround = true; p.lift = L; level.combo = 0; break; }
  }
  if (hit.top) {
    p.vy = 40;
    const { tx, ty } = hit.top, type = tileAt(level, tx, ty);
    if (type === QUESTION) {
      level.grid[ty * level.width + tx] = USED;
      const key = `${tx},${ty}`, area = level.area;
      if (area.flowers?.has(key) || area.mushrooms?.has(key)) level.items.push({ kind: area.flowers?.has(key) ? 'flower' : 'mushroom', x: tx * TILE + 1, y: ty * TILE, w: 18, h: 18, vx: 0, vy: 0, rise: TILE, top: ty * TILE - TILE });
      else { level.coins++; game.score += 100; level.popups.push({ x: tx * TILE + 4, y: ty * TILE - 6, t: 0, coin: true, text: '100' }); }
    }
    // A big pet breaks bricks; a small one only bumps them.
    if (type === BRICK && runner?.big) {
      level.grid[ty * level.width + tx] = EMPTY; game.score += 50;
      for (const [dx, dy] of [[-60, -260], [60, -260], [-40, -180], [40, -180]]) level.debris.push({ x: tx * TILE + 10, y: ty * TILE + 10, vx: dx, vy: dy, t: 0 });
    } else if (type === BRICK || type === QUESTION) level.bumps.push({ tx, ty, t: 0 });
    // Anything standing on a bumped block gets knocked out, like in the original.
    for (const g of [...level.goombas, ...level.koopas]) if (g.alive && !g.squashed && !g.flipped && Math.abs(g.x + g.w / 2 - (tx * TILE + 10)) < 16 && Math.abs(g.y + g.h - ty * TILE) < 4) { game.score += 100; knock(level, g, 100, tx * TILE + 10); }
  }
  // The camera only moves forward, and the runner cannot walk back off screen.
  followCam(level, p);
  if (p.x < level.cam) { p.x = level.cam; p.vx = Math.max(0, p.vx); }

  // Floating coins (1-2) are picked up by touch: 200 each, as in the original.
  for (let ty = Math.floor(p.y / TILE); ty <= Math.floor((p.y + p.h - 1) / TILE); ty++) for (let tx = Math.floor(p.x / TILE); tx <= Math.floor((p.x + p.w - 1) / TILE); tx++) {
    if (tileAt(level, tx, ty) === COIN) { level.grid[ty * level.width + tx] = EMPTY; level.coins++; game.score += 200; }
  }

  // Mushrooms rise out of their block, then slide along and bounce off walls; touching one powers the pet up.
  // The fire flower rises and stays put; touching it gives fire.
  for (const m of level.items) {
    if (m.rise > 0) { const d = Math.min(m.rise, 30 * dt); m.y -= d; m.rise -= d; if (m.rise <= 0 && m.kind !== 'flower') m.vx = 70; continue; }
    if (m.kind !== 'flower') {
      m.vy = Math.min(MAX_FALL, m.vy + GRAVITY * dt);
      const mh = move(level, m, m.vx * dt, m.vy * dt);
      if (mh.left || mh.right) m.vx = -m.vx;
      if (mh.bottom) m.vy = 0;
      if (m.y > ROWS * TILE + 40) m.gone = true;
    }
    if (!m.gone && overlap(p, m)) {
      m.gone = true; game.score += 1000;
      if (m.kind === 'flower') {
        if (runner) { fireUp(runner); fitBox(p, sizeFor(game)); }
        popup(level, m.x, m.y - 8, '1000');
      } else {
        const hearts = runner?.lives;
        if (runner) { powerUp(runner); fitBox(p, sizeFor(game)); }
        popup(level, m.x, m.y - 8, runner?.lives > hearts ? '♥ +1' : '1000');
      }
    }
  }
  level.items = level.items.filter((m) => !m.gone);
  for (const d of level.debris) { d.t += dt; d.vy += GRAVITY * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
  level.debris = level.debris.filter((d) => d.t < 1.2);

  const enemies = [...level.goombas, ...level.koopas], live = (g) => g.alive && g.active && !g.flipped && !g.squashed;
  // Fireballs: bounce along the floor, burst on walls; they knock over goombas and koopas and hurt Bowser.
  for (const f of level.fireballs) {
    f.t += dt;
    if (f.pop) { f.pop += dt; continue; }
    f.vy = Math.min(MAX_FALL, f.vy + GRAVITY * dt);
    const fh = move(level, f, f.vx * dt, f.vy * dt);
    if (fh.bottom) f.vy = FIRE_BOUNCE;
    if (fh.top) f.vy = Math.abs(f.vy);
    if (fh.left || fh.right) f.pop = dt;
    if (f.x < level.cam - 20 || f.x > level.cam + VIEW + 20 || f.y > ROWS * TILE) f.gone = true;
    for (const g of enemies) if (!f.pop && live(g) && overlap(f, g)) { game.score += 200; knock(level, g, 200, f.x); f.pop = dt; }
    const b = level.bowser;
    if (!f.pop && b && !b.dead && b.active && overlap(f, b)) {
      f.pop = dt; b.hp--;
      if (b.hp <= 0) { b.dead = true; b.vy = -200; game.score += 5000; popup(level, b.x, b.y - 10, 5000); }
    }
  }
  level.fireballs = level.fireballs.filter((f) => !f.gone && f.pop < 0.15);

  let result = null;
  const hurt = () => { if (!safe) result = 'hurt'; };
  for (const g of enemies) {
    if (!g.alive) continue;
    if (g.flipped) { g.vy = Math.min(MAX_FALL, g.vy + GRAVITY * dt); g.x += g.vx * dt; g.y += g.vy * dt; if (g.y > ROWS * TILE + 40) g.alive = false; continue; }
    if (g.squashed) { g.squashed -= dt; if (g.squashed <= 0) g.alive = false; continue; }
    if (!g.active) { if (g.x < level.cam + VIEW + 40) g.active = true; else continue; }
    // A koopa left in its shell climbs back out after a while (its legs show first).
    if (g.shell && !g.vx) { g.wake += dt; if (g.wake > 7) { Object.assign(g, { shell: false, y: g.y - 10, h: 26, wake: 0, vx: (p.x < g.x ? -40 : 40) * (level.hard ? 1.25 : 1) }); } }
    g.kickT = Math.max(0, (g.kickT ?? 0) - dt);
    g.vy = Math.min(MAX_FALL, g.vy + GRAVITY * dt);
    const gh = move(level, g, g.vx * dt, g.vy * dt);
    if (gh.left || gh.right) g.vx = -g.vx;
    if (gh.bottom) g.vy = 0;
    if (g.y > ROWS * TILE + 40 || g.x < level.cam - 80 || (g.shell && g.vx && g.x > level.cam + VIEW + 60)) { g.alive = false; continue; }
    // A moving shell knocks over everything in its way: 500, 800, 1000, 2000, 4000, 5000, 8000.
    if (g.shell && g.vx) for (const o of enemies) if (o !== g && live(o) && overlap(g, o)) {
      const points = SHELL_CHAIN[Math.min(g.chain, SHELL_CHAIN.length - 1)]; g.chain++;
      game.score += points; knock(level, o, points, g.x + g.w / 2);
    }
    if (!overlap(p, g)) continue;
    const stomp = p.vy > 0 && p.y + p.h - g.y < 12;
    if (g.shell && !g.vx) {
      // Touching a resting shell kicks it away from the pet (jumping on it too).
      g.vx = (p.x + p.w / 2 < g.x + g.w / 2 ? 1 : -1) * SHELL_SPEED; g.kickT = 0.3; g.chain = 0; g.wake = 0;
      game.score += 400; popup(level, g.x, g.y - 10, 400);
      if (stomp) p.vy = -260;
    } else if (stomp) {
      // Chained stomps without touching the ground double: 100, 200, 400, 800 …
      const points = 100 * 2 ** Math.min(level.combo, 6); level.combo++;
      game.score += points; p.vy = p.held ? -380 : -260;
      popup(level, g.x, g.y - 10, points);
      if (g.kind === 'koopa' && !g.shell) Object.assign(g, { shell: true, y: g.y + 10, h: 16, vx: 0, wake: 0 });
      else if (g.shell) { g.vx = 0; g.wake = 0; }
      else g.squashed = 0.45;
    } else if (!(g.shell && g.kickT > 0)) hurt();
  }

  if (level.theme === 'castle') stepCastle(s, dt, game, random, hurt);
  for (const b of level.bumps) b.t += dt;
  level.bumps = level.bumps.filter((b) => b.t < 0.2);
  agePopups(level, dt);
  if (p.y > ROWS * TILE + 20 || (level.theme === 'castle' && p.y + p.h > LAVA_Y + 2)) result = 'fell';
  if (level.flagX != null && !level.done && p.x + p.w >= level.flagX * TILE + 8) {
    const bonus = flagBonus(p.y); level.done = true; game.score += bonus;
    popup(level, level.flagX * TILE + 14, p.y, bonus);
    s.outro = { phase: 'slide', t: 0 }; p.vy = 0; level.fireballs = [];
  }
  // 1-2: standing at the side pipe's mouth and pushing right goes in.
  const side = level.sidePipe;
  if (side && right && p.onGround && hit.right && p.x + p.w >= side.x * TILE - 1 && p.y + p.h >= (side.y + 2) * TILE - 1) {
    s.warp = { phase: 'in', t: 0 }; level.fireballs = []; p.vx = 0;
  }
  // The castle: touching the axe (at any height) drops the bridge.
  const axe = level.axe;
  if (axe && !axe.taken && result !== 'fell' && p.x + p.w >= axe.x) {
    axe.taken = true; level.done = true; level.flames = []; level.fireballs = [];
    const b = level.bowser;
    if (b && !b.dead) { game.score += 5000; popup(level, b.x, b.y - 10, 5000); b.vy = 0; }
    Object.assign(p, { x: axe.x, y: GROUND * TILE - p.h, vx: 0, vy: 0, onGround: true, face: 1 });
    s.outro = { kind: 'axe', phase: 'collapse', t: 0, clock: 0, col: level.bridge[1] };
    return null;
  }
  return result;
}

// Firebars, Podoboos and Bowser with his fire.
function stepCastle(s, dt, game, random, hurt) {
  const level = s.level, p = s.player, quick = level.hard ? 1.3 : 1;
  const body = { x: p.x + 2, y: p.y + 2, w: p.w - 4, h: p.h - 4 };
  for (const bar of level.firebars) {
    bar.phase += dt * 32 / BAR_REV * quick;
    for (const [x, y] of barBalls(bar)) if (overlap(body, { x: x - 4, y: y - 4, w: 8, h: 8 })) hurt();
  }
  // Podoboos leap out of the lava to about five tiles above the floor, fall back in, wait and leap again.
  for (const pb of level.podoboos) {
    if (pb.wait > 0) { pb.wait -= dt * quick; if (pb.wait <= 0) pb.vy = -Math.sqrt(2 * 900 * (pb.y - (GROUND - 6) * TILE)); continue; }
    pb.vy += 900 * dt; pb.y += pb.vy * dt;
    if (pb.vy > 0 && pb.y > LAVA_Y + 30) { pb.y = LAVA_Y + 30; pb.vy = 0; pb.wait = 1 + random() * 1.5; }
    if (overlap(body, { x: pb.x - 7, y: pb.y, w: 14, h: 16 })) hurt();
  }
  const b = level.bowser;
  if (b && !b.gone) {
    if (!b.active && b.x < level.cam + VIEW + 260) b.active = true;
    if (b.dead) { b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt); b.y += b.vy * dt; if (b.y > ROWS * TILE + 60) b.gone = true; }
    else if (b.active) {
      // Bowser paces his stretch of bridge facing the pet, hops now and then, and breathes fire to the left.
      b.dir = p.x + p.w / 2 < b.x + b.w / 2 ? -1 : 1;
      b.moveT -= dt;
      if (b.moveT <= 0) { b.target = b.x0 + random() * (b.x1 - b.x0); b.moveT = 1 + random() * 1.5; }
      b.vx = b.target == null || Math.abs(b.target - b.x) < 3 ? 0 : Math.sign(b.target - b.x) * 32;
      b.jumpT -= dt;
      if (b.jumpT <= 0 && b.onGround !== false) { b.vy = -330; b.jumpT = 2 + random() * 2.5; }
      b.vy = Math.min(MAX_FALL, b.vy + GRAVITY * dt);
      const bh = move(level, b, b.vx * dt, b.vy * dt);
      b.onGround = bh.bottom; if (bh.bottom) b.vy = 0;
      b.mouth = Math.max(0, b.mouth - dt);
      b.fireT -= dt * quick;
      if (b.fireT <= 0) {
        b.fireT = 2.2 + random() * 2;
        if (b.dir < 0) {
          // The flame drifts toward one of three heights above the floor, like the original's.
          const ty = GROUND * TILE - [12, 30, 48][Math.floor(random() * 3) % 3] - 5;
          level.flames.push({ x: b.x - 26, y: b.y + 6, w: 30, h: 10, vx: -110 * quick, ty }); b.mouth = 0.4;
        }
      }
      if (overlap(body, b)) hurt();
    }
  }
  for (const f of level.flames) {
    f.x += f.vx * dt; f.y += Math.sign(f.ty - f.y) * Math.min(Math.abs(f.ty - f.y), 40 * dt);
    if (overlap(body, f)) hurt();
  }
  level.flames = level.flames.filter((f) => f.x + f.w > level.cam - 20);
}
function barBalls(bar) {
  const angle = Math.floor(bar.phase) * (Math.PI * 2 / 32) * bar.turn;
  return Array.from({ length: BAR_BALLS }, (_, i) => [bar.x + Math.cos(angle) * i * BAR_GAP, bar.y + Math.sin(angle) * i * BAR_GAP]);
}

// Puts the runner back on solid ground at the left edge of the view after a fall.
const groundTop = (level, tx) => { let ty = GROUND; while (ty > 0 && SOLIDS.has(tileAt(level, tx, ty - 1))) ty--; return ty; };
export function respawn(s) {
  const level = s.level, p = s.player;
  const ok = (tx) => SOLIDS.has(tileAt(level, tx, GROUND)) && SOLIDS.has(tileAt(level, tx + 1, GROUND)) && groundTop(level, tx) === groundTop(level, tx + 1);
  let tx = Math.floor((level.cam + 40) / TILE);
  while (tx < level.width - 1 && !ok(tx)) tx++;
  Object.assign(p, { x: tx * TILE + 1, y: groundTop(level, tx) * TILE - p.h - 1, vx: 0, vy: 0, onGround: false, lift: null });
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
// Draws a pixel map (one character per pixel, '.' clear) at `s` px per pixel, optionally mirrored.
function sprite(ctx, rows, colors, x, y, s = 2, flipX = false, flipY = false) {
  const h = rows.length, w = rows[0].length;
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
    const ch = rows[r][c]; if (ch === '.') continue;
    ctx.fillStyle = colors[ch];
    ctx.fillRect(Math.round(x + (flipX ? w - 1 - c : c) * s), Math.round(y + (flipY ? h - 1 - r : r) * s), s, s);
  }
}
// The original's three palettes: brown overworld, blue underground, grey castle.
const PALETTES = {
  over: { solid: '#c84c0c', solidLight: '#e8a070', solidDark: '#5c1c00', brick: '#c84c0c', brickLight: '#f8b090', mortar: '#2c0c00', hardLight: '#f0a070', sky: '#5c94fc', goomba: '#b45000', face: '#fcd8a8' },
  under: { solid: '#1c5cc0', solidLight: '#3cbcfc', solidDark: '#001850', brick: '#00889c', brickLight: '#7ce8f8', mortar: '#00141c', hardLight: '#3cbcfc', sky: '#000', goomba: '#1878a8', face: '#a8e0f8' },
  castle: { solid: '#9c9c9c', solidLight: '#dcdcdc', solidDark: '#4c4c4c', brick: '#9c9c9c', brickLight: '#dcdcdc', mortar: '#202020', hardLight: '#dcdcdc', sky: '#000', goomba: '#b45000', face: '#fcd8a8' },
};
function brickTile(ctx, c, x, y) {
  px(ctx, c.brick, x, y, 20, 20); px(ctx, c.brickLight, x, y, 20, 1);
  for (const r of [0, 5, 10, 15]) px(ctx, c.mortar, x, y + r + 4, 20, 1);
  for (const r of [0, 10]) { px(ctx, c.mortar, x + 9, y + r, 1, 5); px(ctx, c.mortar, x + 4, y + r + 5, 1, 5); px(ctx, c.mortar, x + 14, y + r + 5, 1, 5); }
}
function block(ctx, type, x, y, bump, theme = 'over') {
  const c = PALETTES[theme];
  y -= bump;
  // Castle walls and floors are grey bricks.
  if (type === SOLID && theme === 'castle') brickTile(ctx, c, x, y);
  else if (type === SOLID) { px(ctx, c.solid, x, y, 20, 20); px(ctx, c.solidLight, x, y, 20, 2); px(ctx, c.solidDark, x, y + 18, 20, 2); px(ctx, c.solidDark, x + 9, y + 2, 2, 7); px(ctx, c.solidDark, x, y + 9, 20, 2); px(ctx, c.solidDark, x + 3, y + 11, 2, 7); px(ctx, c.solidDark, x + 15, y + 11, 2, 7); }
  else if (type === BRICK) brickTile(ctx, c, x, y);
  else if (type === QUESTION) {
    px(ctx, '#f8b800', x, y, 20, 20); px(ctx, '#fcf0a0', x, y, 20, 2); px(ctx, '#9c4a00', x, y + 18, 20, 2); px(ctx, '#9c4a00', x + 18, y, 2, 20);
    for (const [a, b] of [[6, 4], [8, 4], [10, 4], [12, 6], [12, 8], [10, 9], [8, 10], [8, 12], [8, 15]]) px(ctx, '#9c4a00', x + a, y + b, 3, 2);
    for (const [a, b] of [[2, 2], [16, 2], [2, 16], [16, 16]]) px(ctx, '#9c4a00', x + a, y + b, 2, 2);
  } else if (type === USED) { px(ctx, '#9c4a00', x, y, 20, 20); px(ctx, '#c86c20', x + 1, y + 1, 18, 18); for (const [a, b] of [[2, 2], [16, 2], [2, 16], [16, 16]]) px(ctx, '#5c1c00', x + a, y + b, 2, 2); }
  else if (type === HARD) { px(ctx, c.solid, x, y, 20, 20); px(ctx, c.hardLight, x, y, 20, 3); px(ctx, c.hardLight, x, y, 3, 20); px(ctx, c.solidDark, x, y + 17, 20, 3); px(ctx, c.solidDark, x + 17, y, 3, 20); }
}
function pipe(ctx, x, top, h, noLip = false) {
  const body = '#00a800', light = '#80d010', dark = '#005800', lip = noLip ? 0 : 18;
  if (!noLip) { px(ctx, dark, x - 2, top, 44, 18); px(ctx, body, x, top + 2, 40, 14); px(ctx, light, x + 6, top + 2, 6, 14); px(ctx, light, x + 14, top + 2, 2, 14); }
  px(ctx, dark, x + 2, top + lip, 36, h * TILE - lip); px(ctx, body, x + 4, top + lip, 32, h * TILE - lip); px(ctx, light, x + 9, top + lip, 5, h * TILE - lip); px(ctx, light, x + 16, top + lip, 2, h * TILE - lip);
}
// A pipe lying on its side with its mouth to the left (1-2's exit).
function sidePipe(ctx, x, top, len) {
  const body = '#00a800', light = '#80d010', dark = '#005800', w = len * TILE - 18;
  px(ctx, dark, x + 18, top + 2, w, 36); px(ctx, body, x + 18, top + 4, w, 32); px(ctx, light, x + 18, top + 9, w, 5); px(ctx, light, x + 18, top + 16, w, 2);
  px(ctx, dark, x, top - 2, 18, 44); px(ctx, body, x + 2, top, 14, 40); px(ctx, light, x + 2, top + 6, 14, 6); px(ctx, light, x + 2, top + 14, 14, 2);
}
function goomba(ctx, g, x, c = PALETTES.over) {
  if (g.squashed) { px(ctx, c.goomba, x, g.y + g.h - 7, g.w, 5); px(ctx, '#000', x + 2, g.y + g.h - 2, g.w - 4, 2); return; }
  const step = Math.floor(x / 6) % 2;
  px(ctx, c.goomba, x + 2, g.y, g.w - 4, 4); px(ctx, c.goomba, x, g.y + 4, g.w, 7); px(ctx, c.face, x + 5, g.y + 11, g.w - 10, 4);
  px(ctx, '#fff', x + 3, g.y + 5, 4, 4); px(ctx, '#fff', x + g.w - 7, g.y + 5, 4, 4); px(ctx, '#000', x + 4, g.y + 6, 2, 3); px(ctx, '#000', x + g.w - 6, g.y + 6, 2, 3);
  px(ctx, '#000', x + 4, g.y + 3, 4, 1); px(ctx, '#000', x + g.w - 8, g.y + 3, 4, 1);
  px(ctx, '#000', x + (step ? 0 : 2), g.y + 15, 7, 3); px(ctx, '#000', x + g.w - (step ? 9 : 7), g.y + 15, 7, 3);
}
// Green Koopa Troopa (walking left; mirrored when walking right), its shell, and the two leg frames.
const KOOPA = [
  '.yy......', 'ywky.....', 'yyyy.....', 'yyyy.....', '.yy..ggg.', '.yy.gwgwg', '..yggwggg',
  '..ygwgwgg', '..ygggwgg', '...wgwggw', '...wwwwww', '...yy.yy.', '..yyy.yyy',
];
const KOOPA_STEP = ['....yyyy.', '...yyy.yy'];
const SHELL = ['...ggg...', '..gwgwg..', '.ggwgwgg.', 'gwggwggwg', 'ggwgggwgg', 'wwwwwwwww', '.yyyyyyy.', '..wwwww..'];
const KOOPA_COLORS = { y: '#fca044', k: '#000', w: '#fcfcfc', g: '#00a800' };
function koopa(ctx, g, x, time) {
  if (g.shell) {
    sprite(ctx, SHELL, KOOPA_COLORS, x, g.y, 2, false, !!g.flipped);
    // About to climb out: the legs wriggle under the shell.
    if (!g.flipped && g.wake > 5 && Math.floor(time * 8) % 2) { px(ctx, '#fca044', x + 2, g.y + 14, 4, 2); px(ctx, '#fca044', x + 12, g.y + 14, 4, 2); }
    return;
  }
  const rows = Math.floor(x / 6) % 2 ? [...KOOPA.slice(0, 11), ...KOOPA_STEP] : KOOPA;
  sprite(ctx, rows, KOOPA_COLORS, x, g.y, 2, g.vx > 0, !!g.flipped);
}
// Super Mushroom: red cap with white spots over a pale stem; `shown` is how much has risen out of the block.
function mushroom(ctx, x, y, shown) {
  ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, 24, Math.max(0, shown) + 2); ctx.clip();
  px(ctx, '#e8402e', x + 2, y, 14, 4); px(ctx, '#e8402e', x, y + 3, 18, 7);
  px(ctx, '#fff', x + 3, y + 3, 4, 4); px(ctx, '#fff', x + 11, y + 3, 4, 4); px(ctx, '#fff', x + 7, y, 4, 3);
  px(ctx, '#f6d8a8', x + 4, y + 10, 10, 8); px(ctx, '#000', x + 6, y + 12, 2, 3); px(ctx, '#000', x + 10, y + 12, 2, 3);
  ctx.restore();
}
// Fire Flower: petals that flash through the palette, a white-and-yellow middle, a green stem with two leaves.
function flower(ctx, x, y, shown, time) {
  ctx.save(); ctx.beginPath(); ctx.rect(x - 2, y - 2, 24, Math.max(0, shown) + 2); ctx.clip();
  const petal = ['#f83800', '#fca044', '#f8d878', '#fca044'][Math.floor(time * 10) % 4];
  px(ctx, petal, x + 3, y, 12, 2); px(ctx, petal, x + 1, y + 2, 16, 6); px(ctx, petal, x + 3, y + 8, 12, 2);
  px(ctx, '#fca044', x + 4, y + 2, 10, 6); px(ctx, '#fcfcfc', x + 6, y + 3, 6, 4);
  px(ctx, '#00a800', x + 8, y + 10, 2, 8); px(ctx, '#00a800', x + 2, y + 12, 6, 3); px(ctx, '#00a800', x + 10, y + 12, 6, 3);
  px(ctx, '#005800', x + 2, y + 15, 4, 1); px(ctx, '#005800', x + 12, y + 15, 4, 1);
  ctx.restore();
}
function fireball(ctx, x, y, time) {
  const r = Math.floor(time * 16) % 2;
  px(ctx, '#f83800', x + 1, y, 6, 8); px(ctx, '#f83800', x, y + 1, 8, 6); px(ctx, '#fca044', x + 2, y + 2, 4, 4); px(ctx, '#fcfcfc', x + (r ? 2 : 4), y + (r ? 2 : 4), 2, 2);
}
function burst(ctx, x, y) { for (const [a, b] of [[-3, -3], [7, -3], [-3, 7], [7, 7]]) px(ctx, '#fca044', x + a, y + b, 4, 4); px(ctx, '#f83800', x + 1, y + 1, 6, 6); }
function coin(ctx, x, y, time) {
  const w = [8, 6, 2, 6][Math.floor(time * 6) % 4];
  px(ctx, '#9c4a00', x + 10 - w / 2 - 1, y + 2, w + 2, 16); px(ctx, '#f8b800', x + 10 - w / 2, y + 3, w, 14); if (w > 2) px(ctx, '#fcf0a0', x + 10 - w / 2 + 1, y + 5, 2, 10);
}
// The orange lifts of 1-2.
function lift(ctx, L, x) {
  px(ctx, '#fca044', x, L.y, L.w, L.h); px(ctx, '#fcd8a8', x, L.y, L.w, 2); px(ctx, '#c84c0c', x, L.y + L.h - 2, L.w, 2);
  for (let i = 4; i < L.w - 4; i += 10) px(ctx, '#c84c0c', x + i, L.y + 4, 3, 3);
}
const PODOBOO = ['..ooo..', '.oyyyo.', 'oywywyo', 'oykykyo', 'oyyyyyo', '.oyyyo.', '.o.o.o.', 'o..o..o'];
const PODOBOO_COLORS = { o: '#f83800', y: '#fca044', w: '#fcfcfc', k: '#000' };
// Bowser, facing left: horns, red mane, spiked green shell, pale belly; the mouth opens when he breathes fire.
const BOWSER = [
  '..w.......w.......', '..ww.....ww..rr...', '...gggggggg.rrrr..', '..ggwkgggggrrww.w.', '.gggkkgggggrrwgwgw', 'gggggggggggrwggggg',
  'wkwkwggggggwggwggg', 'kkkkkggyyywgggwggw', '.wkwkgyybbwggggggg', '....yybbbbwgwggwgg', '...yybbbbbbwgggggg', '...yybbbbbbbwgggdg',
  '....ybbbbbbbwgggd.', '....yybbbbbbggddd.', '.....yyyyyyyydd...', '....yyyy..yyyy....', '...wyyyy..yyyyw...', '...www.....www....',
];
const BOWSER_COLORS = { g: '#00a800', d: '#005800', y: '#fca044', b: '#f8d878', w: '#fcfcfc', k: '#000', r: '#e45c10' };
const TOAD = ['...wwww...', '.wrrwwrrw.', 'wrrrwwrrrw', 'wwwwwwwwww', '.wwwwwwww.', '..skssks..', '..ssssss..', '.bbbssbbb.', 'sbbbbbbbbs', '.wwwwwwww.', '..ww..ww..', '.ddd..ddd.'];
const TOAD_COLORS = { w: '#fcfcfc', r: '#f83800', s: '#fcbcb0', k: '#000', b: '#0058f8', d: '#9c4a00' };
function lava(ctx, x, tx, time) {
  px(ctx, '#f83800', x, LAVA_Y, 20, ROWS * TILE - LAVA_Y);
  for (let i = 0; i < 4; i++) { const h = 2 + Math.round(2 + 2 * Math.sin(time * 4 + (tx * 4 + i) * 0.9)); px(ctx, '#fca044', x + i * 5, LAVA_Y - h + 4, 5, h); }
}
function bridgeTile(ctx, x, y) {
  px(ctx, '#c84c0c', x, y, 20, 10); px(ctx, '#fca044', x, y, 20, 2); px(ctx, '#5c1c00', x, y + 8, 20, 2);
  px(ctx, '#000', x + 4, y + 4, 4, 3); px(ctx, '#000', x + 12, y + 4, 4, 3);
}
function axeSprite(ctx, x, y, time) {
  const blade = Math.floor(time * 4) % 2 ? '#bcbcbc' : '#fcfcfc';
  px(ctx, '#c84c0c', x + 7, y + 8, 3, 26); px(ctx, '#5c1c00', x + 9, y + 8, 1, 26);
  px(ctx, '#000', x, y, 16, 16); px(ctx, blade, x + 1, y + 1, 14, 14); px(ctx, '#7c7c7c', x + 1, y + 11, 14, 4); px(ctx, '#000', x + 7, y + 4, 3, 8);
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
function flagAndCastle(ctx, level, cam) {
  const fx = level.flagX * TILE - cam + 9;
  if (fx < -120 || fx > VIEW + 20) return;
  px(ctx, '#80d010', fx, 2 * TILE + 8, 2, (GROUND - 3) * TILE + 12 - 8); ctx.fillStyle = '#00a800'; ctx.beginPath(); ctx.arc(fx + 1, 2 * TILE + 6, 5, 0, Math.PI * 2); ctx.fill();
  const fy = level.flagY; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx - 22, fy + 9); ctx.lineTo(fx, fy + 18); ctx.fill(); px(ctx, '#00a800', fx - 10, fy + 6, 6, 6);
  const cx = (level.flagX + 4) * TILE - cam, cy = (GROUND - 5) * TILE;
  for (let r = 0; r < 5; r++) for (let c = 0; c < 5; c++) if (r >= 2 || (c >= 1 && c <= 3)) block(ctx, BRICK, cx + c * TILE, cy + r * TILE, 0);
  for (const c of [0, 2, 4]) block(ctx, BRICK, cx + c * TILE, cy + TILE * 2 - 10, 0);
  px(ctx, '#000', cx + 2 * TILE + 3, cy + 3 * TILE, 14, 2 * TILE); px(ctx, '#000', cx + 2 * TILE + 3, cy + TILE + 2, 4, 10); px(ctx, '#000', cx + 2 * TILE + 13, cy + TILE + 2, 4, 10);
}
function paintCastle(ctx, s, cam) {
  const level = s.level, time = s.time ?? 0;
  for (const pb of level.podoboos) if (pb.y < LAVA_Y + 8) sprite(ctx, PODOBOO, PODOBOO_COLORS, pb.x - 7 - cam, pb.y, 2, false, pb.vy > 0);
  // Lava fills every pit and runs under the bridge.
  const first = Math.floor(cam / TILE), last = Math.min(level.width - 1, Math.ceil((cam + VIEW) / TILE));
  for (let tx = first; tx <= last; tx++) if (!SOLIDS.has(tileAt(level, tx, GROUND + 1))) lava(ctx, tx * TILE - cam, tx, time);
  for (const bar of level.firebars) for (const [x, y] of barBalls(bar)) fireball(ctx, x - 4 - cam, y - 4, time);
  const axe = level.axe;
  if (axe && !axe.taken) {
    // The chain from the axe holds up the bridge's end.
    for (let i = 0; i < 4; i++) px(ctx, '#7c7c7c', axe.x - cam - 4 - i * 6, axe.y + 12 + i * 6, 4, 4);
    axeSprite(ctx, axe.x - cam, axe.y, time);
  }
  const b = level.bowser;
  if (b && !b.gone && b.x - cam > -60 && b.x - cam < VIEW + 20) {
    const rows = b.mouth > 0 ? BOWSER.map((r, i) => (i === 7 ? '.' + r.slice(1, 5).replace(/k/g, '.') + r.slice(5) : r)) : BOWSER;
    sprite(ctx, rows, BOWSER_COLORS, b.x - cam, b.y, 2, b.dir > 0, b.dead);
  }
  for (const f of level.flames) {
    const x = f.x - cam, flick = Math.floor(time * 12) % 2;
    px(ctx, '#f83800', x, f.y + 2, f.w, f.h - 4); px(ctx, '#fca044', x + 2, f.y + 3, f.w - 10, f.h - 6); px(ctx, '#fcfcfc', x + 2, f.y + 4, 8, 2);
    px(ctx, '#f83800', x + f.w - 8, f.y + (flick ? 0 : 6), 8, 4);
  }
  if (level.toad) {
    const t = level.toad; sprite(ctx, TOAD, TOAD_COLORS, t.x - cam, t.y, 2);
    const o = s.outro;
    if (o?.phase === 'toad') {
      ctx.save(); ctx.fillStyle = '#fcfcfc'; ctx.font = 'bold 12px ui-monospace, Consolas, monospace'; ctx.textAlign = 'center';
      if (o.t > 0.3) ctx.fillText('THANK YOU PET!', VIEW / 2, 3 * TILE + 10);
      if (o.t > 1.2) { ctx.fillText('BUT OUR PRINCESS IS IN', VIEW / 2, 5 * TILE); ctx.fillText('ANOTHER CASTLE!', VIEW / 2, 5 * TILE + 18); }
      ctx.restore();
    }
  }
}
export function paint(ctx, s, game, drawRunner) {
  const level = s.level, cam = level.cam, theme = level.theme, c = PALETTES[theme], time = s.time ?? 0;
  px(ctx, c.sky, 0, 0, VIEW, ROWS * TILE);
  if (theme === 'over') scenery(ctx, cam);
  const first = Math.floor(cam / TILE), last = Math.min(level.width - 1, Math.ceil((cam + VIEW) / TILE));
  for (let ty = 0; ty < ROWS; ty++) for (let tx = first; tx <= last; tx++) {
    const type = tileAt(level, tx, ty); if (type === EMPTY || type === PIPE) continue;
    if (type === COIN) { coin(ctx, tx * TILE - cam, ty * TILE, time); continue; }
    if (type === BRIDGE) { bridgeTile(ctx, tx * TILE - cam, ty * TILE); continue; }
    const bump = level.bumps.find((b) => b.tx === tx && b.ty === ty);
    block(ctx, type, tx * TILE - cam, ty * TILE, bump ? Math.sin(bump.t / 0.2 * Math.PI) * 6 : 0, theme);
  }
  // Going into a pipe or coming out of one, the pet is drawn behind it.
  const q = pose(s, game), pet = () => { if (!q.hidden) drawRunner(q.x, q.bottom, { hat: q.hat, onGround: q.onGround, flip: q.flip }); };
  if (s.warp) pet();
  for (const [x, h, noLip] of level.area.pipes ?? []) if (x * TILE + 44 > cam && x * TILE < cam + VIEW) pipe(ctx, x * TILE - cam, (GROUND - h) * TILE, h, noLip);
  if (level.sidePipe) sidePipe(ctx, level.sidePipe.x * TILE - cam, level.sidePipe.y * TILE, level.sidePipe.len);
  if (level.flagX != null) flagAndCastle(ctx, level, cam);
  for (const L of level.lifts) if (L.x + L.w > cam && L.x < cam + VIEW) lift(ctx, L, L.x - cam);
  for (const m of level.items) {
    const shown = m.rise > 0 ? m.top + TILE - m.y : m.h;
    if (m.kind === 'flower') flower(ctx, m.x - cam, m.y, shown, time); else mushroom(ctx, m.x - cam, m.y, shown);
  }
  for (const d of level.debris) { px(ctx, c.brick, d.x - cam, d.y, 7, 7); px(ctx, c.mortar, d.x - cam + 5, d.y + 5, 2, 2); }
  for (const g of level.goombas) if (g.alive && g.active) {
    if (!g.flipped) goomba(ctx, g, g.x - cam, c);
    else { ctx.save(); ctx.translate(0, 2 * g.y + g.h); ctx.scale(1, -1); goomba(ctx, g, g.x - cam, c); ctx.restore(); }
  }
  for (const g of level.koopas) if (g.alive && g.active) koopa(ctx, g, g.x - cam, time);
  if (theme === 'castle') paintCastle(ctx, s, cam);
  for (const f of level.fireballs) if (f.pop) burst(ctx, f.x - cam, f.y); else fireball(ctx, f.x - cam, f.y, f.t);
  for (const q of level.popups) {
    const y = q.y - q.t * 40;
    if (q.coin && q.t < 0.35) { px(ctx, '#f8b800', q.x - cam + 3, y - q.t * 60, 8, 14); px(ctx, '#fcf0a0', q.x - cam + 5, y - q.t * 60 + 2, 2, 10); }
    else { ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ui-monospace, Consolas, monospace'; ctx.fillText(q.text, q.x - cam, y); }
  }
  if (!s.warp) pet();
}
