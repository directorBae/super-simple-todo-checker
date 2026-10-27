import test from 'node:test';
import assert from 'node:assert/strict';
import * as pacman from '../src/focus/pacman.mjs';
import { createRunner } from '../src/focus/runner.mjs';

const seeded = (seed = 7) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const none = new Set();
const fakeCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const newGame = (score = 0) => ({ score, runner: createRunner() });
const COLS = 28;
// Ghosts stay home so nothing interferes.
const calm = (st) => st.ghosts.forEach((g) => Object.assign(g, { state: 'house', timer: 1e9 }));
const tiles = (maze, ch) => maze.flatMap((row, y) => [...row].map((c, x) => (c === ch ? { x, y } : null)).filter(Boolean));
const putOn = (st, { x, y }) => Object.assign(st.pac, { x: x + 0.5, y: y + 0.5, dir: { x: 0, y: 0 }, want: { x: 0, y: 0 } });

test('pac-man: three stages — the arcade maze, then Ms. Pac-Man\'s pink and light-blue mazes — with the arcade dot counts', () => {
  assert.equal(pacman.ENTRY, 'right');
  assert.deepEqual(pacman.TARGETS, [1800, 2400, 3000]);
  const expected = [[pacman.MAZE, 244], [pacman.MS_MAZE_1, 224], [pacman.MS_MAZE_2, 244]];
  expected.forEach(([maze, total], stage) => {
    assert.equal(maze.length, 31); assert.ok(maze.every((row) => row.length === 28));
    assert.ok(maze.every((row) => row === [...row].reverse().join('')), 'left-right symmetric');
    assert.equal(tiles(maze, 'o').length, 4, 'four energizers');
    const st = pacman.create(newGame(), { stage });
    assert.equal(st.maze, maze); assert.equal(st.total, total, `stage ${stage}: ${total} dots`);
    assert.equal(st.total, tiles(maze, '.').length + 4);
    // Every dot can be reached from the start, and nothing in the maze is a dead end.
    const open = (x, y) => y >= 0 && y < 31 && !'#_-'.includes(maze[y][((x % COLS) + COLS) % COLS]);
    const seen = new Set(), todo = [[14, 23]];
    while (todo.length) {
      const [x, y] = todo.pop(), k = y * COLS + x;
      if (seen.has(k) || !open(x, y)) continue;
      seen.add(k);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) todo.push([((x + dx) % COLS + COLS) % COLS, y + dy]);
    }
    assert.ok([...st.dots].every((k) => seen.has(k)), 'all dots reachable');
    for (const k of seen) {
      const x = k % COLS, y = Math.floor(k / COLS), ways = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => open(x + dx, y + dy)).length;
      if (!(y >= 13 && y <= 15 && x >= 11 && x <= 16)) assert.ok(ways >= 2, `no dead end at ${x},${y} (stage ${stage})`);
    }
    // The ghost house and the start are where the arcade puts them.
    assert.equal(maze[12].slice(13, 15), '--'); assert.equal(maze[23].slice(13, 15), '  ');
  });
  assert.equal(pacman.create().maze, pacman.MAZE, 'create() alone is the arcade maze');
  // Ms. Pac-Man's mazes have two pairs of tunnels; Pac-Man's one.
  assert.deepEqual(pacman.create(newGame(), { stage: 1 }).tunnels.map((t) => t.row), [8, 17]);
  assert.deepEqual(pacman.create(newGame(), { stage: 2 }).tunnels.map((t) => t.row), [1, 19]);
  assert.deepEqual(pacman.create(newGame()).tunnels.map((t) => t.row), [14]);
});

test('pac-man: every tunnel goes through to the other side, both ways', () => {
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = pacman.create(game, { stage }); st.pause = 0; calm(st);
    for (const t of st.tunnels) for (const [from, key] of [[1.5, 'ArrowLeft'], [COLS - 1.5, 'ArrowRight']]) {
      const dir = { x: key === 'ArrowLeft' ? -1 : 1, y: 0 };
      Object.assign(st.pac, { x: from, y: t.row + 0.5, dir, want: dir });
      let wrapped = false;
      for (let i = 0; i < 40 && !wrapped; i++) { pacman.step(st, 1 / 60, new Set([key]), game, seeded()); wrapped = Math.abs(st.pac.x - from) > COLS / 2; }
      assert.ok(wrapped, `stage ${stage} row ${t.row} ${key}`);
      assert.equal(st.pac.y, t.row + 0.5);
    }
  }
});

test('pac-man: pose() is where the pet is, at create time too (facing right as it comes in)', () => {
  const game = newGame(), st = pacman.create(game);
  const p = pacman.pose(st, game);
  assert.deepEqual(Object.keys(p).sort(), ['bottom', 'cell', 'flip', 'onGround', 'x']);
  const cx = (500 - 28 * 9) / 2 + 14 * 9, cy = 23.5 * 9;
  assert.deepEqual(p, { x: cx - 6 * 0.75, bottom: cy + 11 * 0.75, cell: 0.75, flip: false, onGround: true });
  st.pause = 0; calm(st);
  for (let i = 0; i < 30; i++) pacman.step(st, 1 / 60, new Set(['ArrowLeft']), game, seeded());
  const q = pacman.pose(st, game);
  assert.equal(q.flip, true); assert.ok(q.x < p.x);
  game.runner.big = true; assert.equal(pacman.pose(st, game).cell, 0.95);
  const calls = []; pacman.paint(fakeCtx(), st, game, (x, bottom, o) => calls.push({ x, bottom, ...o }));
  assert.equal(calls.length, 1); assert.deepEqual(calls[0], pacman.pose(st, game));
  for (const stage of [1, 2]) pacman.paint(fakeCtx(), pacman.create(game, { stage }), game, () => {});
});

test('pac-man: a stage ends when it has earned its target — not before — or when the maze is cleared; no 70% rule', () => {
  for (const stage of [0, 1, 2]) {
    const target = pacman.TARGETS[stage], game = newGame(5000), st = pacman.create(game, { stage }); st.pause = 0; calm(st);
    const dots = tiles(st.maze, '.');
    game.score = 5000 + target - 20;
    putOn(st, dots[0]);
    assert.equal(pacman.step(st, 1 / 60, none, game, seeded()), null, 'ten short of the target');
    assert.equal(game.score, 5000 + target - 10);
    putOn(st, dots[1]);
    assert.equal(pacman.step(st, 1 / 60, none, game, seeded()), 'done', `stage ${stage} ends at ${target}`);
    assert.equal(pacman.step(st, 1 / 60, none, game, seeded()), null, 'only once');
    // Most of the dots gone but few points: still playing.
    const s2 = pacman.create(game, { stage }); s2.pause = 0; calm(s2);
    s2.dots = new Set([...s2.dots].slice(0, 5));
    assert.equal(pacman.step(s2, 1 / 60, none, game, seeded()), null);
    // Every dot eaten ends it whatever the points.
    const s3 = pacman.create(game, { stage }); s3.pause = 0; calm(s3); putOn(s3, dots[2]);
    s3.dots = new Set([dots[2].y * COLS + dots[2].x]);
    assert.equal(pacman.step(s3, 1 / 60, none, game, seeded()), 'done');
  }
  // Without a game at create, the stage counts from the score at its first step.
  const game = newGame(9000), st = pacman.create(); st.pause = 0; calm(st);
  assert.equal(pacman.step(st, 1 / 60, none, game, seeded()), null);
});

test('pac-man: the bonus fruit — a cherry (100) under the ghost house after 70 dots; Ms. Pac-Man fruit wanders in and out', () => {
  const game = newGame(), st = pacman.create(game); st.pause = 0; calm(st);
  const dots = tiles(st.maze, '.');
  for (const d of dots.slice(10, 79)) st.dots.delete(d.y * COLS + d.x); // 69 eaten
  putOn(st, dots[0]); pacman.step(st, 1 / 60, none, game, seeded());
  assert.equal(st.fruit.kind, 'cherry'); assert.deepEqual([st.fruit.x, st.fruit.y], [14, 17.5]);
  const before = game.score; Object.assign(st.pac, { x: 14, y: 17.5 }); pacman.step(st, 1 / 60, none, game, seeded());
  assert.equal(game.score - before, 100); assert.equal(st.fruit, null);
  // It goes away by itself after about ten seconds, and the second one comes at 170.
  for (const d of dots.slice(79, 179)) st.dots.delete(d.y * COLS + d.x);
  putOn(st, dots[1]); pacman.step(st, 1 / 60, none, game, seeded());
  assert.equal(st.fruitsShown, 2); assert.ok(st.fruit);
  for (let i = 0; i < 60 * 11; i++) pacman.step(st, 1 / 60, none, game, seeded());
  assert.equal(st.fruit, null);

  for (const [stage, kind, points] of [[1, 'strawberry', 200], [2, 'orange', 500]]) {
    assert.equal(pacman.FRUITS[kind], points);
    const g = newGame(), s = pacman.create(g, { stage }), random = seeded(stage); s.pause = 0; calm(s);
    const ds = tiles(s.maze, '.');
    for (const d of ds.slice(10, 73)) s.dots.delete(d.y * COLS + d.x); // 63 eaten
    putOn(s, ds[0]); pacman.step(s, 1 / 60, none, g, random);
    assert.equal(s.fruit.kind, kind, 'appears after 64 dots');
    assert.ok(s.tunnels.some((t) => Math.floor(s.fruit.y) === t.row), 'comes in through a tunnel');
    // Park the pet in a corner and watch the fruit wander off through a tunnel.
    putOn(s, { x: 1, y: 29 }); s.pac.y = 29.5; s.pac.x = stage === 2 ? 3.5 : 1.5;
    let visitedHouse = false, steps = 0;
    for (; steps < 60 * 30 && s.fruit; steps++) {
      pacman.step(s, 1 / 60, none, g, random);
      if (s.fruit) {
        assert.ok(!'#_'.includes(s.maze[Math.floor(s.fruit.y)][((Math.floor(s.fruit.x) % COLS) + COLS) % COLS]), 'stays in the corridors');
        if (Math.floor(s.fruit.y) === 17 && Math.abs(s.fruit.x - 14) < 1.5) visitedHouse = true;
      }
    }
    assert.equal(s.fruit, null, 'leaves again'); assert.ok(visitedHouse, 'passes the ghost house');
  }
});

test('pac-man: later mazes are faster with shorter fright, and their ghosts scatter to their own corners', () => {
  const [a, b, c] = pacman.STAGES;
  assert.ok(a.pac < b.pac && b.pac < c.pac); assert.ok(a.ghost < b.ghost && b.ghost < c.ghost);
  assert.ok(a.fright > b.fright && b.fright > c.fright);
  for (const s of pacman.STAGES) assert.ok(s.ghost < s.pac, 'the pet stays a bit quicker than the ghosts');
  // Energizer: frightened for the stage's time.
  const game = newGame(), st = pacman.create(game, { stage: 2 }); st.pause = 0;
  st.ghosts.forEach((g) => Object.assign(g, { state: 'active', x: 20.5, y: 29.5 }));
  putOn(st, tiles(st.maze, 'o')[0]); pacman.step(st, 1 / 60, none, game, seeded());
  assert.ok(st.ghosts.every((g) => g.frightened)); assert.ok(Math.abs(st.fright - c.fright) < 0.02);
  // Clyde in scatter heads for the bottom-left of whichever maze.
  for (const stage of [0, 1, 2]) {
    const s = pacman.create(newGame(), { stage }); s.pause = 0;
    const clyde = s.ghosts[3]; s.ghosts = [clyde]; Object.assign(clyde, { state: 'active', x: 14, y: 11.5, dir: { x: -1, y: 0 } });
    Object.assign(s.pac, { x: 1.5, y: 1.5 }); s.pac.dir = { x: 0, y: 0 };
    for (let i = 0; i < 60 * 6; i++) { s.phase = 0; s.phaseTime = 0; s.pac.dir = { x: 0, y: 0 }; s.pac.want = { x: 0, y: 0 }; Object.assign(s.pac, { x: 26.5, y: 1.5 }); pacman.step(s, 1 / 60, none, newGame(), seeded()); }
    assert.ok(clyde.y > 20 && clyde.x < 14, `stage ${stage}: clyde near the bottom-left (${clyde.x}, ${clyde.y})`);
  }
});
