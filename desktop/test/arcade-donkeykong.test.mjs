import test from 'node:test';
import assert from 'node:assert/strict';
import * as dk from '../src/focus/donkeykong.mjs';
import { createRunner, HAMMER_SWINGS } from '../src/focus/runner.mjs';

const DT = 1 / 60;
const seeded = (seed = 7) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const newGame = () => ({ score: 0, runner: createRunner() });
// Steps until `until` is truthy or a result comes back; returns that result.
function run(st, game, seconds, keys = () => new Set(), until = () => false, random = seeded()) {
  for (let i = 0; i < seconds * 60; i++) {
    const r = dk.step(st, DT, keys(i), game, random);
    if (r) return r;
    if (until()) return 'until';
  }
  return null;
}
// A quiet board: DK never throws, nothing on it.
function quiet(stage) {
  const game = newGame(), st = dk.create(game, { stage });
  st.dk.wait = 1e9; st.hazards = []; st.spawnClock = 1e9;
  return { game, st };
}
const level = (st, n, x) => st.girders.find((g) => g.level === n && x >= g.x0 && x <= g.x1);
function putPet(st, n, cx) { const s = level(st, n, cx); Object.assign(st.pet, { x: cx - 9, y: dk.surfaceAt(s, cx), on: s, mode: 'walk', vx: 0, vy: 0 }); }
const barrelAt = (st, n, x, extra) => { const s = level(st, n, x + 7); return { kind: 'barrel', x, y: dk.surfaceAt(s, x + 7), w: 14, h: 11, mode: 'roll', on: s, vx: 0, vy: 0, spin: 0, skip: new Set(), blue: false, ...extra }; };
const mockCtx = () => ({ fillStyle: '', font: '', fillRect() {}, fillText() {} });

test('DK: every board starts with the pet bottom-left on the lowest girder, and pose() is what paint draws', () => {
  assert.equal(dk.ENTRY, 'right');
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = dk.create(game, { stage }), p = dk.pose(st, game);
    assert.equal(st.kind, ['25m', '75m', '100m'][stage]);
    assert.ok(p.x < 120 && p.x >= dk.X0, `stage ${stage} starts on the left`);
    assert.equal(p.bottom, dk.surfaceAt(st.pet.on, p.x + 9)); assert.equal(st.pet.on.level, 0);
    assert.ok(p.bottom >= 260, 'on the bottom girder');
    assert.deepEqual({ cell: p.cell, flip: p.flip, onGround: p.onGround }, { cell: 1, flip: false, onGround: true });
    let drawn = null; dk.paint(mockCtx(), st, game, (x, bottom, opts) => { drawn = { x, bottom, ...opts }; });
    assert.deepEqual(drawn, p);
  }
  // A big pet is drawn a bit bigger, still with explicit cells.
  const game = newGame(); game.runner.big = true; assert.equal(dk.pose(dk.create(game), game).cell, 1.2);
  // The 25m bonus timer starts at 5000 and later passes start higher.
  assert.equal(dk.create(newGame()).bonus, 5000); assert.equal(dk.create(newGame(), { stage: 0, lap: 3 }).bonus, 6000);
});

test('DK: the pet walks along the slope, climbs whole ladders, and gets stuck halfway up a broken one', () => {
  const { game, st } = quiet(0), x = st.pet.x;
  run(st, game, 0.5, () => new Set(['ArrowRight'])); assert.ok(st.pet.x > x + 30); assert.equal(st.pet.on.level, 0);
  assert.equal(dk.pose(st, game).flip, false);
  run(st, game, 0.1, () => new Set(['ArrowLeft'])); assert.equal(dk.pose(st, game).flip, true);
  // Up the full ladder at x 394 to the second girder.
  putPet(st, 0, 394);
  assert.equal(run(st, game, 3, () => new Set(['ArrowUp']), () => st.pet.mode === 'walk' && st.pet.on?.level === 1), 'until');
  const l1 = st.pet.y; assert.ok(l1 < 240);
  // …and back down.
  assert.equal(run(st, game, 3, () => new Set(['ArrowDown']), () => st.pet.mode === 'walk' && st.pet.on?.level === 0), 'until');
  // The broken ladder at x 186 never reaches the girder above.
  putPet(st, 0, 186);
  run(st, game, 3, () => new Set(['ArrowUp']));
  assert.equal(st.pet.mode, 'climb'); assert.ok(st.pet.y > st.pet.ladder.top + 10);
});

test('DK: a barrel rolling into the pet hurts (once, not during the blink); jumping it pays 100', () => {
  const { game, st } = quiet(0);
  st.hazards.push(barrelAt(st, 0, st.pet.x + 80));
  assert.equal(run(st, game, 3), 'hurt');
  assert.equal(st.hazards.length, 0, 'the barrel that hit bursts');
  game.runner.invincible = 1.5; st.hazards.push(barrelAt(st, 0, st.pet.x + 40));
  assert.equal(run(st, game, 1), null, 'no second hit during the blink');
  // Jump a barrel on the bottom girder.
  const b = quiet(0); b.st.hazards.push(barrelAt(b.st, 0, b.st.pet.x + 120));
  const r = run(b.st, b.game, 3, () => (b.st.hazards[0] && b.st.hazards[0].x - b.st.pet.x < 28 ? new Set(['Space']) : new Set()), () => b.game.score > 0);
  assert.equal(r, 'until'); assert.equal(b.game.score, 100);
});

test('DK: DK throws barrels — the first one is the wild blue one that lights the oil drum and lets a fireball out', () => {
  const game = newGame(), st = dk.create(game, { stage: 0 });
  game.runner.invincible = 1e9; // just watching
  run(st, game, 6, () => new Set(), () => st.hazards.some((h) => h.kind === 'fire'));
  assert.ok(st.oil.lit); assert.ok(st.hazards.some((h) => h.kind === 'fire'));
  run(st, game, 6);
  assert.ok(st.hazards.some((h) => h.kind === 'barrel' && h.mode === 'roll' && h.on.level >= 4), 'barrels roll down from the top');
});

test('DK: grabbing the hammer hands the pet hammer swings; smashing a barrel pays 300/500/800; no climbing with it', () => {
  const { game, st } = quiet(0);
  putPet(st, 1, 400);
  assert.equal(run(st, game, 1, (i) => new Set(i < 2 ? ['Space'] : []), () => st.pet.hammer > 0), 'until');
  assert.equal(game.runner.hammer, HAMMER_SWINGS); assert.ok(game.runner.hammer > 0);
  assert.ok(st.hammers[0].taken);
  run(st, game, 0.6);
  st.pet.face = -1; st.hazards.push(barrelAt(st, 1, st.pet.x - 70)); // rolls right, into the swing
  assert.equal(run(st, game, 2, () => new Set(), () => game.score > 0), 'until');
  assert.ok([300, 500, 800].includes(game.score)); assert.equal(st.hazards.length, 0);
  // Can't climb while swinging.
  putPet(st, 1, 218); run(st, game, 1, () => new Set(['ArrowUp'])); assert.equal(st.pet.mode, 'walk');
  // It runs out after about eight seconds.
  run(st, game, dk.HAMMER_TIME); assert.equal(st.pet.hammer, 0);
});

test('DK 25m: climbing up to Pauline shows the heart, pays the remaining bonus and ends the board', () => {
  const { game, st } = quiet(0);
  putPet(st, 5, 282);
  const r = run(st, game, 6, () => new Set(['ArrowUp']));
  assert.equal(r, 'done'); assert.ok(st.outro);
  assert.ok(game.score >= 4900 && game.score <= 5000);
});

test('DK: walking off a girder end is a deadly fall — the pet goes back to the start', () => {
  const { game, st } = quiet(0);
  putPet(st, 5, 430);
  assert.equal(run(st, game, 3, () => new Set(['ArrowRight'])), 'fell');
  assert.equal(st.pet.on.level, 0); assert.ok(st.pet.x < 120);
  // A plain jump on the girder is fine.
  assert.equal(run(st, game, 1.5, (i) => new Set(i < 3 ? ['Space'] : [])), null); assert.equal(st.pet.mode, 'walk');
});

test('DK 100m: pulling rivets pays 100 and leaves holes; the eighth one brings DK down', () => {
  const { game, st } = quiet(2);
  assert.equal(st.rivets.length, 8);
  putPet(st, 1, 110);
  run(st, game, 1, () => new Set(['ArrowRight']), () => game.score > 0);
  assert.equal(game.score, 100); assert.equal(st.rivets.filter((r) => r.pulled).length, 1);
  // Walking back into the hole is a fall.
  assert.equal(run(st, game, 2, () => new Set(['ArrowLeft'])), 'fell');
  // Jumping over a rivet pulls it too.
  putPet(st, 2, 110);
  run(st, game, 1, (i) => new Set(i < 2 ? ['Space', 'ArrowRight'] : []), () => st.pet.mode === 'walk' && st.pet.x > 120);
  assert.ok(st.rivets.find((r) => r.level === 2 && r.x === 130).pulled);
  for (const r of st.rivets) if (!r.pulled && !(r.level === 3 && r.x === 370)) { r.pulled = true; level(st, r.level, r.x).gaps.push(r.x); }
  putPet(st, 3, 390);
  const result = run(st, game, 6, () => new Set(['ArrowLeft']));
  assert.equal(result, 'done'); assert.ok(st.rivets.every((r) => r.pulled));
  assert.ok(st.dk.y > 200, 'DK fell to the bottom');
});

test('DK 75m: lifts carry the pet, springs hurt, Pauline\'s things pay 300, and Pauline ends it', () => {
  const { game, st } = quiet(1);
  assert.equal(st.lifts.length, 6);
  const lift = st.lifts.find((l) => l.shaft.dir < 0 && l.y0 > 180);
  Object.assign(st.pet, { x: (lift.x0 + lift.x1) / 2 - 9, y: lift.y0, on: lift, mode: 'walk' });
  const y = st.pet.y; run(st, game, 0.5); assert.ok(st.pet.y < y - 10, 'riding the up-lift'); assert.equal(st.pet.on, lift);
  // Riding the up-lift all the way to the top is deadly, as in the arcade.
  assert.equal(run(st, game, 8), 'fell'); assert.equal(st.pet.on.level, 0);
  game.runner.invincible = 0;
  // A spring dropping down the right side.
  st.hazards = [{ kind: 'spring', x: 432, y: 100, w: 16, h: 12, vx: 0, vy: 100, mode: 'drop', squash: 0 }];
  putPet(st, 7, 440); assert.equal(run(st, game, 1), 'hurt');
  // The umbrella on the right.
  game.score = 0; game.runner.invincible = 0; st.hazards = [];
  putPet(st, 7, 420); run(st, game, 1, () => new Set(['ArrowRight']), () => game.score > 0);
  assert.equal(game.score, 300);
  putPet(st, 8, 250); assert.equal(run(st, game, 6, () => new Set(['ArrowUp'])), 'done');
});

test('DK: every whole ladder on every board takes the pet from its floor to the next', () => {
  for (const stage of [0, 1, 2]) {
    const { game, st } = quiet(stage);
    for (const l of st.ladders.filter((q) => !q.broken && !q.deco)) {
      putPet(st, l.lo, l.x); st.outro = null;
      run(st, game, 5, () => new Set(['ArrowUp']), () => st.pet.mode === 'walk' && st.pet.on?.level === l.hi);
      assert.equal(st.pet.on?.level, l.hi, `stage ${stage} ladder at ${l.x}`);
    }
  }
});

test('DK: long random play on every board never breaks (finite positions, paint works)', () => {
  for (const stage of [0, 1, 2]) {
    const game = newGame(), st = dk.create(game, { stage, lap: 3 }), random = seeded(stage + 3), ctx = mockCtx();
    const names = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'];
    let keys = new Set(), results = 0;
    for (let i = 0; i < 60 * 120; i++) {
      if (i % 20 === 0) keys = new Set(names.filter(() => random() < 0.3));
      game.runner.invincible = Math.max(0, game.runner.invincible - DT);
      const r = dk.step(st, DT, keys, game, random);
      if (r === 'hurt' || r === 'fell') { results++; game.runner.invincible = 1.5; }
      if (r === 'done') break;
      assert.ok(Number.isFinite(st.pet.x) && Number.isFinite(st.pet.y), `stage ${stage} frame ${i}`);
      assert.ok(st.hazards.every((h) => Number.isFinite(h.x) && Number.isFinite(h.y)));
      if (i % 30 === 0) dk.paint(ctx, st, game, () => {});
    }
    assert.ok(Number.isFinite(game.score));
  }
});
