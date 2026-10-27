// Small helpers shared by the integration function (plain JS so Node can test it and Supabase's Deno can run it).

export class HttpError extends Error {
  constructor(message, status = 400, detail) { super(message); this.status = status; this.detail = detail; }
}

// fetch that returns JSON (or null for an empty body) and throws HttpError with the provider's message.
export async function json(request, url, init = {}) {
  const res = await request(url, init);
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; } }
  if (!res.ok) {
    const message = body?.message || body?.error_description || body?.error?.message || (typeof body?.error === 'string' ? body.error : '') || body?.raw || 'HTTP ' + res.status;
    throw new HttpError(message, res.status, body);
  }
  return body;
}

// HMAC-SHA256 (hex) with WebCrypto — available in Deno and Node.
export async function hmac(secret, text) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(text));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const b64url = (text) => btoa(unescape(encodeURIComponent(text))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (text) => decodeURIComponent(escape(atob(text.replace(/-/g, '+').replace(/_/g, '/'))));

// OAuth `state`: who started the connection, signed so the callback can trust it, valid for 15 minutes.
export async function signState(secret, payload, now = Date.now()) {
  const body = b64url(JSON.stringify({ ...payload, exp: now + 15 * 60_000 }));
  return body + '.' + (await hmac(secret, body));
}
export async function readState(secret, state, now = Date.now()) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !safeEqual(sig, await hmac(secret, body))) throw new HttpError('연결 요청을 확인하지 못했어요. 다시 시도해 주세요.', 400);
  const payload = JSON.parse(unb64url(body));
  if (payload.exp < now) throw new HttpError('연결 요청이 만료됐어요. 다시 시도해 주세요.', 400);
  return payload;
}

// Calendar dates in the person's time zone.
export function localDate(ms, timeZone) {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}
export function localTime(ms, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ms));
}
export function addDays(date, days) {
  const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
// This week (Monday) through the end of next week: the stretch the importer compares against.
export function windowFor(now, timeZone) {
  const today = localDate(now, timeZone), weekday = (new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7;
  const start = addDays(today, -weekday);
  return { today, start, end: addDays(start, 13) };
}
// UTC offset of a zone at a moment, as "+09:00" (for RFC 3339 times sent to Google/Notion).
export function offsetOf(timeZone, ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(ms));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  return name === 'GMT' ? '+00:00' : name.replace('GMT', '');
}
export const truncate = (text, max = 50) => { const chars = Array.from(String(text || '').trim()); return chars.length > max ? chars.slice(0, max - 1).join('') + '…' : chars.join(''); };
