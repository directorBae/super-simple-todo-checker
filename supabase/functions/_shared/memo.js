// 녹음 → 메모 → 노션. A dive (or any moment) is recorded on the computer, sent here in pieces as it goes, written
// down by OpenAI's transcription, summed up by GPT when it ends (title, summary, decisions, to-dos), kept for the
// team (work_memos) and, when asked, written to a Notion page or database of the person's choice through their own
// Notion connection.
import { HttpError, json } from './http.js';
import { db, eq } from './db.js';
import * as notion from './notion.js';

export const MEMO_DAYS = 30, CHUNK_MAX = 6 * 1024 * 1024, TRANSCRIBE_MODEL = 'gpt-4o-mini-transcribe';
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
const shape = (m) => ({ id: m.id, team: m.team_id, dive: m.dive_id, by: m.user_id, title: m.title, state: m.state, transcript: m.transcript, summary: m.summary, notionUrl: m.notion_url, createdAt: m.created_at });

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
  type: 'object', additionalProperties: false, required: ['title', 'summary', 'decisions', 'todos'],
  properties: { title: { type: 'string' }, summary: { type: 'string' }, decisions: { type: 'array', items: { type: 'string' } }, todos: { type: 'array', items: { type: 'string' } } },
};
const SUMMARY_RULES = `너는 회의 녹취를 정리하는 비서야. 한국어 녹취(자동 받아쓰기라 오타가 있을 수 있음)를 읽고 JSON으로 정리해.
- title: 20자 이내의 제목 (무슨 이야기였는지).
- summary: 3~6문장의 요약. 핵심 내용과 맥락만.
- decisions: 정해진 것들. 없으면 빈 배열.
- todos: 누가 무엇을 하기로 했는지, 한 줄씩 ("이름: 할 일" 형태, 이름을 모르면 할 일만). 없으면 빈 배열.
- 녹취에 없는 내용은 지어내지 마.`;
export async function summarize(env, transcript, hint = '') {
  const fallback = { title: clean(hint, 20) || '메모', summary: transcript.slice(0, 600), decisions: [], todos: [] };
  if (!env.OPENAI_API_KEY || !transcript) return fallback;
  try {
    const r = await json(env.fetch, 'https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL, store: false, max_output_tokens: 2000, input: [{ role: 'system', content: SUMMARY_RULES }, { role: 'user', content: `${hint ? '안건: ' + hint + '\n\n' : ''}녹취:\n${transcript.slice(0, 60000)}` }], text: { format: { type: 'json_schema', name: 'memo', schema: SUMMARY_SCHEMA, strict: true } } }),
    });
    const text = r.output_text || (r.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
    const out = JSON.parse(text);
    return { title: clean(out.title, 40) || fallback.title, summary: clean(out.summary, 2000), decisions: (out.decisions || []).map((x) => clean(x, 300)).filter(Boolean).slice(0, 30), todos: (out.todos || []).map((x) => clean(x, 300)).filter(Boolean).slice(0, 50) };
  } catch (e) {
    console.error('메모 정리(GPT) 실패, 녹취만 남깁니다:', e.message);
    return fallback;
  }
}

// ---------- the routes ----------
export async function startMemo(env, user, { team, dive, title }) {
  const store = db(env), me = await activeMember(store, user, team);
  const [memo] = await store.insert('work_memos', [{ team_id: me.team_id, dive_id: dive ? uuid(dive) : null, user_id: user.id, title: clean(title, 50), state: 'recording' }]);
  return { memo: shape(memo) };
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
// The recording is over: the whole text is summed up and the memo is done.
export async function finishMemo(env, user, { memo: memoId }) {
  const store = db(env), memo = await memoFor(store, user, memoId);
  const transcript = transcriptOf(memo.chunks);
  const summary = await summarize(env, transcript, memo.title);
  const [after] = await store.update('work_memos', `id=${eq(memo.id)}`, { transcript, summary, title: memo.title || summary.title, state: 'done', updated_at: iso(env.now()) });
  return { memo: shape(after || { ...memo, transcript, summary, state: 'done' }) };
}
export async function deleteMemo(env, user, { memo: memoId }) {
  const store = db(env), memo = await memoFor(store, user, memoId);
  if (memo.user_id !== user.id) throw new HttpError('녹음한 사람만 지울 수 있어요.', 403);
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
  const made = await notion.createPage(env, conn.secret.access_token, { type: type === 'database' ? 'database' : 'page', id: String(page || '').replace(/-/g, '') }, title, memoBlocks(memo));
  await store.update('work_memos', `id=${eq(memo.id)}`, { notion_url: made.url, updated_at: iso(env.now()) });
  return { url: made.url, id: made.id };
}
