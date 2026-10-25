export const CLOCK_HOLD_MS = 450;
// Ctrl+→ moves to the clock room on the right, Ctrl+← back to the main room.
export function isClockShortcut(event, key = 'ArrowRight') {
  return event.ctrlKey && !event.altKey && !event.metaKey && !event.repeat && !event.isComposing && event.key === key;
}
export function isHorizontalSwipe(dx, dy, distance = 64) {
  return Math.abs(dx) >= distance && Math.abs(dx) > Math.abs(dy) * 1.5;
}
