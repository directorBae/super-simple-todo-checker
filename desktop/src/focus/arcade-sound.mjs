// The arcade's sound effects, synthesized on the spot with Web Audio (no sound files, works offline): short square-
// and triangle-wave chirps and a little noise, in the spirit of 8-bit games but our own.
// The run doesn't report sounds itself: hearSounds() compares the game before and after each step (score, hearts,
// power-ups, stage, the pet leaving the ground) and plays what changed; a few key presses play directly.
let audio = null, master = null, on = true;
const last = {};

export function setSoundOn(value) { on = !!value; if (master) master.gain.value = on ? 0.16 : 0; }
// Browsers only start audio after a click or key press: called from those.
export function unlockSound() {
  try {
    if (!audio) {
      const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return;
      audio = new Ctx(); master = audio.createGain(); master.gain.value = on ? 0.16 : 0; master.connect(audio.destination);
    }
    if (audio.state === 'suspended') audio.resume();
  } catch { /* no audio on this device */ }
}

function tone(type, from, to, length, at = 0, volume = 1) {
  const t = audio.currentTime + at, osc = audio.createOscillator(), gain = audio.createGain();
  osc.type = type; osc.frequency.setValueAtTime(from, t);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + length);
  gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  osc.connect(gain).connect(master); osc.start(t); osc.stop(t + length + 0.02);
}
function noise(length, at = 0, volume = 0.6, pitch = 1800) {
  const t = audio.currentTime + at, frames = Math.ceil(audio.sampleRate * length), buffer = audio.createBuffer(1, frames, audio.sampleRate);
  const data = buffer.getChannelData(0); for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
  const src = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
  src.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = pitch;
  gain.gain.setValueAtTime(volume, t); gain.gain.exponentialRampToValueAtTime(0.0001, t + length);
  src.connect(filter).connect(gain).connect(master); src.start(t);
}
const notes = (type, list, step, length = step, volume = 0.8) => list.forEach((f, i) => tone(type, f, f, length, i * step, volume));
let wakaUp = false;
const SOUNDS = {
  jump: () => tone('square', 260, 620, 0.14, 0, 0.5),
  flap: () => { tone('triangle', 520, 880, 0.08, 0, 0.6); noise(0.05, 0, 0.25, 3000); },
  blip: () => { wakaUp = !wakaUp; tone('triangle', wakaUp ? 440 : 330, wakaUp ? 330 : 440, 0.07, 0, 0.6); },
  coin: () => notes('square', [880, 1320], 0.07, 0.18, 0.45),
  bonus: () => notes('square', [660, 830, 990, 1320], 0.06, 0.1, 0.45),
  powerup: () => notes('square', [392, 523, 659, 784, 1047, 784, 1047, 1319], 0.045, 0.06, 0.4),
  oneup: () => notes('triangle', [660, 990, 1320, 1760], 0.08, 0.12, 0.7),
  shrink: () => notes('square', [880, 660, 494, 370], 0.06, 0.07, 0.4),
  shield: () => { noise(0.18, 0, 0.5, 900); tone('triangle', 1200, 300, 0.2, 0, 0.5); },
  hurt: () => { tone('square', 420, 90, 0.35, 0, 0.5); noise(0.15, 0, 0.35, 600); },
  fire: () => { tone('square', 900, 260, 0.1, 0, 0.35); noise(0.06, 0, 0.3, 2400); },
  swing: () => { noise(0.14, 0, 0.6, 500); tone('square', 160, 60, 0.14, 0, 0.4); },
  tick: () => tone('square', 1200, 1200, 0.025, 0, 0.25),
  start: () => notes('square', [523, 659, 784], 0.07, 0.09, 0.4),
  clear: () => notes('square', [523, 659, 784, 1047, 784, 1047, 1319], 0.07, 0.1, 0.4),
  gameover: () => notes('triangle', [494, 440, 392, 330, 262], 0.16, 0.22, 0.8),
};
export function playSound(name) {
  if (!on || !audio || !SOUNDS[name]) return;
  const now = audio.currentTime;
  if (now - (last[name] ?? -1) < 0.045) return; // the same sound twice in one frame is one sound
  last[name] = now;
  try { SOUNDS[name](); } catch { /* ignore */ }
}

// What the sounds are worked out from.
export function soundState(g, pose) {
  const r = g.runner;
  return { score: g.score, lives: r.lives, big: r.big, fire: r.fire, shield: r.shield, wings: r.wings, hammer: r.hammer, index: g.index, over: g.gameOver, stage: g.stage, ground: !!pose?.onGround, bottom: pose?.bottom ?? 0, crossing: !!g.transition };
}
export function hearSounds(a, b) {
  if (!b.over && a.over) return;
  if (b.over && !a.over) return playSound('gameover');
  if (b.index !== a.index) playSound('clear');
  if (b.lives < a.lives) playSound('hurt');
  else if (b.lives > a.lives) playSound('oneup');
  if (a.shield && !b.shield && b.lives === a.lives) playSound('shield');
  else if ((a.big || a.fire) && !b.big && !b.fire && b.lives === a.lives) playSound('shrink');
  if ((!a.fire && b.fire) || (!a.big && b.big) || (!a.wings && b.wings) || (!a.shield && b.shield) || b.hammer > a.hammer) playSound('powerup');
  else if (b.hammer < a.hammer) playSound('swing');
  const points = b.score - a.score;
  // Points as they come in: a dot or a brick ticks, a coin or a stomp chimes, a big bonus rolls up.
  if (points > 0 && b.index === a.index) playSound(points >= 1000 ? 'bonus' : points >= 100 ? 'coin' : b.stage === 'dino' ? null : 'blip');
  // Leaving the ground going up is a jump (not while crossing between games).
  if (!a.crossing && !b.crossing && a.ground && !b.ground && b.bottom < a.bottom - 0.5 && b.stage === a.stage && b.stage !== 'flappy') playSound('jump');
}
