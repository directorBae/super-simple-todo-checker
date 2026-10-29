import repeatEngine from '../../shared/repeat.cjs';

// Repeating to-dos: add the occurrences still to make (shared/repeat.cjs). Same rows on every device, so they sync like
// any other to-do without doubling. Returns how many were added.
export function fillRepeats(d, today) {
  const made = repeatEngine.plan(d.todos || [], d.tombstones || [], today);
  if (made.length) d.todos.push(...made);
  return made.length;
}

// Applying setRepeat's result to the phone's data: removed ones get tombstones, changed ones are saved whole (so the
// rule and the series stay on them).
export function applyRepeat(d, { changed, removed }, now = Date.now()) {
  if (removed.length) {
    d.todos = d.todos.filter((t) => !removed.includes(t.id));
    for (const id of removed) d.tombstones.push({ coll: 'todos', id, deletedAt: now });
  }
  for (const c of changed) { const i = d.todos.findIndex((t) => t.id === c.id); if (i >= 0) d.todos[i] = c; }
  return d;
}
