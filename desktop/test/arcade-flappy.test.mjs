import test from 'node:test';
import assert from 'node:assert/strict';
import * as flappy from '../src/focus/flappy.mjs';
import { createRunner } from '../src/focus/runner.mjs';
import { FLOOR, START_X } from '../src/focus/dino.mjs';

const newGame = () => ({ score: 0, runner: createRunner() });
const NONE = new Set(), FLAP = new Set(['Space']);
const rand = () => 0.5;
// A small seeded generator so the pipes vary but every run is the same.
const seeded = (seed = 7) => () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
// A canvas stand-in that accepts every call (paint smoke tests).
const fakeCtx = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
// Steps once with a fresh press (flaps are one per press).
function tap(st, game, dt = 1 / 60) { flappy.step(st, dt, FLAP, game, rand); return flappy.step(st, dt, NONE, game, rand); }
// Gets the pet airborne past the "get ready" run-in.
function takeOff(st, game) { tap(st, game); for (let i = 0; i < 80; i++) flappy.step(st, 1 / 60, NONE, game, rand); }

test('flappy: every stage starts with the pet on the dino road, entering from the right', () => {
  assert.equal(flappy.ENTRY, 'right');
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = flappy.create(game, { stage, lap: stage });
    const p = flappy.pose(st, game);
    assert.equal(p.x, START_X); assert.equal(p.bottom, FLOOR);
    assert.equal(p.cell, 1.5); assert.equal(p.onGround, true); assert.equal(p.flip, false);
    assert.equal(st.goal, [8, 10, 12][stage]);
    assert.equal(st.pipes.length, 0, 'no pipe before take-off');
    const calls = [];
    flappy.paint(fakeCtx(), st, game, (...args) => calls.push(args));
    assert.deepEqual(calls[0], [p.x, p.bottom, { onGround: p.onGround, flip: p.flip, cell: p.cell }]);
  }
  // A big pet starts at its big size (seamless from the road) and shrinks while walking in.
  const game = newGame(); game.runner.big = true;
  const st = flappy.create(game);
  assert.equal(flappy.pose(st, game).cell, 2.1);
  for (let i = 0; i < 90; i++) flappy.step(st, 1 / 60, NONE, game, rand);
  assert.equal(flappy.pose(st, game).cell, 1.5);
});

test('flappy: stage 2 has narrower gaps than stage 0; stage 1 slides some pipes', () => {
  const game = newGame();
  const day = flappy.create(game, { stage: 0 }), dusk = flappy.create(game, { stage: 1 }), night = flappy.create(game, { stage: 2 });
  assert.ok(night.gap < day.gap);
  assert.equal(day.sky, 'day'); assert.equal(dusk.sky, 'dusk'); assert.equal(night.sky, 'night');
  game.runner.invincible = 1e9; // fly through everything
  takeOff(dusk, game);
  const amps = dusk.pipes.map((p) => p.amp);
  for (let i = 0; i < 2000 && dusk.made < 4; i++) {
    const before = dusk.pipes.length;
    flappy.step(dusk, 1 / 60, NONE, game, rand);
    if (dusk.pipes.length > before) amps.push(dusk.pipes[dusk.pipes.length - 1].amp);
  }
  assert.deepEqual(amps.map((a) => a > 0), [false, true, false, true]);
  const moving = dusk.pipes.find((p) => p.amp > 0), c0 = flappy.gapCenter(moving, dusk.time);
  for (let i = 0; i < 30; i++) flappy.step(dusk, 1 / 60, NONE, game, rand);
  assert.notEqual(flappy.gapCenter(moving, dusk.time), c0, 'it slides');
});

test('flappy: a flap rises, gravity pulls back down, the first pipe is far away', () => {
  const game = newGame(), st = flappy.create(game);
  tap(st, game);
  assert.equal(st.phase, 'fly');
  const start = st.pet.bottom;
  for (let i = 0; i < 10; i++) flappy.step(st, 1 / 60, NONE, game, rand);
  assert.ok(st.pet.bottom < start - 20, 'went up');
  assert.equal(flappy.pose(st, game).onGround, false);
  const top = st.pet.bottom;
  for (let i = 0; i < 15; i++) flappy.step(st, 1 / 60, NONE, game, rand);
  assert.ok(st.pet.vy > 0 && st.pet.bottom > top, 'falls again');
  assert.ok(st.pipes[0].x > 400, 'first pipe starts off screen');
  // Holding the key is one flap, not flight.
  const blinking = newGame(), held = flappy.create(blinking);
  blinking.runner.invincible = 1e9; // so it lands on the ground instead of being put back in a gap
  for (let i = 0; i < 120; i++) flappy.step(held, 1 / 60, FLAP, blinking, rand);
  assert.equal(held.pet.bottom, FLOOR);
});

test('flappy: it takes off by itself after the run-in', () => {
  const game = newGame(), st = flappy.create(game);
  for (let i = 0; i < 90; i++) flappy.step(st, 1 / 60, NONE, game, rand);
  assert.equal(st.phase, 'fly');
});

test('flappy: hitting a pipe hurts, then the pet waits in the next gap with the near pipes cleared', () => {
  const game = newGame(), st = flappy.create(game);
  takeOff(st, game);
  st.pipes = [];
  const p = st.pet;
  // A pipe right on the pet with its gap far below, and one further on.
  flappy.placePipe(st, p.x, 220);
  const next = flappy.placePipe(st, p.x + 260, 120);
  assert.equal(flappy.step(st, 1 / 60, NONE, game, rand), 'hurt');
  assert.deepEqual(st.pipes, [next]);
  assert.ok(Math.abs(p.bottom - 13 - flappy.gapCenter(next, st.time)) < 1, 'put back in the next gap');
  // It hovers there instead of dropping straight away.
  game.runner.invincible = 1.5;
  for (let i = 0; i < 20; i++) assert.equal(flappy.step(st, 1 / 60, NONE, game, rand), null);
  assert.ok(Math.abs(p.bottom - 13 - flappy.gapCenter(next, st.time)) < 3);
});

test('flappy: the ground hurts; while blinking the pet stands on it instead', () => {
  const game = newGame(), st = flappy.create(game);
  takeOff(st, game); st.pipes = [];
  let result = null;
  for (let i = 0; i < 200 && !result; i++) result = flappy.step(st, 1 / 60, NONE, game, rand);
  assert.equal(result, 'hurt');
  game.runner.invincible = 1.5; st.hover = 0; st.pipes = [];
  for (let i = 0; i < 120; i++) assert.equal(flappy.step(st, 1 / 60, NONE, game, rand), null);
  assert.equal(st.pet.bottom, FLOOR); assert.equal(st.pet.onGround, true);
});

test('flappy: each pipe passed is 100 points; N pipes give wings, WINGS!, a landing on the road and done', () => {
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = flappy.create(game, { stage }), random = seeded(stage + 3);
    takeOff(st, game);
    // Fly by itself: flap whenever the pet's feet sink near the bottom of the next gap (where it will be on arrival).
    let result = null, guard = 0;
    while (result !== 'done' && guard++ < 60 * 120) {
      const next = st.pipes.find((p) => !p.passed);
      const arrive = next ? Math.max(0, (next.x - st.pet.x - 20) / st.speed) : 0;
      const aim = next ? flappy.gapCenter(next, st.time + arrive) + st.gap / 2 - 10 : 140;
      const press = st.phase === 'fly' && st.pet.bottom > aim && !st.held;
      result = flappy.step(st, 1 / 60, press ? FLAP : NONE, game, random);
      assert.notEqual(result, 'hurt', `stage ${stage}: autopilot crashed at pipe ${st.passed}`);
      if (st.phase === 'outro') assert.equal(game.runner.wings, true);
    }
    assert.equal(result, 'done');
    assert.equal(st.passed, st.goal); assert.equal(game.score, st.goal * 100);
    assert.equal(game.runner.wings, true);
    assert.equal(st.message.text, 'WINGS!');
    const p = flappy.pose(st, game);
    assert.equal(p.x, START_X); assert.equal(p.bottom, FLOOR); assert.equal(p.onGround, true);
    assert.equal(flappy.step(st, 1 / 60, NONE, game, rand), null, 'done only once');
  }
});

test('flappy: pipes cleared by a hit are made up for, so the goal is still reachable', () => {
  const game = newGame(), st = flappy.create(game);
  takeOff(st, game);
  for (let i = 0; i < 300; i++) flappy.step(st, 1 / 60, i % 25 === 0 ? FLAP : NONE, game, rand);
  const before = st.pipes.filter((p) => !p.passed).length;
  assert.ok(before > 0);
  st.pipes.forEach((p) => { if (!p.passed) p.x = st.pet.x + 100; });
  st.hover = 0; st.pet.bottom = FLOOR + 5;
  assert.equal(flappy.step(st, 1 / 60, NONE, game, rand), 'hurt');
  assert.ok(st.pipes.every((p) => p.passed || p.x > st.pet.x + 150), 'the pipes just in front are gone');
  game.runner.invincible = 3;
  for (let i = 0; i < 200; i++) flappy.step(st, 1 / 60, i % 25 === 0 ? FLAP : NONE, game, rand);
  assert.ok(st.pipes.some((p) => !p.passed), 'new pipes come');
});
