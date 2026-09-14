export const lineOrder = (a, b) => (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0) || a.id.localeCompare(b.id);
export function splitLine(text, current, next) {
  const parts = text.replace(/\r/g, '').split('\n');
  const start = current.sortOrder ?? current.createdAt ?? 0;
  const finish = next ? (next.sortOrder ?? next.createdAt ?? start + 1024) : start + 1024;
  const step = (finish > start ? finish - start : 1) / parts.length;
  return parts.map((title, index) => ({ title, sortOrder: start + step * index }));
}
export function datePatch(todo, date) {
  if (!date) return { date: null, endDate: null, startTime: null, endTime: null };
  let endDate = null;
  if (todo.endDate && todo.date && todo.endDate > todo.date) {
    const days = (Date.parse(todo.endDate + 'T12:00:00Z') - Date.parse(todo.date + 'T12:00:00Z')) / 86400000;
    endDate = new Date(Date.parse(date + 'T12:00:00Z') + days * 86400000).toISOString().slice(0,10);
  }
  return { date, endDate };
}
