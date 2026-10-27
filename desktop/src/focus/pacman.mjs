// Pac-Man with the pet in Pac-Man's place, three stages: the arcade Pac-Man maze, then Ms. Pac-Man's first
// (pink) and second (light blue) mazes. Dots 10, energizers 50 and a frightened spell, ghosts 200/400/800/1600,
// and the bonus fruit of each game (Pac-Man's cherry sits under the ghost house; Ms. Pac-Man's fruit bounces in
// through a tunnel, wanders the maze and leaves by another one).
// Each ghost uses its arcade targeting: Blinky chases, Pinky aims 4 tiles ahead, Inky flanks off Blinky,
// Clyde chases from afar and retreats up close; scatter/chase phases alternate. Every stage is capped by points so
// the run moves on: it ends when this stage has earned its target (or every dot is eaten, as the arcade clears).
export const ENTRY = 'right';
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
// Ms. Pac-Man's first maze (pink walls): 220 dots, tunnels on rows 8 and 17. '_' is the dead space outside.
export const MS_MAZE_1 = [
  '############################',
  '#......##..........##......#',
  '#o####.##.########.##.####o#',
  '#.####.##.########.##.####.#',
  '#..........................#',
  '###.##.#####.##.#####.##.###',
  '__#.##.#####.##.#####.##.#__',
  '###.##.#####.##.#####.##.###',
  '   .##.......##.......##.   ',
  '###.##### ######## #####.###',
  '__#.##### ######## #####.#__',
  '__#.                    .#__',
  '__#.##### ###--### #####.#__',
  '__#.##### #      # #####.#__',
  '__#.##    #      #    ##.#__',
  '__#.## ## #      # ## ##.#__',
  '###.## ## ######## ## ##.###',
  '   .   ##          ##   .   ',
  '###.######## ## ########.###',
  '__#.######## ## ########.#__',
  '__#......    ##    ......#__',
  '__#.#####.########.#####.#__',
  '###.#####.########.#####.###',
  '#............  ............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#.####.##..........##.####.#',
  '#o####.##.########.##.####o#',
  '#.####.##.########.##.####.#',
  '#..........................#',
  '############################',
];
// Ms. Pac-Man's second maze (light blue walls, yellow dots): 240 dots, tunnels on the top row and row 19.
export const MS_MAZE_2 = [
  '############################',
  '       ##..........##       ',
  '###### ##.########.## ######',
  '###### ##.########.## ######',
  '#o...........##...........o#',
  '#.#######.##.##.##.#######.#',
  '#.#######.##.##.##.#######.#',
  '#.##......##.##.##......##.#',
  '#.##.####.##....##.####.##.#',
  '#.##.####.########.####.##.#',
  '#......##.########.##......#',
  '######.##          ##.######',
  '######.## ###--### ##.######',
  '#......## #      # ##......#',
  '#.####.## #      # ##.####.#',
  '#.####.   #      #   .####.#',
  '#...##.## ######## ##.##...#',
  '### ##.##          ##.## ###',
  '### ##.##.########.##.## ###',
  '    ##.##.########.##.##    ',
  '### ##.##.########.##.## ###',
  '#......##..........##......#',
  '#.####.##.########.##.####.#',
  '#.####....        ....####.#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#......##..........##......#',
  '###.#####.########.#####.###',
  '###.#####.########.#####.###',
  '###......................###',
  '############################',
];
const COLS = 28, ROWS = 31, T = 9, OX = (500 - COLS * T) / 2, OY = 0;
const PHASES = [['scatter', 7], ['chase', 20], ['scatter', 7], ['chase', 20], ['scatter', 5], ['chase', Infinity]];
// From level 5 on the arcade shortens the scatter spells.
const PHASES_LATE = [['scatter', 5], ['chase', 20], ['scatter', 5], ['chase', 20], ['scatter', 5], ['chase', Infinity]];
// Fruit and their arcade values (Ms. Pac-Man's strawberry is 200, Pac-Man's 300).
export const FRUITS = { cherry: 100, strawberry: 200, orange: 500 };
// Per stage: the maze, its colours and tunnels (slow zone: `upto` tiles from either edge), the fruit and when it
// comes (dots eaten), speeds in tiles/s (the arcade's level 1, level 2 and level 5 tables), the frightened time
// and the stage's point target.
export const STAGES = [
  { maze: MAZE, look: { walls: 'outline', stroke: '#2b3dff', dot: '#ffb8ae' }, tunnels: [{ row: 14, upto: 6 }],
    fruit: 'cherry', fruitAt: [70, 170], wander: false, pac: 7.6, ghost: 7.1, scared: 4.2, slow: 3.6, fright: 6, phases: PHASES, target: 1800 },
  { maze: MS_MAZE_1, look: { walls: 'filled', fill: '#ffb8ae', stroke: '#ff0000', dot: '#dedeff' }, tunnels: [{ row: 8, upto: 3 }, { row: 17, upto: 3 }],
    fruit: 'strawberry', fruitAt: [64, 176], wander: true, pac: 8.5, ghost: 8.0, scared: 5.2, slow: 4.3, fright: 5, phases: PHASES, target: 2400 },
  { maze: MS_MAZE_2, look: { walls: 'filled', fill: '#47b7ff', stroke: '#dedeff', dot: '#ffff00' }, tunnels: [{ row: 1, upto: 7 }, { row: 19, upto: 3 }],
    fruit: 'orange', fruitAt: [64, 176], wander: true, pac: 9.0, ghost: 8.5, scared: 5.6, slow: 4.7, fright: 3, phases: PHASES_LATE, target: 3000 },
];
export const TARGETS = STAGES.map((s) => s.target);
const DIRS = [{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 0 }]; // arcade tie-break order: up, left, down, right
// Scatter corners sit off the maze, the same tiles in every maze (so each ghost circles that maze's corner block).
const GHOSTS = [
  { name: 'blinky', color: '#ff2a2a', start: { x: 14, y: 11.5 }, corner: { x: 25, y: -3 }, release: 0 },
  { name: 'pinky', color: '#ffb8ff', start: { x: 14, y: 14.5 }, corner: { x: 2, y: -3 }, release: 1.5 },
  { name: 'inky', color: '#2affff', start: { x: 12, y: 14.5 }, corner: { x: 27, y: 32 }, release: 5 },
  { name: 'clyde', color: '#ffb852', start: { x: 16, y: 14.5 }, corner: { x: 0, y: 32 }, release: 9 },
];
const FRUIT_SPOT = { x: 14, y: 17.5 }; // under the ghost house
const cellIn = (maze, x, y) => (y < 0 || y >= ROWS ? '#' : maze[y][((x % COLS) + COLS) % COLS]);
const cell = (st, x, y) => cellIn(st.maze, x, y);
const wallFor = (ch, ghost) => ch === '#' || ch === '_' || (ch === '-' && !ghost);
const isCenter = (v) => Math.abs(v - Math.floor(v) - 0.5) < 1e-6;
const tunnel = (st, e) => st.tunnels.some((t) => Math.floor(e.y) === t.row && (e.x < t.upto || e.x > COLS - t.upto));

export function create(game, { stage = 0, lap = 0 } = {}) {
  const info = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage))];
  const dots = new Set();
  info.maze.forEach((row, y) => [...row].forEach((c, x) => { if (c === '.' || c === 'o') dots.add(y * COLS + x); }));
  // Later laps run the same mazes a little faster.
  const hard = 1 + 0.06 * Math.min(4, Math.floor(lap / STAGES.length));
  const st = { stage, info, maze: info.maze, tunnels: info.tunnels, hard, target: info.target, startScore: game?.score,
    dots, total: dots.size, time: 0, dying: 0, phase: 0, phaseTime: 0, fright: 0, eatenChain: 0, pause: 0.8, popups: [], fruit: null, fruitsShown: 0, ending: false };
  reset(st, true);
  return st;
}
// The first time the pet arrives it faces right (it ran in from the left); after a catch it restarts facing left, as Pac-Man does.
function reset(st, first = false) {
  const dir = first ? { x: 1, y: 0 } : { x: -1, y: 0 };
  st.pac = { x: 14, y: 23.5, dir, want: { ...dir }, mouth: 0 };
  st.ghosts = GHOSTS.map((g) => ({ ...g, x: g.start.x, y: g.start.y, dir: { x: -1, y: 0 }, state: g.release ? 'house' : 'active', timer: g.release, frightened: false }));
  st.pause = 0.8;
}

// Moves an entity `dist` tiles along the grid, deciding at each tile centre with `decide`.
function travel(st, e, dist, decide, ghost) {
  let guard = 0;
  while (dist > 1e-6 && guard++ < 8) {
    if (isCenter(e.x) && isCenter(e.y)) {
      decide(e);
      if (!e.dir.x && !e.dir.y) return;
      if (wallFor(cell(st, Math.floor(e.x) + e.dir.x, Math.floor(e.y) + e.dir.y), ghost)) { e.dir = { x: 0, y: 0 }; return; }
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
  const pac = st.pac, px = Math.floor(pac.x), py = Math.floor(pac.y), mode = st.info.phases[st.phase][0];
  if (mode === 'scatter') return g.corner;
  if (g.name === 'blinky') return { x: px, y: py };
  if (g.name === 'pinky') return { x: px + pac.dir.x * 4, y: py + pac.dir.y * 4 };
  if (g.name === 'inky') { const b = st.ghosts[0], ax = px + pac.dir.x * 2, ay = py + pac.dir.y * 2; return { x: 2 * ax - Math.floor(b.x), y: 2 * ay - Math.floor(b.y) }; }
  return Math.hypot(px - g.x, py - g.y) > 8 ? { x: px, y: py } : g.corner;
}
// The open ways out of a tile centre, never straight back and never through the ghost-house door.
function exits(st, e) {
  const tx = Math.floor(e.x), ty = Math.floor(e.y);
  return DIRS.filter((d) => !(d.x === -e.dir.x && d.y === -e.dir.y) && !wallFor(cell(st, tx + d.x, ty + d.y), true) && cell(st, tx + d.x, ty + d.y) !== '-');
}
function chooseGhostDir(st, g, random) {
  const options = exits(st, g);
  if (!options.length) { g.dir = { x: -g.dir.x, y: -g.dir.y }; return; }
  // Ms. Pac-Man: in the first scatter spell Blinky and Pinky wander at random instead of heading for their corners.
  const wandering = st.info.wander && st.phase === 0 && (g.name === 'blinky' || g.name === 'pinky') && g.state === 'active';
  if (g.frightened || wandering) { g.dir = options[Math.floor(random() * options.length)]; return; }
  // The exit whose next tile is nearest the target (ties go up, left, down, right).
  const target = g.state === 'eaten' ? { x: 13, y: 11 } : ghostTarget(st, g), tx = Math.floor(g.x), ty = Math.floor(g.y);
  options.sort((a, b) => Math.hypot(tx + a.x - target.x, ty + a.y - target.y) - Math.hypot(tx + b.x - target.x, ty + b.y - target.y));
  g.dir = options[0];
}
// Glides toward a point ignoring walls (inside the ghost house and through its door).
function glide(e, to, v) {
  const dx = to.x - e.x, dy = to.y - e.y, d = Math.hypot(dx, dy);
  if (d <= v) { e.x = to.x; e.y = to.y; return true; }
  e.x += dx / d * v; e.y += dy / d * v; return false;
}

// Pac-Man's fruit sits under the ghost house for about ten seconds; Ms. Pac-Man's comes in through a random
// tunnel, bounces over to the ghost house and leaves through another random tunnel.
function spawnFruit(st, random) {
  const kind = st.info.fruit;
  if (!st.info.wander) { st.fruit = { kind, x: FRUIT_SPOT.x, y: FRUIT_SPOT.y, timer: 9.5, wander: false }; return; }
  const pick = () => { const t = st.tunnels[Math.floor(random() * st.tunnels.length)]; return { row: t.row, side: random() < 0.5 ? -1 : 1 }; };
  const from = pick(), to = pick();
  st.fruit = { kind, wander: true, x: from.side < 0 ? 0.5 : COLS - 0.5, y: from.row + 0.5, dir: { x: -from.side, y: 0 }, phase: 'in', exit: to, timer: 30 };
}
// Steps-to-go from every open tile to one tile (through the tunnels too), for the fruit's route.
function routeTo(st, gx, gy) {
  const key = gy * COLS + gx;
  st.routes ||= {};
  if (st.routes[key]) return st.routes[key];
  const dist = new Map([[key, 0]]), queue = [[gx, gy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i], d = dist.get(y * COLS + x);
    for (const dir of DIRS) {
      const nx = ((x + dir.x) % COLS + COLS) % COLS, ny = y + dir.y, k = ny * COLS + nx;
      if (dist.has(k) || wallFor(cellIn(st.maze, nx, ny), false)) continue;
      dist.set(k, d + 1); queue.push([nx, ny]);
    }
  }
  return (st.routes[key] = dist);
}
function stepFruit(st, dt) {
  const f = st.fruit;
  f.timer -= dt;
  if (f.timer <= 0) { st.fruit = null; return; }
  if (!f.wander) return;
  const route = f.phase === 'in' ? routeTo(st, 14, 17) : routeTo(st, f.exit.side < 0 ? 0 : COLS - 1, f.exit.row);
  const far = (e, d) => route.get(Math.floor(e.y + d.y) * COLS + ((Math.floor(e.x) + d.x) % COLS + COLS) % COLS) ?? Infinity;
  travel(st, f, 4 * st.hard * dt, (e) => {
    const options = exits(st, e);
    if (options.length) e.dir = options.reduce((best, d) => (far(e, d) < far(e, best) ? d : best)); else e.dir = { x: -e.dir.x, y: -e.dir.y };
  }, true);
  if (f.phase === 'in' && Math.abs(f.x - 14) < 1 && Math.floor(f.y) === 17) f.phase = 'out';
  // Out through the tunnel mouth: gone.
  if (f.phase === 'out' && Math.floor(f.y) === f.exit.row && ((f.dir.x < 0 && f.x < 0.6) || (f.dir.x > 0 && f.x > COLS - 0.6))) st.fruit = null;
}

export function step(st, dt, keys, game, random = Math.random) {
  if (st.startScore === undefined) st.startScore = game.score;
  st.time += dt;
  for (const q of st.popups) q.t += dt;
  st.popups = st.popups.filter((q) => q.t < 1);
  if (st.dying > 0) { st.dying -= dt; if (st.dying <= 0) reset(st); return null; }
  if (st.pause > 0) { st.pause -= dt; return null; }
  const info = st.info, pac = st.pac;
  const want = keys.has('ArrowLeft') ? { x: -1, y: 0 } : keys.has('ArrowRight') ? { x: 1, y: 0 } : keys.has('ArrowUp') ? { x: 0, y: -1 } : keys.has('ArrowDown') ? { x: 0, y: 1 } : null;
  if (want) {
    pac.want = want;
    if (want.x === -pac.dir.x && want.y === -pac.dir.y && (pac.dir.x || pac.dir.y)) pac.dir = want; // reverse any time
  }
  travel(st, pac, info.pac * st.hard * dt, (e) => {
    if (!wallFor(cell(st, Math.floor(e.x) + e.want.x, Math.floor(e.y) + e.want.y), false)) e.dir = e.want;
  }, false);
  if (pac.dir.x || pac.dir.y) pac.mouth += dt * 14;
  // Eat
  const key = Math.floor(pac.y) * COLS + ((Math.floor(pac.x) % COLS) + COLS) % COLS;
  if (st.dots.delete(key)) {
    const big = st.maze[Math.floor(pac.y)][key % COLS] === 'o';
    game.score += big ? 50 : 10;
    if (big) {
      st.fright = info.fright; st.eatenChain = 0;
      for (const g of st.ghosts) if (g.state === 'active') { g.frightened = true; g.dir = { x: -g.dir.x, y: -g.dir.y }; }
    }
    // The fruit shows up twice a maze, after a set number of dots.
    if (st.fruitsShown < info.fruitAt.length && st.total - st.dots.size >= info.fruitAt[st.fruitsShown]) { st.fruitsShown++; spawnFruit(st, random); }
  }
  if (st.fruit) {
    stepFruit(st, dt);
    const f = st.fruit;
    if (f && Math.hypot(f.x - pac.x, f.y - pac.y) < 0.8) {
      const points = FRUITS[f.kind]; game.score += points;
      st.popups.push({ x: f.x, y: f.y, t: 0, text: String(points), color: '#ffb8ff' }); st.fruit = null;
    }
  }
  if (finished(st, game)) return 'done';
  // Phase clock pauses while ghosts are frightened, as in the arcade.
  if (st.fright > 0) { st.fright -= dt; if (st.fright <= 0) st.ghosts.forEach((g) => { g.frightened = false; }); }
  else {
    st.phaseTime += dt;
    if (st.phaseTime >= info.phases[st.phase][1]) { st.phase = Math.min(info.phases.length - 1, st.phase + 1); st.phaseTime = 0; for (const g of st.ghosts) if (g.state === 'active') g.dir = { x: -g.dir.x, y: -g.dir.y }; }
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
    const speed = g.state === 'eaten' ? 14 : (g.frightened ? info.scared : tunnel(st, g) ? info.slow : info.ghost) * st.hard;
    travel(st, g, speed * dt, (e) => chooseGhostDir(st, e, random), true);
    if (g.state === 'eaten' && Math.abs(g.y - 11.5) < 0.6 && Math.abs(g.x - 14) < 1) { g.state = 'returning'; g.x = 14; g.y = 11.5; }
    if (g.state === 'active' && Math.hypot(g.x - pac.x, g.y - pac.y) < 0.7) {
      if (!g.frightened && game.runner?.invincible > 0) continue;
      if (g.frightened) {
        const points = 200 * 2 ** Math.min(st.eatenChain, 3); st.eatenChain++; game.score += points;
        g.frightened = false; g.state = 'eaten'; st.popups.push({ x: g.x, y: g.y, t: 0, text: String(points) }); st.pause = 0.35;
      } else result = 'hurt';
    }
  }
  if (finished(st, game)) return 'done';
  // Either way the hit costs a heart (in the engine); a big pet shrinks and blinks on, a small one is caught.
  if (result === 'hurt' && !game.runner?.big) st.dying = 1.4;
  return result;
}
// The stage's point target reached, or the maze cleared.
function finished(st, game) {
  if (st.ending || (game.score - st.startScore < st.target && st.dots.size > 0)) return false;
  st.ending = true;
  return true;
}

// Where the pet is drawn (the drawRunner arguments); it shrinks away when caught, like Pac-Man folding up.
export function pose(st, game) {
  const p = st.pac, cx = OX + p.x * T, cy = OY + p.y * T, base = game?.runner?.big ? 0.95 : 0.75;
  const k = st.dying > 0 ? Math.max(0, (st.dying - 0.3) / 1.1) : 1, size = base * k;
  return { x: cx - 6 * size, bottom: cy + 11 * size, cell: size, flip: (p.dir.x || p.want.x) < 0, onGround: true };
}

// ---------- drawing ----------
const px = (ctx, color, x, y, w, h) => { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); };
function paintWalls(ctx, st) {
  const look = st.info.look;
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    const ch = st.maze[y][x];
    if (ch === '-') { px(ctx, '#ffb8ff', OX + x * T, OY + y * T + 4, T, 2); continue; }
    if (ch !== '#') continue;
    const open = (dx, dy) => cell(st, x + dx, y + dy) !== '#';
    const X = OX + x * T, Y = OY + y * T;
    if (look.walls === 'outline') {
      // Pac-Man: hollow blue double lines.
      ctx.fillStyle = look.stroke;
      if (open(0, -1)) ctx.fillRect(X, Y + 2, T, 1.5);
      if (open(0, 1)) ctx.fillRect(X, Y + T - 3.5, T, 1.5);
      if (open(-1, 0)) ctx.fillRect(X + 2, Y, 1.5, T);
      if (open(1, 0)) ctx.fillRect(X + T - 3.5, Y, 1.5, T);
      continue;
    }
    // Ms. Pac-Man: solid-filled walls with a thin border line.
    const l = open(-1, 0) ? 2 : 0, r = open(1, 0) ? 2 : 0, t = open(0, -1) ? 2 : 0, b = open(0, 1) ? 2 : 0;
    px(ctx, look.fill, X + l, Y + t, T - l - r, T - t - b);
    ctx.fillStyle = look.stroke;
    if (t) ctx.fillRect(X + l, Y + t, T - l - r, 1);
    if (b) ctx.fillRect(X + l, Y + T - b - 1, T - l - r, 1);
    if (l) ctx.fillRect(X + l, Y + t, 1, T - t - b);
    if (r) ctx.fillRect(X + T - r - 1, Y + t, 1, T - t - b);
  }
}
// Little pixel fruit, about one tile big, centred on (cx, cy).
function paintFruit(ctx, kind, cx, cy) {
  if (kind === 'cherry') {
    ctx.fillStyle = '#ff2a2a';
    for (const [x, y] of [[-2.5, 1.5], [2, 2.5]]) { ctx.beginPath(); ctx.arc(cx + x, cy + y, 2.3, 0, Math.PI * 2); ctx.fill(); }
    px(ctx, '#fff', cx - 3.5, cy + 0.5, 1, 1); px(ctx, '#fff', cx + 1, cy + 1.5, 1, 1);
    ctx.strokeStyle = '#de9751'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(cx - 2.5, cy - 0.5); ctx.lineTo(cx + 3, cy - 4.5); ctx.lineTo(cx + 2, cy + 0.5); ctx.stroke();
  } else if (kind === 'strawberry') {
    [7, 7, 6, 5, 3, 1].forEach((n, i) => px(ctx, '#ff2a2a', cx - n / 2, cy - 2 + i * 1.2, n, 1.3));
    for (const [x, y] of [[-2, -1.5], [1, -1], [-0.5, 1], [2, 0.5]]) px(ctx, '#fff', cx + x, cy + y, 1, 1);
    px(ctx, '#2fb36a', cx - 3, cy - 3.5, 6, 1.5); px(ctx, '#2fb36a', cx - 0.5, cy - 5, 1, 2);
  } else {
    ctx.fillStyle = '#ffb852'; ctx.beginPath(); ctx.arc(cx, cy + 0.5, 3.6, 0, Math.PI * 2); ctx.fill();
    px(ctx, '#de9751', cx - 0.5, cy - 4, 1, 1.5); px(ctx, '#2fb36a', cx + 0.5, cy - 4.5, 2.5, 1.5);
  }
}
export function paint(ctx, st, game, drawRunner) {
  px(ctx, '#000', 0, 0, 500, 280);
  paintWalls(ctx, st);
  // Dots
  const dot = st.info.look.dot;
  for (const k of st.dots) {
    const x = k % COLS, y = Math.floor(k / COLS), cx = OX + x * T + T / 2, cy = OY + y * T + T / 2;
    if (st.maze[y][x] === 'o') { if (Math.floor(st.time * 4) % 2 === 0) { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, Math.PI * 2); ctx.fill(); } }
    else px(ctx, dot, cx - 1, cy - 1, 2, 2);
  }
  if (st.fruit) {
    const f = st.fruit, hop = f.wander ? -Math.abs(Math.sin(st.time * 7)) * 2 : 0;
    paintFruit(ctx, f.kind, OX + f.x * T, OY + f.y * T + hop);
  }
  // The pet
  {
    const p = pose(st, game);
    if (p.cell > 0) drawRunner?.(p.x, p.bottom, { cell: p.cell, flip: p.flip, onGround: p.onGround });
    if (st.dying > 0) return;
  }
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
  ctx.font = 'bold 9px ui-monospace, Consolas, monospace';
  for (const q of st.popups) { ctx.fillStyle = q.color || '#2affff'; ctx.fillText(q.text, OX + q.x * T - 8, OY + q.y * T); }
}
