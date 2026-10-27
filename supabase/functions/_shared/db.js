// PostgREST with the service key (the function writes for whoever the webhook or request is about),
// and "who is this?" for requests that come from the app with the person's login token.
import { json, HttpError } from './http.js';

export function db(env) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '') + '/rest/v1/';
  const headers = { apikey: env.SERVICE_KEY, Authorization: 'Bearer ' + env.SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' };
  const go = (path, init) => json(env.fetch, base + path, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
  return {
    select: (table, query) => go(`${table}?${query}`).then((r) => r || []),
    insert: (table, rows, { upsert = false, onConflict } = {}) => go(`${table}${onConflict ? '?on_conflict=' + onConflict : ''}`, { method: 'POST', body: JSON.stringify(rows), headers: upsert ? { Prefer: 'return=representation,resolution=merge-duplicates' } : {} }).then((r) => r || []),
    update: (table, query, patch) => go(`${table}?${query}`, { method: 'PATCH', body: JSON.stringify(patch) }).then((r) => r || []),
    remove: (table, query) => go(`${table}?${query}`, { method: 'DELETE' }),
  };
}

// The signed-in person behind an app request (Authorization: Bearer <access token>).
export async function userOf(env, req) {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) throw new HttpError('로그인해 주세요.', 401);
  const user = await json(env.fetch, env.SUPABASE_URL.replace(/\/+$/, '') + '/auth/v1/user', { headers: { apikey: env.ANON_KEY || env.SERVICE_KEY, Authorization: auth } })
    .catch(() => { throw new HttpError('로그인해 주세요.', 401); });
  if (!user?.id) throw new HttpError('로그인해 주세요.', 401);
  return user;
}
export const eq = (v) => 'eq.' + encodeURIComponent(v);
