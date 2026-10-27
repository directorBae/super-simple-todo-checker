// Notion (public integration, OAuth): connecting, the page picker, reading a subscribed page or database,
// and writing a changed date back. Notion-Version 2022-06-28.
import { json, HttpError } from './http.js';

const API = 'https://api.notion.com/v1';
const VERSION = '2022-06-28';
export const plainId = (id) => String(id || '').replace(/-/g, '');

const call = (env, token, path, init = {}) => json(env.fetch, API + path, {
  ...init,
  headers: { Authorization: 'Bearer ' + token, 'Notion-Version': VERSION, 'Content-Type': 'application/json', ...(init.headers || {}) },
});

export function authorizeUrl(env, state) {
  const q = new URLSearchParams({ client_id: env.NOTION_CLIENT_ID, response_type: 'code', owner: 'user', redirect_uri: env.redirect('notion'), state });
  return 'https://api.notion.com/v1/oauth/authorize?' + q;
}
export async function exchange(env, code) {
  const basic = btoa(env.NOTION_CLIENT_ID + ':' + env.NOTION_CLIENT_SECRET);
  const r = await json(env.fetch, API + '/oauth/token', {
    method: 'POST', headers: { Authorization: 'Basic ' + basic, 'Content-Type': 'application/json', 'Notion-Version': VERSION },
    body: JSON.stringify({ grant_type: 'authorization_code', code, redirect_uri: env.redirect('notion') }),
  });
  return { account: r.workspace_name || 'Notion', meta: { workspace_id: plainId(r.workspace_id), bot_id: r.bot_id }, secret: { access_token: r.access_token, refresh_token: r.refresh_token || null } };
}

const richText = (parts) => (parts || []).map((t) => t.plain_text).join('');
export function titleOf(item) {
  if (item.object === 'database') return richText(item.title) || '제목 없는 DB';
  const prop = Object.values(item.properties || {}).find((p) => p.type === 'title');
  return richText(prop?.title) || '제목 없음';
}
// The picker: pages and databases this connection may read (the person chose them when connecting).
export async function search(env, token, query = '') {
  const r = await call(env, token, '/search', { method: 'POST', body: JSON.stringify({ query, page_size: 50, sort: { direction: 'descending', timestamp: 'last_edited_time' } }) });
  return (r.results || []).filter((x) => !x.archived && !x.in_trash).map((x) => ({
    id: plainId(x.id), type: x.object === 'database' ? 'database' : 'page', title: titleOf(x), url: x.url,
    icon: x.icon?.type === 'emoji' ? x.icon.emoji : null, edited: x.last_edited_time,
  }));
}
export const resource = (env, token, type, id) => call(env, token, type === 'database' ? `/databases/${id}` : `/pages/${id}`);

// Which properties of a database hold the title, the date and "done" — found by type, so any DB works.
export function schemaOf(db) {
  const props = Object.entries(db.properties || {});
  const find = (type) => props.find(([, p]) => p.type === type)?.[0] || null;
  return { titleProp: find('title'), dateProp: find('date'), doneProp: find('checkbox') || find('status') };
}
// A database: one item per row (page), with its date and done state.
export async function readDatabase(env, token, sub, window) {
  const { titleProp, dateProp, doneProp } = sub.meta;
  const items = []; let cursor;
  // Rows dated from this Monday on, plus undated rows touched this week (older undated rows are old business).
  const recent = { timestamp: 'last_edited_time', last_edited_time: { on_or_after: window.start } };
  const filter = dateProp ? { or: [{ property: dateProp, date: { on_or_after: window.start } }, { and: [{ property: dateProp, date: { is_empty: true } }, recent] }] } : recent;
  do {
    const r = await call(env, token, `/databases/${sub.resource_id}/query`, { method: 'POST', body: JSON.stringify({ page_size: 100, start_cursor: cursor, filter }) });
    for (const page of r.results || []) {
      if (page.archived || page.in_trash) continue;
      const date = dateProp ? page.properties[dateProp]?.date : null;
      const done = doneProp ? page.properties[doneProp] : null;
      items.push({
        external_id: plainId(page.id), url: page.url, title: richText(page.properties[titleProp]?.title),
        start: date?.start || null, end: date?.end || null,
        done: done ? (done.type === 'checkbox' ? !!done.checkbox : /done|완료|complete/i.test(done.status?.name || '')) : false,
        edited: page.last_edited_time,
      });
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor && items.length < 500);
  return items.filter((x) => !x.start || x.start.slice(0, 10) <= window.end);
}
// A page: its text, block by block (with ids so to-dos can be linked back), nested one level.
export async function readPage(env, token, pageId, depth = 0) {
  const lines = []; let cursor;
  do {
    const r = await call(env, token, `/blocks/${pageId}/children?page_size=100${cursor ? '&start_cursor=' + cursor : ''}`);
    for (const b of r.results || []) {
      const body = b[b.type] || {}, text = richText(body.rich_text);
      if (b.type === 'child_page') lines.push({ id: plainId(b.id), type: 'child_page', text: body.title, depth });
      else if (text) lines.push({ id: plainId(b.id), type: b.type, text, checked: b.type === 'to_do' ? !!body.checked : undefined, depth });
      if (b.has_children && depth < 1 && b.type !== 'child_page') lines.push(...await readPage(env, token, plainId(b.id), depth + 1));
    }
    cursor = r.has_more ? r.next_cursor : undefined;
  } while (cursor && lines.length < 800);
  return lines;
}

// Back to Notion: a database row's date, or a to-do block's check box.
export async function writeDate(env, token, pageId, dateProp, { date, start_time, end_time }, offset) {
  if (!dateProp) throw new HttpError('이 DB에는 날짜 속성이 없어요.', 400);
  const value = !date ? null : { start: start_time ? `${date}T${start_time}:00${offset}` : date, end: start_time && end_time ? `${date}T${end_time}:00${offset}` : null };
  await call(env, token, `/pages/${pageId}`, { method: 'PATCH', body: JSON.stringify({ properties: { [dateProp]: { date: value } } }) });
}
export async function writeChecked(env, token, blockId, checked) {
  await call(env, token, `/blocks/${blockId}`, { method: 'PATCH', body: JSON.stringify({ to_do: { checked } }) });
}
