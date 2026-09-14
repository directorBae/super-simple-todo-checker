const { json, ApiError, schedule, DateTime } = require('./common');
const VERSION = '2025-09-03';
const rich = value => {
  const chars = Array.from(String(value || '')), out = [];
  for (let i = 0; i < chars.length; i += 1900) out.push({ type: 'text', text: { content: chars.slice(i, i + 1900).join('') } });
  return out;
};
const text = value => (value || []).map(x => x.plain_text ?? x.text?.content ?? '').join('');
function adapter(credentials, persistCredentials, config) {
  async function request(endpoint, method = 'GET', body, refreshed = false) {
    try {
      return await json('https://api.notion.com/v1/' + endpoint, { method, headers: { Authorization: `Bearer ${credentials.accessToken}`, 'Notion-Version': VERSION, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    } catch (e) {
      if (e.status !== 401 || !credentials.refreshToken || refreshed) throw e;
      const result = await json('https://api.notion.com/v1/oauth/token', { method: 'POST', headers: { Authorization: 'Basic ' + Buffer.from(`${config.notionClientId}:${config.notionClientSecret}`).toString('base64'), 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: credentials.refreshToken }) });
      credentials.accessToken = result.access_token; credentials.refreshToken = result.refresh_token || credentials.refreshToken; persistCredentials(credentials);
      return request(endpoint, method, body, true);
    }
  }
  async function paginate(endpoint, body) {
    const items = []; let cursor;
    do { const d = await request(endpoint, 'POST', { ...body, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }); items.push(...d.results); cursor = d.has_more ? d.next_cursor : null; } while (cursor);
    return items;
  }
  async function getPages(endpoint) {
    const items = []; let cursor;
    do {
      const query = new URLSearchParams({ page_size: '100', ...(cursor ? { start_cursor: cursor } : {}) });
      const d = await request(`${endpoint}?${query}`);
      items.push(...d.results); cursor = d.has_more ? d.next_cursor : null;
    } while (cursor);
    return items;
  }
  async function inScope(page, target) {
    const filter = target.assigneeFilter;
    if (!filter || page.archived || page.in_trash) return true;
    const property = Object.values(page.properties || {}).find(p => p.id === filter.propertyId) || page.properties?.[filter.propertyId];
    if (!property || property.type !== 'people') throw new ApiError('Notion 담당자 속성이 변경되었습니다. 연결 설정을 확인해 주세요.');
    if (property.people.some(p => p.id === filter.userId)) return true;
    if (property.people.length < 25) return false;
    const people = await getPages(`pages/${encodeURIComponent(page.id)}/properties/${encodeURIComponent(filter.propertyId)}`);
    return people.some(p => p.people?.id === filter.userId);
  }
  function parse(page, target) {
    const m = target.mapping, props = page.properties || {};
    const prop = key => Object.values(props).find(x => x.id === m[key]) || props[m[key]];
    const dt = prop('date')?.date;
    const status = prop('status');
    let dates = { date: null, endDate: null, startTime: null, endTime: null, timeZone: target.timeZone };
    if (dt?.start) {
      const hasTime = dt.start.includes('T');
      const a = DateTime.fromISO(dt.start, { zone: target.timeZone });
      const b = dt.end ? DateTime.fromISO(dt.end, { zone: target.timeZone }) : null;
      if (!a.isValid || (b && !b.isValid)) throw new ApiError('Notion 날짜를 읽을 수 없습니다.');
      dates = { date: a.toISODate(), endDate: b?.toISODate() || null, startTime: hasTime ? a.toFormat('HH:mm') : null, endTime: hasTime && b ? b.toFormat('HH:mm') : null, timeZone: target.timeZone };
    }
    return { externalId: page.id, version: page.last_edited_time, deleted: !!(page.archived || page.in_trash), url: page.url, appId: text(prop('appId')?.rich_text), data: { title: text(prop('title')?.title) || '(제목 없음)', ...(m.notes ? { notes: text(prop('notes')?.rich_text) } : {}), ...(m.date ? dates : {}), ...(m.status ? { status: status?.type === 'checkbox' ? (status.checkbox ? 'done' : 'todo') : ((status?.[status.type]?.name === m.doneValue) ? 'done' : 'todo') } : {}) }, raw: page };
  }
  function properties(todo, target) {
    const m = target.mapping, props = { [m.title]: { title: rich(todo.title) } };
    if (m.notes) props[m.notes] = { rich_text: rich(todo.notes) };
    if (m.appId) props[m.appId] = { rich_text: rich(todo.id) };
    if (m.date) {
      let date = null;
      if (todo.date) {
        const s = schedule(todo, target.defaultMinutes);
        date = todo.startTime ? { start: s.start.dateTime, end: s.end.dateTime } : { start: todo.date, ...(todo.endDate && todo.endDate !== todo.date ? { end: todo.endDate } : {}) };
      }
      props[m.date] = { date };
    }
    if (m.status) {
      props[m.status] = m.statusType === 'checkbox' ? { checkbox: todo.status === 'done' } : { [m.statusType]: { name: todo.status === 'done' ? m.doneValue : m.todoValue } };
    }
    return props;
  }
  return {
    async identity() { const d = await request('users/me'); return { accountId: d.id, workspaceId: d.bot?.workspace_id || null, label: [d.bot?.workspace_name, d.name].filter(Boolean).join(' · ') || 'Notion' }; },
    async users() {
      try { return (await getPages('users')).filter(u => u.type === 'person').map(u => ({ id: u.id, label: u.name || u.person?.email || u.id, email: u.person?.email || '' })); }
      catch (e) { if (e.status === 403) throw new ApiError('Notion 연결 설정에서 사용자 정보 읽기 권한을 허용한 뒤 다시 불러와 주세요.', 403); throw e; }
    },
    async user(userId) { const u = await request(`users/${encodeURIComponent(userId)}`); if (u.type !== 'person') throw new ApiError('봇이 아닌 본인의 Notion 계정을 선택해 주세요.'); return { id: u.id, label: u.name || u.person?.email || u.id }; },
    async containers() {
      return (await paginate('search', { filter: { value: 'data_source', property: 'object' } })).map(d => ({ id: d.id, label: text(d.title) || '이름 없는 데이터베이스', databaseId: d.parent?.database_id, writable: true, properties: Object.values(d.properties || {}).map(p => ({ id: p.id, name: p.name, type: p.type, options: p[p.type]?.options || [] })) }));
    },
    async schema(containerId) { const d = await request(`data_sources/${encodeURIComponent(containerId)}`); return Object.values(d.properties).map(p => ({ id: p.id, name: p.name, type: p.type, options: p[p.type]?.options || [] })); },
    async list(target) {
      const f = target.assigneeFilter;
      return (await paginate(`data_sources/${encodeURIComponent(target.containerId)}/query`, f ? { filter: { property: f.propertyId, people: { contains: f.userId } } } : {})).map(p => parse(p, target));
    },
    async get(target, externalId) { try { const page = await request(`pages/${encodeURIComponent(externalId)}`); return { ...parse(page, target), inScope: await inScope(page, target) }; } catch (e) { if (e.status === 404) return null; throw e; } },
    async recover(target, todoId) {
      if (!target.mapping.appId) throw new ApiError('Notion 중복 복구용 텍스트 속성을 선택해 주세요.');
      const found = await paginate(`data_sources/${encodeURIComponent(target.containerId)}/query`, { filter: { property: target.mapping.appId, rich_text: { equals: todoId } } });
      if (found.length > 1) throw new ApiError('Notion에 같은 앱 ID가 여러 개 있습니다. 중복을 정리해 주세요.', 409);
      return found.length ? { ...parse(found[0], target), inScope: await inScope(found[0], target) } : null;
    },
    async create(target, todo) {
      const props = properties(todo, target), f = target.assigneeFilter;
      if (f) props[f.propertyId] = { people: [{ object: 'user', id: f.userId }] };
      return parse(await request('pages', 'POST', { parent: { type: 'data_source_id', data_source_id: target.containerId }, properties: props }), target);
    },
    async update(target, todo, remote) {
      const all = properties(todo, target), patch = {}, m = target.mapping;
      if (todo.title !== remote.data.title) patch[m.title] = all[m.title];
      if (m.notes && (todo.notes || '') !== (remote.data.notes || '')) patch[m.notes] = all[m.notes];
      if (m.status && todo.status !== remote.data.status) patch[m.status] = all[m.status];
      if (m.date && ['date', 'endDate', 'startTime', 'endTime'].some(k => (todo[k] || null) !== (remote.data[k] || null))) patch[m.date] = all[m.date];
      if (!Object.keys(patch).length) return remote;
      return parse(await request(`pages/${encodeURIComponent(remote.externalId)}`, 'PATCH', { properties: patch }), target);
    },
    async remove(target, remote) { await request(`pages/${encodeURIComponent(remote.externalId)}`, 'PATCH', { in_trash: true }); },
  };
}
module.exports = { adapter };
