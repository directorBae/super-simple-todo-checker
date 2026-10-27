import { petPixels } from '../../../shared/pixel-pet.js';

// The hero of every game is the person's own pixel pet (drawn from local code, so it works offline):
// legs move on the ground, jump pose in the air, squashed flat while ducking, bigger after a mushroom,
// a red cap in Mario, mirrored when it faces left.
const SPRITE = 24;
export function drawPet(ctx, pet, x, bottom, { ducking = false, onGround = true, hat = false, flip = false, cell, fire = false } = {}, big, time) {
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
    // Fire Mario wears a white cap with a red brim.
    ctx.fillStyle = fire ? '#f4f4f4' : '#e52521'; ctx.fillRect(...at(x0 + 1, topY - 2, x1 - x0 - 1, 3));
    ctx.fillStyle = '#e52521';
    ctx.fillRect(...at(flip ? x0 - 3 : x1 - 2, topY + 1, 5, 1));
    ctx.fillStyle = fire ? '#e52521' : '#fff'; ctx.fillRect(...at((x0 + x1) / 2 - 1, topY - 1, 2, 1.5));
    ctx.fillStyle = '#a3161a'; ctx.fillRect(...at(x0 + 1, topY + 1, x1 - x0 - 1, 0.5));
  }
}

// What the pet carries, drawn around it in every game: wings on its back (Flappy Bird), a hammer over its head
// (Donkey Kong; it swings down when it smashes something) and a shield bubble (Breakout).
export function drawGear(ctx, x, bottom, { cell = 1.5, flip = false, swing = false } = {}, runner, time) {
  const size = SPRITE * cell, left = x - 6 * cell / 1.5, cx = left + size / 2, cy = bottom - size / 2;
  const back = flip ? left + size * 0.78 : left + size * 0.22, dir = flip ? 1 : -1;
  if (runner.wings) {
    const beat = Math.sin(time * 14) * cell * 3;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 4; i++) ctx.fillRect(Math.round(back + dir * (i + 1) * cell * 2), Math.round(cy - cell * (4 + i * 2) - beat * (i / 3)), Math.ceil(cell * 3), Math.ceil(cell * (6 - i)));
    ctx.fillStyle = '#c8d6ec'; ctx.fillRect(Math.round(back + dir * cell * 2), Math.round(cy - cell * 2), Math.ceil(cell * 6), Math.ceil(cell * 1.5));
  }
  if (runner.hammer > 0) {
    // Held up like Jumpman's hammer; on a smash it comes down in front.
    const angle = swing ? (flip ? -1 : 1) * 1.4 : 0, hx = cx + (flip ? -1 : 1) * size * 0.25, hy = bottom - size * 0.75;
    ctx.save(); ctx.translate(hx, hy); ctx.rotate(angle);
    ctx.fillStyle = '#8a5a2b'; ctx.fillRect(-cell, -size * 0.55, cell * 2, size * 0.55);
    ctx.fillStyle = '#c0c6d0'; ctx.fillRect(-cell * 5, -size * 0.55 - cell * 4, cell * 10, cell * 5);
    ctx.fillStyle = '#7d8592'; ctx.fillRect(-cell * 5, -size * 0.55, cell * 10, cell);
    ctx.restore();
  }
  if (runner.shield) {
    ctx.save(); ctx.globalAlpha = 0.35 + Math.sin(time * 5) * 0.1;
    ctx.strokeStyle = '#7fe3ff'; ctx.lineWidth = Math.max(1.5, cell);
    ctx.beginPath(); ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha *= 0.4; ctx.fillStyle = '#7fe3ff'; ctx.fill(); ctx.restore();
  }
}
