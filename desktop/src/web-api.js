// The Electron preload remains the desktop entry point; browsers use same-origin HTTP.
if (!window.api) {
  const listeners = new Set();
  const request = async (method, payload) => {
    const response = await fetch('/api/' + method, payload === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || '서버 요청에 실패했습니다.');
    return result;
  };
  let previous = '';
  const emit = state => { const serialized = JSON.stringify(state); if (serialized !== previous) { previous = serialized; listeners.forEach(fn => fn(state)); } return state; };
  const mutate = (method, payload) => request(method, payload).then(state => { emit(state); channel.postMessage('refresh'); return state; });
  const channel = new BroadcastChannel('checker-state');
  channel.onmessage = () => request('state').then(emit).catch(() => {});
  window.api = {
    platform: 'web',
    openClock: todoId => {
      const url = new URL(window.location.href); url.search = 'view=clock';
      if (todoId) url.searchParams.set('todo', todoId);
      const clock = window.open(url.href, 'checker-clock', 'popup,width=420,height=700,resizable=yes');
      clock?.focus(); return { ok: !!clock };
    },
    getState: () => request('state').then(emit), getInfo: () => request('info'),
    addTodo: p => mutate('todo/add', p), updateTodo: (id, patch) => mutate('todo/update', { id, patch }), deleteTodo: id => mutate('todo/delete', { id }),
    addTeam: p => mutate('team/add', p), updateTeam: (id, patch) => mutate('team/update', { id, patch }), deleteTeam: id => mutate('team/delete', { id }),
    addProject: p => mutate('project/add', p), updateProject: (id, patch) => mutate('project/update', { id, patch }), deleteProject: id => mutate('project/delete', { id }),
    updateSettings: p => mutate('settings', p), ackMissed: () => mutate('ack', {}),
    syncNow: async () => { emit(await request('state')); return { ok: true }; },
    pairDevice: () => request('pair', {}),
    integrations: p => p ? request('integrations', p).then(async r => { if (r.ok && !['compress-title', 'create-pet'].includes(p.action)) emit(await request('state')); return r; }) : request('integrations'),
    saveWallpaper: dataUrl => request('wallpaper-upload', { dataUrl }),
    exportWallpaper: async p => {
      const response = await fetch('/api/wallpaper', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) });
      if (!response.ok) throw new Error('월페이퍼를 저장하지 못했습니다.');
      const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
      link.href = url; link.download = 'checker-wallpaper.html'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); return { ok: true };
    },
    onDbChanged: fn => { listeners.add(fn); return () => listeners.delete(fn); }, onOpenView: () => {},
  };
  setInterval(() => { if (!document.hidden) request('state').then(emit).catch(() => {}); }, 3000);
}
