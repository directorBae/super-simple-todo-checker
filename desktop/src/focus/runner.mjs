// The pet that plays every stage, as one object that carries over from game to game:
// its size (a mushroom makes it big), its hearts, its blink after a hit, and what it picked up along the way —
// the fire flower (Bowser's castle), wings (Flappy Bird), a shield (Breakout) and hammer swings (Donkey Kong).
export const LIVES = 3, GRACE = 1.5;
// Mushrooms add hearts only up to this many, like a capped 1-UP; below it each one counts.
export const MUSHROOM_CAP = 4;
// Swings of the Donkey Kong hammer the pet carries out of a DK stage (each one smashes one thing in the dino run).
export const HAMMER_SWINGS = 3;

export function createRunner() {
  // boneBirds: once the pet has had the fire flower, the dino road sends fireproof bone birds too (it stays on).
  return { big: false, fire: false, lives: LIVES, invincible: 0, wings: false, shield: false, hammer: 0, boneBirds: false };
}

export function tick(runner, dt) {
  runner.invincible = Math.max(0, runner.invincible - dt);
}

// A hit (or a fall) costs a heart, and the pet drops back to small (fire goes with the size, as in Super Mario Bros.).
// A shield takes one hit instead. Hits during the blink after a hit don't count. Returns true when the last heart is gone.
export function hurt(runner, { fall = false } = {}) {
  if (!fall && runner.invincible > 0) return false;
  runner.invincible = GRACE;
  if (!fall && runner.shield) { runner.shield = false; return false; }
  runner.big = false;
  runner.fire = false;
  runner.lives--;
  return runner.lives <= 0;
}

// A mushroom: a bigger body, and one more heart while there are fewer than four.
export function powerUp(runner) {
  if (runner.lives < MUSHROOM_CAP) runner.lives++;
  runner.big = true;
}
// The fire flower: big, and Space throws fireballs (in Mario and in the dino run). From now on bone birds fly too.
export function fireUp(runner) {
  runner.big = true;
  runner.fire = true;
  runner.boneBirds = true;
}
export const giveHammer = (runner, swings = HAMMER_SWINGS) => { runner.hammer = Math.max(runner.hammer, swings); };
export const giveWings = (runner) => { runner.wings = true; };
export const giveShield = (runner) => { runner.shield = true; };

// Resizes a stage's player box to the runner's current size, keeping its feet where they are.
export function fitBox(box, size) {
  if (box.w === size.w && box.h === size.h) return;
  box.y += box.h - size.h;
  box.w = size.w; box.h = size.h;
}
