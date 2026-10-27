import test from 'node:test';
import assert from 'node:assert/strict';
import * as tetris from '../src/focus/tetris.mjs';

const { COLS, ROWS, CELL, WELL_X, WELL_Y, LEDGE, PET_CELL, CLEAR_TIME, cellsOf, fits, gravity } = tetris;
const DT = 1 / 60;
// A fixed sequence of "random" numbers so every run is the same.
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const newGame = () => ({ score: 0, runner: { big: false, lives: 3, invincible: 0 } });
const none = new Set();
function run(st, game, seconds, keys = none, random = seeded()) {
  const results = [];
  for (let t = 0; t < seconds - 1e-9; t += DT) { const r = tetris.step(st, DT, keys, game, random); if (r) results.push(r); }
  return results;
}
// Past the pet's opening hop, with the piece in the well and the pet riding it.
function ready(stage = 0, piece) {
  const game = newGame(), st = tetris.create(game, { stage, random: seeded() });
  run(st, game, 0.62);
  if (piece) st.piece = { rot: 0, x: 5, y: 0, ...piece };
  st.fall = 0;
  return { game, st };
}
const topOf = (st) => st.board.findIndex((row) => row.some(Boolean));
const press = (st, game, key) => { tetris.step(st, DT, new Set([key]), game, seeded()); tetris.step(st, DT, none, game, seeded()); };

test('tetris: every stage creates with its NES type, level and line goal; B-type starts on garbage', () => {
  assert.equal(tetris.ENTRY, 'up');
  const want = [['A', 0, 4], ['A', 5, 6], ['B', 8, 8]];
  for (let stage = 0; stage < 3; stage++) {
    const st = tetris.create(newGame(), { stage, random: seeded(stage + 1) });
    assert.deepEqual([st.type, st.level, st.goal, st.lines], [...want[stage], 0]);
    assert.ok(tetris.ORDER.includes(st.piece.kind) && tetris.ORDER.includes(st.next));
    assert.deepEqual([st.piece.x, st.piece.y, st.piece.rot], [5, 0, 0]);
  }
  const a = tetris.create(newGame(), { stage: 0 });
  assert.equal(topOf(a), -1, 'A-type starts with an empty well');
  const b = tetris.create(newGame(), { stage: 2, random: seeded(3) });
  for (let y = 0; y < ROWS - 6; y++) assert.ok(b.board[y].every((c) => c === null));
  for (let y = ROWS - 6; y < ROWS; y++) {
    assert.ok(b.board[y].some(Boolean), `garbage row ${y} has blocks`);
    assert.ok(b.board[y].some((c) => c === null), `garbage row ${y} has a hole`);
  }
  // Later laps repeat a little faster.
  assert.equal(tetris.create(newGame(), { stage: 0, lap: 3 }).level, 1);
  assert.equal(tetris.create(newGame(), { stage: 0, lap: 1 }).level, 0);
});

test('tetris: the pet starts on its ledge, then hops onto the first piece', () => {
  const game = newGame(), st = tetris.create(game, { random: seeded() });
  const start = tetris.pose(st, game);
  assert.deepEqual(start, { x: LEDGE.x, bottom: LEDGE.bottom, cell: PET_CELL, flip: false, onGround: true });
  assert.ok(Math.abs(start.x - 64) < 1 && Math.abs(start.bottom - 250) < 1);
  run(st, game, 0.3);
  const mid = tetris.pose(st, game);
  assert.equal(mid.onGround, false);
  assert.ok(mid.x > start.x && mid.bottom < start.bottom, 'in the air, heading up and right');
  assert.equal(st.piece.y, 0, 'the first piece waits for the pet');
  run(st, game, 0.32);
  const on = tetris.pose(st, game), top = Math.min(...cellsOf(st.piece).map(([, y]) => y));
  assert.equal(on.onGround, true);
  assert.equal(on.bottom, WELL_Y + top * CELL, 'feet on the top of the piece');
  const col = Math.floor((on.x + 8.5 * PET_CELL - WELL_X) / CELL);
  assert.ok(cellsOf(st.piece).some(([x, y]) => x === col && y === top), 'standing over one of its highest blocks');
});

test('tetris: pieces fall one row per NES gravity period', () => {
  for (const [stage, frames] of [[0, 48], [1, 23], [2, 8]]) {
    const { game, st } = ready(stage, { kind: 'T' });
    assert.ok(Math.abs(gravity(st.level) - frames / 60.0988) < 1e-9);
    const rows = 6, time = rows * gravity(st.level);
    run(st, game, time - 2 * DT);
    assert.equal(st.piece.y, rows - 1, `stage ${stage}: not yet`);
    run(st, game, 3 * DT);
    assert.equal(st.piece.y, rows, `stage ${stage}: ${rows} rows in ${time.toFixed(2)}s`);
  }
});

test('tetris: ← → shift with DAS, ↑ rotates clockwise (with a kick), ↓ soft drops, Space hard drops', () => {
  const { game, st } = ready(0, { kind: 'T' });
  press(st, game, 'ArrowLeft');
  assert.equal(st.piece.x, 4, 'a tap moves one column');
  // Holding: one at once, then nothing until the 16-frame DAS, then one every 6 frames, up to the wall.
  const left = new Set(['ArrowLeft']);
  tetris.step(st, DT, left, game);
  assert.equal(st.piece.x, 3);
  run(st, game, 14 * DT, left);
  assert.equal(st.piece.x, 3, 'DAS still charging');
  run(st, game, 3 * DT, left);
  assert.equal(st.piece.x, 2, 'auto-repeat starts');
  run(st, game, 0.5, left);
  assert.equal(st.piece.x, 1, 'stops at the wall');
  tetris.step(st, DT, none, game);

  // T spawn points down; one clockwise turn points it left.
  const before = st.piece.rot;
  press(st, game, 'ArrowUp');
  assert.equal(st.piece.rot, before + 1);
  assert.deepEqual(new Set(cellsOf(st.piece).map(String)), new Set([[1, -1], [0, 0], [1, 0], [1, 1]].map(([x, y]) => String([x, st.piece.y + y]))));
  // Held ↑ does not keep turning.
  run(st, game, 0.3, new Set(['ArrowUp']));
  assert.equal(st.piece.rot, before + 2);
  tetris.step(st, DT, none, game);

  // A vertical I against the left wall kicks out when it turns flat.
  st.piece = { kind: 'I', rot: 1, x: 0, y: 5 };
  press(st, game, 'ArrowUp');
  assert.equal(st.piece.rot, 0);
  assert.ok(fits(st.board, st.piece) && Math.min(...cellsOf(st.piece).map(([x]) => x)) === 0);

  // Soft drop: one row every 2 frames, 1 point a row.
  st.piece = { kind: 'O', rot: 0, x: 5, y: 0 }; st.fall = 0;
  const score = game.score, down = new Set(['ArrowDown']);
  run(st, game, 10 * DT, down);
  assert.equal(st.piece.y, 5);
  assert.equal(game.score - score, 5);

  // Hard drop: straight to the floor, 2 points a row, and the piece locks.
  const s2 = game.score, y = st.piece.y;
  tetris.step(st, DT, new Set(['Space']), game);
  assert.equal(st.piece, null);
  assert.equal(game.score - s2, 2 * (ROWS - 2 - y));
  assert.equal(st.board[ROWS - 1][4], 'O');
  assert.equal(st.board[ROWS - 2][5], 'O');
});

test('tetris: clearing lines scores NES points and wipes the rows', () => {
  for (const [lines, points] of [[1, 40], [2, 100], [3, 300], [4, 1200]]) {
    for (const stage of [0, 1]) {
      const { game, st } = ready(stage, { kind: 'I', rot: 1, x: 9, y: 0 });
      // Full rows except the last column; one more row above keeps the stack.
      for (let y = ROWS - lines; y < ROWS; y++) for (let x = 0; x < 9; x++) st.board[y][x] = 'J';
      st.board[ROWS - lines - 1][0] = 'L';
      // The vertical I (rows y-2 … y+1) falls from y = 0 to y = 18 down the open last column: 18 rows.
      const start = game.score, hard = 2 * 18;
      tetris.step(st, DT, new Set(['Space']), game);
      assert.equal(game.score - start, points * (st.level + 1) + hard, `${lines} lines at level ${st.level}`);
      assert.ok(st.clearing && st.clearing.rows.length === lines, 'the wipe animation runs');
      run(st, game, CLEAR_TIME + DT);
      assert.equal(st.lines, lines);
      assert.equal(st.clearing, null);
      assert.equal(st.board[ROWS - 1][0], 'L', 'what was above drops down');
      assert.equal(st.board.flat().filter(Boolean).length, 1 + (4 - lines), 'the rest of the I and the L remain');
    }
  }
});

test('tetris: the pet rides the falling piece and hops onto the next one', () => {
  const { game, st } = ready(0, { kind: 'O' });
  run(st, game, 0.3); // walks to the block it stands on
  const p0 = tetris.pose(st, game);
  assert.equal(p0.bottom, WELL_Y + st.piece.y * CELL);
  // Down with gravity …
  run(st, game, gravity(0) * 2);
  const p1 = tetris.pose(st, game);
  assert.equal(p1.bottom, WELL_Y + st.piece.y * CELL);
  assert.equal(p1.bottom - p0.bottom, 2 * CELL);
  // … and sideways with the piece.
  press(st, game, 'ArrowRight');
  const p2 = tetris.pose(st, game);
  assert.equal(p2.x - p1.x, CELL);
  assert.equal(p2.flip, false);
  press(st, game, 'ArrowLeft'); press(st, game, 'ArrowLeft');
  assert.equal(tetris.pose(st, game).x - p2.x, -2 * CELL);
  assert.equal(tetris.pose(st, game).flip, true);
  // Hard drop: the pet goes down with it, then jumps to the next piece at the top.
  tetris.step(st, DT, new Set(['Space']), game);
  assert.equal(st.pet.hop.y0, WELL_Y + (ROWS - 2) * CELL, 'came down with the piece and jumps off it');
  assert.ok(tetris.pose(st, game).bottom > WELL_Y + (ROWS - 5) * CELL);
  run(st, game, 0.15);
  assert.equal(tetris.pose(st, game).onGround, false, 'hopping');
  run(st, game, 0.5);
  assert.ok(st.piece, 'next piece is out');
  const top = Math.min(...cellsOf(st.piece).map(([, y]) => y));
  assert.equal(tetris.pose(st, game).bottom, WELL_Y + top * CELL, 'standing on the new piece');
});

test('tetris: topping out costs a heart and crumbles the top half of the stack', () => {
  const { game, st } = ready(0, { kind: 'O', x: 1 });
  // A column of blocks up through the spawn point (no full rows).
  for (let y = 0; y < ROWS; y++) for (const x of [4, 5, 6]) st.board[y][x] = 'Z';
  const results = [];
  results.push(tetris.step(st, DT, new Set(['Space']), game));
  results.push(...run(st, game, 0.4));
  assert.deepEqual(results.filter(Boolean), ['hurt'], 'one heart, once');
  assert.ok(topOf(st) >= 10, `stack lowered (top row now ${topOf(st)})`);
  assert.ok(st.debris.length > 0, 'blocks crumble away');
  assert.equal(st.board[ROWS - 1][5], 'Z', 'the bottom half stays');
  run(st, game, 0.6);
  assert.ok(st.piece, 'play goes on with a new piece');
});

test('tetris: reaching the line goal shows CLEAR!, returns the pet to its ledge, then is done', () => {
  for (const stage of [0, 1, 2]) {
    const { game, st } = ready(stage, { kind: 'I', rot: 1, x: 9, y: 0 });
    st.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    st.lines = st.goal - 4;
    for (let y = ROWS - 4; y < ROWS; y++) for (let x = 0; x < 9; x++) st.board[y][x] = 'T';
    const results = [tetris.step(st, DT, new Set(['Space']), game), ...run(st, game, 0.5)];
    assert.ok(st.outro, 'CLEAR! is up');
    assert.ok(!results.includes('done'), 'not done straight away');
    results.push(...run(st, game, 2));
    assert.deepEqual(results.filter(Boolean), ['done']);
    assert.equal(st.lines, st.goal);
    const p = tetris.pose(st, game);
    assert.ok(Math.abs(p.x - LEDGE.x) < 1e-6 && p.bottom === LEDGE.bottom && p.onGround);
  }
});

test('tetris: paints the NES screen and the pet exactly at its pose', () => {
  const calls = [], texts = [];
  const ctx = { fillRect: () => {}, fillText: (s) => texts.push(s), set fillStyle(v) {}, set font(v) {}, globalAlpha: 1 };
  const { game, st } = ready(2);
  game.score = 1234;
  run(st, game, 0.2);
  tetris.paint(ctx, st, game, (x, bottom, opts) => calls.push({ x, bottom, ...opts }));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], tetris.pose(st, game));
  for (const s of ['B-TYPE', 'STATISTICS', 'SCORE', '001234', 'NEXT', 'LEVEL', '08', 'LINES-008']) assert.ok(texts.includes(s), s);
});
