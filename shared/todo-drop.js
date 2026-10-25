// Where dragged notebook rows land: reorder inside a day, move into/out of a team, or onto another date.
// Pure so the same rules are shared by the desktop/web notebook and the phone app, and unit-tested.

const teamOf = (todo, db) => {
  const p = db.projects.find((x) => x.id === todo.projectId);
  return (p && p.teamId) || todo.teamId || null;
};

// Same order the notebook shows: timed lines first by time, then the hand-made order.
export const lineSort = (a, b) => {
  const ka = a.startTime || '99:99';
  const kb = b.startTime || '99:99';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0);
};

// A project tied to another team would override the new team, so the link is dropped.
const teamPatch = (todo, teamId, db) => {
  const p = db.projects.find((x) => x.id === todo.projectId);
  return p && p.teamId && p.teamId !== teamId ? { teamId, projectId: null } : { teamId };
};

/*
 * drop:
 *   { kind: 'line', targetId, after }  — next to another line (takes its day and team)
 *   { kind: 'team', teamId, date? }    — into a team (with a date: at the end of that day's group)
 *   { kind: 'day', date }              — onto a day outside any team (out of the team)
 *   { kind: 'date', date }             — onto a calendar cell (date only)
 * `sort` is the order the caller shows lines in. Returns [{ id, patch }] with only the fields that change.
 */
export function dropPatches(db, ids, drop, sort = lineSort) {
  const moving = ids.map((id) => db.todos.find((t) => t.id === id)).filter(Boolean);
  if (!moving.length || !drop) return [];
  const out = new Map();
  const put = (todo, patch) => {
    const changed = Object.fromEntries(Object.entries(patch).filter(([k, v]) => (todo[k] ?? null) !== v));
    if (Object.keys(changed).length) out.set(todo.id, { ...(out.get(todo.id) || {}), ...changed });
  };

  if (drop.kind === 'date') {
    for (const t of moving) put(t, { date: drop.date });
    return [...out].map(([id, patch]) => ({ id, patch }));
  }
  if (drop.kind === 'team' && !drop.date) {
    for (const t of moving) put(t, teamPatch(t, drop.teamId || null, db));
    return [...out].map(([id, patch]) => ({ id, patch }));
  }

  let date, teamId, kind, index = Infinity, target = null;
  if (drop.kind === 'line') {
    target = db.todos.find((t) => t.id === drop.targetId);
    if (!target || ids.includes(target.id)) return [];
    date = target.date; teamId = teamOf(target, db); kind = target.kind;
  } else {
    date = drop.date; teamId = drop.kind === 'team' ? drop.teamId || null : null; kind = moving[0].kind;
  }
  const group = db.todos
    .filter((t) => t.kind === kind && t.date === date && t.status !== 'bucket' && !ids.includes(t.id) && teamOf(t, db) === teamId)
    .sort(sort);
  if (target) index = group.indexOf(target) + (drop.after ? 1 : 0);
  const list = [...group];
  list.splice(Math.min(index, list.length), 0, ...moving);
  list.forEach((t, i) => {
    const patch = { sortOrder: (i + 1) * 1024 };
    if (moving.includes(t)) Object.assign(patch, { date }, teamPatch(t, teamId, db));
    put(t, patch);
  });
  return [...out].map(([id, patch]) => ({ id, patch }));
}

// Shift-click range over the rows as they appear on screen.
export function selectRange(order, anchor, id) {
  const a = order.indexOf(anchor), b = order.indexOf(id);
  if (a < 0 || b < 0) return [id];
  return order.slice(Math.min(a, b), Math.max(a, b) + 1);
}
