// NES Tetris (1989) with the pet riding along: it hops from its ledge onto the first piece, rides each falling
// piece on its highest block, and hops onto the next one when a piece locks. The rules are the NES ones —
// 10×20 well, Nintendo rotation (↑ turns clockwise, here with a one-column wall kick), DAS of 16 then 6 frames,
// ↓ soft drop (re-press per piece, 1 pt a row), gravity per level, no lock delay, 40/100/300/1200 × (level+1),
// the centre-outward line wipe and the level colour palettes. Extras: Space hard drop (2 pts a row), and topping
// out costs a heart instead of the game: the upper half of the stack crumbles away and play goes on.
// Randomizer: the NES one — roll 1 of 8; on the 8th or a repeat of the last piece, roll 1 of 7 once more.
// Stages are short: 0 = A-type level 0, 4 lines; 1 = A-type level 5, 6 lines; 2 = B-type level 8 over 6 rows
// of garbage, 8 lines. Clearing them shows "CLEAR!", the pet hops back to its ledge, and the stage is done.
export const ENTRY = 'up';
export const COLS = 10, ROWS = 20, CELL = 12, WELL_X = 190, WELL_Y = 32;
const W = 500, H = 280, FPS = 60.0988;
// NES frames per row, levels 0–18; 19–28 fall every 2 frames, 29+ every frame.
const GRAVITY = [48, 43, 38, 33, 28, 23, 18, 13, 8, 6, 5, 5, 5, 4, 4, 4, 3, 3, 3];
export const gravity = (level) => (level < GRAVITY.length ? GRAVITY[level] : level < 29 ? 2 : 1) / FPS;
const DAS_FIRST = 16 / FPS, DAS_REPEAT = 6 / FPS, SOFT = 2 / FPS, ARE = 10 / FPS;
export const CLEAR_TIME = 20 / FPS;
const LINE_POINTS = [0, 40, 100, 300, 1200];
const STAGES = [{ type: 'A', level: 0, goal: 4 }, { type: 'A', level: 5, goal: 6 }, { type: 'B', level: 8, goal: 8, garbage: 6 }];
// The pet: drawn small (sprite ≈ 24 cells × PET_CELL), standing on a ledge left of the well between pieces.
export const PET_CELL = 0.9, LEDGE = { x: 64, bottom: 250 };
const PET_MID = 8.5 * PET_CELL; // drawRunner x → the middle of the pet's body
const INTRO = 0.6, HOP = 0.42, HOP_UP = 12, WALK = 60, CLIMB = 160, CRUMBLE = 0.5, OUTRO = 1.3;

// Spawn orientations as in the NES (T and the L/J point down), pivot at (0, 0); y grows downward.
export const ORDER = ['T', 'J', 'Z', 'O', 'S', 'L', 'I'];
const BASE = {
  T: [[-1, 0], [0, 0], [1, 0], [0, 1]], J: [[-1, 0], [0, 0], [1, 0], [1, 1]], Z: [[-1, 0], [0, 0], [0, 1], [1, 1]],
  O: [[-1, 0], [0, 0], [-1, 1], [0, 1]], S: [[0, 0], [1, 0], [-1, 1], [0, 1]], L: [[-1, 0], [0, 0], [1, 0], [-1, 1]],
  I: [[-2, 0], [-1, 0], [0, 0], [1, 0]],
};
const cw = (cells) => cells.map(([x, y]) => [-y, x]);
const turns = (b) => [b, cw(b), cw(cw(b)), cw(cw(cw(b)))];
// T, J and L turn four ways about their centre; S, Z and I flip between two states (NES rotation); O never turns.
const SHAPES = {
  T: turns(BASE.T), J: turns(BASE.J), L: turns(BASE.L), O: [BASE.O],
  Z: [BASE.Z, [[1, -1], [1, 0], [0, 0], [0, 1]]], S: [BASE.S, [[0, -1], [0, 0], [1, 0], [1, 1]]], I: [BASE.I, [[0, -2], [0, -1], [0, 0], [0, 1]]],
};
export const cellsOf = (p) => SHAPES[p.kind][p.rot % SHAPES[p.kind].length].map(([x, y]) => [p.x + x, p.y + y]);
// Rows above the well are open (pieces may poke out the top), walls and floor are not.
const blocked = (board, x, y) => x < 0 || x >= COLS || y >= ROWS || (y >= 0 && board[y][x] !== null);
export const fits = (board, p) => cellsOf(p).every(([x, y]) => !blocked(board, x, y));

function roll(random, prev) {
  let i = Math.floor(random() * 8);
  if (i >= 7 || ORDER[i] === prev) i = Math.floor(random() * 7);
  return ORDER[Math.min(6, i)];
}
// B-type garbage: random blocks, every row with at least one hole.
function fillGarbage(board, rows, random) {
  for (let y = ROWS - rows; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) board[y][x] = random() < 0.55 ? ORDER[Math.floor(random() * 7)] : null;
    if (board[y].every(Boolean)) board[y][Math.floor(random() * COLS)] = null;
  }
}

export function create(game, { stage = 0, lap = 0, speed, random = Math.random } = {}) { // eslint-disable-line no-unused-vars
  const def = STAGES[Math.max(0, Math.min(2, stage | 0))];
  // From the third lap on, each repeat starts a level higher (up to four).
  const level = def.level + (lap >= 3 ? Math.min(lap - 2, 4) : 0);
  const board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  if (def.garbage) fillGarbage(board, def.garbage, random);
  const st = {
    type: def.type, level, goal: def.goal, lines: 0, board, piece: null, next: roll(random, null), last: null,
    stats: Object.fromEntries(ORDER.map((k) => [k, 0])), fall: 0, das: { dir: 0, t: 0 }, softArmed: false,
    // Keys already held when the stage starts must be let go before they rotate or drop.
    prev: new Set(['ArrowUp', 'Space', 'ArrowDown']),
    freeze: INTRO, clearing: null, spawnIn: 0, ending: false, outro: null, finished: false, time: 0, debris: [], popups: [], flash: 0,
    pet: { cx: LEDGE.x + PET_MID, feet: LEDGE.bottom, flip: false, onGround: true, hop: null },
  };
  spawnPiece(st, random);
  st.pet.hop = { x0: st.pet.cx, y0: st.pet.feet, t: 0, dur: INTRO };
  return st;
}

function spawnPiece(st, random) {
  const p = { kind: st.next, rot: 0, x: 5, y: 0 };
  if (!fits(st.board, p)) return false;
  st.piece = p; st.last = p.kind; st.next = roll(random, p.kind); st.stats[p.kind]++;
  st.fall = 0; st.softArmed = false;
  return true;
}

// Where the pet stands on a piece: on top of its highest block, the one nearest to where the pet already is.
function perch(p, cx) {
  const tops = new Map();
  for (const [x, y] of cellsOf(p)) tops.set(x, Math.min(tops.get(x) ?? Infinity, y));
  const high = Math.min(...tops.values());
  let best = null;
  for (const [x, top] of tops) if (top === high && (best === null || Math.abs(colMid(x) - cx) < Math.abs(colMid(best) - cx))) best = x;
  return { cx: colMid(best), feet: WELL_Y + high * CELL, tops };
}
const colMid = (x) => WELL_X + (x + 0.5) * CELL;
// The piece the pet is heading for: the falling one, or the next one where it is about to appear.
const nextPiece = (st) => st.piece || { kind: st.next, rot: 0, x: 5, y: 0 };
const hopTarget = (st) => (st.outro || st.ending ? { cx: LEDGE.x + PET_MID, feet: LEDGE.bottom } : perch(nextPiece(st), st.pet.cx));

function startHop(st, dur) {
  const pet = st.pet;
  pet.hop = { x0: pet.cx, y0: pet.feet, t: 0, dur };
  pet.onGround = false;
}

// A jump's height over time (k = 0 → 1) that ends `drop` lower and tops out `rise` above the start (rise ≥ HOP_UP,
// so the apex is always a little above the higher end): y = (drop − u)·k + u·k², with u solved for that apex.
const arc = (drop, rise) => { const u = drop + 2 * rise + 2 * Math.sqrt(rise * (drop + rise)); return (k) => (drop - u) * k + u * k * k; };

function stepPet(st, dt) {
  const pet = st.pet;
  if (pet.hop) {
    const h = pet.hop, to = hopTarget(st);
    h.t += dt;
    const k = Math.min(1, h.t / h.dur);
    pet.cx = h.x0 + (to.cx - h.x0) * k;
    pet.feet = h.y0 + arc(to.feet - h.y0, Math.max(0, h.y0 - to.feet) + HOP_UP)(k);
    pet.flip = to.cx < h.x0 - 1;
    pet.onGround = k >= 1;
    if (k >= 1) pet.hop = null;
    return;
  }
  if (!st.piece) return;
  // Riding: stroll over to the piece's highest block; step down with the piece at once, climb up quickly.
  const { cx, tops } = perch(st.piece, pet.cx);
  const d = cx - pet.cx;
  if (Math.abs(d) > 0.5) { pet.cx += Math.sign(d) * Math.min(Math.abs(d), WALK * dt); pet.flip = d < 0; } else pet.cx = cx;
  let under = Math.floor((pet.cx - WELL_X) / CELL), nearest = null;
  for (const x of tops.keys()) if (nearest === null || Math.abs(x - under) < Math.abs(nearest - under)) nearest = x;
  under = nearest;
  const want = WELL_Y + tops.get(under) * CELL;
  if (want >= pet.feet) { pet.feet = want; pet.onGround = true; } else { pet.feet = Math.max(want, pet.feet - CLIMB * dt); pet.onGround = pet.feet === want; }
}

function shift(st, dx) {
  const p = st.piece, moved = { ...p, x: p.x + dx };
  if (!fits(st.board, moved)) return false;
  st.piece = moved;
  if (!st.pet.hop) { st.pet.cx += dx * CELL; st.pet.flip = dx < 0; } // the pet rides along sideways
  return true;
}
function rotate(st) {
  const p = st.piece, turned = { ...p, rot: (p.rot + 1) % SHAPES[p.kind].length };
  // NES rotation, plus a basic kick one column off a wall or block (two for the long bar).
  for (const dx of p.kind === 'I' ? [0, -1, 1, -2, 2] : [0, -1, 1]) {
    const k = { ...turned, x: turned.x + dx };
    if (fits(st.board, k)) { st.piece = k; if (!st.pet.hop) st.pet.cx += dx * CELL; return true; }
  }
  return false;
}

// The piece settles where it is (NES: no lock delay); full rows start their wipe, the pet hops to the next piece.
function lock(st, game) {
  for (const [x, y] of cellsOf(st.piece)) if (y >= 0) st.board[y][x] = st.piece.kind;
  st.piece = null;
  const rows = [];
  for (let y = 0; y < ROWS; y++) if (st.board[y].every(Boolean)) rows.push(y);
  if (rows.length) {
    const points = LINE_POINTS[rows.length] * (st.level + 1);
    game.score += points;
    st.clearing = { rows, t: 0 };
    st.popups.push({ x: WELL_X + COLS * CELL / 2, y: WELL_Y + rows[0] * CELL, t: 0, text: String(points) });
    if (rows.length === 4) st.flash = CLEAR_TIME;
  }
  st.spawnIn = (rows.length ? CLEAR_TIME : 0) + ARE;
  // The last lines of the stage: no next piece, the pet heads back to its ledge.
  if (st.lines + rows.length >= st.goal) { st.ending = true; startHop(st, 0.7); } else startHop(st, Math.max(HOP, st.spawnIn + 0.1));
}

// Topping out: the upper half of the stack crumbles into falling bits, leaving room to go on.
function crumble(st) {
  let top = st.board.findIndex((row) => row.some(Boolean));
  if (top < 0) return;
  const n = Math.ceil((ROWS - top) / 2);
  for (let y = top; y < top + n; y++) for (let x = 0; x < COLS; x++) {
    const kind = st.board[y][x];
    if (!kind) continue;
    st.board[y][x] = null;
    const seed = (x * 7 + y * 13) % 11;
    st.debris.push({ kind, x: WELL_X + x * CELL, y: WELL_Y + y * CELL, vx: (seed - 5) * 14, vy: -60 - seed * 12, t: 0 });
  }
}

// Returns 'hurt' | 'fell' | 'done' | null.
export function step(st, dt, keys, game, random = Math.random) {
  st.time += dt;
  st.flash = Math.max(0, st.flash - dt);
  for (const d of st.debris) { d.t += dt; d.vy += 700 * dt; d.x += d.vx * dt; d.y += d.vy * dt; }
  st.debris = st.debris.filter((d) => d.y < H + 20);
  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < 0.9);
  let result = null;

  if (st.clearing) {
    st.clearing.t += dt;
    if (st.clearing.t >= CLEAR_TIME) {
      const rows = new Set(st.clearing.rows);
      st.board = [...Array.from({ length: rows.size }, () => Array(COLS).fill(null)), ...st.board.filter((_, y) => !rows.has(y))];
      st.lines += rows.size;
      st.clearing = null;
      if (st.lines >= st.goal) st.outro = { t: 0 };
    }
  }
  if (st.outro) {
    st.outro.t += dt;
    stepPet(st, dt);
    st.prev = new Set(keys);
    if (!st.finished && st.outro.t >= OUTRO && !st.pet.hop) { st.finished = true; return 'done'; }
    return null;
  }
  if (st.freeze > 0) {
    st.freeze -= dt;
    stepPet(st, dt);
    st.prev = new Set(keys);
    return null;
  }
  if (!st.piece && !st.clearing && !st.ending) {
    st.spawnIn -= dt;
    if (st.spawnIn <= 0 && !spawnPiece(st, random)) {
      result = 'hurt';
      crumble(st);
      st.spawnIn = CRUMBLE;
      if (st.pet.hop) st.pet.hop.dur = Math.max(st.pet.hop.dur, st.pet.hop.t + CRUMBLE + 0.1);
    }
  }

  // Controls (from the held keys: edges for rotate / hard drop, DAS for sideways).
  const held = (k) => keys.has(k), pressed = (k) => keys.has(k) && !st.prev.has(k);
  const dir = Number(held('ArrowRight')) - Number(held('ArrowLeft'));
  if (dir !== st.das.dir) { st.das = { dir, t: 0 }; if (dir && st.piece) shift(st, dir); }
  else if (dir) {
    st.das.t += dt;
    while (st.das.t >= DAS_FIRST) { st.das.t -= DAS_REPEAT; if (st.piece) shift(st, dir); }
  }
  if (st.piece && pressed('ArrowUp')) rotate(st);
  if (!held('ArrowDown')) st.softArmed = true;
  if (st.piece && pressed('Space')) {
    let rows = 0;
    while (fits(st.board, { ...st.piece, y: st.piece.y + 1 })) { st.piece = { ...st.piece, y: st.piece.y + 1 }; rows++; }
    game.score += 2 * rows;
    stepPet(st, 0);
    lock(st, game);
  }
  if (st.piece) {
    const soft = held('ArrowDown') && st.softArmed;
    const every = soft ? Math.min(SOFT, gravity(st.level)) : gravity(st.level);
    st.fall += dt;
    while (st.piece && st.fall >= every) {
      st.fall -= every;
      const down = { ...st.piece, y: st.piece.y + 1 };
      if (fits(st.board, down)) { st.piece = down; if (soft) game.score += 1; }
      else { stepPet(st, 0); lock(st, game); }
    }
  }
  stepPet(st, dt);
  st.prev = new Set(keys);
  return result;
}

// Exactly what paint passes to drawRunner for the pet right now.
export const pose = (st) => ({ x: st.pet.cx - PET_MID, bottom: st.pet.feet, cell: PET_CELL, flip: st.pet.flip, onGround: st.pet.onGround });

// ---------- drawing ----------
// NES palettes: two colours per level, repeating every ten levels.
const PALETTES = [
  ['#0058f8', '#3cbcfc'], ['#00a800', '#b8f818'], ['#d800cc', '#f878f8'], ['#0058f8', '#58d854'], ['#e40058', '#58f898'],
  ['#58f898', '#6888fc'], ['#f83800', '#7c7c7c'], ['#6844fc', '#a80020'], ['#0058f8', '#f83800'], ['#f83800', '#fca044'],
];
// T, O and I are white with a border; J and S solid in the first colour; Z and L in the second.
const STYLE = { T: 0, O: 0, I: 0, J: 1, S: 1, Z: 2, L: 2 };
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
const FONT = 'bold 10px ui-monospace, Consolas, monospace';
const pad = (n, d) => String(Math.max(0, Math.floor(n))).padStart(d, '0');

function block(ctx, kind, level, x, y, size = CELL) {
  const [c1, c2] = PALETTES[level % 10], s = size - 1, u = Math.max(1, Math.round(size / 8));
  if (STYLE[kind] === 0) { px(ctx, c1, x, y, s, s); px(ctx, '#fcfcfc', x + u, y + u, s - 2 * u, s - 2 * u); px(ctx, '#fcfcfc', x, y, u, u); }
  else {
    px(ctx, STYLE[kind] === 1 ? c1 : c2, x, y, s, s);
    px(ctx, '#fcfcfc', x, y, u, u); px(ctx, '#fcfcfc', x + u, y + u, 2 * u, u); px(ctx, '#fcfcfc', x + u, y + u, u, 2 * u);
  }
}
function piece(ctx, kind, level, cx, cy, size) {
  const cells = SHAPES[kind][0], xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * size, h = (Math.max(...ys) - Math.min(...ys) + 1) * size;
  for (const [x, y] of cells) block(ctx, kind, level, cx - w / 2 + (x - Math.min(...xs)) * size, cy - h / 2 + (y - Math.min(...ys)) * size, size);
}
// NES frame: light rim, grey line, black inside.
function frame(ctx, x, y, w, h) { px(ctx, '#bcbcbc', x - 3, y - 3, w + 6, h + 6); px(ctx, '#545454', x - 1, y - 1, w + 2, h + 2); px(ctx, '#000', x, y, w, h); }
const text = (ctx, s, x, y, color = '#fcfcfc') => { ctx.fillStyle = color; ctx.font = FONT; ctx.fillText(s, Math.round(x), Math.round(y)); };

export function paint(ctx, st, game, drawRunner) {
  const lv = st.level;
  // The grey stone backdrop behind the panels.
  px(ctx, '#3c3c3c', 0, 0, W, H);
  for (let y = 0; y < H; y += 10) for (let x = (y / 10) % 2 ? -10 : 0; x < W; x += 20) { px(ctx, '#545454', x + 1, y + 1, 18, 8); px(ctx, '#747474', x + 1, y + 1, 18, 1); }

  frame(ctx, 26, 8, 136, 18); text(ctx, `${st.type}-TYPE`, 34, 21); text(ctx, `GOAL ${st.goal}`, 104, 21, '#fca044');
  frame(ctx, 26, 38, 136, 186); text(ctx, 'STATISTICS', 50, 52);
  ORDER.forEach((k, i) => { piece(ctx, k, lv, 62, 70 + i * 22, 6); text(ctx, pad(st.stats[k], 3), 98, 74 + i * 22, '#f83800'); });
  // The pet's ledge: a row of blocks under where it waits.
  for (let i = 0; i < 5; i++) block(ctx, 'T', lv, 40 + i * CELL, LEDGE.bottom, CELL);

  frame(ctx, WELL_X, 6, COLS * CELL, 18);
  text(ctx, `LINES-${pad(st.type === 'B' ? st.goal - st.lines : st.lines, 3)}`, WELL_X + 33, 19);
  frame(ctx, WELL_X, WELL_Y, COLS * CELL, ROWS * CELL);

  frame(ctx, 336, 8, 136, 50); text(ctx, 'SCORE', 346, 26); text(ctx, pad(game?.score || 0, 6), 346, 46);
  frame(ctx, 352, 76, 64, 56); text(ctx, 'NEXT', 368, 90); if (!st.ending) piece(ctx, st.next, lv, 384, 112, CELL);
  frame(ctx, 352, 150, 64, 38); text(ctx, 'LEVEL', 364, 164); text(ctx, pad(lv, 2), 376, 180);

  // The stack, with full rows wiping from the middle out (and the whole screen flashing for a Tetris).
  const wipe = st.clearing ? Math.min(5, Math.floor(st.clearing.t / CLEAR_TIME * 6)) : 0;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const kind = st.board[y][x];
    if (!kind || (st.clearing?.rows.includes(y) && x >= 5 - wipe && x < 5 + wipe)) continue;
    block(ctx, kind, lv, WELL_X + x * CELL, WELL_Y + y * CELL);
  }
  if (st.piece) for (const [x, y] of cellsOf(st.piece)) if (y >= 0) block(ctx, st.piece.kind, lv, WELL_X + x * CELL, WELL_Y + y * CELL);
  if (st.flash > 0 && Math.floor(st.flash * 30) % 2 === 0) { ctx.globalAlpha = 0.5; px(ctx, '#fcfcfc', WELL_X, WELL_Y, COLS * CELL, ROWS * CELL); ctx.globalAlpha = 1; }
  for (const d of st.debris) block(ctx, d.kind, lv, d.x, d.y, Math.max(4, CELL - d.t * 8));

  const p = pose(st);
  drawRunner?.(p.x, p.bottom, { onGround: p.onGround, flip: p.flip, cell: p.cell });

  for (const q of st.popups) text(ctx, q.text, q.x - q.text.length * 3, q.y - q.t * 30, '#fca044');
  if (st.outro) {
    frame(ctx, WELL_X + 20, WELL_Y + 100, COLS * CELL - 40, 28);
    if (Math.floor(st.outro.t * 6) % 2 === 0 || st.outro.t > 0.6) text(ctx, 'CLEAR!', WELL_X + 42, WELL_Y + 118, '#fca044');
  }
}
