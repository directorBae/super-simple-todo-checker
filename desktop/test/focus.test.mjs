import test from 'node:test';
import assert from 'node:assert/strict';
import { compactTitle, clockTimeAt, schedulePatch, titleSource } from '../src/focus-utils.mjs';
import { createGame, stepGame, stopAt, GAMES, DINO_GOAL, RUNNER_X, CROSSING, crossingPose, worldOffsets } from '../src/focus/game-engine.mjs';
import * as dino from '../src/focus/dino.mjs';
import * as mario from '../src/focus/mario.mjs';
import * as galaga from '../src/focus/galaga.mjs';
import * as pacman from '../src/focus/pacman.mjs';
import { createRunner, hurt, powerUp } from '../src/focus/runner.mjs';
import titlePolicy from '../electron/todo-title.cjs';
import wallpaper from '../electron/wallpaper.cjs';
import { isClockShortcut, isHorizontalSwipe } from '../src/focus/clock-gestures.mjs';
import { petPixels,createPet,stepPet,summonPet,hidePet,movePetTo,releasePet,petRoom } from '../../shared/pixel-pet.js';

test('pixel pets have integer grid cells and distinct walking/blinking/species frames',()=>{
 for(const species of ['cat','bunny','dino']){
  const pixels=petPixels({species,color:'mint'},'walk',0);assert.ok(pixels.length>100);
  assert.ok(pixels.every(p=>Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<24&&p.y>=0&&p.y<24));
  assert.notDeepEqual(pixels,petPixels({species,color:'mint'},'walk',1));
 }
 assert.notDeepEqual(petPixels({species:'cat'},'idle',0),petPixels({species:'cat'},'idle',9));
 assert.notDeepEqual(petPixels({species:'cat'}),petPixels({species:'bunny'}));
});
test('pet enters/exits at screen edge and summons without teleporting from its real location',()=>{
 const s=createPet(1000,700);assert.ok(s.x>1000);
 for(let i=0;i<100;i++)stepPet(s,.1,1000,700,()=>.5);assert.ok(s.x<1000&&s.x>=0);
 movePetTo(s,130,90,1000,700);releasePet(s);const before={x:s.x,y:s.y};summonPet(s,1000,700);
 assert.equal(s.mode,'jump');assert.equal(s.x,before.x);assert.equal(s.y,before.y);
 for(let i=0;i<70;i++)stepPet(s,.1,1000,700,()=>.5);assert.ok(s.x>before.x+200&&s.y>before.y+100);
 hidePet(s,1000);for(let i=0;i<300&&s.mode!=='hidden';i++)stepPet(s,.1,1000,700,()=>.5);
 assert.equal(s.mode,'hidden');assert.ok(s.x>2000);const edge=s.x;summonPet(s,1000,700);assert.equal(s.x,edge);assert.equal(s.hidden,false);
 for(let i=0;i<80;i++)stepPet(s,.1,1000,700,()=>.5);assert.ok(s.x<1000);
});
test('main screen and clock are two rooms: the pet stays in its room and walks between them',()=>{
 const s=createPet(1000,700);for(let i=0;i<100;i++)stepPet(s,.1,1000,700,()=>.5);
 const main=s.x;assert.ok(main<1000);
 // Opening the clock does not drag the pet along; it is still in the main room (off camera).
 stepPet(s,.1,1000,700,()=>.5,false,1);assert.ok(s.x<1000);
 // Dragging while looking at the clock keeps it inside the clock room.
 movePetTo(s,-500,100,1000,700,1);assert.equal(s.x,1000);movePetTo(s,5000,100,1000,700,1);assert.equal(s.x,1928);
 // Called from the clock room, it comes over from wherever it was.
 movePetTo(s,200,300,1000,700,0);releasePet(s);summonPet(s,1000,700,1);assert.equal(s.x,200);
 for(let i=0;i<60;i++)stepPet(s,.1,1000,700,()=>.5,false,1);assert.ok(s.x>=1000&&s.x<=1928);
 // Wandering mostly follows the room being viewed, sometimes the other room.
 s.mode='idle';s.age=10;s.wait=0;stepPet(s,.1,1000,700,()=>.5,false,0);assert.ok(s.targetX<1000);
 // Neighbouring rooms: the clock on the right and teams/buckets on the left.
 s.mode='idle';s.age=10;s.wait=0;stepPet(s,.1,1000,700,(()=>{const r=[.5,.9,.9,.5,.5];return()=>r.shift();})(),false,0);assert.ok(s.targetX>=1000);
 s.mode='idle';s.age=10;s.wait=0;stepPet(s,.1,1000,700,(()=>{const r=[.5,.9,.1,.5,.5];return()=>r.shift();})(),false,0);assert.ok(s.targetX<0);
 movePetTo(s,5000,100,1000,700,-1);assert.equal(s.x,-72);movePetTo(s,-5000,100,1000,700,-1);assert.equal(s.x,-1000);assert.equal(petRoom(s,1000),-1);
});

test('clock opens with Ctrl+Right and never captures C or composition/modifier shortcuts', () => {
  assert.equal(isClockShortcut({ key:'ArrowRight',ctrlKey:true }),true);
  assert.equal(isClockShortcut({ key:'ArrowLeft',ctrlKey:true },'ArrowLeft'),true);assert.equal(isClockShortcut({ key:'ArrowLeft',ctrlKey:true }),false);
  for(const event of [{key:'c',ctrlKey:false},{key:'c',ctrlKey:true},{key:'ArrowRight',ctrlKey:false},{key:'ArrowRight',ctrlKey:true,altKey:true},{key:'ArrowRight',ctrlKey:true,isComposing:true},{key:'ArrowRight',ctrlKey:true,repeat:true}])assert.equal(isClockShortcut(event),false);
  assert.equal(isHorizontalSwipe(-80,12),true);assert.equal(isHorizontalSwipe(18,80),false);assert.equal(isHorizontalSwipe(100,90),false);
});

test('long Korean/emoji titles retain the original in notes without broken code points', () => {
  const original = '🦕 다음 주 회의 전에 반드시 검토할 제안서와 예산 자료를 준비하고 담당자에게 전달하기 '.repeat(3);
  const r = titlePolicy.titleFields(original, '기존 메모');
  assert.ok(Array.from(r.title).length <= 50); assert.ok(r.notes.startsWith('기존 메모')); assert.ok(r.notes.includes(original.trim()));
  assert.equal(compactTitle(original), r.title); assert.equal(compactTitle('  회의\n 준비  '), '회의 준비');
  assert.equal(titleSource({ ...r, notes: `${r.notes}\n\n다른 개인 메모` }), original.trim());
  assert.equal(titleSource({ title: '새로운 할 일', notes: r.notes }), '새로운 할 일');
});
test('clock maps every quadrant, AM/PM and the midnight rounding boundary', () => {
  const r = { left: 0, top: 0, width: 200, height: 200 };
  assert.equal(clockTimeAt(100, 0, r, 0), '00:00'); assert.equal(clockTimeAt(200, 100, r, 1), '15:00');
  assert.equal(clockTimeAt(100, 200, r, 0), '06:00'); assert.equal(clockTimeAt(0, 100, r, 1), '21:00');
  assert.equal(clockTimeAt(99, 0, r, 1), '12:00');
});
test('rescheduling clears previous end fields to prevent inverted intervals', () => {
  assert.deepEqual(schedulePatch({ timeZone: 'Asia/Seoul' }, '2026-10-25', '15:00'), { date: '2026-10-25', startTime: '15:00', endTime: null, endDate: null, timeZone: 'Asia/Seoul' });
});
const seeded = (seed = 7) => () => ((seed = seed * 16807 % 2147483647) / 2147483647);
const run = (step, seconds, keys = () => new Set()) => { let r = null; for (let i = 0; i < seconds * 60 && !r; i++) r = step(keys(i), i); return r; };

test('the run: dino 1000 → a game → dino …, three stages per game by lap, and the pet crosses over without a cut', () => {
  assert.deepEqual([1, 3, 5, 7, 9, 11, 13].map((i) => stopAt(i).name), GAMES);
  assert.deepEqual([stopAt(0).name, stopAt(2).name], ['dino', 'dino']);
  assert.deepEqual(stopAt(15), { name: 'mario', stage: 1, lap: 1 }); assert.deepEqual(stopAt(29), { name: 'mario', stage: 2, lap: 2 });
  assert.deepEqual(stopAt(43), { name: 'mario', stage: 0, lap: 3 }, 'after three laps the stages come round again (harder)');
  const g = createGame(); assert.equal(g.stage, 'dino'); assert.equal(g.runner.invincible, 0);
  g.state.obstacles = [{ kind: 'small', x: 480, y: dino.FLOOR - 26, w: 16, h: 26 }]; g.score = DINO_GOAL;
  stepGame(g, 1 / 60, new Set(), () => 0.5); assert.equal(g.stage, 'dino'); assert.equal(g.state.ending, true);
  g.state.obstacles = []; stepGame(g, 1 / 60, new Set()); assert.equal(g.stage, 'mario'); assert.equal(g.transition.way, 'right');
  // Halfway across: both worlds on screen, the pet in the air between its last dino spot and its first Mario spot.
  const from = g.transition.pose, to = g.transition.to;
  for (let i = 0; i < Math.round(CROSSING * 30); i++) stepGame(g, 1 / 60, new Set());
  const mid = crossingPose(g), off = worldOffsets(g);
  assert.ok(off.from.x < -100 && off.to.x > 100, 'old world leaving, new one arriving');
  assert.ok(mid.bottom < Math.min(from.bottom, to.bottom) - 20, 'the pet hops across: ' + mid.bottom);
  for (let i = 0; i < 80; i++) stepGame(g, 1 / 60, new Set());
  assert.equal(g.transition, null); assert.equal(g.state.player.x, RUNNER_X);
  // Mario ends at the castle door; the road comes back the same way (right).
  g.state.player.x = 4083; g.state.level.cam = 3740; g.state.outro = { phase: 'inside', t: 1 };
  stepGame(g, 1 / 60, new Set()); assert.equal(g.stage, 'dino'); assert.equal(g.transition.way, 'right');
  for (let i = 0; i < 80; i++) stepGame(g, 1 / 60, new Set());
  assert.equal(g.state.player.x, RUNNER_X);
  // Galaga goes up into space and comes back down.
  g.state.obstacles = []; g.score = g.stageStart + DINO_GOAL; stepGame(g, 1 / 60, new Set()); stepGame(g, 1 / 60, new Set());
  assert.equal(g.stage, 'galaga'); assert.equal(g.transition.way, 'up');
  for (let i = 0; i < Math.round(CROSSING * 30); i++) stepGame(g, 1 / 60, new Set());
  assert.ok(worldOffsets(g).from.y > 100 && worldOffsets(g).to.y < -100, 'the road drops away as space comes down');
  for (let i = 0; i < 80; i++) stepGame(g, 1 / 60, new Set());
  assert.equal(g.transition, null);
});
test('lives: a hit costs one life with a grace period, zero lives ends the run', () => {
  const tree = () => [{ kind: 'small', x: RUNNER_X, y: dino.FLOOR - 26, w: 16, h: 26 }];
  const g = createGame(); g.state.obstacles = tree();
  stepGame(g, 1 / 60, new Set()); assert.equal(g.runner.lives, 2); assert.ok(g.runner.invincible > 1);
  g.state.obstacles = tree(); stepGame(g, 1 / 60, new Set()); assert.equal(g.runner.lives, 2);
  g.runner.lives = 1; g.runner.invincible = 0; g.state.obstacles = tree();
  stepGame(g, 1 / 60, new Set()); assert.equal(g.gameOver, true);
  const score = g.score; stepGame(g, 1, new Set()); assert.equal(g.score, score);
});
test('dino: speeds up like Chrome, birds only once fast, ↓ ducks, and a held jump goes higher than a tap', () => {
  const game = { score: 0, runner: createRunner() }, st = dino.create(game), start = st.speed;
  for (let i = 0; i < 60 * 30; i++) { dino.step(st, 1 / 60, new Set(), game, () => 0.99); st.obstacles = []; }
  assert.ok(st.speed > start + 140, `speed ${st.speed}`); assert.ok(game.score > 0);
  const slow = dino.create(game); slow.gap = 0; dino.step(slow, 1 / 600, new Set(), game, () => 0.01); assert.notEqual(slow.obstacles[0].kind, 'bird');
  const fast = dino.create(game, { speed: 500 }); fast.gap = 0; dino.step(fast, 1 / 60, new Set(), game, () => 0.01); assert.equal(fast.obstacles[0].kind, 'bird');
  const duck = dino.create(game); dino.step(duck, 1 / 60, new Set(['ArrowDown']), game); assert.equal(duck.player.ducking, true); assert.ok(duck.player.h < 20);
  const peak = (hold) => { const s = dino.create(game); let top = s.player.y; for (let i = 0; i < 60; i++) { dino.step(s, 1 / 60, new Set(i < hold ? ['ArrowUp'] : []), game, () => 0.99); s.obstacles = []; top = Math.min(top, s.player.y); } return dino.FLOOR - 28 - top; };
  const tap = peak(1), held = peak(20);
  assert.ok(tap > 26, 'a tap clears a small tree: ' + tap); assert.ok(held > tap * 2, `hold ${held} vs tap ${tap}`);
});
test('dino: ↑ jumps and Space acts — with the hammer, a tree is smashed only by a swing (one per press)', () => {
  const game = { score: 0, runner: createRunner() };
  const s = dino.create(game); dino.step(s, 1 / 60, new Set(['Space']), game, () => 0.99); assert.equal(s.player.onGround, true, 'Space never jumps');
  const tree = (st) => { st.gap = 1e9; st.obstacles = [{ kind: 'small', x: st.player.x + st.player.w + 10, y: dino.FLOOR - 26, w: 16, h: 26 }]; };
  game.runner.hammer = 2;
  const held = dino.create(game); tree(held);
  let hit = null; for (let i = 0; i < 30 && !hit; i++) hit = dino.step(held, 1 / 60, new Set(), game, () => 0.99);
  assert.equal(hit, 'hurt', 'no swing: it hits');
  assert.equal(game.runner.hammer, 2);
  const swung = dino.create(game); tree(swung); const before = game.score;
  assert.equal(dino.step(swung, 1 / 60, new Set(['Space']), game, () => 0.99), null);
  assert.equal(swung.obstacles.length, 0); assert.equal(game.runner.hammer, 1); assert.ok(game.score - before >= 300);
});
test('mario 1-1: moves only by hand, ? blocks pay 100, chained stomps double, the flag ends the stage', () => {
  const game = { score: 0, runner: createRunner() }, st = mario.create(game), x = st.player.x;
  run((k) => mario.step(st, 1 / 60, k, game), 1); assert.ok(Math.abs(st.player.x - x) < 1, 'no auto-run');
  run((k) => mario.step(st, 1 / 60, k, game), 0.5, () => new Set(['ArrowRight'])); assert.ok(st.player.x > x + 20);
  // ? block at tile 16, four tiles up.
  Object.assign(st.player, { x: 16 * mario.TILE + 1, y: mario.GROUND * mario.TILE - 28, vx: 0, vy: 0, onGround: true });
  run((k) => { mario.step(st, 1 / 60, k, game); return game.score >= 100; }, 1.5, (i) => new Set(i < 30 ? ['ArrowUp'] : []));
  assert.equal(game.score, 100);
  // Three goombas in a row without touching the ground: 100, 200, 400.
  const st2 = mario.create(game); game.score = 0; st2.level.goombas = []; Object.assign(st2.player, { x: 95, y: 120, vy: 0, onGround: false });
  for (const total of [100, 300, 700]) {
    run(() => (st2.player.vy > 0 && st2.player.y + st2.player.h < mario.GROUND * mario.TILE - 22 ? 'falling' : mario.step(st2, 1 / 60, new Set(), game)), 2);
    st2.level.goombas.push({ x: 95, y: mario.GROUND * mario.TILE - 18, w: 18, h: 18, vx: 0, vy: 0, alive: true, squashed: 0, active: true });
    const r = run(() => mario.step(st2, 1 / 60, new Set(), game) || (game.score >= total ? 'ok' : null), 2);
    assert.equal(r, 'ok'); assert.equal(game.score, total);
  }
  const st3 = mario.create(game); game.score = 0; st3.level.cam = 3500;
  Object.assign(st3.player, { x: mario.FLAG_X * mario.TILE - 12, y: 100, vx: 150, vy: 0, onGround: false });
  assert.equal(run(() => mario.step(st3, 1 / 60, new Set(['ArrowRight']), game), 15), 'done');
  assert.ok(game.score >= 2000, 'high grab bonus: ' + game.score);
});
test('galaga: the pet fires by itself (two shots at a time), enemies shoot back, kills are 100 and wiping out the wave moves on', () => {
  const game = { score: 0, runner: createRunner() }, random = seeded(), st = galaga.create(game);
  let fired = false; for (let i = 0; i < 60 * 25 && !fired; i++) { game.runner.invincible = 9; galaga.step(st, 1 / 60, new Set(), game, random); fired = st.bullets.length > 0; }
  assert.ok(fired, 'diving enemies fire');
  const s2 = galaga.create(game); for (let i = 0; i < 12; i++) galaga.step(s2, 1 / 60, new Set(), game, random);
  assert.equal(s2.shots.length, 2, 'two shots in the air without pressing anything');
  assert.equal(s2.enemies.length, 40); assert.equal(s2.enemies.filter((e) => e.kind === 'boss').length, 4);
  const s3 = galaga.create(game), e = s3.enemies.find((x) => x.kind === 'bee');
  game.score = 5000; galaga.step(s3, 1 / 1000, new Set(), game, () => 0.99);
  assert.equal(galaga.step(s3, 1 / 1000, new Set(), game, () => 0.99), null, 'points alone never end the stage');
  const others = s3.enemies.filter((x) => x !== e); s3.enemies = [e]; e.state = 'formation'; galaga.step(s3, 1 / 1000, new Set(), game, () => 0.99);
  const before = game.score; s3.shots = [{ x: e.x + 6, y: e.y + 4 }];
  assert.equal(galaga.step(s3, 1 / 1000, new Set(), game, () => 0.99), 'done', 'the last enemy down ends the stage');
  assert.equal(game.score - before, 100, 'a kill is 100 points'); assert.ok(others.length === 39);
});
test('the pet is one object across games: a mushroom makes it big and adds a heart up to four; a hit costs a heart and shrinks it', () => {
  const r = createRunner(); powerUp(r);
  assert.deepEqual([r.lives, r.big], [4, true]);
  powerUp(r); assert.equal(r.lives, 4, 'no more hearts from mushrooms at four');
  assert.equal(hurt(r), false); assert.deepEqual([r.lives, r.big], [3, false], 'a hit after a mushroom costs a heart and shrinks');
  hurt(r); assert.equal(r.lives, 3, 'no second hit while blinking');
  r.invincible = 0; powerUp(r); assert.equal(r.lives, 4, 'below four a mushroom counts again');
  r.invincible = 0; hurt(r, { fall: true }); assert.deepEqual([r.lives, r.big], [3, false]);
  // Big carries into the next game: a big pet in Mario is a tall pet back in the dino run.
  const g = createGame(); g.runner.big = true; g.state.obstacles = []; g.score = DINO_GOAL; stepGame(g, 1 / 60, new Set());
  assert.equal(g.stage, 'mario'); assert.ok(g.state.player.h > 30);
  for (let i = 0; i < 80; i++) stepGame(g, 1 / 60, new Set());
  g.state.player.x = 4083; g.state.level.cam = 3740; g.state.outro = { phase: 'inside', t: 1 }; stepGame(g, 1 / 60, new Set());
  assert.equal(g.stage, 'dino'); assert.ok(g.state.player.h > 30, 'still big in the dino run');
  g.transition = null; g.state.player.x = RUNNER_X; g.runner.invincible = 0; g.state.obstacles = [{ kind: 'small', x: RUNNER_X, y: dino.FLOOR - 26, w: 16, h: 26 }];
  stepGame(g, 1 / 60, new Set()); assert.equal(g.runner.big, false); assert.equal(g.runner.lives, 2, 'a hit costs a heart and shrinks the pet');
  for (let i = 0; i < 5; i++) stepGame(g, 1 / 60, new Set()); assert.equal(g.state.player.h, 28);
});
test('mario: a mushroom block grows the pet and adds a heart; a big pet breaks bricks', () => {
  const game = { score: 0, runner: createRunner() }, st = mario.create(game);
  // ? block at tile 21 (four tiles up) holds a mushroom.
  Object.assign(st.player, { x: 21 * mario.TILE + 1, y: mario.GROUND * mario.TILE - 28, vx: 0, vy: 0, onGround: true });
  run((k) => { mario.step(st, 1 / 60, k, game); return st.level.items.length > 0; }, 1.5, (i) => new Set(i < 30 ? ['ArrowUp'] : []));
  assert.equal(st.level.items.length, 1, 'a mushroom comes out');
  run(() => { mario.step(st, 1 / 60, new Set(), game); return game.runner.big; }, 2, () => new Set());
  if (!game.runner.big) { const m = st.level.items[0]; Object.assign(st.player, { x: m.x, y: m.y }); mario.step(st, 1 / 60, new Set(), game); }
  assert.equal(game.runner.big, true); assert.equal(game.runner.lives, 4); assert.equal(st.player.h, 38);
  // Brick at tile 20, four tiles up: big → it breaks.
  const st2 = mario.create(game), brick = () => mario.tileAt(st2.level, 20, mario.GROUND - 4);
  Object.assign(st2.player, { x: 20 * mario.TILE + 1, vx: 0, vy: 0, onGround: true }); st2.player.y = mario.GROUND * mario.TILE - st2.player.h;
  const solid = brick();
  run((k) => { mario.step(st2, 1 / 60, k, game); return brick() !== solid; }, 1.5, (i) => new Set(i < 30 ? ['ArrowUp'] : []));
  assert.equal(brick(), 0, 'the brick is gone'); assert.ok(st2.level.debris.length > 0);
});
test('pac-man: dots 10, energizer 50 and frightened ghosts worth 200 then 400; a normal ghost catches you', () => {
  const game = { score: 0, runner: createRunner() }, st = pacman.create(); st.pause = 0;
  for (let i = 0; i < 20; i++) pacman.step(st, 1 / 60, new Set(), game, seeded());
  assert.ok(game.score >= 10 && game.score % 10 === 0);
  game.score = 0; Object.assign(st.pac, { x: 1.5, y: 3.5, dir: { x: 0, y: 0 }, want: { x: 0, y: 0 } });
  st.ghosts.forEach((g) => { Object.assign(g, { x: 20.5, y: 29.5, state: 'active' }); });
  pacman.step(st, 1 / 60, new Set(), game, seeded()); assert.equal(game.score, 50); assert.ok(st.ghosts.every((g) => g.frightened));
  Object.assign(st.ghosts[0], { x: 1.5, y: 3.5 }); st.pause = 0; pacman.step(st, 1 / 120, new Set(), game, seeded()); assert.equal(game.score, 250);
  Object.assign(st.ghosts[1], { x: 1.5, y: 3.5 }); st.pause = 0; pacman.step(st, 1 / 120, new Set(), game, seeded()); assert.equal(game.score, 650);
  st.fright = 0; st.ghosts.forEach((g) => { g.frightened = false; }); Object.assign(st.ghosts[2], { x: st.pac.x, y: st.pac.y }); st.pause = 0;
  assert.equal(pacman.step(st, 1 / 120, new Set(), game, seeded()), 'hurt');
  assert.equal(pacman.MAZE.length, 31); assert.ok(pacman.MAZE.every((row) => row.length === 28));
  // The stage ends at its score target (1800 in the first maze), not before.
  const g2 = { score: 0, runner: createRunner() }, st2 = pacman.create(g2); st2.pause = 0;
  st2.ghosts.forEach((g) => { Object.assign(g, { x: 14, y: 14.5, state: 'house', timer: 99 }); });
  g2.score = 1790; assert.equal(pacman.step(st2, 1 / 120, new Set(), g2, seeded()), null);
  g2.score = 1800; st2.pause = 0; assert.equal(pacman.step(st2, 1 / 120, new Set(), g2, seeded()), 'done');
});
test('wallpaper is standalone and safely embeds untrusted pet names', () => {
  const html = wallpaper.wallpaperHtml({ pet: { name: '</script><script>alert(1)</script>', greeting: '<img src=x>', color: 'evil' } });
  assert.ok(!html.includes('</script><script>alert')); assert.ok(html.includes('\\u003c/script>')); assert.ok(html.includes('#98ddc5'));
  assert.equal((html.match(/<script>/g) || []).length, 1); assert.ok(!html.includes('api.openai.com'));
});

test('YouTube links: videos, playlists, shorts and music links are recognised; other sites are not', async () => {
  const { parseYouTube } = await import('../../shared/youtube.js');
  assert.deepEqual(parseYouTube('https://youtu.be/M7lc1UVf-VE?si=abc'), { videoId: 'M7lc1UVf-VE', listId: null });
  assert.deepEqual(parseYouTube('https://www.youtube.com/watch?v=M7lc1UVf-VE&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'), { videoId: 'M7lc1UVf-VE', listId: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' });
  assert.deepEqual(parseYouTube('https://music.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG'), { videoId: null, listId: 'PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG' });
  assert.deepEqual(parseYouTube('https://m.youtube.com/shorts/M7lc1UVf-VE'), { videoId: 'M7lc1UVf-VE', listId: null });
  for (const bad of ['https://example.com/watch?v=M7lc1UVf-VE', 'https://www.youtube.com/watch?v=short', 'youtube', '']) assert.equal(parseYouTube(bad), null);
});


test('every to-do keeps a date: undated ones get the day they were made, bucket items stay undated', async () => {
  const { createRequire } = await import('node:module');
  const { ensureDates } = createRequire(import.meta.url)('../electron/ensure-dates.cjs');
  const made = new Date(2026, 9, 20, 15).getTime();
  const db = { todos: [{ id: 'a', status: 'todo', date: null, createdAt: made }, { id: 'b', status: 'bucket', date: null, createdAt: made }, { id: 'c', status: 'done', date: '2026-10-01' }] };
  assert.equal(ensureDates(db), true);
  assert.equal(db.todos[0].date, '2026-10-20'); assert.equal(db.todos[1].date, null); assert.equal(db.todos[2].date, '2026-10-01');
  assert.equal(ensureDates(db), false);
});
