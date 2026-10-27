// A day's to-dos as one notepad, for the phone app: the day becomes plain text, one line per to-do, with a team's
// name on its own line as the heading for the lines under it (lines before any heading have no team). After editing,
// the text is matched back to the to-dos — unchanged and edited lines keep their to-do (and with it its time,
// done state and links), new lines become to-dos and missing ones are deleted. Pure, so it can be unit-tested.
export const TITLE_MAX = 50;
const teamOf = (todo, db) => {
  const p = db.projects.find((x) => x.id === todo.projectId), id = (p && p.teamId) || todo.teamId || null;
  // A team that no longer exists counts as no team, so its lines still show (first, with the lines without a team).
  return id && db.teams.some((t) => t.id === id) ? id : null;
};
const order = (a, b) => (a.sortOrder ?? a.createdAt ?? 0) - (b.sortOrder ?? b.createdAt ?? 0) || String(a.id).localeCompare(String(b.id));

// The day in reading order: [{ team: null|team, todos: [...] }], lines without a team first, then each team in order.
export function dayGroups(db, date) {
  const items = db.todos.filter((t) => (t.date || null) === date && t.status !== 'bucket').sort(order);
  return [{ team: null, todos: items.filter((t) => !teamOf(t, db)) }, ...db.teams.map((team) => ({ team, todos: items.filter((t) => teamOf(t, db) === team.id) }))]
    .filter((g) => g.todos.length);
}

// The text shown in the notepad, and where each to-do's line starts (for putting the caret on a tapped line).
export function dayText(db, date) {
  const lines = [], starts = {};
  let at = 0;
  const push = (line, id) => { if (id) starts[id] = at; lines.push(line); at += line.length + 1; };
  for (const g of dayGroups(db, date)) {
    if (g.team) push(g.team.name);
    for (const t of g.todos) push(t.title, t.id);
  }
  return { text: lines.join('\n'), starts };
}

const clip = (title) => Array.from(title).slice(0, TITLE_MAX).join('');
const headingOf = (line, db) => db.teams.find((t) => t.name.trim().toLowerCase() === line.trim().toLowerCase());

// Reads the text back: [{ title, teamId }] in order (blank lines are ignored, team-name lines switch the team).
export function parseDay(db, text) {
  const out = [];
  let teamId = null;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;
    const heading = headingOf(line, db);
    if (heading) { teamId = heading.id; continue; }
    out.push({ title: clip(line), teamId });
  }
  return out;
}

// Longest common subsequence of equal titles, as index pairs.
function lcs(a, b) {
  const n = a.length, m = b.length, L = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const pairs = [];
  for (let i = 0, j = 0; i < n && j < m;) {
    if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return pairs;
}

// What to change so the day matches the text: { adds: [{ title, date, teamId, sortOrder }], updates: [{ id, patch }], deletes: [id] }.
// `only` (a Set of ids) limits it to the to-dos the notepad knows — so one that arrives from another device while
// the notepad is open is left alone rather than taken as deleted.
export function planDay(db, date, text, only = null) {
  const old = dayGroups(db, date).flatMap((g) => g.todos).filter((t) => !only || only.has(t.id)), next = parseDay(db, text);
  const owner = new Array(next.length).fill(null), used = new Set(), oldIndex = new Map(old.map((t, i) => [t, i]));
  const take = (j, i) => { owner[j] = old[i]; used.add(i); };
  // 1. Lines that stayed in order, then lines moved elsewhere with the same text: same to-do.
  for (const [i, j] of lcs(old.map((t) => t.title), next.map((x) => x.title))) take(j, i);
  next.forEach((line, j) => { if (owner[j]) return; const i = old.findIndex((t, k) => !used.has(k) && t.title === line.title); if (i >= 0) take(j, i); });
  // 2. A changed line keeps the to-do that sat in the same place: between the same unchanged neighbours.
  for (let j = 0; j < next.length;) {
    if (owner[j]) { j++; continue; }
    let end = j; while (end < next.length && !owner[end]) end++;
    const lo = j > 0 ? oldIndex.get(owner[j - 1]) : -1, hi = end < next.length ? oldIndex.get(owner[end]) : old.length;
    const spare = old.map((_, i) => i).filter((i) => !used.has(i) && i > lo && i < hi);
    for (let k = j; k < end && spare.length; k++) take(k, spare.shift());
    j = end;
  }
  const plan = { adds: [], updates: [], deletes: old.filter((_, i) => !used.has(i)).map((t) => t.id) };
  next.forEach((line, j) => {
    const sortOrder = (j + 1) * 1024, todo = owner[j];
    if (!todo) { plan.adds.push({ title: line.title, date, teamId: line.teamId, sortOrder }); return; }
    const patch = {};
    if (todo.title !== line.title) patch.title = line.title;
    if (teamOf(todo, db) !== line.teamId) {
      patch.teamId = line.teamId;
      const project = db.projects.find((p) => p.id === todo.projectId);
      if (project && project.teamId && project.teamId !== line.teamId) patch.projectId = null; // its project belongs elsewhere
    }
    if ((todo.sortOrder ?? null) !== sortOrder) patch.sortOrder = sortOrder;
    if (Object.keys(patch).length) plan.updates.push({ id: todo.id, patch });
  });
  return plan;
}
