// Where dragged notebook rows land: reorder inside a day, move into/out of a team, or onto another date.
// Pure so the same rules are shared by the desktop/web notebook and the phone app, and unit-tested.

const teamOf = (todo, db) => {
  const p = db.projects.find((x) => x.id === todo.projectId), id = (p && p.teamId) || todo.teamId || null;
  // A team that no longer exists counts as no team, so its lines still show (first, with the lines without a team).
  return id && db.teams.some((t) => t.id === id) ? id : null;
};

// Tab (or the phone's 팀 button) on a line being edited: the next team in the order the day shows them — no team
// first, then each team — round and round (dir -1 goes back). undefined when there is nothing to switch, or the team
// comes from the line's project.
export function cycleTeam(db, todo, dir = 1) {
  const p = db.projects.find((x) => x.id === todo.projectId);
  if (p && p.teamId) return undefined;
  const order = [null, ...db.teams.map((t) => t.id)];
  if (order.length < 2) return undefined;
  const at = Math.max(0, order.indexOf(teamOf(todo, db)));
  return order[(at + dir + order.length) % order.length];
}

// Same order the notebook shows: timed lines first by time, then the hand-made order.
export const lineSort = (a, b) => {
  const ka = a.startTime || '99:99';
  const kb = b.startTime || '99:99';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0);
};

// Calendar order (week and month): grouped by team like the day page — lines without a team first, then each team
// in its own order — and within a team the notebook order.
export const teamSort = (db) => {
  const rank = new Map(db.teams.map((t, i) => [t.id, i + 1]));
  return (a, b) => (rank.get(teamOf(a, db)) ?? 0) - (rank.get(teamOf(b, db)) ?? 0) || lineSort(a, b);
};
// The same lines split into those groups: [{ team, list }] (team is null for lines without one).
export function teamGroups(db, list) {
  const sorted = [...list].sort(teamSort(db)), groups = [];
  for (const t of sorted) {
    const team = db.teams.find((x) => x.id === teamOf(t, db)) || null;
    if (groups.at(-1)?.team !== team) groups.push({ team, list: [] });
    groups.at(-1).list.push(t);
  }
  return groups;
}

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
