// Deterministic IDs keep independently upgraded/offline devices from duplicating teams.
function migrateTeams(db) {
  db.teams ||= []; db.todos ||= []; db.projects ||= []; db.tombstones ||= [];
  for (const project of db.projects) {
    const teamId = project.teamId && db.teams.some(t => t.id === project.teamId) ? project.teamId : 'project-team-' + project.id;
    if (!db.teams.some(t => t.id === teamId) && !db.tombstones.some(t => t.coll === 'teams' && t.id === teamId)) db.teams.push({ id: teamId, name: project.name, color: '#6685e8', important: !!project.important, createdAt: project.createdAt || Date.now(), updatedAt: project.updatedAt || Date.now() });
    for (const todo of db.todos.filter(t => t.projectId === project.id)) {
      todo.teamId = db.teams.some(t => t.id === teamId) ? teamId : null;
      todo.projectId = null;
      todo.updatedAt = Math.max(Date.now(), (todo.updatedAt || 0) + 1);
    }
    if (!db.tombstones.some(t => t.coll === 'projects' && t.id === project.id)) db.tombstones.push({ coll: 'projects', id: project.id, deletedAt: Math.max(Date.now(), project.updatedAt || 0) });
  }
  db.projects = [];
  return db;
}
module.exports = { migrateTeams };
