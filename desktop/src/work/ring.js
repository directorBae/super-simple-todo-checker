// The dive ringtone on PC and web, played with WebAudio while a dive is calling you: the same bubbly marimba
// motif as the phone's ringtone (mobile/assets/dive-ring.wav), every 2.8 s, for at most RING_MS.
export const RING_MS = 45_000, CYCLE_MS = 2800;
const MOTIF = [[0, 74], [0.13, 78], [0.26, 81], [0.52, 86], [0.65, 85], [0.78, 81]];
const hz = (n) => 440 * 2 ** ((n - 69) / 12);

function phrase(ctx) {
  const t0 = ctx.currentTime + 0.02, out = ctx.createGain();
  out.gain.value = 0.22; out.connect(ctx.destination);
  for (const [dt, m] of MOTIF) for (const [mul, vol, decay] of [[1, 1, 0.9], [4, 0.3, 0.12], [2, 0.12, 0.6]]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + dt;
    o.frequency.value = hz(m) * mul;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.connect(g).connect(out); o.start(t); o.stop(t + decay + 0.05);
  }
  for (const [dt, from, to, len] of [[1.15, 500, 1400, 0.12], [1.32, 650, 1700, 0.1]]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = t0 + dt;
    o.frequency.setValueAtTime(from, t); o.frequency.exponentialRampToValueAtTime(to, t + len);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.25, t + len / 2); g.gain.linearRampToValueAtTime(0, t + len);
    o.connect(g).connect(out); o.start(t); o.stop(t + len + 0.02);
  }
}

// Starts ringing; returns stop().
export function ring() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!AC) return () => {};
  let ctx = null, timer = null, end = null;
  try { ctx = new AC(); } catch { return () => {}; }
  const once = () => { try { if (ctx.state === 'suspended') ctx.resume().catch(() => {}); phrase(ctx); } catch { /* no sound */ } };
  once(); timer = setInterval(once, CYCLE_MS);
  const stop = () => { clearInterval(timer); clearTimeout(end); ctx?.close().catch(() => {}); ctx = null; };
  end = setTimeout(stop, RING_MS);
  return stop;
}
