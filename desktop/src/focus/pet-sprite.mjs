import { petPixels } from '../../../shared/pixel-pet.js';

// The hero of every game is the person's own pixel pet (drawn from local code, so it works offline):
// legs move on the ground, jump pose in the air, squashed flat while ducking, bigger after a mushroom,
// a red cap in Mario, mirrored when it faces left.
const SPRITE = 24;
export function drawPet(ctx, pet, x, bottom, { ducking = false, onGround = true, hat = false, flip = false, cell } = {}, big, time) {
  const base = cell ?? (big ? 2.1 : 1.5), cellX = ducking ? base * 1.27 : base, cellY = ducking ? base * 0.5 : base;
  const pixels = petPixels(pet, onGround ? 'walk' : 'jump', Math.floor(time * 12) % 4);
  const left = x - 6 * cellX / 1.5, top = bottom - (SPRITE - 1) * cellY;
  const at = (gx, gy, w = 1, h = 1) => [Math.round(left + (flip ? SPRITE - gx - w : gx) * cellX), Math.round(top + gy * cellY), Math.ceil(w * cellX), Math.ceil(h * cellY)];
  for (const px of pixels) { ctx.fillStyle = px.color; ctx.fillRect(...at(px.x, px.y)); }
  if (hat) {
    // Mario's cap over the top of the head, brim toward where the pet is going.
    const head = pixels.filter((q) => q.color !== '#152c3030'); // not the ground shadow
    const topY = Math.min(...head.map((q) => q.y)), row = head.filter((q) => q.y <= topY + 3);
    const x0 = Math.min(...row.map((q) => q.x)), x1 = Math.max(...row.map((q) => q.x));
    ctx.fillStyle = '#e52521'; ctx.fillRect(...at(x0 + 1, topY - 2, x1 - x0 - 1, 3));
    ctx.fillRect(...at(flip ? x0 - 3 : x1 - 2, topY + 1, 5, 1));
    ctx.fillStyle = '#fff'; ctx.fillRect(...at((x0 + x1) / 2 - 1, topY - 1, 2, 1.5));
    ctx.fillStyle = '#a3161a'; ctx.fillRect(...at(x0 + 1, topY + 1, x1 - x0 - 1, 0.5));
  }
}
