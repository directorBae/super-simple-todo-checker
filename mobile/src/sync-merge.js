// Preserve edits/deletions made while a sync request was in flight.
function mergeResponse(current, sent, response) {
  const tombs = new Map();
  for (const t of [...(response.tombstones || []), ...(current.tombstones || [])]) {
    const key = t.coll + ':' + t.id;
    if (!tombs.has(key) || (!tombs.get(key).mergedInto && (t.mergedInto || tombs.get(key).deletedAt < t.deletedAt))) tombs.set(key, t);
  }
  for (const coll of ['teams', 'projects', 'todos']) {
    const before = new Map((sent[coll] || []).map(t => [t.id, t]));
    const merged = new Map((response[coll] || []).map(t => [t.id, t]));
    for (const local of current[coll] || []) {
      if (JSON.stringify(local) === JSON.stringify(before.get(local.id))) continue;
      const remote = merged.get(local.id);
      merged.set(local.id, remote && coll === 'todos' ? { ...remote, ...local, syncRevision: remote.syncRevision, revision: remote.revision, integration: remote.integration, origin: remote.origin } : local);
    }
    current[coll] = [...merged.values()].filter(t => { const tomb = tombs.get(coll + ':' + t.id); return !tomb?.mergedInto && !(tomb?.deletedAt >= (t.updatedAt || t.createdAt || 0)); });
    if (coll === 'todos') current.todos = current.todos.filter(t => !(response.excludedTodoIds || []).includes(t.id)).map(t => ({ ...t, kind: 'todo' }));
  }
  current.tombstones = [...tombs.values()];
}
export { mergeResponse };
