import test from 'node:test';
import assert from 'node:assert/strict';
import * as breakout from '../src/focus/breakout.mjs';
import { createRunner } from '../src/focus/runner.mjs';

const { BRICK_W, BRICK_H, FIELD_L, FIELD_R, FIELD_T, PADDLE_Y } = breakout;
const newGame = () => ({ score: 0, runner: createRunner() });
const NONE = new Set(), SPACE = new Set(['Space']), RIGHT = new Set(['ArrowRight']), LEFT = new Set(['ArrowLeft']);
const never = () => 0.99; // no capsules
const fakeCtx = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
const run = (st, game, n, keys = NONE, random = never) => { let r = null; for (let i = 0; i < n && !r; i++) r = breakout.step(st, 1 / 60, keys, game, random); return r; };
// Puts the ball in flight at (x, y) with velocity (vx, vy).
function aim(st, x, y, vx, vy) { Object.assign(st.ball, { x, y, vx, vy, speed: Math.hypot(vx, vy), stuck: false, serving: false }); }

test('breakout: each round lays out 13 columns of Arkanoid bricks and the pet stands on the Vaus', () => {
  assert.equal(breakout.ENTRY, 'up');
  assert.equal(FIELD_R - FIELD_L, 13 * BRICK_W);
  assert.ok(FIELD_L > 0 && FIELD_R < 500);
  const counts = [];
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = breakout.create(game, { stage, lap: stage });
    counts.push(st.bricks.length);
    assert.ok(st.bricks.every((b) => b.x >= FIELD_L && b.x + BRICK_W <= FIELD_R && b.y >= FIELD_T && b.y + BRICK_H < PADDLE_Y - 60));
    const p = breakout.pose(st, game);
    assert.equal(p.bottom, PADDLE_Y); assert.equal(p.onGround, true);
    assert.ok(Math.abs(p.x + 8 * p.cell - 250) < 1, 'centered on the paddle in the middle');
    assert.ok(st.ball.stuck, 'the ball waits on the Vaus');
    const calls = [];
    breakout.paint(fakeCtx(), st, game, (...args) => calls.push(args));
    assert.deepEqual(calls, [[p.x, p.bottom, { onGround: p.onGround, flip: p.flip, cell: p.cell }]]);
  }
  // Round 1: six full rows, silver on top (two hits each).
  const r1 = breakout.create(newGame(), { stage: 0 });
  assert.equal(counts[0], 78);
  const top = Math.min(...r1.bricks.map((b) => b.y));
  assert.ok(r1.bricks.filter((b) => b.y === top).every((b) => b.kind === 's' && b.hits === 2));
  // Round 2: the staircase (1, 2, 3 … bricks per row from the left).
  const r2 = breakout.create(newGame(), { stage: 1 });
  const rows = new Map(); for (const b of r2.bricks) rows.set(b.y, (rows.get(b.y) || 0) + 1);
  assert.deepEqual([...rows.values()].slice(0, 5), [1, 2, 3, 4, 5]);
  // Round 3: gold bricks.
  const r3 = breakout.create(newGame(), { stage: 2 });
  assert.ok(r3.bricks.filter((b) => b.kind === 'G').length >= 20);
  assert.ok(breakout.bricksLeft(r3) < r3.bricks.length);
});

test('breakout: ← → move the Vaus and the pet moves with it, inside the walls', () => {
  const game = newGame(), st = breakout.create(game);
  const x0 = breakout.pose(st, game).x, cx0 = st.paddle.cx;
  run(st, game, 20, RIGHT);
  const moved = st.paddle.cx - cx0;
  assert.ok(moved > 50);
  assert.ok(Math.abs(breakout.pose(st, game).x - x0 - moved) < 1e-9);
  assert.ok(Math.abs(st.ball.x - st.paddle.cx - 14) < 1e-9, 'the waiting ball rides along');
  run(st, game, 300, LEFT);
  assert.equal(st.paddle.cx - st.paddle.w / 2, FIELD_L);
  assert.equal(breakout.pose(st, game).flip, true);
});

test('breakout: Space launches (or it goes by itself), the ball bounces off walls and the Vaus by where it lands', () => {
  const game = newGame(), st = breakout.create(game);
  breakout.step(st, 1 / 60, SPACE, game, never);
  assert.equal(st.ball.stuck, false); assert.ok(st.ball.vy < 0);
  const auto = breakout.create(game);
  run(auto, game, 100);
  assert.equal(auto.ball.stuck, false);
  // Off the left wall
  aim(st, FIELD_L + 6, 200, -200, -60);
  run(st, game, 3);
  assert.ok(st.ball.vx > 0);
  // Off the right end of the Vaus: a shallow angle to the right. Off the left end: to the left.
  const pad = st.paddle;
  aim(st, pad.cx + pad.w / 2 - 1, PADDLE_Y - 6, 0, 200);
  run(st, game, 3);
  assert.ok(st.ball.vy < 0 && st.ball.vx > Math.abs(st.ball.vy), 'shallow to the right');
  aim(st, pad.cx - pad.w / 2 + 1, PADDLE_Y - 6, 0, 200);
  run(st, game, 3);
  assert.ok(st.ball.vy < 0 && -st.ball.vx > Math.abs(st.ball.vy), 'shallow to the left');
  // Onto the pet's head: steep, up.
  aim(st, pad.cx + 2, PADDLE_Y - 34, 0, 200);
  run(st, game, 10);
  assert.ok(st.ball.vy < 0 && Math.abs(st.ball.vx) < Math.abs(st.ball.vy), 'steep off the pet');
  assert.ok(st.ball.y < PADDLE_Y - 20);
});

test('breakout: the ball speeds up as the round goes on', () => {
  const game = newGame(), st = breakout.create(game, { stage: 0 });
  st.bricks = st.bricks.slice(0, 1); // keep the field mostly empty so nothing else interferes
  breakout.step(st, 1 / 60, SPACE, game, never);
  const v0 = st.ball.speed;
  for (let i = 0; i < 600; i++) {
    breakout.step(st, 1 / 60, NONE, game, never);
    st.paddle.cx = Math.max(FIELD_L + st.paddle.w / 2, Math.min(FIELD_R - st.paddle.w / 2, st.ball.x - 14));
  }
  assert.ok(st.ball.speed > v0 + 20);
});

test('breakout: bricks pay by color; silver takes two hits and pays 50 × round; gold never breaks', () => {
  const game = newGame(), st = breakout.create(game, { stage: 0 });
  const green = st.bricks.find((b) => b.kind === 'g');
  aim(st, green.x + BRICK_W / 2, green.y + BRICK_H + 8, 0, -200);
  run(st, game, 6);
  assert.equal(game.score, 80);
  assert.ok(!st.bricks.includes(green));
  assert.ok(st.ball.vy > 0, 'bounced back down');
  // Silver: first hit only dents it.
  const silver = st.bricks.find((b) => b.kind === 's');
  for (const b of st.bricks) if (b !== silver && b.x === silver.x) b.gone = true;
  st.bricks = st.bricks.filter((b) => !b.gone);
  aim(st, silver.x + BRICK_W / 2, silver.y + BRICK_H + 8, 0, -200);
  run(st, game, 6);
  assert.ok(st.bricks.includes(silver)); assert.equal(silver.hits, 1); assert.equal(game.score, 80);
  aim(st, silver.x + BRICK_W / 2, silver.y + BRICK_H + 8, 0, -200);
  run(st, game, 6);
  assert.ok(!st.bricks.includes(silver)); assert.equal(game.score, 130);
  const r2 = breakout.create(game, { stage: 1 }), s2 = r2.bricks.find((b) => b.kind === 's');
  r2.bricks = [s2]; s2.hits = 1; game.score = 0;
  aim(r2, s2.x + BRICK_W / 2, s2.y + BRICK_H + 8, 0, -200);
  run(r2, game, 6);
  assert.equal(game.score, 100, 'silver in round 2 = 100');
  // Gold
  const r3 = breakout.create(game, { stage: 2 }), gold = r3.bricks.find((b) => b.kind === 'G');
  r3.bricks = r3.bricks.filter((b) => b === gold || b.kind !== 'G' && b.y < gold.y - 10);
  game.score = 0;
  aim(r3, gold.x + BRICK_W / 2, gold.y + BRICK_H + 8, 0, -200);
  run(r3, game, 6);
  assert.ok(r3.bricks.includes(gold)); assert.equal(game.score, 0); assert.ok(r3.ball.vy > 0);
});

test('breakout: points per color follow the arcade', () => {
  const want = { w: 50, o: 60, c: 70, g: 80, r: 90, b: 100, p: 110, y: 120 };
  for (const [kind, points] of Object.entries(want)) assert.equal(breakout.BRICKS[kind].points, points);
});

test('breakout: a lost ball hurts and a new one is served on the Vaus', () => {
  const game = newGame(), st = breakout.create(game);
  st.effect = 'E';
  aim(st, 120, 270, 0, 250);
  assert.equal(run(st, game, 10), 'hurt');
  assert.ok(st.ball.stuck && st.ball.serving);
  assert.equal(st.effect, null, 'power-ups end with the ball');
  // While blinking, no second report.
  game.runner.invincible = 1;
  aim(st, 120, 270, 0, 250);
  assert.equal(run(st, game, 10), null);
});

test('breakout: capsules — E widens the Vaus, S slows the ball, C catches it, P adds a heart up to four', () => {
  const game = newGame(), st = breakout.create(game);
  const w0 = st.paddle.w;
  breakout.dropCapsule(st, 'E');
  run(st, game, 60);
  assert.equal(st.effect, 'E'); assert.equal(st.capsules.length, 0);
  assert.ok(st.paddle.w > w0 * 1.4, 'wider');
  assert.equal(game.score, 1000);
  assert.ok(Math.abs(breakout.pose(st, game).x + 8 * 1.2 - st.paddle.cx) < 1e-9, 'the pet stays in the middle');
  // Slow
  breakout.step(st, 1 / 60, SPACE, game, never);
  st.ball.speed = 320;
  breakout.dropCapsule(st, 'S');
  aim(st, 250, 100, 120, -200); st.ball.speed = 320;
  run(st, game, 40);
  assert.equal(st.effect, 'S'); assert.ok(st.ball.speed < 260);
  assert.ok(st.paddle.w < w0 + 1 || st.paddle.w < 78, 'E ends when another capsule is caught');
  // Catch (the ball waits on the Vaus meanwhile, so it isn't lost)
  Object.assign(st.ball, { stuck: true, offset: -20, hold: 99 });
  breakout.dropCapsule(st, 'C');
  run(st, game, 40);
  assert.equal(st.effect, 'C');
  aim(st, st.paddle.cx + 18, PADDLE_Y - 8, 0, 200);
  run(st, game, 4);
  assert.equal(st.ball.stuck, true, 'caught');
  run(st, game, 3, RIGHT);
  assert.ok(Math.abs(st.ball.x - st.paddle.cx - 18) < 3, 'rides along until launched');
  breakout.step(st, 1 / 60, NONE, game, never);
  breakout.step(st, 1 / 60, SPACE, game, never);
  assert.equal(st.ball.stuck, false);
  // P: a heart while below four
  Object.assign(st.ball, { stuck: true, offset: -20, hold: 99 });
  assert.equal(game.runner.lives, 3);
  breakout.dropCapsule(st, 'P'); run(st, game, 40);
  assert.equal(game.runner.lives, 4);
  breakout.dropCapsule(st, 'P'); run(st, game, 40);
  assert.equal(game.runner.lives, 4);
  // Missed capsules fall away.
  breakout.dropCapsule(st, 'E', FIELD_L + 2, 200); st.paddle.cx = FIELD_R - 40;
  run(st, game, 120);
  assert.equal(st.capsules.length, 0); assert.notEqual(st.effect, 'E');
});

test('breakout: capsules come out of some colored bricks', () => {
  const game = newGame(), st = breakout.create(game);
  const green = st.bricks.find((b) => b.kind === 'g');
  aim(st, green.x + BRICK_W / 2, green.y + BRICK_H + 8, 0, -200);
  run(st, game, 6, NONE, () => 0);
  assert.equal(st.capsules.length, 1); assert.equal(st.capsules[0].type, 'E');
});

test('breakout: the last breakable brick wins a shield, SHIELD! shows, then done (gold bricks do not count)', () => {
  for (const stage of [0, 2]) {
    const game = newGame(), st = breakout.create(game, { stage });
    const last = st.bricks.find((b) => b.kind !== 'G' && b.kind !== 's' && st.bricks.every((q) => q === b || q.x !== b.x || q.y < b.y));
    st.bricks = st.bricks.filter((b) => b === last || b.kind === 'G');
    aim(st, last.x + BRICK_W / 2, last.y + BRICK_H + 8, 0, -200);
    let result = run(st, game, 6);
    assert.equal(result, null);
    assert.equal(breakout.bricksLeft(st), 0);
    assert.equal(game.runner.shield, true);
    assert.ok(st.popups.some((q) => q.text === 'SHIELD!'));
    if (stage === 2) assert.ok(st.bricks.length > 0, 'gold bricks are still there');
    result = run(st, game, 200);
    assert.equal(result, 'done');
    assert.equal(run(st, game, 5), null, 'done only once');
  }
});

test('breakout: a whole round can be cleared by following the ball', () => {
  const game = newGame(), st = breakout.create(game, { stage: 0 });
  let result = null, hurts = 0;
  for (let i = 0; i < 60 * 600 && result !== 'done'; i++) {
    // Keep the Vaus under the ball, a bit off-center so the angle keeps changing.
    const target = st.ball.x + Math.sin(i / 97) * 18, dir = target > st.paddle.cx + 3 ? RIGHT : target < st.paddle.cx - 3 ? LEFT : NONE;
    result = breakout.step(st, 1 / 60, dir, game, never);
    if (result === 'hurt') hurts++;
  }
  assert.equal(result, 'done');
  assert.ok(game.score >= 77 * 50);
  assert.ok(hurts < 3, `lost ${hurts} balls`);
});

test('breakout: a round that drags on lets out the B capsule; the warp gate counts as a clear (shield + done)', () => {
  const game = newGame(), st = breakout.create(game, { stage: 2 });
  const green = st.bricks.find((b) => b.kind === 'g');
  aim(st, green.x + BRICK_W / 2, green.y + BRICK_H + 8, 0, -200);
  run(st, game, 6);
  assert.equal(st.capsules.length, 0, 'no B early on');
  st.time = breakout.BREAK_AFTER;
  const gold = st.bricks.find((b) => b.kind === 'G');
  aim(st, gold.x + BRICK_W / 2, gold.y + BRICK_H + 8, 0, -200);
  run(st, game, 6);
  assert.equal(st.capsules.length, 1); assert.equal(st.capsules[0].type, 'B');
  Object.assign(st.ball, { stuck: true, offset: -20, hold: 99 });
  st.capsules[0].x = st.paddle.cx - 10; st.capsules[0].y = PADDLE_Y - 30;
  run(st, game, 40);
  assert.equal(st.gate, true);
  assert.ok(breakout.bricksLeft(st) > 0);
  const before = game.score;
  let result = null;
  for (let i = 0; i < 120 && !st.outro; i++) result = breakout.step(st, 1 / 60, RIGHT, game, never);
  assert.equal(result, null); assert.ok(st.outro, 'warped');
  assert.equal(game.score - before, 10000);
  assert.equal(game.runner.shield, true);
  result = run(st, game, 200);
  assert.equal(result, 'done');
});
