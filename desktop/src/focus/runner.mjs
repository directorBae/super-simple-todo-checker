// The pet that plays every stage, as one object that carries over from game to game:
// its size (a mushroom makes it big), its hearts and its blink after a hit.
export const LIVES = 3, GRACE = 1.5;
// Mushrooms add hearts only up to this many, like a capped 1-UP; below it each one counts.
export const MUSHROOM_CAP = 4;

export function createRunner() {
  return { big: false, lives: LIVES, invincible: 0 };
}

export function tick(runner, dt) {
  runner.invincible = Math.max(0, runner.invincible - dt);
}

// A hit (or a fall) costs a heart, and a big pet shrinks back. Hits during the blink after a hit don't count.
// Returns true when the last heart is gone.
export function hurt(runner, { fall = false } = {}) {
  if (!fall && runner.invincible > 0) return false;
  runner.invincible = GRACE;
  runner.big = false;
  runner.lives--;
  return runner.lives <= 0;
}

// A mushroom: a bigger body, and one more heart while there are fewer than four.
export function powerUp(runner) {
  if (runner.lives < MUSHROOM_CAP) runner.lives++;
  runner.big = true;
}

// Resizes a stage's player box to the runner's current size, keeping its feet where they are.
export function fitBox(box, size) {
  if (box.w === size.w && box.h === size.h) return;
  box.y += box.h - size.h;
  box.w = size.w; box.h = size.h;
}
