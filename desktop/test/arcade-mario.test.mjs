import test from 'node:test';
import assert from 'node:assert/strict';
import * as mario from '../src/focus/mario.mjs';
import { createRunner } from '../src/focus/runner.mjs';

const { TILE, GROUND, ROWS } = mario;
const newGame = () => ({ score: 0, runner: createRunner() });
const NONE = new Set();
const keys = (...k) => new Set(k);
// Steps until `until` (or a non-null step result) for at most `seconds`; returns what stopped it.
function run(st, game, seconds, press = () => NONE, until = () => false, random = () => 0.5) {
  for (let i = 0; i < seconds * 60; i++) {
    const r = mario.step(st, 1 / 60, press(i), game, random);
    if (r) return r;
    if (until()) return 'until';
  }
  return null;
}
// A canvas stand-in that accepts every call (paint smoke tests).
const fakeCtx = () => new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => {}), set: (o, k, v) => { o[k] = v; return true; } });
const paintCalls = (st, game) => { const calls = []; mario.paint(fakeCtx(), st, game, (...args) => calls.push(args)); return calls; };
const stand = (st, x) => Object.assign(st.player, { x, y: GROUND * TILE - st.player.h, vx: 0, vy: 0, onGround: true });

test('mario: three stages, each starting with the pet on the ground at x=64; pose() is what paint draws', () => {
  assert.equal(mario.ENTRY, 'right');
  assert.deepEqual(mario.WORLD_NAMES, ['1-1', '1-2', '1-4']);
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = mario.create(game, { stage });
    assert.equal(st.world, mario.WORLD_NAMES[stage]);
    const start = mario.pose(st, game);
    assert.deepEqual({ x: start.x, bottom: start.bottom, hat: start.hat, onGround: start.onGround, flip: start.flip }, { x: 64, bottom: GROUND * TILE, hat: true, onGround: true, flip: false });
    assert.equal(run(st, game, 1), null, 'nothing happens standing still');
    assert.equal(st.player.onGround, true); assert.equal(st.player.y + st.player.h, GROUND * TILE);
    run(st, game, 0.6, () => keys('ArrowRight'));
    const p = mario.pose(st, game), calls = paintCalls(st, game);
    assert.equal(p.x, st.player.x - st.level.cam); assert.ok(st.player.x > 64);
    assert.equal(calls.length, 1); assert.deepEqual(calls[0], [p.x, p.bottom, { hat: true, onGround: p.onGround, flip: p.flip }]);
  }
  // No options is still 1-1, and laps past the third repeat the stages a little harder.
  assert.equal(mario.create(newGame()).world, '1-1');
  const hard = mario.create(newGame(), { stage: 1, lap: 4 });
  assert.equal(hard.world, '1-2'); assert.ok(Math.abs(hard.level.goombas[0].vx) > 40);
  // A big pet starts big.
  const big = newGame(); big.runner.big = true;
  assert.equal(mario.create(big, { stage: 2 }).player.h, 38);
});

test('mario 1-2: underground with koopas; a stomp makes a shell, touching it kicks it, a moving shell knocks enemies over and hurts the pet', () => {
  const game = newGame(), st = mario.create(game, { stage: 1 });
  assert.equal(st.level.theme, 'under');
  assert.ok(st.level.koopas.length >= 3 && st.level.goombas.length >= 8);
  assert.ok(st.level.lifts.length >= 2, 'the lifts near the end');
  assert.equal(mario.tileAt(st.level, 20, 1), 2, 'brick ceiling');
  const L = st.level;
  L.goombas = []; L.koopas = [{ kind: 'koopa', x: 100, y: GROUND * TILE - 26, w: 18, h: 26, vx: 0, vy: 0, alive: true, squashed: 0, active: true, shell: false, wake: 0, kickT: 0, chain: 0 }];
  const k = L.koopas[0];
  Object.assign(st.player, { x: 94, y: 120, vx: 0, vy: 0, onGround: false });
  run(st, game, 1, () => NONE, () => k.shell);
  assert.equal(k.shell, true); assert.equal(k.h, 16); assert.equal(game.score, 100);
  // The pet bounces and comes down on the resting shell, which kicks it away (to the right: the pet is left of it).
  run(st, game, 2, () => NONE, () => k.vx !== 0);
  assert.ok(k.vx > 200, 'kicked: ' + k.vx); assert.equal(game.score, 500);
  L.goombas.push({ x: k.x + 60, y: (GROUND - 1) * TILE + 2, w: 18, h: 18, vx: 0, vy: 0, alive: true, squashed: 0, active: true });
  const g = L.goombas[0];
  run(st, game, 1, () => NONE, () => g.flipped);
  assert.equal(g.flipped, true, 'the shell knocks the goomba over'); assert.equal(game.score, 1000);
  // A moving shell coming at the pet hurts it.
  const st2 = mario.create(game, { stage: 1 }); st2.level.goombas = []; stand(st2, 100);
  st2.level.koopas = [{ kind: 'koopa', x: 200, y: GROUND * TILE - 16, w: 18, h: 16, vx: -270, vy: 0, alive: true, squashed: 0, active: true, shell: true, wake: 0, kickT: 0, chain: 0 }];
  assert.equal(run(st2, game, 1), 'hurt');
});

test('mario 1-2: a lift carries the pet; the side pipe leads outside to the flagpole', () => {
  const game = newGame(), st = mario.create(game, { stage: 1 });
  const L = st.level.lifts[0];
  st.level.cam = 2600; Object.assign(st.player, { x: L.x + 20, y: L.y - st.player.h - 2, vx: 0, vy: 0, onGround: false });
  run(st, game, 0.2, () => NONE, () => st.player.onGround);
  assert.equal(st.player.onGround, true); assert.equal(st.player.lift, L);
  const y0 = st.player.y; run(st, game, 0.3);
  assert.ok(st.player.y < y0 - 10, 'carried up'); assert.equal(st.player.y + st.player.h, L.y);
  // Push right at the side pipe's mouth.
  const st2 = mario.create(game, { stage: 1 }); st2.level.cam = 2900; st2.level.goombas = []; st2.level.koopas = [];
  stand(st2, 163 * TILE - 30);
  run(st2, game, 3, () => keys('ArrowRight'), () => st2.warp?.phase === 'out');
  assert.equal(st2.level.flagX, 23, 'outside now');
  run(st2, game, 2, () => NONE, () => !st2.warp);
  assert.equal(st2.warp, null); assert.equal(st2.player.onGround, true);
  assert.equal(st2.player.y + st2.player.h, (GROUND - 2) * TILE, 'standing on the pipe it came out of');
  assert.equal(paintCalls(st2, game).length, 1);
  game.score = 0;
  assert.equal(run(st2, game, 20, () => keys('ArrowRight', 'Space')), 'done', 'flag, walk, castle');
  assert.ok(game.score >= 100);
});

test('mario castle: the ? block always holds a fire flower; with fire, Space throws (two at a time) and ↑ jumps', () => {
  const game = newGame(), st = mario.create(game, { stage: 2 });
  assert.equal(st.level.theme, 'castle');
  stand(st, 21 * TILE + 1);
  run(st, game, 1.5, (i) => (i < 30 ? keys('Space') : NONE), () => st.level.items.length > 0);
  assert.equal(st.level.items[0].kind, 'flower', 'a flower even for a small pet');
  run(st, game, 1.5, () => NONE, () => st.level.items[0].rise <= 0);
  const f = st.level.items[0]; Object.assign(st.player, { x: f.x, y: f.y });
  const before = game.score; mario.step(st, 1 / 60, NONE, game);
  assert.equal(game.runner.fire, true); assert.equal(game.runner.big, true); assert.equal(game.score - before, 1000);
  // Space throws one fireball per press, never more than two in the air, and doesn't jump.
  stand(st, 6 * TILE); st.level.cam = 0; st.player.h = 38;
  for (let i = 0; i < 8; i++) { mario.step(st, 1 / 60, keys('Space'), game); mario.step(st, 1 / 60, NONE, game); assert.ok(st.level.fireballs.length <= 2); }
  assert.equal(st.level.fireballs.length, 2); assert.equal(st.player.onGround, true, 'Space is the fire button now');
  mario.step(st, 1 / 60, keys('ArrowUp'), game); assert.ok(st.player.vy < 0, '↑ jumps');
});

test('mario: a fireball bounces along and knocks over a goomba for 200', () => {
  const game = newGame(); game.runner.fire = true; game.runner.big = true;
  const st = mario.create(game); st.level.goombas = []; stand(st, 64);
  st.level.goombas.push({ x: 220, y: (GROUND - 1) * TILE + 2, w: 18, h: 18, vx: 0, vy: 0, alive: true, squashed: 0, active: true });
  mario.step(st, 1 / 60, keys('Space'), game);
  assert.equal(st.level.fireballs.length, 1);
  let bounced = false;
  run(st, game, 1, () => NONE, () => { bounced ||= st.level.fireballs[0]?.vy < 0; return st.level.goombas[0].flipped; });
  assert.ok(bounced, 'bounced off the floor'); assert.equal(st.level.goombas[0].flipped, true); assert.equal(game.score, 200);
});

test('mario castle: lava is a fall, firebars and podoboos hurt', () => {
  const game = newGame(), st = mario.create(game, { stage: 2 });
  Object.assign(st.player, { x: 15 * TILE, y: 200, vx: 0, vy: 0, onGround: false });
  assert.equal(run(st, game, 2), 'fell');
  assert.ok(st.player.y + st.player.h <= GROUND * TILE, 'back on solid ground'); assert.ok(st.player.x < 14 * TILE);
  // Standing under the firebar right after the ? block, it comes round.
  const st2 = mario.create(game, { stage: 2 }); stand(st2, 25 * TILE - 4);
  assert.equal(run(st2, game, 4), 'hurt');
  // Standing at a lava pit's edge, a Podoboo jumps up through the pet.
  const st3 = mario.create(game, { stage: 2 }); st3.level.firebars = []; Object.assign(st3.player, { x: 15 * TILE + 1, y: 160, vx: 0, vy: 0 });
  const pb = st3.level.podoboos[0]; pb.wait = 0.01;
  let r = null; for (let i = 0; i < 60 && !r; i++) { st3.player.y = 160; st3.player.vy = 0; r = mario.step(st3, 1 / 60, NONE, game); }
  assert.equal(r, 'hurt');
});

test('mario castle: five fireballs defeat Bowser; the axe drops the bridge and Toad ends the stage', () => {
  const game = newGame(), st = mario.create(game, { stage: 2 }), L = st.level, b = L.bowser;
  stand(st, 120 * TILE); L.cam = 2400; L.firebars = []; L.podoboos = [];
  mario.step(st, 1 / 60, NONE, game);
  assert.equal(b.active, true);
  for (let i = 0; i < 5; i++) { L.fireballs = [{ x: b.x + 10, y: b.y + 10, w: 8, h: 8, vx: 300, vy: 0, t: 0, pop: 0 }]; mario.step(st, 1 / 60, NONE, game); }
  assert.equal(b.dead, true); assert.equal(game.score, 5000);
  // With Bowser still on the bridge: walk into the axe.
  const g2 = newGame(), st2 = mario.create(g2, { stage: 2 }), L2 = st2.level, b2 = L2.bowser;
  L2.cam = 2440; L2.firebars = []; L2.podoboos = []; g2.runner.invincible = 1e9;
  stand(st2, L2.axe.x - 40);
  assert.equal(run(st2, g2, 2, () => keys('ArrowRight'), () => !!st2.outro), 'until');
  assert.equal(st2.outro.phase, 'collapse'); assert.equal(g2.score, 5000);
  let saw = false;
  assert.equal(run(st2, g2, 12, () => NONE, () => { saw ||= st2.outro.phase === 'toad'; return false; }), 'done');
  assert.ok(saw, 'Toad speaks'); assert.equal(b2.gone, true, 'Bowser fell into the lava');
  for (let x = L2.bridge[0]; x <= L2.bridge[1]; x++) assert.equal(mario.tileAt(L2, x, GROUND), 0);
  assert.ok(st2.player.x > L2.axe.x + 100, 'walked on to Toad');
});

test('mario: every stage paints without errors, Bowser fire and Toad included', () => {
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = mario.create(game, { stage });
    for (let i = 0; i < 300; i++) { game.runner.invincible = 9; mario.step(st, 1 / 60, keys('ArrowRight'), game, () => 0.3); if (i % 50 === 0) paintCalls(st, game); }
  }
  const game = newGame(), st = mario.create(game, { stage: 2 }); st.level.cam = 2400; stand(st, 2620);
  game.runner.invincible = 9;
  for (let i = 0; i < 400; i++) mario.step(st, 1 / 60, NONE, game, () => 0.1);
  assert.ok(st.level.flames.length > 0 || st.level.bowser.fireT > 0);
  st.outro = { kind: 'axe', phase: 'toad', t: 2 }; assert.equal(paintCalls(st, game).length, 1);
});
