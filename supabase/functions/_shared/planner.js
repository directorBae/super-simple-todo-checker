// The "pet's brain": reads everything in a subscribed source, compares it with the person's to-dos for this week
// and next, and decides which to-dos the source stands for — one day each, titles of 50 characters or fewer.
// GPT does the reading (pages are free text; DB rows and events may need a shorter title or a day); the diff
// against the to-dos already imported is plain code, so the model never deletes anything by itself.
import { json, truncate, localDate, localTime } from './http.js';

const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['external_id', 'same_as', 'title', 'date', 'start_time', 'end_time', 'done'],
        properties: {
          external_id: { type: 'string' }, same_as: { type: ['string', 'null'] }, title: { type: 'string' },
          date: { type: ['string', 'null'] }, start_time: { type: ['string', 'null'] }, end_time: { type: ['string', 'null'] }, done: { type: 'boolean' },
        },
      },
    },
  },
};
const RULES = `너는 할 일 앱의 펫 비서야. 연결된 원본(노션 페이지·DB, 구글 캘린더)을 읽고 이 사람의 할 일 목록에 넣을 항목을 정해.
규칙:
- 원본의 항목 하나가 할 일 하나야. external_id는 반드시 원본에 적힌 id 중 하나를 그대로 써.
- 할 일이 아닌 것(회의록 본문, 설명, 제목줄, 참고 링크)은 빼.
- title은 50자 이내로, 원문의 언어 그대로 핵심만. 이미 짧으면 그대로 둬.
- date는 YYYY-MM-DD. 원본에 날짜가 있으면 그 날짜(시간대 기준 현지 날짜). 없으면 요일 표현·마감·순서와 이번 주 할 일이 몰린 날을 보고 이번 주나 다음 주의 하루를 골라. 범위 밖이면 그 항목은 빼.
- start_time/end_time은 HH:MM(24시간). 원본에 시간이 없으면 null.
- done은 원본에서 완료(체크)된 경우 true.
- 이 원본에서 이미 가져온 할 일과 같은 일이면 그 할 일의 external_id를 그대로 써.
- 앱에 이미 있는 다른 할 일(직접 적었거나 다른 도구에서 온 것)과 같은 일이면 same_as에 그 할 일의 id를 적어. 아니면 null.
- 같은 일을 두 번 내지 마.`;

// Source items in a compact form for the prompt (and the ids that exist in the source right now).
export function describeSource(sub, raw, timeZone) {
  if (sub.provider === 'notion' && sub.resource_type === 'page') {
    const lines = raw.map((b) => `[${b.id}] ${'  '.repeat(b.depth)}${b.type === 'to_do' ? (b.checked ? '☑ ' : '☐ ') : b.type.startsWith('heading') ? '# ' : b.type.includes('list') ? '- ' : ''}${b.text}`);
    return { text: `노션 페이지 "${sub.title}":\n` + lines.join('\n').slice(0, 30000), ids: new Set(raw.map((b) => b.id)) };
  }
  const rows = raw.map((x) => ({ id: x.external_id, title: x.title, ...when(x, timeZone), done: x.done }));
  const kind = sub.provider === 'google' ? `구글 캘린더 "${sub.title}"의 일정` : `노션 DB "${sub.title}"의 행`;
  return { text: `${kind}:\n` + JSON.stringify(rows).slice(0, 30000), ids: new Set(raw.map((x) => x.external_id)) };
}
// A source date (date or date-time) as the person's local day and time.
export function when(x, timeZone) {
  if (!x.start) return { date: null, start_time: null, end_time: null };
  if (x.start.length <= 10) return { date: x.start, start_time: null, end_time: null };
  const s = Date.parse(x.start), e = x.end && x.end.length > 10 ? Date.parse(x.end) : null;
  return { date: localDate(s, timeZone), start_time: localTime(s, timeZone), end_time: e ? localTime(e, timeZone) : null };
}

// Without GPT (no key, or it failed): DB rows and events map one to one; page to-do lines become to-dos for today.
export function fallbackPlan(sub, raw, window, timeZone) {
  if (sub.provider === 'notion' && sub.resource_type === 'page') {
    return raw.filter((b) => b.type === 'to_do').map((b) => ({ external_id: b.id, same_as: null, title: truncate(b.text), date: window.today, start_time: null, end_time: null, done: !!b.checked }));
  }
  return raw.map((x) => ({ external_id: x.external_id, same_as: null, title: truncate(x.title), ...when(x, timeZone), done: !!x.done })).filter((x) => !x.date || (x.date >= window.start && x.date <= window.end));
}

const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
// Keeps only well-formed items that point at something in the source and fall inside the window; `same_as` must
// name one of the app's to-dos that were shown (`appIds`), and each of those is claimed at most once.
export function clean(items, ids, window, appIds = new Set()) {
  const seen = new Set(), claimed = new Set();
  return (items || []).filter((x) => x && ids.has(x.external_id) && !seen.has(x.external_id) && seen.add(x.external_id)).map((x) => {
    const same = x.same_as && appIds.has(x.same_as) && !claimed.has(x.same_as) ? (claimed.add(x.same_as), x.same_as) : null;
    const date = DATE.test(x.date || '') && x.date >= window.start && x.date <= window.end ? x.date : null;
    const start = date && TIME.test(x.start_time || '') ? x.start_time : null;
    return { external_id: x.external_id, same_as: same, title: truncate(x.title || ''), date, start_time: start, end_time: start && TIME.test(x.end_time || '') && x.end_time > start ? x.end_time : null, done: !!x.done };
  }).filter((x) => x.title && x.date);
}

export async function plan(env, { sub, raw, existing, week, window }) {
  const timeZone = env.TIME_ZONE;
  const source = describeSource(sub, raw, timeZone);
  if (!env.OPENAI_API_KEY) return clean(fallbackPlan(sub, raw, window, timeZone), source.ids, window);
  const mine = existing.map((t) => ({ external_id: t.origin?.id, title: t.title, date: t.date, start_time: t.start_time, done: t.status === 'done' }));
  const others = week.filter((t) => t.origin?.subscription !== sub.id).slice(0, 150);
  const context = others.map((t) => `[${t.id}] ${t.date} ${t.start_time || ''} ${t.title}${t.origin?.provider ? ` (${t.origin.provider})` : ''}`.replace(/\s+/g, ' ')).join('\n');
  const appIds = new Set(others.map((t) => t.id));
  const input = `오늘: ${window.today} (${timeZone})\n범위: ${window.start} ~ ${window.end}\n\n${source.text}\n\n이 원본에서 이미 가져온 할 일:\n${JSON.stringify(mine)}\n\n앱에 있는 이번 주·다음 주의 다른 할 일([id] 날짜 시간 제목):\n${context || '(없음)'}`;
  try {
    const r = await json(env.fetch, 'https://api.openai.com/v1/responses', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: env.OPENAI_MODEL, store: false, max_output_tokens: 6000, input: [{ role: 'system', content: RULES }, { role: 'user', content: input }], text: { format: { type: 'json_schema', name: 'todos', schema: SCHEMA, strict: true } } }),
    });
    const text = r.output_text || (r.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('');
    return clean(JSON.parse(text).items, source.ids, window, appIds);
  } catch (e) {
    console.error('GPT 정리 실패, 원본 그대로 가져옵니다:', e.message);
    return clean(fallbackPlan(sub, raw, window, timeZone), source.ids, window);
  }
}

const FIELDS = ['title', 'date', 'start_time', 'end_time', 'done'];
// What to write: new to-dos, changes the SOURCE made since the last import (edits made in the app stay), and
// to-dos whose source item is gone. `ids` = everything that exists in the source now; `week` = the app's to-dos in
// the window. A source item GPT matched to one of the app's to-dos (same_as) is not created again: a to-do the
// person wrote by hand gets this source attached (`adopt`), one that already came from another tool is left alone.
export function diff(desired, existing, ids, week = []) {
  const byId = new Map(existing.map((t) => [t.origin?.id, t])), app = new Map(week.map((t) => [t.id, t]));
  const create = [], update = [], remove = [], adopt = [];
  for (const d of desired) {
    const t = byId.get(d.external_id);
    if (!t && d.same_as && app.has(d.same_as)) { if (!app.get(d.same_as).origin?.provider) adopt.push({ todo: app.get(d.same_as), d }); continue; }
    if (!t) { create.push(d); continue; }
    const before = t.origin?.remote || {}, patch = {};
    for (const f of FIELDS) if ((d[f] ?? null) !== (before[f] ?? null)) patch[f] = d[f];
    if (Object.keys(patch).length) update.push({ todo: t, patch, remote: Object.fromEntries(FIELDS.map((f) => [f, d[f] ?? null])) });
  }
  for (const t of existing) if (!ids.has(t.origin?.id)) remove.push(t);
  return { create, update, remove, adopt };
}
