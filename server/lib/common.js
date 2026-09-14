const { createHash, randomUUID } = require('node:crypto');
const { DateTime } = require('luxon');
class ApiError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const id = () => randomUUID();
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
const fields = ['title', 'notes', 'date', 'endDate', 'startTime', 'endTime', 'timeZone', 'status'];
const content = t => Object.fromEntries(fields.map(k => [k, t[k] ?? null]));
const fingerprint = t => hash(content(t));
const editable = [...fields, 'kind', 'projectId', 'teamId', 'channel', 'important', 'sortOrder'];
function zone(t) { return t.timeZone || 'Asia/Seoul'; }
function schedule(t, defaultMinutes = 60) {
  if (!t.date) throw new ApiError('날짜를 지정해 주세요.');
  const tz = zone(t), day = DateTime.fromISO(t.date, { zone: tz });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t.date) || !day.isValid) throw new ApiError('날짜 또는 시간대가 올바르지 않습니다.');
  if (!t.startTime) {
    if (t.endTime) throw new ApiError('시작 시간을 지정해 주세요.');
    const last = DateTime.fromISO(t.endDate || t.date, { zone: tz });
    if (!last.isValid || last < day) throw new ApiError('종료 날짜를 확인해 주세요.');
    return { start: { date: day.toISODate() }, end: { date: last.plus({ days: 1 }).toISODate() } };
  }
  if (!/^\d{2}:\d{2}$/.test(t.startTime) || (t.endTime && !/^\d{2}:\d{2}$/.test(t.endTime))) throw new ApiError('시간은 HH:mm 형식이어야 합니다.');
  const start = DateTime.fromISO(`${t.date}T${t.startTime}`, { zone: tz });
  const end = t.endTime ? DateTime.fromISO(`${t.endDate || t.date}T${t.endTime}`, { zone: tz }) : start.plus({ minutes: defaultMinutes });
  if (!start.isValid || start.toFormat('HH:mm') !== t.startTime || !end.isValid || end <= start) throw new ApiError('시작·종료 시간과 종료 날짜를 확인해 주세요.');
  if (start.getPossibleOffsets().length > 1 || end.getPossibleOffsets().length > 1) throw new ApiError('서머타임 전환으로 중복되는 시각입니다. 다른 시각을 지정해 주세요.');
  return { start: { dateTime: start.toISO(), timeZone: tz }, end: { dateTime: end.toISO(), timeZone: tz } };
}
function fromSchedule(start, end, fallback = 'Asia/Seoul') {
  if (!start) return { date: null, endDate: null, startTime: null, endTime: null, timeZone: fallback };
  if (start.date) return { date: start.date, endDate: end?.date ? DateTime.fromISO(end.date).minus({ days: 1 }).toISODate() : start.date, startTime: null, endTime: null, timeZone: fallback };
  const tz = start.timeZone || fallback;
  const a = DateTime.fromISO(start.dateTime, { zone: tz }), b = DateTime.fromISO(end?.dateTime || start.dateTime, { zone: end?.timeZone || tz });
  if (!a.isValid || !b.isValid) throw new ApiError('원본 일정 시간대를 해석할 수 없습니다.');
  return { date: a.toISODate(), endDate: b.toISODate(), startTime: a.toFormat('HH:mm'), endTime: b.toFormat('HH:mm'), timeZone: tz };
}
async function json(url, options = {}) {
  const res = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(30000) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error?.message || data.message || (typeof data.error === 'string' ? data.error : `API 요청 실패 (${res.status})`), res.status);
  return data;
}
module.exports = { ApiError, id, hash, content, fingerprint, editable, schedule, fromSchedule, json, zone, DateTime };
