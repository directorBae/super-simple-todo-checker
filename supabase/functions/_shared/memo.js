// 녹음 → 메모 → 노션. A dive is recorded on a computer in the room, sent here in pieces as it goes and written down
// by OpenAI's transcription; when the recording ends GPT sums it up (title, summary, decisions, to-dos) and the note
// goes where the team decided (회의록 저장소, one choice per team): a Notion database (or page) through the connection
// of whoever chose it, or each computer's local folder. Nothing said → no note. Kept for the team in work_memos;
// a memo can also be sent to Notion by hand.
import { HttpError, json } from './http.js';
import { db, eq } from './db.js';
import * as notion from './notion.js';

export const MEMO_DAYS = 30, CHUNK_MAX = 6 * 1024 * 1024, TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
// A recording whose pieces stopped coming this long ago (the computer went to sleep, the app died) is finished by the server.
export const MEMO_STALE_MS = 5 * 60_000;
const uuid = (s) => { const v = String(s || ''); if (!/^[0-9a-f-]{36}$/i.test(v)) throw new HttpError('항목을 찾을 수 없어요.', 404); return v; };
const iso = (ms) => new Date(ms).toISOString();
const clean = (s, max) => Array.from(String(s ?? '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');

async function activeMember(store, user, teamId) {
  const rows = await store.select('work_members', `team_id=${eq(uuid(teamId))}&user_id=${eq(user.id)}&status=eq.active&select=*`);
  if (!rows.length) throw new HttpError('이 팀의 팀원이 아니에요.', 403);
  return rows[0];
}
async function memoFor(store, user, memoId) {
  const [memo] = await store.select('work_memos', `id=${eq(uuid(memoId))}&select=*`);
  if (!memo) throw new HttpError('메모를 찾을 수 없어요.', 404);
  await activeMember(store, user, memo.team_id);
  return memo;
}
const transcriptOf = (chunks) => Object.keys(chunks || {}).map(Number).sort((a, b) => a - b).map((k) => chunks[k]).filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
const shape = (m) => ({ id: m.id, team: m.team_id, dive: m.dive_id, by: m.user_id, title: m.title, state: m.state, transcript: m.transcript, summary: m.summary, notionUrl: m.notion_url, stored: m.stored || null, createdAt: m.created_at });
// The team's store as the apps see it (no connection ids).
export const publicStore = (s) => (s && typeof s === 'object' && s.kind ? { kind: s.kind, type: s.type || null, page: s.page || null, title: s.title || null, url: s.url || null, workspace: s.workspace || null, by: s.by || null, at: s.at || null } : null);

// A piece of the recording → text (OpenAI). An empty piece (silence) is fine; a refusal is an error for the caller.
export async function transcribe(env, bytes, mime) {
  if (!env.OPENAI_API_KEY) throw new HttpError('받아쓰기(OpenAI)가 설정되지 않았어요.', 503);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: mime || 'audio/webm' }), 'piece.' + (/(mp4|m4a|aac)/.test(mime || '') ? 'mp4' : /(ogg)/.test(mime || '') ? 'ogg' : 'webm'));
  form.append('model', env.TRANSCRIBE_MODEL || TRANSCRIBE_MODEL);
  form.append('language', 'ko');
  form.append('response_format', 'json');
  const r = await json(env.fetch, 'https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY }, body: form });
  return clean(r.text || '', 20000);
}

const SUMMARY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['nothing', 'title', 'summary', 'decisions', 'todos'],
  properties: { nothing: { type: 'boolean' }, title: { type: 'string' }, summary: { type: 'string' }, decisions: { type: 'array', items: { type: 'string' } }, todos: { type: 'array', items: { type: 'string' } } },
};
const SUMMARY_RULES = `너는 팀의 다이브(음성 회의) 녹취를 회의록으로 정리하는 비서야. 한국어 녹취(자동 받아쓰기라 오타가 있을 수 있음)를 읽고 JSON으로 정리해.
- nothing: 회의라고 할 내용이 없으면 true — 침묵·잡음·인사말·마이크 테스트("들려요?")뿐이거나 받아쓴 글이 의미 없는 조각일 때. true면 회의록은 만들어지지 않으니 나머지는 빈 값으로 둬. 실제 이야기가 조금이라도 있으면 false.
- title: 20자 이내의 제목 (무슨 이야기였는지).
- summary: 3~6문장의 요약. 핵심 내용과 맥락만.
- decisions: 정해진 것들. 없으면 빈 배열.
- todos: 누가 무엇을 하기로 했는지, 한 줄씩 ("이름: 할 일" 형태, 이름을 모르면 할 일만). 없으면 빈 배열.
- 녹취에 없는 내용은 지어내지 마.`;
// Where the note goes shapes how it is written.
const STORE_RULES = {
  notion: (s) => (s.type === 'database'
    ? `이 회의록은 노션 데이터베이스 '${s.title || ''}'의 새 행(페이지)이 돼. title은 DB 목록에서 바로 알아볼 수 있게 날짜·팀 이름 없이 안건의 핵심만 담고, summary는 그 페이지 본문의 첫 문단으로 읽히게 완결된 문장으로 써. todos는 노션 체크박스가 되니 하나에 한 가지 일만.`
    : `이 회의록은 노션 페이지 '${s.title || ''}' 아래의 새 페이지가 돼. title은 페이지 제목이 되니 안건의 핵심만 담고, summary는 본문의 첫 문단으로 읽히게 완결된 문장으로 써. todos는 노션 체크박스가 되니 하나에 한 가지 일만.`),
  local: () => `이 회의록은 팀 폴더에 마크다운(.md) 파일로 저장돼. title은 파일 이름으로도 쓰이니 짧고 특수문자(/ \\ : * ? " < > |) 없이 써. summary는 파일을 열자마자 무슨 회의였는지 알 수 있게 첫 문장에 결론을 담아.`,
};
export const storeRule = (store, team) => (store && STORE_RULES[store.kind] ? `${team ? `팀: ${team}\n` : ''}${STORE_RULES[store.kind](store)}` : '');
// transcript → { nothing, title, summary, decisions, todos }. Without a key (or when GPT fails) the text itself is the summary.
export async function summarize(env, transcript, hint = '', { store = null, team = '' } = {}) {
  const fallback = { nothing: false, title: clean(hint, 20) || '메모', summary: transcript.slice(0, 600), decisions: [], todos: [] };
  if (!env.OPENAI_API_KEY || !transcript) return fallback;
  try {
    const rule = storeRule(store, team);
    const r = await json(env.fetch, 'https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL, store: false, max_output_tokens: 2000, input: [{ role: 'system', content: SUMMARY_RULES + (rule ? '\n\n' + rule : '') }, { role: 'user', content: `${hint ? '안건: ' + hint + '\n\n' : ''}녹취:\n${transcript.slice(0, 60000)}` }], text: { format: { type: 'json_schema', name: 'memo', schema: SUMMARY_SCHEMA, strict: true } } }),
    });
    const text = r.output_text || (r.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
    const out = JSON.parse(text);
    if (out.nothing === true) return { ...fallback, nothing: true, summary: '' };
    return { nothing: false, title: clean(out.title, 40) || fallback.title, summary: clean(out.summary, 2000), decisions: (out.decisions || []).map((x) => clean(x, 300)).filter(Boolean).slice(0, 30), todos: (out.todos || []).map((x) => clean(x, 300)).filter(Boolean).slice(0, 50) };
  } catch (e) {
    console.error('메모 정리(GPT) 실패, 녹취만 남깁니다:', e.message);
    return fallback;
  }
}

// ---------- the routes ----------
export async function startMemo(env, user, { team, dive, title, auto }) {
  const store = db(env), me = await activeMember(store, user, team), diveId = dive ? uuid(dive) : null;
  const other = async () => (diveId ? (await store.select('work_memos', `dive_id=${eq(diveId)}&state=eq.recording&select=id,user_id`))[0] : null);
  const taken = (o) => { if (auto) return { memo: null, recorder: o.user_id }; throw new HttpError('이미 다른 사람이 이 방을 녹음하고 있어요.', 409); };
  const o = await other(); if (o) return taken(o);
  try {
    const [memo] = await store.insert('work_memos', [{ team_id: me.team_id, dive_id: diveId, user_id: user.id, title: clean(title, 50), state: 'recording' }]);
    return { memo: shape(memo) };
  } catch (e) {
    const o2 = await other(); if (o2) return taken(o2); // two computers at the same moment: the unique index decided
    throw e;
  }
}
// A piece of the recording, in order (index), as base64. Written down at once; the memo's text grows as pieces come.
export async function addChunk(env, user, { memo: memoId, index, audio, mime }) {
  const store = db(env), memo = await memoFor(store, user, memoId);
  if (memo.state !== 'recording') throw new HttpError('이미 끝난 메모예요.', 409);
  const i = Number(index); if (!Number.isInteger(i) || i < 0 || i > 10000) throw new HttpError('조각 번호가 이상해요.');
  const b64 = String(audio || ''); if (!b64) throw new HttpError('소리가 비어 있어요.');
  if (b64.length > CHUNK_MAX * 1.4) throw new HttpError('조각이 너무 커요.', 413);
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  let text = '';
  try { text = await transcribe(env, bytes, mime); }
  catch (e) { console.error('받아쓰기 실패', memo.id, i, e.message); throw new HttpError('받아쓰지 못했어요: ' + e.message, 502); }
  const chunks = { ...(memo.chunks || {}), [i]: text };
  const [after] = await store.update('work_memos', `id=${eq(memo.id)}`, { chunks, transcript: transcriptOf(chunks), updated_at: iso(env.now()) });
  return { index: i, text, memo: shape(after || { ...memo, chunks, transcript: transcriptOf(chunks) }) };
}
// The recording is over: the whole text is summed up the way the team's store wants and the memo is done — written
// to the team's Notion DB (or page) by itself when that is the store. Nothing said (an empty room, a mic test) → no
// note: { memo: null, reason: 'empty' | 'nothing' }.
export async function finishMemo(env, user, { memo: memoId }) {
  const store = db(env), memo = await memoFor(store, user, memoId);
  if (memo.state === 'done') return { memo: shape(memo), stored: memo.stored || null };
  return finishRow(env, store, memo);
}
export async function finishRow(env, store, memo) {
  const transcript = transcriptOf(memo.chunks), [team] = await store.select('work_teams', `id=${eq(memo.team_id)}&select=name,memo_store`);
  const where = team?.memo_store || null;
  const cancel = async (reason) => { await store.remove('work_memos', `id=${eq(memo.id)}`); return { memo: null, reason }; };
  if (!transcript) return cancel('empty');
  await store.update('work_memos', `id=${eq(memo.id)}`, { state: 'summarizing', transcript, updated_at: iso(env.now()) });
  const summary = await summarize(env, transcript, memo.title, { store: where, team: team?.name });
  if (summary.nothing) return cancel('nothing');
  delete summary.nothing;
  let stored = where ? { kind: where.kind } : null, notion_url = memo.notion_url || null;
  if (where?.kind === 'notion') {
    try { const made = await toNotion(env, store, { ...memo, transcript, summary }, where); notion_url = made.url; stored = { kind: 'notion', type: where.type, title: where.title, url: made.url }; }
    catch (e) { console.error('회의록 → 노션 실패', memo.id, e.message); stored = { kind: 'notion', type: where.type, title: where.title, error: e.message }; }
  }
  const patch = { transcript, summary, title: memo.title || summary.title, state: 'done', stored, notion_url, updated_at: iso(env.now()) };
  const [after] = await store.update('work_memos', `id=${eq(memo.id)}`, patch);
  return { memo: shape(after || { ...memo, ...patch }), stored };
}
// Recordings whose pieces stopped coming (the computer slept, the app died): finished with what there is.
export async function finishStale(env, store, now) {
  const stale = await store.select('work_memos', `state=eq.recording&updated_at=lt.${iso(now - MEMO_STALE_MS)}&select=*&limit=5`).catch(() => []);
  for (const memo of stale) await finishRow(env, store, memo).catch((e) => console.error('오래된 녹음 정리 실패', memo.id, e.message));
  return stale.length;
}
export async function deleteMemo(env, user, { memo: memoId }) {
  const store = db(env), memo = await memoFor(store, user, memoId), me = await activeMember(store, user, memo.team_id);
  if (memo.user_id !== user.id && me.role !== 'owner') throw new HttpError('녹음한 사람(또는 팀을 만든 사람)만 지울 수 있어요.', 403);
  await store.remove('work_memos', `id=${eq(memo.id)}`);
  return { ok: true };
}
// The team's memos of the last MEMO_DAYS days, newest first.
export async function listMemos(env, user, { team }) {
  const store = db(env), me = await activeMember(store, user, team);
  const rows = await store.select('work_memos', `team_id=${eq(me.team_id)}&created_at=gte.${iso(env.now() - MEMO_DAYS * 86400_000)}&select=*&order=created_at.desc&limit=100`);
  return { memos: rows.map(shape) };
}

// ---------- Notion ----------
async function notionConnections(store, user) {
  return store.select('connections', `user_id=${eq(user.id)}&provider=eq.notion&select=id,secret,account,meta&order=created_at.asc`);
}
// Pages and databases the person's Notion connections can reach, for picking where a memo goes.
export async function searchNotion(env, user, { q }) {
  const store = db(env), conns = await notionConnections(store, user);
  if (!conns.length) throw new HttpError('노션이 연결되어 있지 않아요. 설정 → 도구 연결에서 노션을 연결해 주세요.', 412);
  const results = [];
  for (const c of conns) {
    const found = await notion.search(env, c.secret.access_token, clean(q, 100)).catch(() => []);
    results.push(...found.map((x) => ({ ...x, connection: c.id, workspace: c.account || c.meta?.workspace_name || null })));
  }
  return { results: results.slice(0, 60) };
}
// 회의록 저장소: one choice for the whole team — anyone in it may set or change it (so one dive makes one note, in
// one place). Notion: a database (or page) reached through this person's connection; the title is read now so it can
// be shown without asking Notion again. null clears it (no automatic recording).
export async function setMemoStore(env, user, { team, store: wanted }) {
  const store = db(env), me = await activeMember(store, user, team);
  let value = null;
  if (wanted && wanted.kind === 'local') value = { kind: 'local' };
  else if (wanted && wanted.kind === 'notion') {
    const conns = await notionConnections(store, user), conn = conns.find((c) => c.id === wanted.connection) || conns[0];
    if (!conn) throw new HttpError('노션이 연결되어 있지 않아요. 설정 → 도구 연결에서 노션을 연결해 주세요.', 412);
    const type = wanted.type === 'database' ? 'database' : 'page', id = notion.plainId(wanted.page);
    if (!/^[0-9a-f]{32}$/i.test(id)) throw new HttpError('노션 DB나 페이지를 골라 주세요.');
    const r = await notion.resource(env, conn.secret.access_token, type, id).catch(() => { throw new HttpError('그 노션 페이지에 닿지 못했어요. 노션에서 연결 권한을 준 페이지인지 확인해 주세요.', 502); });
    value = { kind: 'notion', type, page: id, title: clean(notion.titleOf({ ...r, object: r.object || type }), 80), url: r.url || null, connection: conn.id, workspace: conn.account || conn.meta?.workspace_name || null };
  } else if (wanted) throw new HttpError('저장소는 로컬 저장소나 노션 DB 중 하나예요.');
  if (value) Object.assign(value, { by: user.id, at: iso(env.now()) });
  await store.update('work_teams', `id=${eq(me.team_id)}`, { memo_store: value });
  return { store: publicStore(value) };
}
async function toNotion(env, store, memo, where) {
  const [conn] = await store.select('connections', `id=${eq(where.connection)}&provider=eq.notion&select=id,secret`);
  if (!conn) throw new HttpError('회의록 저장소로 정한 노션 연결이 끊겼어요. 저장소를 다시 정해 주세요.', 412);
  const title = where.type === 'database' ? (memo.summary?.title || memo.title || '회의록') : `${memo.title || memo.summary?.title || '회의록'} · ${new Date(memo.created_at).toLocaleDateString('ko-KR', { timeZone: env.TIME_ZONE })}`;
  return notion.createPage(env, conn.secret.access_token, { type: where.type, id: where.page }, title, memoBlocks(memo), { date: memo.created_at });
}
const text = (s) => ({ type: 'text', text: { content: String(s).slice(0, 2000) } });
const block = (type, content, extra = {}) => ({ object: 'block', type, [type]: { rich_text: [text(content)], ...extra } });
export function memoBlocks(memo) {
  const s = memo.summary || {}, out = [];
  if (s.summary) { out.push(block('heading_2', '요약')); out.push(block('paragraph', s.summary)); }
  if (s.decisions?.length) { out.push(block('heading_2', '정해진 것')); for (const d of s.decisions) out.push(block('bulleted_list_item', d)); }
  if (s.todos?.length) { out.push(block('heading_2', '할 일')); for (const t of s.todos) out.push(block('to_do', t, { checked: false })); }
  if (memo.transcript) {
    out.push(block('heading_2', '전체 기록'));
    for (const piece of memo.transcript.match(/[\s\S]{1,1900}(?:\s|$)/g) || []) out.push(block('paragraph', piece.trim()));
  }
  return out.slice(0, 400);
}
// The memo as a new page under the chosen page (or a row of the chosen database), through the chosen connection.
export async function memoToNotion(env, user, { memo: memoId, page, type, connection }) {
  const store = db(env), memo = await memoFor(store, user, memoId);
  if (memo.state !== 'done') throw new HttpError('아직 정리 중인 메모예요.', 409);
  const conns = await notionConnections(store, user), conn = conns.find((c) => c.id === connection) || conns[0];
  if (!conn) throw new HttpError('노션이 연결되어 있지 않아요.', 412);
  const title = `${memo.title || memo.summary?.title || '메모'} · ${new Date(memo.created_at).toLocaleDateString('ko-KR', { timeZone: env.TIME_ZONE })}`;
  const made = await notion.createPage(env, conn.secret.access_token, { type: type === 'database' ? 'database' : 'page', id: String(page || '').replace(/-/g, '') }, title, memoBlocks(memo), { date: memo.created_at });
  await store.update('work_memos', `id=${eq(memo.id)}`, { notion_url: made.url, updated_at: iso(env.now()) });
  return { url: made.url, id: made.id };
}
