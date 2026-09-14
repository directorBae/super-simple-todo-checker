const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('api', {
  getState: () => ipcRenderer.invoke('smoke:state'),
  getInfo: async () => ({ version: 'test', userData: 'test-fixture' }),
  integrations: p => ipcRenderer.invoke('smoke:integrations', p),
  syncNow: async () => ({ ok: true }),
  updateSettings: p => ipcRenderer.invoke('smoke:settings', p),
  updateTodo: (id, patch) => ipcRenderer.invoke('smoke:todo', { id, patch }),
  pairDevice: async () => ({ ok: true, code: '123456', urls: ['http://192.0.2.1:8787'] }),
  onDbChanged: callback => ipcRenderer.on('smoke:db', (_, db) => callback(db)), onOpenView: () => {},
});
