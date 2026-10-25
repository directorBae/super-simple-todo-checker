// Pac-Man on the arcade maze (28×31). Dots 10, energizers 50 and a frightened spell, ghosts 200/400/800/1600.
// Each ghost uses its arcade targeting: Blinky chases, Pinky aims 4 tiles ahead, Inky flanks off Blinky,
// Clyde chases from afar and retreats up close; scatter/chase phases alternate. Eating every dot ends the stage.
export const MAZE = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #      #   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......  .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################',
];
const COLS = 28, ROWS = 31, T = 9, OX = (500 - COLS * T) / 2, OY = 0;
const PHASES = [['scatter', 7], ['chase', 20], ['scatter', 7], ['chase', 20], ['scatter', 5], ['chase', Infinity]];
const DIRS = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }]; // arcade tie-break order: up, left, down, right
const GHOSTS = [
  { name: 'blinky', color: '#ff2a2a', start: { x: 14, y: 11.5 }, corner: { x: 25, y: -3 }, release: 0 },
  { name: 'pinky', color: '#ffb8ff', start: { x: 14, y: 14.5 }, corner: { x: 2, y: -3 }, release: 1.5 },
  { name: 'inky', color: '#2affff', start: { x: 12, y: 14.5 }, corner: { x: 27, y: 32 }, release: 5 },
  { name: 'clyde', color: '#ffb852', start: { x: 16, y: 14.5 }, corner: { x: 0, y: 32 }, release: 9 },
];
const cell = (x, y) => (y < 0 || y >= ROWS ? '#' : MAZE[y][((x % COLS) + COLS) % COLS]);
const wallFor = (ch, ghost) => ch === '#' || (ch === '-' && !ghost);
const isCenter = (v) => Math.abs(v - Math.floor(v) - 0.5) < 1e-6;
const tunnel = (e) => Math.floor(e.y) === 14 && (e.x < 6 || e.x > 22);

export function create() {
  const dots = new Set();
  MAZE.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.' || c === 'o') dots.add(y * COLS + x); }));
  const st = { dots, time: 0, dying: 0, phase: 0, phaseTime: 0, fright: 0, eatenChain: 0, pause: 0.8, popups: [], ending: false };
  reset(st);
  return st;
}
function reset(st) {
  st.pac = { x: 14, y: 23.5, dir: { x: -1, y: 0 }, want: { x: -1, y: 0 }, mouth: 0 };
  st.ghosts = GHOSTS.map((g) => ({ ...g, x: g.start.x, y: g.start.y, dir: { x: -1, y: 0 }, state: g.release ? 'house' : 'active', timer: g.release, frightened: false }));
  st.pause = 0.8;
}

// Moves an entity `dist` tiles along the grid, deciding at each tile centre with `decide`.
function travel(e, dist, decide, ghost) {
  let guard = 0;
  while (dist > 1e-6 && guard++ < 8) {
    if (isCenter(e.x) && isCenter(e.y)) {
      decide(e);
      if (!e.dir.x && !e.dir.y) return;
      if (wallFor(cell(Math.floor(e.x) + e.dir.x, Math.floor(e.y) + e.dir.y), ghost)) { e.dir = { x: 0, y: 0 }; return; }
    }
    const along = e.dir.x ? e.x : e.y, sign = e.dir.x || e.dir.y;
    let toCenter = sign > 0 ? Math.floor(along - 0.5 + 1) + 0.5 - along : along - (Math.ceil(along - 0.5 - 1) + 0.5);
    if (toCenter < 1e-6) toCenter = 1;
    const stepLen = Math.min(dist, toCenter);
    e.x += e.dir.x * stepLen; e.y += e.dir.y * stepLen; dist -= stepLen;
    if (Math.abs(stepLen - toCenter) < 1e-6) { e.x = Math.floor(e.x) + 0.5; e.y = Math.floor(e.y) + 0.5; }
    if (e.x < -0.5) e.x += COLS; if (e.x > COLS - 0.5) e.x -= COLS;
  }
}

function ghostTarget(st, g) {
  const pac = st.pac, px = Math.floor(pac.x), py = Math.floor(pac.y), mode = PHASES[st.phase][0];
  if (mode === 'scatter') return g.corner;
  if (g.name === 'blinky') return { x: px, y: py };
  if (g.name === 'pinky') return { x: px + pac.dir.x * 4, y: py + pac.dir.y * 4 };
  if (g.name === 'inky') { const b = st.ghosts[0], ax = px + pac.dir.x * 2, ay = py + pac.dir.y * 2; return { x: 2 * ax - Math.floor(b.x), y: 2 * ay - Math.floor(b.y) }; }
  return Math.hypot(px - g.x, py - g.y) > 8 ? { x: px, y: py } : g.corner;
}
function chooseGhostDir(st, g, random) {
  const tx = Math.floor(g.x), ty = Math.floor(g.y);
  const options = DIRS.filter((d) => !(d.x === -g.dir.x && d.y === -g.dir.y) && !wallFor(cell(tx + d.x, ty + d.y), true) && cell(tx + d.x, ty + d.y) !== '-');
  if (!options.length) { g.dir = { x: -g.dir.x, y: -g.dir.y }; return; }
  if (g.frightened) { g.dir = options[Math.floor(random() * options.length)]; return; }
  const target = g.state === 'eaten' ? { x: 13, y: 11 } : ghostTarget(st, g);
  options.sort((a, b) => Math.hypot(tx + a.x - target.x, ty + a.y - target.y) - Math.hypot(tx + b.x - target.x, ty + b.y - target.y));
  g.dir = options[0];
}
// Glides toward a point ignoring walls (inside the ghost house and through its door).
function glide(e, to, v) {
  const dx = to.x - e.x, dy = to.y - e.y, d = Math.hypot(dx, dy);
  if (d <= v) { e.x = to.x; e.y = to.y; return true; }
  e.x += dx / d * v; e.y += dy / d * v; return false;
}

export function step(st, dt, keys, game, random = Math.random) {
  st.time += dt;
  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < 1);
  if (st.dying > 0) { st.dying -= dt; if (st.dying <= 0) reset(st); return null; }
  if (st.pause > 0) { st.pause -= dt; return null; }
  const pac = st.pac;
  const want = keys.has('ArrowLeft') ? { x: -1, y: 0 } : keys.has('ArrowRight') ? { x: 1, y: 0 } : keys.has('ArrowUp') ? { x: 0, y: -1 } : keys.has('ArrowDown') ? { x: 0, y: 1 } : null;
  if (want) {
    pac.want = want;
    if (want.x === -pac.dir.x && want.y === -pac.dir.y && (pac.dir.x || pac.dir.y)) pac.dir = want; // reverse any time
  }
  travel(pac, 7.6 * dt, (e) => {
    if (!wallFor(cell(Math.floor(e.x) + e.want.x, Math.floor(e.y) + e.want.y), false)) e.dir = e.want;
  }, false);
  if (pac.dir.x || pac.dir.y) pac.mouth += dt * 14;
  // Eat
  const key = Math.floor(pac.y) * COLS + ((Math.floor(pac.x) % COLS) + COLS) % COLS;
  if (st.dots.delete(key)) {
    const big = MAZE[Math.floor(pac.y)][key % COLS] === 'o';
    game.score += big ? 50 : 10;
    if (big) {
      st.fright = 6; st.eatenChain = 0;
      for (const g of st.ghosts) if (g.state === 'active') { g.frightened = true; g.dir = { x: -g.dir.x, y: -g.dir.y }; }
    }
  }
  if (!st.dots.size && !st.ending) return 'done';
  // Phase clock pauses while ghosts are frightened, as in the arcade.
  if (st.fright > 0) { st.fright -= dt; if (st.fright <= 0) st.ghosts.forEach((g) => { g.frightened = false; }); }
  else {
    st.phaseTime += dt;
    if (st.phaseTime >= PHASES[st.phase][1]) { st.phase = Math.min(PHASES.length - 1, st.phase + 1); st.phaseTime = 0; for (const g of st.ghosts) if (g.state === 'active') g.dir = { x: -g.dir.x, y: -g.dir.y }; }
  }
  let result = null;
  for (const g of st.ghosts) {
    if (g.state === 'house') { g.timer -= dt; g.y = g.start.y + Math.sin(st.time * 6) * 0.25; if (g.timer <= 0) g.state = 'leaving'; continue; }
    if (g.state === 'leaving') {
      const v = 4 * dt;
      if (Math.abs(g.x - 14) > 1e-6) glide(g, { x: 14, y: 14.5 }, v);
      else if (glide(g, { x: 14, y: 11.5 }, v)) { g.state = 'active'; g.dir = { x: -1, y: 0 }; g.frightened = false; }
      continue;
    }
    if (g.state === 'returning') { if (glide(g, { x: 14, y: 14.5 }, 8 * dt)) { g.state = 'leaving'; } continue; }
    const speed = g.state === 'eaten' ? 14 : g.frightened ? 4.2 : tunnel(g) ? 3.6 : 7.1;
    travel(g, speed * dt, (e) => chooseGhostDir(st, e, random), true);
    if (g.state === 'eaten' && Math.abs(g.y - 11.5) < 0.6 && Math.abs(g.x - 14) < 1) { g.state = 'returning'; g.x = 14; g.y = 11.5; }
    if (g.state === 'active' && Math.hypot(g.x - pac.x, g.y - pac.y) < 0.7) {
      if (g.frightened) {
        const points = 200 * 2 ** Math.min(st.eatenChain, 3); st.eatenChain++; game.score += points;
        g.frightened = false; g.state = 'eaten'; st.popups.push({ x: g.x, y: g.y, t: 0, text: String(points) }); st.pause = 0.35;
      } else result = 'hurt';
    }
  }
  if (result === 'hurt') st.dying = 1.4;
  return result;
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
export function paint(ctx, st) {
  px(ctx, '#000', 0, 0, 500, 280);
  // Walls: outline every wall cell edge that faces a corridor.
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (MAZE[y][x] !== '#') { if (MAZE[y][x] === '-') px(ctx, '#ffb8ff', OX + x * T, OY + y * T + 4, T, 2); continue; }
    const open = (dx, dy) => cell(x + dx, y + dy) !== '#';
    const X = OX + x * T, Y = OY + y * T;
    ctx.fillStyle = '#2b3dff';
    if (open(0, -1)) ctx.fillRect(X, Y + 2, T, 1.5);
    if (open(0, 1)) ctx.fillRect(X, Y + T - 3.5, T, 1.5);
    if (open(-1, 0)) ctx.fillRect(X + 2, Y, 1.5, T);
    if (open(1, 0)) ctx.fillRect(X + T - 3.5, Y, 1.5, T);
  }
  // Dots
  for (const k of st.dots) {
    const x = k % COLS, y = Math.floor(k / COLS), cx = OX + x * T + T / 2, cy = OY + y * T + T / 2;
    if (MAZE[y][x] === 'o') { if (Math.floor(st.time * 4) % 2 === 0) { ctx.fillStyle = '#ffb8ae'; ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, Math.PI * 2); ctx.fill(); } }
    else px(ctx, '#ffb8ae', cx - 1, cy - 1, 2, 2);
  }
  // Pac-Man (folds away when caught, like the arcade)
  if (st.dying > 0) {
    const p = st.pac, k = Math.min(1, (1.4 - st.dying) / 1.1), cx = OX + p.x * T, cy = OY + p.y * T;
    if (k < 1) { ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 6.5, -Math.PI / 2 + k * Math.PI, -Math.PI / 2 - k * Math.PI + Math.PI * 2); ctx.fill(); }
    return;
  }
  const p = st.pac, cx = OX + p.x * T, cy = OY + p.y * T, open = 0.08 + Math.abs(Math.sin(p.mouth)) * 0.32, facing = Math.atan2(p.dir.y || p.want.y, p.dir.x || p.want.x || -1);
  ctx.fillStyle = '#ffe600'; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, 6.5, facing + open * Math.PI, facing - open * Math.PI + Math.PI * 2); ctx.fill();
  // Ghosts
  for (const g of st.ghosts) {
    const gx = OX + g.x * T, gy = OY + g.y * T, flash = g.frightened && st.fright < 2 && Math.floor(st.time * 6) % 2 === 0;
    if (g.state !== 'eaten' && g.state !== 'returning') {
      ctx.fillStyle = g.frightened ? (flash ? '#f2f2ff' : '#2b3dff') : g.color;
      ctx.beginPath(); ctx.arc(gx, gy - 1, 6.5, Math.PI, 0); ctx.lineTo(gx + 6.5, gy + 6);
      const wave = Math.floor(st.time * 8) % 2;
      for (let i = 0; i < 4; i++) ctx.lineTo(gx + 6.5 - (i + 0.5) * 3.25, gy + (i % 2 === wave ? 3.5 : 6));
      ctx.lineTo(gx - 6.5, gy + 6); ctx.closePath(); ctx.fill();
    }
    if (g.frightened && g.state === 'active') { px(ctx, flash ? '#ff2a2a' : '#ffb8ae', gx - 3, gy - 2, 2, 2); px(ctx, flash ? '#ff2a2a' : '#ffb8ae', gx + 1, gy - 2, 2, 2); continue; }
    for (const ex of [-2.8, 2.8]) { px(ctx, '#fff', gx + ex - 2, gy - 4, 4, 5); px(ctx, '#2b3dff', gx + ex - 1 + g.dir.x * 1.2, gy - 3 + g.dir.y * 1.5, 2, 2); }
  }
  ctx.fillStyle = '#2affff'; ctx.font = 'bold 9px ui-monospace, Consolas, monospace';
  for (const q of st.popups) ctx.fillText(q.text, OX + q.x * T - 8, OY + q.y * T);
}
