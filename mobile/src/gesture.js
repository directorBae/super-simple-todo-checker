// Taps on the screen: a tap anywhere tells open pop-overs (the "내 팀 전부 넣기" pill) and the line selection to let go,
// except right after a tap on a to-do line (those toggle the selection instead; lines stamp touch.lastRowTap).
export const touch = { lastRowTap: 0 };
const outside = new Set();
export const onOutsideTap = (fn) => { outside.add(fn); return () => outside.delete(fn); };
export const outsideTap = () => { if (Date.now() - touch.lastRowTap < 250) return; outside.forEach((fn) => fn()); };
