// ChatGPT (and any MCP client) talks to the person's to-dos here: a remote MCP server (streamable HTTP, JSON responses)
// at /mcp/<key>. The key is the person's own secret link, made in the app (설정 → 도구 연결 → ChatGPT) and stored only
// as a hash; it can be cut off there any time. What the tools write goes straight into Supabase, so the desktop, the
// web and the phone pick it up within seconds like any other change.
import { db, eq } from './db.js';
import { HttpError, localDate, addDays } from './http.js';

export const PROTOCOL = '2025-06-18';
const MAX_ADD = 50;
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const sha256 = async (text) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map((b) => b.toString(16).padStart(2, '0')).join('');
const newKey = () => { const b = crypto.getRandomValues(new Uint8Array(24)); return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
export const linkUrl = (env, key) => env.SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1/integrations/mcp/' + key;

// ---- the app's side: make, list and cut off the person's links ----
export async function createLink(env, userId, label) {
  const key = newKey();
  const [row] = await db(env).insert('mcp_tokens', [{ user_id: userId, token_hash: await sha256(key), label: String(label || 'ChatGPT').slice(0, 40) }]);
  return { id: row.id, label: row.label, url: linkUrl(env, key) }; // the only time the key is shown
}
export const listLinks = (env, userId) => db(env).select('mcp_tokens', `user_id=${eq(userId)}&revoked_at=is.null&select=id,label,created_at,last_used_at&order=created_at.desc`);
export const revokeLink = (env, userId, id) => db(env).update('mcp_tokens', `user_id=${eq(userId)}&id=${eq(id)}`, { revoked_at: new Date(env.now()).toISOString() });

// ---- the tools ----
// Like the app (desktop/electron/todo-title.cjs): titles stay within 50 characters, the full text goes to the notes.
function titleFields(title, notes = '') {
  const original = String(title || '').trim(), clean = original.replace(/\s+/g, ' '), chars = Array.from(clean);
  if (chars.length <= 50) return { title: clean, notes };
  const source = `원문: ${original}`;
  return { title: chars.slice(0, 49).join('').trimEnd() + '…', notes: [notes, source].filter(Boolean).join('\n\n') };
}
const dateArg = { type: 'string', description: 'YYYY-MM-DD (the person\'s own calendar day)' };
const timeArg = { type: 'string', description: 'HH:MM, 24-hour' };
export const TOOLS = [
  { name: 'list_teams', title: '팀 목록', description: 'The teams (groups) the person files to-dos under. Use these names for `team`.', inputSchema: { type: 'object', properties: {} }, annotations: { readOnlyHint: true } },
  {
    name: 'list_todos', title: '할 일 보기',
    description: 'The to-dos between two days (default: today and the 6 days after), with their ids, dates, times, teams and whether they are done. Call this before changing or deleting one.',
    inputSchema: { type: 'object', properties: { from: dateArg, to: dateArg, include_done: { type: 'boolean', description: 'Also list finished ones (default true).' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'add_todos', title: '할 일 추가',
    description: 'Add to-dos to the person\'s to-do app (체커). One call can add a whole plan. Keep each title short (it is cut at 50 characters, the full text is kept as a note). A to-do already there with the same title on the same day is skipped.',
    inputSchema: {
      type: 'object', required: ['todos'],
      properties: { todos: { type: 'array', maxItems: MAX_ADD, items: { type: 'object', required: ['title'], properties: {
        title: { type: 'string' }, date: { ...dateArg, description: 'YYYY-MM-DD; default today' }, start_time: timeArg, end_time: timeArg,
        team: { type: 'string', description: 'A team name from list_teams (optional)' }, notes: { type: 'string' },
      } } } },
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'update_todo', title: '할 일 고치기',
    description: 'Change one to-do (id from list_todos): title, day, times, team, or mark it done / not done. Send only what changes; null clears a time or the team.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' }, title: { type: 'string' }, date: dateArg, start_time: { type: ['string', 'null'] }, end_time: { type: ['string', 'null'] }, team: { type: ['string', 'null'] }, done: { type: 'boolean' } } },
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: 'delete_todo', title: '할 일 지우기', description: 'Delete one to-do (id from list_todos). Ask the person first.',
    inputSchema: { type: 'object', required: ['id'], properties: { id: { type: 'string' } } },
    annotations: { readOnlyHint: false, destructiveHint: true },
  },
];

const bad = (message) => { const e = new Error(message); e.toolError = true; throw e; };
const line = (t, teams) => `${t.id} | ${t.date || '날짜 없음'}${t.start_time ? ' ' + t.start_time + (t.end_time ? '~' + t.end_time : '') : ''} | ${t.status === 'done' ? '✓ ' : ''}${t.title}${t.team_id && teams.get(t.team_id) ? ' | ' + teams.get(t.team_id) : ''}`;

async function callTool(env, user, name, args = {}) {
  const store = db(env), now = env.now();
  const [prefs] = await store.select('user_prefs', `user_id=${eq(user)}&select=time_zone`);
  const zone = prefs?.time_zone || env.TIME_ZONE, today = localDate(now, zone);
  const teamRows = await store.select('teams', `user_id=${eq(user)}&deleted_at=is.null&select=id,name,color&order=created_at.asc`);
  const teams = new Map(teamRows.map((t) => [t.id, t.name]));
  const teamId = (name) => {
    if (name === null || name === undefined || name === '') return null;
    const want = String(name).trim().toLowerCase(), t = teamRows.find((x) => x.name.trim().toLowerCase() === want);
    if (!t) bad(`"${name}" 팀이 없어요. 있는 팀: ${teamRows.map((x) => x.name).join(', ') || '(없음)'}`);
    return t.id;
  };
  const time = (v, field) => { if (v === null || v === undefined || v === '') return null; if (!TIME.test(v)) bad(`${field}은(는) HH:MM 형식이어야 해요.`); return v; };
  const day = (v, fallback) => { if (!v) return fallback; if (!DATE.test(v)) bad('날짜는 YYYY-MM-DD 형식이어야 해요.'); return v; };

  if (name === 'list_teams') {
    return { text: teamRows.length ? teamRows.map((t) => t.name).join('\n') : '팀이 없어요.', data: { teams: teamRows.map((t) => ({ name: t.name, color: t.color })) } };
  }
  if (name === 'list_todos') {
    const from = day(args.from, today), to = day(args.to, addDays(from, 6));
    const rows = await store.select('todos', `user_id=${eq(user)}&deleted_at=is.null&status=neq.bucket&date=gte.${from}&date=lte.${to}${args.include_done === false ? '&status=eq.todo' : ''}&select=id,title,date,start_time,end_time,status,team_id&order=date.asc,start_time.asc.nullslast`);
    return { text: rows.length ? `${from} ~ ${to} (${rows.length}건)\n` + rows.map((t) => line(t, teams)).join('\n') : `${from} ~ ${to}에는 할 일이 없어요.`, data: { from, to, todos: rows.map((t) => ({ id: t.id, title: t.title, date: t.date, start_time: t.start_time, end_time: t.end_time, done: t.status === 'done', team: teams.get(t.team_id) || null })) } };
  }
  if (name === 'add_todos') {
    const items = Array.isArray(args.todos) ? args.todos : [];
    if (!items.length) bad('추가할 할 일이 없어요.');
    if (items.length > MAX_ADD) bad(`한 번에 ${MAX_ADD}개까지 넣을 수 있어요.`);
    const prepared = items.map((it) => {
      if (!String(it?.title || '').trim()) bad('제목이 빈 할 일이 있어요.');
      const date = day(it.date, today), start = time(it.start_time, 'start_time'), end = time(it.end_time, 'end_time');
      return { ...titleFields(it.title, String(it.notes || '')), date, start, end: start ? end : null, team: teamId(it.team) };
    });
    const days = [...new Set(prepared.map((p) => p.date))];
    const there = await store.select('todos', `user_id=${eq(user)}&deleted_at=is.null&date=in.(${days.join(',')})&select=title,date`);
    const seen = new Set(there.map((t) => t.date + '|' + t.title.trim()));
    const rows = [], skipped = [];
    for (const p of prepared) {
      if (seen.has(p.date + '|' + p.title)) { skipped.push(p); continue; }
      seen.add(p.date + '|' + p.title);
      rows.push({
        id: crypto.randomUUID(), user_id: user, title: p.title, notes: p.notes, date: p.date, end_date: null, start_time: p.start, end_time: p.end,
        time_zone: zone, team_id: p.team, project_id: null, status: 'todo', sort_order: null, important: false, channel: null, completed_at: null,
        created_at: now + rows.length, updated_at: now + rows.length, deleted_at: null, extra: { kind: 'todo' }, origin: { type: 'app', via: 'chatgpt' },
      });
    }
    if (rows.length) await store.insert('todos', rows);
    const text = [rows.length ? `${rows.length}건을 넣었어요.\n` + rows.map((t) => line(t, teams)).join('\n') : '새로 넣은 할 일이 없어요.', skipped.length ? `이미 있어서 건너뜀 ${skipped.length}건: ${skipped.map((p) => `${p.date} ${p.title}`).join(', ')}` : ''].filter(Boolean).join('\n');
    return { text, data: { added: rows.map((t) => ({ id: t.id, title: t.title, date: t.date })), skipped: skipped.map((p) => ({ title: p.title, date: p.date })) } };
  }
  if (name === 'update_todo' || name === 'delete_todo') {
    const [t] = await store.select('todos', `user_id=${eq(user)}&id=${eq(String(args.id || ''))}&deleted_at=is.null&select=*`);
    if (!t) bad('그 할 일을 찾지 못했어요. list_todos로 id를 확인해 주세요.');
    if (name === 'delete_todo') {
      await store.update('todos', 'id=' + eq(t.id), { deleted_at: now, updated_at: now });
      return { text: `지웠어요: ${t.title}`, data: { deleted: t.id } };
    }
    const patch = {};
    if ('title' in args) { if (!String(args.title || '').trim()) bad('제목을 비울 수는 없어요.'); Object.assign(patch, titleFields(args.title, t.notes || '')); }
    if ('date' in args) patch.date = day(args.date, t.date);
    if ('start_time' in args) patch.start_time = time(args.start_time, 'start_time');
    if ('end_time' in args) patch.end_time = time(args.end_time, 'end_time');
    if ('start_time' in patch && !patch.start_time) patch.end_time = null;
    if ('team' in args) patch.team_id = teamId(args.team);
    if ('done' in args) { patch.status = args.done ? 'done' : 'todo'; patch.completed_at = args.done ? now : null; }
    if (!Object.keys(patch).length) bad('바꿀 내용이 없어요.');
    const [after] = await store.update('todos', 'id=' + eq(t.id), { ...patch, updated_at: Math.max(now, Number(t.updated_at || 0) + 1) });
    return { text: '고쳤어요: ' + line(after || { ...t, ...patch }, teams), data: { id: t.id } };
  }
  bad('없는 도구예요: ' + name);
}

// ---- the MCP endpoint: JSON-RPC over HTTP POST, answered with JSON (no server-sent stream) ----
const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

async function answer(env, user, msg) {
  const { id, method, params = {} } = msg || {};
  if (id === undefined || id === null) return null; // a notification (e.g. notifications/initialized): nothing to say
  if (method === 'initialize') {
    return rpc(id, {
      protocolVersion: params.protocolVersion || PROTOCOL, capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'checker', title: '체커 할 일', version: '1.0.0' },
      instructions: '체커(Checker) is the person\'s to-do app. Use add_todos to put a plan into it (one call for the whole plan, each to-do on its own day, titles short). Dates are the person\'s local days (YYYY-MM-DD). Look up ids with list_todos before changing or deleting, and ask before deleting.',
    });
  }
  if (method === 'ping') return rpc(id, {});
  if (method === 'tools/list') return rpc(id, { tools: TOOLS });
  if (method === 'tools/call') {
    try {
      const { text, data } = await callTool(env, user, params.name, params.arguments || {});
      return rpc(id, { content: [{ type: 'text', text }], structuredContent: data });
    } catch (e) {
      if (!e.toolError) console.error('mcp tool', params.name, e);
      return rpc(id, { content: [{ type: 'text', text: e.toolError ? e.message : '처리하지 못했어요. 잠시 후 다시 시도해 주세요.' }], isError: true });
    }
  }
  return rpcError(id, -32601, 'Method not found: ' + method);
}

export async function handleMcp(env, req, key) {
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: { Allow: 'POST' } });
  const store = db(env);
  const [link] = key ? await store.select('mcp_tokens', `token_hash=${eq(await sha256(key))}&revoked_at=is.null&select=id,user_id,last_used_at`) : [];
  if (!link) throw new HttpError('이 연결 주소는 끊겼거나 올바르지 않아요. 앱에서 새로 만들어 주세요.', 401);
  // Note when it was last used (at most once a minute).
  if (!link.last_used_at || env.now() - Date.parse(link.last_used_at) > 60_000) await store.update('mcp_tokens', 'id=' + eq(link.id), { last_used_at: new Date(env.now()).toISOString() }).catch(() => {});
  const body = await req.json().catch(() => null);
  if (!body) return Response.json(rpcError(null, -32700, 'Parse error'), { status: 400 });
  const out = Array.isArray(body) ? (await Promise.all(body.map((m) => answer(env, link.user_id, m)))).filter(Boolean) : await answer(env, link.user_id, body);
  if (!out || (Array.isArray(out) && !out.length)) return new Response(null, { status: 202 });
  return Response.json(out, { headers: { 'Content-Type': 'application/json' } });
}
