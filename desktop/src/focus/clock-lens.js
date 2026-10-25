// Hover magnifier for the clock: a glass torus slice (rounded ends) that reaches well beyond the dial.
// It shows ±35 minutes around the pointer spread over 70° of arc (2× along time, larger radius),
// with a minute ruler and every scheduled to-do as a clear dot plus its title.
// Radii are in units of the dial radius (1 = rim).
export const LENS = { inner: 0.42, outer: 1.24, span: 70, zoom: 2, track: 0.6, pill: 0.84 };

const rad = (deg) => (deg * Math.PI) / 180;
// Smallest signed difference between two angles in degrees.
export const angleGap = (a, b) => ((a - b + 540) % 360) - 180;
// Where a time sits on the dial, in degrees clockwise from 12 (12-hour face).
export const timeAngle = (time) => ((Number(time.slice(0, 2)) % 12) * 60 + Number(time.slice(3, 5))) / 2;
// Dial angle → angle inside the lens (spread around its centre).
export const lensAngle = (dialDeg, centre) => centre + angleGap(dialDeg, centre) * LENS.zoom;
// Is a dial angle inside the lens' time window?
export const inWindow = (dialDeg, centre) => Math.abs(angleGap(dialDeg, centre)) <= LENS.span / 2 / LENS.zoom;

// Point at (angle, r) for a circle of radius R centred at c (pixels).
export const at = (c, R, deg, r) => [c + R * r * Math.sin(rad(deg)), c - R * r * Math.cos(rad(deg))];

// Outline of the slice: a piece of a ring cut straight along the radius, with softly rounded corners.
export function lensPath(c, R, angle) {
  const f = (p) => p.map((v) => v.toFixed(1)).join(' '), round = R * 0.08;
  const a0 = angle - LENS.span / 2, a1 = angle + LENS.span / 2, ro = R * LENS.outer, ri = R * LENS.inner;
  // Corners are rounded by stopping each arc a few degrees short and bridging with a quadratic curve.
  const dOut = (round / ro) * 180 / Math.PI, dIn = (round / ri) * 180 / Math.PI, inward = (round / R);
  return `M${f(at(c, R, a0 + dOut, LENS.outer))} A${ro} ${ro} 0 0 1 ${f(at(c, R, a1 - dOut, LENS.outer))}`
    + ` Q${f(at(c, R, a1, LENS.outer))} ${f(at(c, R, a1, LENS.outer - inward))}`
    + ` L${f(at(c, R, a1, LENS.inner + inward))} Q${f(at(c, R, a1, LENS.inner))} ${f(at(c, R, a1 - dIn, LENS.inner))}`
    + ` A${ri} ${ri} 0 0 0 ${f(at(c, R, a0 + dIn, LENS.inner))} Q${f(at(c, R, a0, LENS.inner))} ${f(at(c, R, a0, LENS.inner + inward))}`
    + ` L${f(at(c, R, a0, LENS.outer - inward))} Q${f(at(c, R, a0, LENS.outer))} ${f(at(c, R, a0 + dOut, LENS.outer))} Z`;
}
// An arc along the slice at radius r (used for the crest highlight and the time track).
export function arcPath(c, R, angle, r, trim = 0) {
  const f = (p) => p.map((v) => v.toFixed(1)).join(' ');
  return `M${f(at(c, R, angle - LENS.span / 2 + trim, r))} A${R * r} ${R * r} 0 0 1 ${f(at(c, R, angle + LENS.span / 2 - trim, r))}`;
}
