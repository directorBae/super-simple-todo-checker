const { createDAVClient } = require('tsdav');
const ICAL = require('ical.js');
const { ApiError, schedule, fromSchedule, hash, DateTime } = require('./common');
function trusted(url) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !(u.hostname === 'caldav.icloud.com' || u.hostname.endsWith('.icloud.com')) || u.username || u.password || (u.port && u.port !== '443')) throw new ApiError('iCloud CalDAV 주소가 올바르지 않습니다.');
  return u.toString();
}
function parse(object, target, occurrenceId) {
  const calendar = new ICAL.Component(ICAL.parse(object.data));
  for (const tz of calendar.getAllSubcomponents('vtimezone')) ICAL.TimezoneService.register(new ICAL.Timezone(tz));
  const components = calendar.getAllSubcomponents('vevent');
  const requested = occurrenceId && DateTime.fromISO(occurrenceId, { zone: target.timeZone });
  const windowStart = requested?.isValid ? requested.minus({ days: 2 }).toMillis() : Date.now() - 365 * 864e5;
  const windowEnd = requested?.isValid ? requested.plus({ days: 2 }).toMillis() : Date.now() + 730 * 864e5;
  return components.filter(component => !component.hasProperty('recurrence-id') || !components.some(c => !c.hasProperty('recurrence-id') && c.getFirstPropertyValue('uid') === component.getFirstPropertyValue('uid'))).flatMap(component => {
    const event = new ICAL.Event(component);
    const dt = (v, property = 'dtstart') => {
      if (v.isDate) return { date: v.toString() };
      if (v.zone === ICAL.Timezone.localTimezone) {
        const timeZone = component.getFirstProperty(property)?.getParameter('tzid') || target.timeZone;
        const time = DateTime.fromISO(v.toString(), { zone: timeZone });
        if (!time.isValid) throw new ApiError('iCloud 일정의 시간대를 해석할 수 없습니다.');
        return { dateTime: time.toISO(), timeZone };
      }
      return { dateTime: v.toJSDate().toISOString(), timeZone: target.timeZone };
    };
    const recurrence = component.getFirstPropertyValue('recurrence-id')?.toString();
    const result = { externalId: object.url + (recurrence ? '#' + recurrence : ''), objectUrl: object.url, version: object.etag, deleted: component.getFirstPropertyValue('status') === 'CANCELLED', appId: component.getFirstPropertyValue('x-todo-app-id'), recurring: event.isRecurring() || !!recurrence, writable: !event.isRecurring() && !recurrence && components.length === 1, data: { title: event.summary || '(제목 없음)', notes: event.description || '', ...fromSchedule(dt(event.startDate), dt(event.endDate, 'dtend'), target.timeZone) }, raw: object };
    if (!event.isRecurring()) return [result];
    const out = [], iterator = event.iterator();
    for (let count = 0; count < 100000; count++) {
      const next = iterator.next(); if (!next) return out;
      const detail = event.getOccurrenceDetails(next);
      const start = dt(detail.startDate), end = dt(detail.endDate, 'dtend');
      const startMs = DateTime.fromISO(start.dateTime || start.date, { zone: target.timeZone }).toMillis();
      if (startMs > windowEnd) return out;
      if (startMs < windowStart) continue;
      out.push({ ...result, externalId: object.url + '#' + next.toString(), appId: null, deleted: result.deleted || detail.item.component.getFirstPropertyValue('status') === 'CANCELLED', data: { title: detail.item.summary || '(제목 없음)', notes: detail.item.description || '', ...fromSchedule(start, end, target.timeZone) } });
    }
    throw new ApiError('반복 일정이 너무 많습니다. 원본 캘린더에서 반복 범위를 줄여 주세요.');
  });
}
function serialize(todo, target, remote) {
  const calendar = remote ? new ICAL.Component(ICAL.parse(remote.raw.data)) : new ICAL.Component(['vcalendar', [], []]);
  if (!remote) { calendar.updatePropertyWithValue('version', '2.0'); calendar.updatePropertyWithValue('prodid', '-//Todo Checker//KO'); }
  let event = calendar.getFirstSubcomponent('vevent');
  if (!event) { event = new ICAL.Component('vevent'); calendar.addSubcomponent(event); event.updatePropertyWithValue('uid', hash(todo.id) + '@todo-checker'); }
  event.updatePropertyWithValue('summary', todo.title);
  event.updatePropertyWithValue('description', todo.notes || '');
  event.updatePropertyWithValue('x-todo-app-id', todo.id);
  event.updatePropertyWithValue('dtstamp', ICAL.Time.fromJSDate(new Date(), true));
  event.updatePropertyWithValue('sequence', Number(event.getFirstPropertyValue('sequence') || 0) + 1);
  const s = schedule(todo, target.defaultMinutes);
  for (const [key, value] of [['dtstart', s.start], ['dtend', s.end]]) {
    event.removeAllProperties(key);
    event.updatePropertyWithValue(key, value.date ? ICAL.Time.fromDateString(value.date) : ICAL.Time.fromJSDate(new Date(value.dateTime), true));
  }
  event.removeAllProperties('duration');
  return calendar.toString();
}
function adapter(credentials) {
  let client;
  async function dav() {
    if (!client) client = await createDAVClient({ serverUrl: 'https://caldav.icloud.com', credentials: { username: credentials.username, password: credentials.password }, authMethod: 'Basic', defaultAccountType: 'caldav', fetch: async (url, options = {}) => {
      trusted(String(url));
      const res = await fetch(url, { ...options, redirect: 'manual', signal: AbortSignal.timeout(30000) });
      if (res.status >= 300 && res.status < 400) {
        const next = trusted(new URL(res.headers.get('location'), url).toString());
        return fetch(next, { ...options, redirect: 'error', signal: AbortSignal.timeout(30000) });
      }
      return res;
    } });
    return client;
  }
  const cal = t => ({ url: trusted(t.containerId) });
  async function check(res) { if (!res.ok) throw new ApiError(`iCloud 요청 실패 (${res.status})`, res.status); }
  return {
    async containers() {
      const calendars = await (await dav()).fetchCalendars({ props: { 'd:displayname': {}, 'd:resourcetype': {}, 'c:supported-calendar-component-set': {}, 'd:current-user-privilege-set': {} }, projectedProps: { currentUserPrivilegeSet: true } });
      return calendars.filter(c => !c.components || c.components.includes('VEVENT')).map(c => {
        const privileges = c.projectedProps?.currentUserPrivilegeSet;
        const encoded = JSON.stringify(privileges || {});
        return { id: c.url, label: typeof c.displayName === 'string' ? c.displayName : c.url, writable: /"(all|write|writeContent)"/.test(encoded) };
      });
    },
    async list(t) { const objects = await (await dav()).fetchCalendarObjects({ calendar: cal(t), timeRange: { start: new Date(Date.now() - 365 * 864e5).toISOString(), end: new Date(Date.now() + 730 * 864e5).toISOString() }, expand: false }); return objects.flatMap(o => parse(o, t)); },
    async get(t, externalId) { const [url, occurrence] = externalId.split('#'); trusted(url); if (!url.startsWith(t.containerId.endsWith('/') ? t.containerId : t.containerId + '/')) throw new ApiError('캘린더 범위가 일치하지 않습니다.'); const objects = await (await dav()).fetchCalendarObjects({ calendar: cal(t), objectUrls: [url] }); return objects.flatMap(o => parse(o, t, occurrence)).find(o => o.externalId === externalId) || null; },
    async recover(t, todoId) { return this.get(t, new URL(hash(todoId) + '.ics', t.containerId.endsWith('/') ? t.containerId : t.containerId + '/').toString()); },
    async create(t, todo) { const filename = hash(todo.id) + '.ics'; const data = serialize(todo, t); await check(await (await dav()).createCalendarObject({ calendar: cal(t), filename, iCalString: data })); const remote = await this.recover(t, todo.id); if (!remote) throw new ApiError('iCloud 생성 결과를 확인하지 못했습니다.', 503); return remote; },
    async update(t, todo, remote) { if (!remote.writable) throw new ApiError('iCloud 반복 일정은 원본 캘린더에서 수정해 주세요.', 409); const data = serialize(todo, t, remote); await check(await (await dav()).updateCalendarObject({ calendarObject: { url: remote.objectUrl, etag: remote.version, data } })); const result = await this.get(t, remote.externalId); if (!result) throw new ApiError('iCloud 수정 결과 확인 실패', 503); return result; },
    async remove(t, remote) { if (!remote.writable) throw new ApiError('iCloud 반복 일정 삭제는 원본 캘린더에서 해 주세요.', 409); await check(await (await dav()).deleteCalendarObject({ calendarObject: { url: remote.objectUrl, etag: remote.version } })); },
  };
}
module.exports = { adapter, parse, serialize, trusted };
