export const TODO_DRAG_TYPE = 'application/x-checker-todo';
export function compactTitle(value, limit = 50) {
  const clean = String(value || '').replace(/\s+/g, ' ').trim();
  const chars = Array.from(clean);
  return chars.length <= limit ? clean : chars.slice(0, limit - 1).join('').trimEnd() + '…';
}
export function titleSource(todo) {
  // Recover a locally shortened title without sending unrelated task notes.
  const originals = String(todo.notes || '').split(/\n\n/).filter(block => block.startsWith('원문: ')).map(block => block.slice(4).trim());
  return originals.reverse().find(text => compactTitle(text) === todo.title) || todo.title;
}
export function clockTimeAt(x, y, rect, half = 0) {
  const angle = (Math.atan2(x - rect.left - rect.width / 2, -(y - rect.top - rect.height / 2)) + Math.PI * 2) % (Math.PI * 2);
  const minutes = Math.round(angle / (Math.PI * 2) * 720 / 15) * 15 % 720 + half * 720;
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
export function schedulePatch(todo, date, time) {
  // A previous end time can become earlier than a newly assigned start.
  return { date, startTime: time, endTime: null, endDate: null, timeZone: todo.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone };
}
export { parseYouTube } from '../../shared/youtube.js';
