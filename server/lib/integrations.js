const { ApiError, id, hash, fingerprint, editable, content, json, schedule, DateTime } = require('./common');
const { classify, taskTypes } = require('./router');
const { Duplicates } = require('./duplicates');
const providers = { notion: require('./notion'), google: require('./google'), apple: require('./apple') };
const safeError = e => String(e.message || '요청 실패').slice(0, 400);

class Integrations {
  constructor(storage, config, overrides = {}) {
    this.store = storage; this.db = storage.data; this.config = config;
    this.providers = overrides.providers || providers; this.classify = overrides.classify || classify;
    this.busy = false;
    this.duplicates = new Duplicates(this, overrides.suggestDuplicates);
  }
  save() { this.store.save(); }
  excluded(todoId) {
    const links = this.db.links.filter(l => l.todoId === todoId);
    return links.some(l => l.excluded) && links.every(l => l.excluded || l.deleted);
  }
  exclude(link) {
    link.excluded = true;
    for (const job of this.db.jobs.filter(j => j.linkId === link.id && !['done', 'superseded', 'running'].includes(j.state))) job.state = 'superseded';
    this.save();
  }
  connection(id) { const c = this.db.connections.find(c => c.id === id && c.enabled); if (!c) throw new ApiError('계정을 연결해 주세요.'); return c; }
  adapter(target) {
    const c = this.connection(target.connectionId);
    return this.providers[c.provider].adapter(this.store.unseal(c.credentials), credentials => { if (c.enabled) { c.credentials = this.store.seal(credentials); this.save(); } }, this.config);
  }
  state() {
    return {
      connections: this.db.connections.map(({ credentials, ...c }) => c), targets: this.db.targets,
      jobs: this.db.jobs.filter(j => j.state !== 'done' && j.state !== 'superseded').map(({ payload, ...j }) => j).slice(-100),
      configured: { google: !!(this.config.googleClientId && this.config.googleClientSecret && this.config.publicUrl), notionOAuth: !!(this.config.notionClientId && this.config.notionClientSecret && this.config.publicUrl), openai: !!this.config.openaiKey, model: this.config.openaiModel, publicUrl: this.config.publicUrl, timeZone: this.config.timeZone },
      busy: this.busy,
    };
  }
  decorate(t) {
    const links = this.db.links.filter(l => l.todoId === t.id);
    const link = links.find(l => l.conflict) || links.find(l => !l.deleted) || links[0];
    const target = link && this.db.targets.find(x => x.id === link.targetId);
    const job = this.db.jobs.findLast(j => j.todoId === t.id && !['done', 'superseded'].includes(j.state));
    return { ...t, syncRevision: t.revision, integration: { provider: target?.provider || null, targetId: target?.id || null, targetLabel: target?.label || null, externalId: link?.externalId || null, externalUrl: link?.url || null, state: link?.conflict ? 'conflict' : link?.deleted ? 'remote_deleted' : job?.state || t.routing?.state || (link ? 'synced' : 'local'), error: link?.conflict?.message || job?.error || t.routing?.reason || null, recurring: !!link?.recurring, sources: links.map(l => { const destination = this.db.targets.find(x => x.id === l.targetId); return { linkId: l.id, provider: destination?.provider, targetLabel: destination?.label, externalId: l.externalId, externalUrl: l.url, deleted: !!l.deleted, conflict: l.conflict?.message || null, writable: !!destination?.writeEnabled && l.writable !== false, content: l.remoteBase }; }) } };
  }
  enqueue(todo, operation = 'update', targetId, linkId) {
    if (operation === 'update' && !targetId && !linkId) {
      for (const link of this.db.links.filter(l => l.todoId === todo.id)) this.enqueue(todo, operation, link.targetId, link.id);
      return;
    }
    const link = this.db.links.find(l => l.todoId === todo.id && (!linkId || l.id === linkId) && (!targetId || l.targetId === targetId));
    const target = this.db.targets.find(t => t.id === (targetId || link?.targetId));
    if (operation === 'update' && !link) return;
    if (!target || !target.writeEnabled || link?.excluded || (link?.deleted && operation !== 'delete')) return;
    const key = `${todo.id}:${target.id}:${operation}:${operation === 'create' ? 'initial' : `${link?.id}:${todo.revision}`}`;
    if (this.db.jobs.some(j => j.key === key && !['superseded'].includes(j.state))) return;
    this.db.jobs.push({ id: id(), key, todoId: todo.id, targetId: target.id, linkId: link?.id, operation, revision: todo.revision, payload: structuredClone(todo), state: 'pending', attempts: 0, createdAt: Date.now(), nextAttemptAt: 0 });
  }
  changed(todo) {
    const link = this.db.links.find(l => l.todoId === todo.id);
    if (link) { this.enqueue(todo); return; }
    if (todo.origin?.type === 'app' && todo.status === 'todo') todo.routing = { state: 'pending', reason: '자동 분류 대기' };
  }
  effectiveTeam(todo) { return this.db.projects.find(p => p.id === todo.projectId)?.teamId || todo.teamId || null; }
  candidates(todo) { const teamId = this.effectiveTeam(todo); return this.db.targets.filter(t => t.writeEnabled && t.autoRoute && this.db.teams.some(team => team.id === t.teamId) && this.db.connections.some(c => c.id === t.connectionId && c.enabled) && (!teamId || t.teamId === teamId)); }
  async route(todo) {
    const revision = todo.revision, candidates = this.candidates(todo);
    if (!candidates.length) { todo.routing = { state: 'needs_review', reason: '이 조직에 자동 분배할 연결을 설정해 주세요.' }; this.save(); return; }
    todo.routing = { state: 'classifying', reason: '일의 종류와 목적지를 확인하는 중' }; this.save();
    try {
      if (this.db.duplicateMemories.some(m => m.teamId === this.effectiveTeam(todo))) {
        let offset = 0;
        do {
          const review = await this.duplicates.candidates(todo.id, offset);
          if (!this.db.todos.includes(todo) || todo.revision !== revision) return;
          if (review.matches.length) { todo.routing = { state: 'needs_review', reason: '개인 메모리를 참고한 중복 후보가 있습니다. 도구 연결 → 중복 업무에서 확인해 주세요.' }; todo.duplicateReview = review.matches; return; }
          offset = review.nextOffset;
        } while (offset !== null);
      }
      delete todo.duplicateReview;
      const result = await this.classify({ ...todo, teamId: this.effectiveTeam(todo) }, candidates, this.db.teams.map(({ id, name }) => ({ id, name })), this.config);
      if (!this.db.todos.includes(todo) || todo.revision !== revision) return;
      const allowed = this.candidates(todo).filter(t => t.teamId === (this.effectiveTeam(todo) || result.teamId) && t.taskTypes.includes(result.taskType));
      const target = allowed.find(t => t.isDefault) || allowed.find(t => t.id === result.targetId);
      if (result.needsReview || !target) { todo.routing = { state: 'needs_review', reason: result.reason || '조직과 목적지를 선택해 주세요.' }; return; }
      const patch = {};
      for (const k of ['date', 'endDate', 'startTime', 'endTime']) if (!todo[k] && result[k]) patch[k] = result[k];
      const next = { ...todo, ...patch, timeZone: todo.timeZone || target.timeZone };
      if (next.date) schedule(next, target.defaultMinutes);
      else if (target.provider !== 'notion') { todo.routing = { state: 'needs_review', reason: '캘린더에 넣을 날짜를 지정해 주세요.' }; return; }
      Object.assign(todo, patch, { taskType: result.taskType, teamId: target.teamId, timeZone: next.timeZone });
      todo.revision++; todo.updatedAt = Date.now();
      todo.routing = { state: 'pending', targetId: target.id, reason: result.reason, model: this.config.openaiModel };
      this.enqueue(todo, 'create', target.id);
    } catch (e) {
      if (todo.revision === revision) todo.routing = { state: 'needs_review', reason: safeError(e) };
    } finally { this.save(); }
  }
  remoteChanged(link, remote) { return hash(remote.data) !== hash(link.remoteBase); }
  localChanged(todo, link) { return hash(Object.fromEntries(Object.keys(link.remoteBase || {}).map(k => [k, todo[k] ?? null]))) !== hash(link.localBase); }
  linkRemote(todo, target, remote, sent) {
    let link = this.db.links.find(l => l.targetId === target.id && l.externalId === remote.externalId);
    if (!link) { link = { id: id(), todoId: todo.id, targetId: target.id, externalId: remote.externalId }; this.db.links.push(link); }
    link.version = remote.version; link.url = remote.url || null; link.recurring = remote.recurring; link.writable = remote.writable !== false;
    link.remoteBase = remote.data;
    link.localBase = Object.fromEntries(Object.keys(remote.data).map(k => [k, (sent || todo)[k] ?? null]));
    link.conflict = null; link.deleted = false; link.excluded = false; link.syncedAt = Date.now();
    return link;
  }
  importRemote(target, remote) {
    let link = this.db.links.find(l => l.targetId === target.id && l.externalId === remote.externalId);
    if (remote.inScope === false) { if (link) this.exclude(link); return; }
    if (!link) {
      const remembered = this.duplicates.remembered(target, remote);
      if (remembered) {
        const todo = this.db.todos.find(t => t.id === remembered);
        if (todo && !remote.deleted) { this.linkRemote(todo, target, remote); this.save(); }
        return;
      }
    }
    if (link) {
      const todo = this.db.todos.find(t => t.id === link.todoId);
      if (!todo) return; // locally deleted: retain link as a tombstone against reimport
      const wasExcluded = link.excluded; link.excluded = false;
      if (remote.deleted) { link.deleted = true; if (!this.db.links.some(l => l.todoId === todo.id && !l.deleted)) todo.routing = { state: 'remote_deleted', reason: '원본에서 삭제된 항목입니다.' }; this.save(); return; }
      if (link.deleted) { link.deleted = false; todo.routing = null; this.save(); }
      if (!this.remoteChanged(link, remote)) { if (wasExcluded) { this.save(); if (this.localChanged(todo, link)) this.enqueue(todo); } return; }
      if (this.localChanged(todo, link)) { link.conflict = { message: '앱과 원본이 함께 변경되었습니다. 유지할 내용을 선택해 주세요.', remote: remote.data }; this.save(); return; }
      Object.assign(todo, remote.data, { revision: todo.revision + 1, updatedAt: Date.now() });
      this.linkRemote(todo, target, remote); this.save(); return;
    }
    if (remote.deleted) return;
    let todo = remote.appId && this.db.todos.find(t => t.id === remote.appId && this.db.jobs.some(j => j.todoId === t.id && j.targetId === target.id && j.operation === 'create'));
    // Only our known create operation can adopt an app ID supplied by external text.
    if (todo) {
      const j = this.db.jobs.findLast(j => j.todoId === todo.id && j.targetId === target.id && j.operation === 'create');
      this.linkRemote(todo, target, remote, j.payload); j.state = 'done'; todo.routing = null;
      if (todo.revision !== j.revision) this.enqueue(todo);
    } else {
      const now = Date.now();
      todo = { id: id(), kind: 'todo', title: '', notes: '', date: null, startTime: null, endTime: null, projectId: null, teamId: target.teamId, status: 'todo', ...remote.data, origin: { type: 'external', provider: target.provider, connectionId: target.connectionId, containerId: target.containerId, externalId: remote.externalId }, createdAt: now, updatedAt: now, revision: 1 };
      this.db.todos.push(todo); this.linkRemote(todo, target, remote);
    }
    this.save();
  }
  async pull(target) {
    const adapter = this.adapter(target);
    const seen = new Set();
    for (const remote of await adapter.list(target)) {
      if (!target.readEnabled || !this.db.connections.some(c => c.id === target.connectionId && c.enabled)) return;
      seen.add(remote.externalId); this.importRemote(target, remote);
    }
    // A missing list result can just be outside the window or an archived Notion page.
    // Confirm by ID before marking any known item deleted.
    for (const link of this.db.links.filter(l => l.targetId === target.id && !l.deleted && !seen.has(l.externalId))) {
      const remote = await adapter.get(target, link.externalId);
      if (remote) this.importRemote(target, remote);
      else { link.deleted = true; this.save(); }
    }
    target.lastSync = Date.now(); target.error = null; this.save();
  }
  async execute(job) {
    const target = this.db.targets.find(t => t.id === job.targetId), todo = this.db.todos.find(t => t.id === job.todoId);
    if (!target?.writeEnabled) { job.state = 'blocked'; job.error = '연결 위치의 쓰기가 꺼져 있습니다.'; this.save(); return; }
    if (!todo && job.operation !== 'delete') { job.state = 'superseded'; this.save(); return; }
    if (todo && job.operation === 'update' && job.revision < todo.revision) { job.state = 'superseded'; this.enqueue(todo); this.save(); return; }
    let link = this.db.links.find(l => l.todoId === job.todoId && l.targetId === job.targetId && (!job.linkId || l.id === job.linkId));
    if (job.operation === 'create' && link) { job.state = 'done'; if (todo) this.enqueue(todo); this.save(); return; }
    if (link?.conflict || link?.deleted) { job.state = 'blocked'; job.error = link.deleted ? '원본이 삭제되었습니다.' : '충돌을 해결해 주세요.'; this.save(); return; }
    const wasUncertain = job.state === 'uncertain';
    if (todo && job.revision !== todo.revision && !wasUncertain && job.attempts === 0) {
      job.revision = todo.revision; job.payload = structuredClone(todo);
    }
    job.state = 'running'; job.attempts++; this.save();
    let mayHaveWritten = false;
    try {
      const adapter = this.adapter(target);
      let result;
      if (job.operation === 'create') {
        result = await adapter.recover(target, job.todoId);
        if (!result) {
          if (wasUncertain && target.provider === 'notion') throw new ApiError('Notion 생성 결과가 불명확합니다. 앱 ID 속성으로 원본을 확인한 뒤 다시 확인해 주세요.', 409);
          if (todo && this.effectiveTeam(todo) !== target.teamId) throw new ApiError('조직이 변경되었습니다. 목적지를 다시 선택해 주세요.');
          this.connection(target.connectionId);
          if (!target.writeEnabled || !this.db.teams.some(t => t.id === target.teamId)) throw new ApiError('조직과 연결 위치를 확인해 주세요.');
          mayHaveWritten = true;
          result = await adapter.create(target, job.payload);
        }
        if (result.deleted) throw new ApiError('이 할 일의 원본은 이미 삭제되었습니다. 새로 생성하지 않습니다.', 409);
        if (result.inScope === false) { const excluded = this.linkRemote(todo || job.payload, target, result, job.payload); this.exclude(excluded); job.state = 'done'; return; }
      } else {
        if (!link) throw new ApiError('원본 연결이 없습니다.');
        const remote = await adapter.get(target, link.externalId);
        if (remote?.inScope === false) { this.exclude(link); job.state = 'superseded'; return; }
        if (!remote || remote.deleted) {
          link.deleted = true;
          if (job.operation === 'delete') { job.state = 'done'; this.save(); return; }
          throw new ApiError('원본이 삭제되었거나 접근할 수 없습니다.', 409);
        }
        if (remote.writable === false) throw new ApiError('반복 일정은 원본 캘린더에서 수정해 주세요.', 409);
        if (this.remoteChanged(link, remote)) {
          // A lost update response can be reconciled by comparing projected fields.
          const matches = Object.entries(remote.data).every(([k, v]) => (job.payload[k] ?? null) === v);
          if (job.operation === 'update' && matches) result = remote;
          else { link.conflict = { message: '전송 전에 원본이 변경되었습니다.', remote: remote.data }; throw new ApiError(link.conflict.message, 409); }
        }
        if (!result) {
          this.connection(target.connectionId);
          if (!target.writeEnabled) throw new ApiError('이 위치의 쓰기가 중지되었습니다.');
          mayHaveWritten = true;
          if (job.operation === 'delete') { await adapter.remove(target, remote); link.deleted = true; }
          else result = await adapter.update(target, job.payload, remote);
        }
      }
      if (result) {
        // Retain a link even if a user deleted the local item during a network request.
        this.linkRemote(todo || job.payload, target, result, job.payload);
        if (todo) { todo.routing = null; if (todo.revision !== job.revision) this.enqueue(todo); }
      }
      job.state = 'done'; job.error = null;
    } catch (e) {
      const uncertain = job.operation === 'create' && (wasUncertain || (mayHaveWritten && (!e.status || e.status >= 500 || [409, 412].includes(e.status))));
      job.state = uncertain ? 'uncertain' : [401, 403, 409, 412].includes(e.status) ? 'blocked' : 'error';
      job.error = safeError(e); job.nextAttemptAt = Date.now() + Math.min(3600000, 15000 * 2 ** Math.min(job.attempts, 8));
    } finally { this.save(); }
  }
  async cycle({ pull = false } = {}) {
    if (this.busy) return;
    this.busy = true;
    try {
      if (pull) for (const target of this.db.targets.filter(t => t.readEnabled && this.db.connections.some(c => c.id === t.connectionId && c.enabled))) {
        try { await this.pull(target); } catch (e) { target.error = safeError(e); this.save(); }
      }
      for (const todo of [...this.db.todos]) {
        if (todo.routing?.state === 'classifying') todo.routing.state = 'pending';
        if (todo.routing?.state === 'pending' && !this.db.links.some(l => l.todoId === todo.id) && !this.db.jobs.some(j => j.todoId === todo.id && !['superseded', 'done'].includes(j.state))) await this.route(todo);
      }
      for (const job of [...this.db.jobs]) if (['pending', 'error', 'uncertain'].includes(job.state) && (job.nextAttemptAt || 0) <= Date.now() && (job.attempts < 6 || job.state === 'pending')) await this.execute(job);
    } finally { this.busy = false; }
  }
  async addConnection(provider, credentials, identity) {
    let c = this.db.connections.find(c => c.provider === provider && c.accountId === identity.accountId);
    // Preserve target IDs when upgrading a legacy Notion connection with the same token.
    if (!c && provider === 'notion') c = this.db.connections.find(c => c.provider === provider && c.credentials && this.store.unseal(c.credentials).accessToken === credentials.accessToken);
    if (!c) { c = { id: id(), provider, accountId: identity.accountId }; this.db.connections.push(c); }
    Object.assign(c, { accountId: identity.accountId, workspaceId: identity.workspaceId || c.workspaceId || null, label: identity.label, credentials: this.store.seal(credentials), enabled: true }); this.save(); return c.id;
  }
  async action(p) {
    if (p.action === 'connect-notion') {
      const credentials = { accessToken: String(p.token || '').trim() };
      if (!credentials.accessToken) throw new ApiError('Notion 토큰을 입력해 주세요.');
      const identity = await this.providers.notion.adapter(credentials, () => {}, this.config).identity();
      await this.addConnection('notion', credentials, identity);
    } else if (p.action === 'connect-apple') {
      const credentials = { username: String(p.username || '').trim(), password: String(p.password || '').trim() };
      if (!credentials.username || !credentials.password) throw new ApiError('Apple 계정과 앱 암호를 입력해 주세요.');
      await this.providers.apple.adapter(credentials).containers();
      await this.addConnection('apple', credentials, { accountId: credentials.username.toLowerCase(), label: credentials.username });
    } else if (p.action === 'oauth-start') return { ok: true, url: this.oauthStart(p.provider) };
    else if (p.action === 'containers') return { ok: true, containers: await this.adapter({ connectionId: p.connectionId }).containers() };
    else if (p.action === 'notion-users') {
      if (this.connection(p.connectionId).provider !== 'notion') throw new ApiError('Notion 연결을 선택해 주세요.');
      return { ok: true, users: await this.adapter({ connectionId: p.connectionId }).users() };
    }
    else if (p.action === 'disconnect') {
      const c = this.connection(p.connectionId); c.enabled = false; c.credentials = null;
      for (const t of this.db.targets.filter(t => t.connectionId === c.id)) { t.readEnabled = false; t.writeEnabled = false; t.autoRoute = false; }
    } else if (p.action === 'duplicate-candidates') return this.duplicates.candidates(p.todoId, p.offset);
    else if (['merge-duplicates', 'different-duplicates'].includes(p.action)) this.duplicates.decide(p);
    else if (p.action === 'save-target') await this.saveTarget(p);
    else if (p.action === 'target-toggle') {
      const t = this.db.targets.find(t => t.id === p.targetId); if (!t) throw new ApiError('연결 위치가 없습니다.');
      if (p.enabled) throw new ApiError('계정에서 위치를 다시 선택하여 연결해 주세요.');
      t.readEnabled = false; t.writeEnabled = false; t.autoRoute = false;
    } else if (p.action === 'run') { void this.cycle({ pull: true }); }
    else if (p.action === 'retry') {
      const j = this.db.jobs.find(j => j.id === p.jobId); if (!j || j.state === 'running' || j.state === 'done') throw new ApiError('재시도할 작업이 없습니다.');
      j.state = j.state === 'uncertain' ? 'uncertain' : 'pending'; j.attempts = 0; j.nextAttemptAt = 0;
    } else if (p.action === 'route') {
      const todo = this.db.todos.find(t => t.id === p.todoId); if (!todo) throw new ApiError('할 일이 없습니다.');
      if (this.db.links.some(l => l.todoId === todo.id)) throw new ApiError('기존 원본이 있는 일은 새로 분배하지 않습니다.');
      if (this.db.jobs.some(j => j.todoId === todo.id && ['running', 'uncertain'].includes(j.state))) throw new ApiError('이전 전송 결과를 먼저 확인해 주세요.');
      if (p.targetId) {
        const t = this.db.targets.find(t => t.id === p.targetId && t.writeEnabled && t.teamId === this.effectiveTeam(todo));
        if (!t) throw new ApiError('이 조직의 쓰기 가능한 위치를 선택해 주세요.');
        if (todo.date || t.provider !== 'notion') schedule(todo, t.defaultMinutes);
        for (const j of this.db.jobs.filter(j => j.todoId === todo.id)) j.state = 'superseded';
        todo.routing = { state: 'pending', targetId: t.id, reason: '직접 선택한 목적지' }; this.enqueue(todo, 'create', t.id);
      } else { for (const j of this.db.jobs.filter(j => j.todoId === todo.id)) j.state = 'superseded'; todo.routing = { state: 'pending', reason: '자동 분류 대기' }; }
    } else if (p.action === 'resolve') await this.resolve(p);
    else if (p.action === 'delete-remote') {
      const todo = this.db.todos.find(t => t.id === p.todoId); if (!todo) throw new ApiError('할 일이 없습니다.');
      const links = this.db.links.filter(l => l.todoId === todo.id);
      if (links.length > 1 && !p.linkId) throw new ApiError('삭제할 원본을 선택해 주세요.');
      const link = links.find(l => !p.linkId || l.id === p.linkId);
      if (!link || !this.db.targets.some(t => t.id === link.targetId && t.writeEnabled)) throw new ApiError('쓰기 가능한 원본 연결이 없습니다.');
      this.enqueue(todo, 'delete', link.targetId, link.id);
    } else throw new ApiError('지원하지 않는 작업입니다.');
    this.save(); return { ok: true, ...this.state() };
  }
  async resolve(p) {
    const todo = this.db.todos.find(t => t.id === p.todoId), link = this.db.links.find(l => l.todoId === p.todoId && (p.linkId ? l.id === p.linkId : l.conflict));
    if (!todo || !link?.conflict) throw new ApiError('해결할 충돌이 없습니다.');
    const target = this.db.targets.find(t => t.id === link.targetId);
    const remote = await this.adapter(target).get(target, link.externalId);
    if (!remote || remote.deleted) throw new ApiError('원본을 찾을 수 없습니다.');
    if (p.choice === 'remote') { Object.assign(todo, remote.data); todo.revision++; todo.updatedAt = Date.now(); this.linkRemote(todo, target, remote); }
    else if (p.choice === 'local') { link.remoteBase = remote.data; link.version = remote.version; link.conflict = null; todo.revision++; this.enqueue(todo, 'update', target.id, link.id); }
    else throw new ApiError('앱 또는 원본을 선택해 주세요.');
    for (const j of this.db.jobs.filter(j => j.todoId === todo.id && j.targetId === target.id && (!j.linkId || j.linkId === link.id) && j.state !== 'running' && j.revision < todo.revision)) j.state = 'superseded';
  }
  async saveTarget(p) {
    if (this.busy) throw new ApiError('동기화가 끝난 뒤 연결 설정을 저장해 주세요.', 409);
    const c = this.connection(p.connectionId), adapter = this.adapter({ connectionId: c.id });
    const container = (await adapter.containers()).find(x => x.id === p.containerId);
    if (!container) throw new ApiError('계정에서 접근할 수 있는 위치를 선택해 주세요.');
    if (this.db.targets.some(t => t.provider === c.provider && t.containerId === container.id && t.connectionId !== c.id && t.readEnabled)) throw new ApiError('같은 위치가 다른 계정으로 이미 연결되어 있습니다. 기존 연결을 사용하거나 먼저 중지해 주세요.');
    if (!this.db.teams.some(t => t.id === p.teamId)) throw new ApiError('조직을 먼저 만들고 선택해 주세요.');
    if (p.writeEnabled && !container.writable) throw new ApiError('이 캘린더는 읽기 전용입니다.');
    const mapping = p.mapping || {};
    const previous = this.db.targets.find(t => t.connectionId === c.id && t.containerId === container.id);
    let assigneeFilter = previous?.assigneeFilter || null;
    if (c.provider === 'notion') {
      const props = await adapter.schema(container.id), prop = (key, types, required) => { const found = props.find(x => x.id === mapping[key]); if ((required || mapping[key]) && (!found || !types.includes(found.type))) throw new ApiError(`Notion ${key} 속성을 선택해 주세요.`); return found; };
      prop('title', ['title'], true); prop('date', ['date']); prop('notes', ['rich_text']); prop('appId', ['rich_text'], !!p.writeEnabled);
      const status = prop('status', ['checkbox', 'status', 'select']);
      if (mapping.notes && mapping.notes === mapping.appId) throw new ApiError('메모와 앱 ID는 서로 다른 속성을 선택해 주세요.');
      if (status) { mapping.statusType = status.type; if (status.type !== 'checkbox' && p.writeEnabled && (!status.options.some(o => o.name === mapping.doneValue) || !status.options.some(o => o.name === mapping.todoValue) || mapping.doneValue === mapping.todoValue)) throw new ApiError('완료와 미완료 상태를 서로 다르게 선택해 주세요.'); }
      if (Object.hasOwn(p, 'assigneeFilter')) {
        assigneeFilter = null;
        if (p.assigneeFilter !== null) {
          const f = p.assigneeFilter;
          if (!f || !props.some(x => x.id === f.propertyId && x.type === 'people')) throw new ApiError('Notion 담당자(사람) 속성을 선택해 주세요.');
          if (typeof f.userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(f.userId)) throw new ApiError('본인의 Notion 계정을 선택해 주세요.');
          const user = await adapter.user(f.userId);
          assigneeFilter = { propertyId: f.propertyId, userId: user.id, userName: user.label };
        }
      }
    }
    if (this.busy) throw new ApiError('동기화가 끝난 뒤 연결 설정을 저장해 주세요.', 409);
    let target = this.db.targets.find(t => t.connectionId === c.id && t.containerId === container.id);
    if (target && target.teamId !== p.teamId && this.db.links.some(l => l.targetId === target.id)) throw new ApiError('이미 가져온 위치의 조직은 변경할 수 없습니다. 기존 항목을 먼저 정리해 주세요.');
    if (!target) target = { id: id() };
    const timeZone = p.timeZone || container.timeZone || this.config.timeZone;
    if (!DateTime.now().setZone(timeZone).isValid) throw new ApiError('시간대를 확인해 주세요.');
    const types = Array.isArray(p.taskTypes) ? p.taskTypes.filter(x => taskTypes.includes(x)) : c.provider === 'notion' ? ['deadline', 'task'] : ['meeting', 'personal'];
    if (!types.length) throw new ApiError('한 가지 이상의 업무 종류를 선택해 주세요.');
    Object.assign(target, { connectionId: c.id, provider: c.provider, containerId: container.id, label: container.label, teamId: p.teamId, mapping, readEnabled: true, writeEnabled: !!p.writeEnabled, autoRoute: !!p.autoRoute && !!p.writeEnabled, taskTypes: types, isDefault: !!p.isDefault, timeZone, defaultMinutes: Math.max(5, Math.min(480, Number(p.defaultMinutes) || 60)) });
    if (c.provider === 'notion') target.assigneeFilter = assigneeFilter;
    if (!this.db.targets.includes(target)) this.db.targets.push(target);
    if (target.isDefault) for (const other of this.db.targets) if (other !== target && other.teamId === target.teamId && other.taskTypes.some(t => types.includes(t))) other.isDefault = false;
    if (c.provider === 'notion') {
      // Recheck known pages as well as the filtered query; keep data and links for reassignment.
      for (const link of this.db.links.filter(l => l.targetId === target.id)) {
        if (assigneeFilter) this.exclude(link);
        else link.excluded = false;
      }
      target.lastSync = null;
    }
    for (const link of this.db.links.filter(l => l.targetId === target.id && !l.deleted)) {
      const todo = this.db.todos.find(t => t.id === link.todoId);
      if (todo && this.localChanged(todo, link)) this.enqueue(todo);
    }
  }
  oauthStart(provider) {
    if (!['google', 'notion'].includes(provider)) throw new ApiError('OAuth 공급자가 올바르지 않습니다.');
    const clientId = this.config[provider + 'ClientId'];
    if (!clientId || !this.config[provider + 'ClientSecret'] || !this.config.publicUrl) throw new ApiError('서버의 OAuth 클라이언트와 PUBLIC_URL을 설정해 주세요.');
    const state = id() + id();
    const redirect = `${this.config.publicUrl}/oauth/${provider}/callback`;
    this.db.oauth = this.db.oauth.filter(x => x.expires > Date.now());
    this.db.oauth.push({ stateHash: hash(state), provider, redirect, expires: Date.now() + 600000 }); this.save();
    const u = new URL(provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://api.notion.com/v1/oauth/authorize');
    for (const [k, v] of Object.entries({ client_id: clientId, redirect_uri: redirect, response_type: 'code', state })) u.searchParams.set(k, v);
    if (provider === 'google') { u.searchParams.set('scope', 'openid email https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/calendar.events'); u.searchParams.set('access_type', 'offline'); u.searchParams.set('prompt', 'consent select_account'); }
    else u.searchParams.set('owner', 'user');
    return u.toString();
  }
  async callback(provider, params) {
    const pending = this.db.oauth.find(s => s.provider === provider && s.stateHash === hash(params.get('state') || '') && s.expires > Date.now());
    if (!pending) throw new ApiError('인증 요청이 만료되었습니다. 앱에서 다시 연결해 주세요.');
    this.db.oauth = this.db.oauth.filter(s => s !== pending); this.save();
    if (!params.get('code') || params.get('error')) throw new ApiError('계정 연결이 취소되었습니다.');
    if (provider === 'google') {
      const d = await json('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code: params.get('code'), client_id: this.config.googleClientId, client_secret: this.config.googleClientSecret, redirect_uri: pending.redirect, grant_type: 'authorization_code' }) });
      const scopes = String(d.scope || '').split(' ');
      if (!scopes.includes('https://www.googleapis.com/auth/calendar.events') || !scopes.includes('https://www.googleapis.com/auth/calendar.calendarlist.readonly')) throw new ApiError('캘린더 목록과 일정 읽기·쓰기 권한을 모두 허용해 주세요.');
      const user = await json('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${d.access_token}` } });
      const old = this.db.connections.find(c => c.provider === 'google' && c.accountId === user.sub);
      const refreshToken = d.refresh_token || (old?.credentials && this.store.unseal(old.credentials).refreshToken);
      if (!refreshToken) throw new ApiError('오프라인 접근 권한이 필요합니다. Google 연결을 다시 승인해 주세요.');
      await this.addConnection('google', { accessToken: d.access_token, refreshToken, expiresAt: Date.now() + d.expires_in * 1000 }, { accountId: user.sub, label: user.email || 'Google' });
    } else {
      const d = await json('https://api.notion.com/v1/oauth/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${this.config.notionClientId}:${this.config.notionClientSecret}`).toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'authorization_code', code: params.get('code'), redirect_uri: pending.redirect }) });
      await this.addConnection('notion', { accessToken: d.access_token, refreshToken: d.refresh_token }, { accountId: d.bot_id || d.workspace_id, workspaceId: d.workspace_id, label: d.workspace_name || 'Notion' });
    }
  }
}
module.exports = { Integrations };
