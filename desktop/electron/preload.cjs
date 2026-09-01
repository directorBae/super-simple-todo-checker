const { contextBridge, ipcRenderer } = require('electron');

const invoke = (ch, ...args) => ipcRenderer.invoke(ch, ...args);

contextBridge.exposeInMainWorld('api', {
  getState: () => invoke('state:get'),
  getInfo: () => invoke('app:info'),

  addTodo: (p) => invoke('todo:add', p),
  updateTodo: (id, patch) => invoke('todo:update', { id, patch }),
  deleteTodo: (id) => invoke('todo:delete', id),

  addProject: (p) => invoke('project:add', p),
  updateProject: (id, patch) => invoke('project:update', { id, patch }),
  deleteProject: (id) => invoke('project:delete', id),

  addTeam: (p) => invoke('team:add', p),
  updateTeam: (id, patch) => invoke('team:update', { id, patch }),
  deleteTeam: (id) => invoke('team:delete', id),

  updateSettings: (patch) => invoke('settings:update', patch),
  ackMissed: () => invoke('notif:ack'),
  syncNow: () => invoke('sync:now'),

  gcalConnect: () => invoke('gcal:connect'),
  gcalSync: () => invoke('gcal:sync'),
  gcalDisconnect: () => invoke('gcal:disconnect'),

  onDbChanged: (cb) => ipcRenderer.on('db-changed', (_, db) => cb(db)),
  onOpenView: (cb) => ipcRenderer.on('open-view', (_, view) => cb(view)),
});
