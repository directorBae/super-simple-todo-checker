import test from 'node:test';
import assert from 'node:assert/strict';
import * as galaga from '../src/focus/galaga.mjs';
import { createRunner } from '../src/focus/runner.mjs';

const seeded = (seed = 7) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const none = new Set();
// A canvas that accepts every call, so paint() can run without a browser.
const fakeCtx = () => new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
const newGame = () => ({ score: 0, runner: createRunner() });
// Steps with the pet blinking (no hits) and holding its fire, until `until` is true; returns what the last step said.
function fly(st, game, seconds, until = () => false, { random = seeded(), keys = none, invincible = true, hold = true } = {}) {
  let r = null;
  for (let i = 0; i < seconds * 60; i++) {
    if (invincible) game.runner.invincible = 9;
    if (hold) st.cool = Infinity;
    r = galaga.step(st, 1 / 60, keys, game, random);
    if (r || until()) return r;
  }
  return r;
}

test('galaga: three stages build their waves; create() alone is stage 1; the pet flies up into it', () => {
  assert.equal(galaga.ENTRY, 'up');
  const game = newGame();
  for (const [st, path] of [[galaga.create(game), 'bezier'], [galaga.create(game, { stage: 0 }), 'bezier'], [galaga.create(game, { stage: 1 }), 'spline']]) {
    assert.equal(st.enemies.length, 40); assert.equal(st.enemies.filter((e) => e.kind === 'boss').length, 4);
    assert.equal(new Set(st.enemies.map((e) => `${e.row},${e.col}`)).size, 40, 'every formation slot taken once');
    assert.equal(st.enemies.every((e) => !!e.bez === (path === 'bezier')), true);
  }
  const ch = galaga.create(game, { stage: 2 });
  assert.equal(ch.enemies.length, 40);
  for (let g = 0; g < 5; g++) assert.equal(ch.enemies.filter((e) => e.group === g).length, 8, 'five groups of eight');
  // Stage 2's wave flies in (two lines, then pairs) and settles into the formation.
  const s1 = galaga.create(game, { stage: 1 });
  fly(s1, game, 20, () => { s1.diveTimer = Infinity; return s1.enemies.every((e) => e.state === 'formation'); });
  assert.ok(s1.enemies.every((e) => e.state === 'formation'), 'the stage-2 wave settles');
  assert.equal(s1.enemies.length + Math.round(game.score / 100), 40);
});

test('galaga: pose() is where the fighter is, at create time too; big pets are bigger', () => {
  const game = newGame(), st = galaga.create(game);
  const p = galaga.pose(st, game);
  assert.deepEqual(Object.keys(p).sort(), ['bottom', 'cell', 'flip', 'onGround', 'x']);
  assert.deepEqual(p, { x: st.ship.x + 3, bottom: 270, cell: 1.5, flip: false, onGround: true });
  assert.ok(Math.abs(st.ship.x + st.ship.w / 2 - 250) < 1, 'starts in the middle');
  fly(st, game, 0.5, undefined, { keys: new Set(['ArrowLeft']) });
  assert.equal(galaga.pose(st, game).x, st.ship.x + 3, 'follows the ship');
  game.runner.big = true; const big = galaga.create(game);
  assert.equal(galaga.pose(big, game).cell, 2.1);
  // paint draws the pet only through drawRunner, at the pose.
  const calls = []; galaga.paint(fakeCtx(), big, game, (x, bottom, o) => calls.push({ x, bottom, ...o }));
  assert.equal(calls.length, 1); assert.deepEqual(calls[0], galaga.pose(big, game));
});

// Brings a boss down to beam right over the fighter.
function beamDown(st, game) {
  fly(st, game, 20, () => { st.diveTimer = Infinity; return st.enemies.every((e) => e.state === 'formation'); });
  const boss = st.enemies.find((e) => e.kind === 'boss');
  Object.assign(boss, { state: 'beamDive', t: 0.5, dir: 1, tx: st.ship.x + st.ship.w / 2 - 8 });
  return boss;
}

test('galaga stage 2: the tractor beam captures the fighter (a heart), and shooting the boss frees it into the dual fighter', () => {
  const game = newGame(), st = galaga.create(game, { stage: 1 }), random = seeded();
  const boss = beamDown(st, game);
  // While the pet blinks the beam can't take it.
  assert.equal(fly(st, game, 1.8, () => boss.state === 'beam' && boss.bt > 1.2), null);
  assert.equal(st.ship.alive, true); assert.equal(st.captive, null);
  // A fresh beam with the pet not blinking: captured.
  Object.assign(boss, { bt: 0 }); game.runner.invincible = 0;
  let r = null;
  for (let i = 0; i < 120 && !r; i++) { st.diveTimer = Infinity; st.cool = Infinity; r = galaga.step(st, 1 / 60, none, game, random); }
  assert.equal(r, 'hurt', 'caught in the beam costs that ship');
  assert.equal(st.ship.alive, false); assert.equal(st.captive.mode, 'rising');
  // The pet is the captured ship now: it rises toward the boss, shrinking.
  game.runner.invincible = 1.5;
  fly(st, game, 0.4, () => { st.diveTimer = Infinity; return false; }, { invincible: false });
  const rising = galaga.pose(st, game);
  assert.equal(rising.onGround, false); assert.ok(rising.bottom < 270 && rising.cell < 1.5 && rising.cell > 0.75);
  assert.ok(fly(st, game, 4, () => { st.diveTimer = Infinity; return st.captive?.mode === 'held'; }) === null);
  assert.equal(st.captive.mode, 'held'); assert.equal(boss.holding, true);
  fly(st, game, 4, () => { st.diveTimer = Infinity; return boss.state === 'formation' && st.ship.alive; });
  assert.equal(st.ship.alive, true, 'a new fighter comes in');
  // Shooting the holding boss in formation would lose the fighter; it has to be out diving.
  Object.assign(boss, { state: 'diving', t: 1, fired: 2, vx: 0, dir: 1 });
  const before = game.score;
  for (let i = 0; i < 2; i++) { st.shots = [{ x: boss.x + 8, y: boss.y + 7 }]; game.runner.invincible = 9; galaga.step(st, 1 / 1000, none, game, random); }
  assert.equal(game.score - before, 100); assert.equal(st.captive.mode, 'rescue');
  fly(st, game, 5, () => { st.diveTimer = Infinity; return st.dual; });
  assert.equal(st.dual, true, 'the rescued fighter docks beside the pet');

  // The dual fighter: two ships side by side, two shots each in the air — four at most.
  st.enemies = st.enemies.filter((e) => e.kind === 'boss' && e.col === 6).slice(0, 1); st.bullets = [];
  assert.equal(st.enemies.length, 1);
  st.ship.x = 150; st.shots = []; st.cool = 0;
  let most = 0, perShip = 0;
  for (let i = 0; i < 90; i++) {
    st.diveTimer = Infinity; game.runner.invincible = 9; galaga.step(st, 1 / 60, none, game, random);
    most = Math.max(most, st.shots.length);
    perShip = Math.max(perShip, ...[0, 1].map((k) => st.shots.filter((s) => s.ship === k).length));
  }
  assert.equal(most, 4); assert.equal(perShip, 2);
  const xs = new Set(st.shots.map((s) => s.x)); assert.equal(xs.size, 2, 'shots come from both ships');
  // paint: the pet twice (one per ship).
  const calls = []; galaga.paint(fakeCtx(), st, game, (x) => calls.push(x));
  assert.equal(calls.length, 2); assert.equal(calls[1] - calls[0], st.ship.w + 2);
  // A hit on one of the pair loses that ship only — no heart.
  game.runner.invincible = 0;
  st.bullets = [{ x: st.ship.x + st.ship.w + 2 + st.ship.w / 2, y: 270 - 10, vx: 0, vy: 0 }];
  assert.equal(galaga.step(st, 1 / 1000, none, game, random), null);
  assert.equal(st.dual, false); assert.equal(st.ship.alive, true);
});

test('galaga stage 2: a boss shot while it holds the fighter in formation lets it fly off; a beam that misses leaves', () => {
  const game = newGame(), st = galaga.create(game, { stage: 1 }), random = seeded();
  const boss = beamDown(st, game);
  game.runner.invincible = 0;
  let r = null;
  for (let i = 0; i < 300 && !r; i++) { st.diveTimer = Infinity; st.cool = Infinity; r = galaga.step(st, 1 / 60, none, game, random); }
  assert.equal(r, 'hurt');
  fly(st, game, 8, () => { st.diveTimer = Infinity; return boss.state === 'formation' && st.captive?.mode === 'held'; });
  for (let i = 0; i < 2; i++) { st.shots = [{ x: boss.x + 8, y: boss.y + 7 }]; galaga.step(st, 1 / 1000, none, game, random); }
  assert.equal(st.captive.mode, 'leaving');
  fly(st, game, 3, () => { st.diveTimer = Infinity; return !st.captive; });
  assert.equal(st.captive, null); assert.equal(st.dual, false);
  // Moving out from under the beam: nothing is caught and the boss drops away.
  const other = beamDown(st, game);
  fly(st, game, 1.2, () => { st.diveTimer = Infinity; return other.state === 'beam'; });
  st.ship.x = other.x > 250 ? 20 : 440;
  const got = fly(st, game, 5, () => { st.diveTimer = Infinity; return other.state === 'falling'; }, { invincible: false, keys: new Set([other.x > 250 ? 'ArrowLeft' : 'ArrowRight']) });
  assert.notEqual(got, 'hurt'); assert.equal(other.state, 'falling'); assert.equal(st.captive, null);
});

test('galaga stage 3 (challenging): nobody fires, the groups loop through and leave, then the stage is done', () => {
  const game = newGame(), st = galaga.create(game, { stage: 2 }), random = seeded();
  let r = null, frames = 0, onScreen = 0;
  for (; frames < 60 * 40 && !r; frames++) {
    st.shots = []; // the pet holds its fire
    r = galaga.step(st, 1 / 60, none, game, random);
    assert.equal(st.bullets.length, 0, 'never fires');
    assert.ok(st.enemies.every((e) => e.state === 'waiting' || e.state === 'flying'), 'never dives');
    onScreen = Math.max(onScreen, st.enemies.filter((e) => e.state === 'flying' && e.y > 0 && e.y < 280 && e.x > 0 && e.x < 500).length);
  }
  assert.equal(r, 'done');
  assert.ok(frames > 60 * 18 && frames < 60 * 30, 'about twenty seconds of flying plus the tally: ' + frames / 60);
  assert.ok(onScreen >= 8, 'whole groups on screen');
  assert.equal(st.hits, 0); assert.equal(game.score, 0); assert.equal(st.result.perfect, false);
  // The pet's own auto-fire scores some hits on the way.
  const g2 = newGame(), s2 = galaga.create(g2, { stage: 2 });
  assert.equal(fly(s2, g2, 40, undefined, { hold: false }), 'done');
  assert.ok(s2.hits > 0 && g2.score >= s2.hits * 100);
});

test('galaga stage 3: every hit is 100, a whole group of 8 adds 1000, and all 40 is PERFECT! (+10000)', () => {
  const game = newGame(), st = galaga.create(game, { stage: 2 }), random = seeded();
  game.score = 500;
  let r = null;
  for (let i = 0; i < 60 * 40 && !r; i++) {
    // A shot onto every enemy that is flying (bosses need two).
    st.shots = st.enemies.filter((e) => e.state === 'flying').map((e) => ({ x: e.x + 8, y: e.y + 7 }));
    r = galaga.step(st, 1 / 60, none, game, random);
  }
  assert.equal(r, 'done');
  assert.equal(st.hits, 40); assert.equal(st.result.perfect, true);
  assert.equal(game.score - 500, 40 * 100 + 5 * 1000 + 10000);
  const texts = []; const ctx = fakeCtx(); ctx.fillText = (s) => texts.push(s);
  st.result.t = 1; galaga.paint(ctx, st, game, () => {});
  assert.ok(texts.includes('NUMBER OF HITS') && texts.includes('40') && texts.includes('PERFECT !'));
});

test('galaga: later laps are a bit harder (faster)', () => {
  const game = newGame();
  const a = galaga.create(game, { stage: 2 }), b = galaga.create(game, { stage: 2, lap: 5 });
  assert.ok(b.enemies[0].dur < a.enemies[0].dur);
  assert.equal(galaga.create(game, { stage: 0, lap: 3 }).enemies.length, 40);
});
