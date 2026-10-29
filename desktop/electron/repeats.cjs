// Repeating to-dos on this computer (rules in shared/repeat.cjs): the occurrences ahead are made right here, and
// turning repeat on or off rewrites the series. The same code runs in the web server and on the phone.
const shared = (name) => { try { return require('../shared/' + name); } catch { return require('../../shared/' + name); } };
const engine = shared('repeat.cjs');
const { localDate } = require('./ensure-dates.cjs');

// Adds the occurrences still missing; true when it added any.
function grow(db, today = localDate()) {
  const made = engine.plan(db.todos, db.tombstones, today);
  if (made.length) db.todos.push(...made);
  return made.length > 0;
}

// rule = { every, unit } to turn on (or change), null to turn off. Returns the ids it deleted.
function setRepeat(db, id, rule, now = Date.now()) {
  const { changed, removed } = engine.setRepeat(db.todos, id, rule, now);
  for (const c of changed) { const at = db.todos.findIndex((t) => t.id === c.id); if (at >= 0) db.todos[at] = c; }
  if (removed.length) {
    db.todos = db.todos.filter((t) => !removed.includes(t.id));
    for (const gone of removed) db.tombstones.push({ coll: 'todos', id: gone, deletedAt: now });
  }
  if (changed.length) grow(db);
  return removed;
}

module.exports = { grow, setRepeat };
