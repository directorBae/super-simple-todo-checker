const test = require('node:test');
const assert = require('node:assert/strict');
const google = require('../lib/google');
const notion = require('../lib/notion');
const apple = require('../lib/apple');
const { classify } = require('../lib/router');
const target = { containerId: 'calendar@company', timeZone: 'Asia/Seoul', defaultMinutes: 60, mapping: { title: 'title', date: 'date', notes: 'notes', status: 'status', statusType: 'checkbox', appId: 'appid' } };
const todo = { id: 'todo-123', title: '미팅', notes: '메모', date: '2026-09-14', startTime: null, endTime: null, teamId: 'team', status: 'todo', createdAt: 1789347600000 };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function mockFetch(t, fn) { const prev = global.fetch; global.fetch = fn; t.after(() => { global.fetch = prev; }); }

test('Google create uses a stable valid ID, selected calendar and exclusive end', async t => {
  const calls = [];
  mockFetch(t, async (url, opts) => { const b = JSON.parse(opts.body); calls.push({ url, b }); return response({ ...b, etag: 'v1' }); });
  const adapter = google.adapter({ accessToken: 'access', expiresAt: Date.now() + 3600000 }, () => {}, {});
  await adapter.create(target, todo); await adapter.create(target, { ...todo, title: '다른 문구' });
  assert.equal(calls[0].b.id, calls[1].b.id); assert.match(calls[0].b.id, /^[0-9a-v]{5,1024}$/);
  assert.match(calls[0].url, /calendar%40company/); assert.equal(calls[0].b.end.date, '2026-09-15');
});
test('Google refresh token and paginated calendar list retain selected permissions', async t => {
  let saved, count = 0;
  mockFetch(t, async (url, options) => {
    if (url.includes('oauth2.googleapis')) return response({ access_token: 'new-access', expires_in: 3600 });
    assert.equal(options.headers.Authorization, 'Bearer new-access'); count++;
    if (count === 1) return response({ items: [{ id: 'read', summary: '공유', accessRole: 'reader' }], nextPageToken: 'page2' });
    assert.match(url, /pageToken=page2/); return response({ items: [{ id: 'write', summary: '내 일정', accessRole: 'owner' }] });
  });
  const a = google.adapter({ accessToken: 'old', refreshToken: 'refresh', expiresAt: 0 }, value => { saved = value; }, { googleClientId: 'client', googleClientSecret: 'secret' });
  assert.deepEqual((await a.containers()).map(c => c.writable), [false, true]); assert.equal(saved.accessToken, 'new-access');
});
test('Google update patches original ID and uses If-Match', async t => {
  mockFetch(t, async (url, options) => { assert.match(url, /\/events\/original\?/); assert.equal(options.method, 'PATCH'); assert.equal(options.headers['If-Match'], 'etag-original'); const b = JSON.parse(options.body); assert.equal(b.id, undefined); assert.equal(b.attendees, undefined); return response({ ...b, id: 'original', etag: 'new' }); });
  await google.adapter({ accessToken: 'access', expiresAt: Date.now() + 3600000 }, () => {}, {}).update(target, todo, { externalId: 'original', version: 'etag-original' });
});
function notionPage(properties) { return { id: 'original-page', last_edited_time: 'v1', properties: Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, { id: key, type: Object.keys(value)[0], ...value }])) }; }
test('Notion identifies each connection by bot ID within the same workspace', async t => {
  mockFetch(t, async () => response({ id: 'bot-a', name: '고객사 업무 연결', bot: { workspace_id: 'workspace', workspace_name: '회사' } }));
  const identity = await notion.adapter({ accessToken: 'token' }, () => {}, {}).identity();
  assert.equal(identity.accountId, 'bot-a'); assert.equal(identity.workspaceId, 'workspace'); assert.match(identity.label, /고객사/);
});
test('Notion create writes mapped properties, stable app ID and full long notes', async t => {
  mockFetch(t, async (url, opts) => { assert.equal(url, 'https://api.notion.com/v1/pages'); const b = JSON.parse(opts.body); assert.equal(b.parent.data_source_id, target.containerId); assert.equal(b.properties.appid.rich_text[0].text.content, todo.id); assert.equal(b.properties.notes.rich_text.map(t => t.text.content).join('').length, 5000); return response(notionPage(b.properties)); });
  const r = await notion.adapter({ accessToken: 'token' }, () => {}, {}).create(target, { ...todo, notes: '가'.repeat(5000) });
  assert.equal(r.externalId, 'original-page'); assert.equal(r.data.date, todo.date); assert.equal(r.data.startTime, null);
});
test('Notion update uses page ID; recovery queries app ID rather than wording', async t => {
  mockFetch(t, async (url, opts) => {
    const b = JSON.parse(opts.body);
    if (opts.method === 'PATCH') { assert.match(url, /pages\/original-page$/); return response(notionPage(b.properties)); }
    assert.equal(b.filter.property, 'appid'); assert.equal(b.filter.rich_text.equals, todo.id); return response({ results: [notionPage({ title: { title: [{ text: { content: '수정 전' } }] }, appid: { rich_text: [{ text: { content: todo.id } }] } })], has_more: false });
  });
  const a = notion.adapter({ accessToken: 'token' }, () => {}, {});
  assert.equal((await a.recover(target, todo.id)).externalId, 'original-page');
  assert.equal((await a.update(target, todo, { externalId: 'original-page', data: { title: '수정 전' } })).data.title, todo.title);
});
test('iCalendar round trip preserves Korean text, all-day dates and timed zones', () => {
  for (const t of [todo, { ...todo, title: '회의, 세미콜론;\n다음 줄', startTime: '14:00', endTime: '15:00', timeZone: 'Asia/Seoul' }]) {
    const data = apple.serialize(t, target);
    const r = apple.parse({ url: 'https://caldav.icloud.com/cal/file.ics', data, etag: 'v1' }, target)[0];
    assert.equal(r.data.title, t.title); assert.equal(r.data.date, t.date); assert.equal(r.data.startTime, t.startTime); assert.equal(r.appId, t.id);
  }
});
test('iCalendar edits preserve existing location and reject untrusted CalDAV hosts', () => {
  const raw = apple.serialize(todo, target).replace('END:VEVENT', 'LOCATION:회의실 A\r\nEND:VEVENT');
  const remote = apple.parse({ url: 'https://caldav.icloud.com/cal/file.ics', data: raw }, target)[0];
  assert.match(apple.serialize({ ...todo, title: '새 이름' }, target, remote), /LOCATION:회의실 A/);
  assert.throws(() => apple.trusted('https://evil.example/calendar'), /iCloud/); assert.throws(() => apple.trusted('http://caldav.icloud.com/'), /iCloud/);
});
test('iCloud recurring series expands into stable occurrence IDs without rewriting series', () => {
  const raw = apple.serialize(todo, target).replace('END:VEVENT', 'RRULE:FREQ=DAILY;COUNT=3\r\nEND:VEVENT');
  const events = apple.parse({ url: 'https://caldav.icloud.com/cal/series.ics', data: raw }, target, '2026-09-14');
  assert.equal(events.length, 3); assert.equal(new Set(events.map(e => e.externalId)).size, 3); assert.ok(events.every(e => !e.writable && e.recurring));
});
test('OpenAI request is structured and excludes secrets from classification context', async t => {
  mockFetch(t, async (url, opts) => { const b = JSON.parse(opts.body); assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(b.text.format.strict, true); assert.equal(b.store, false); assert.ok(!b.input.includes('top-secret')); return response({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ taskType: 'meeting', teamId: 'team', targetId: 'allowed', date: null, endDate: null, startTime: null, endTime: null, needsReview: false, reason: '미팅' }) }] }] }); });
  const result = await classify(todo, [{ id: 'allowed', provider: 'google', teamId: 'team', taskTypes: ['meeting'] }], [{ id: 'team', name: '조직' }], { openaiKey: 'top-secret', openaiModel: 'test', timeZone: 'Asia/Seoul' });
  assert.equal(result.targetId, 'allowed');
});
test('OpenAI hallucinated destination is rejected', async t => {
  mockFetch(t, async () => response({ status: 'completed', output: [{ content: [{ type: 'output_text', text: JSON.stringify({ taskType: 'meeting', teamId: 'other', targetId: 'evil', needsReview: false }) }] }] }));
  const result = await classify(todo, [], [], { openaiKey: 'secret', openaiModel: 'test' }); assert.equal(result.targetId, null); assert.equal(result.needsReview, true);
});

const assigneeId = '11111111-1111-4111-8111-111111111111';
const scoped = { ...target, assigneeFilter: { propertyId: 'owner', userId: assigneeId } };
test('Notion filters every query page by assignee, including joint assignments', async t => {
  let calls = 0;
  mockFetch(t, async (url, opts) => {
    const b = JSON.parse(opts.body); assert.deepEqual(b.filter, { property: 'owner', people: { contains: assigneeId } });
    calls++; if (calls === 2) assert.equal(b.start_cursor, 'next');
    return response({results:[notionPage({owner:{people:[{id:'other'},{id:assigneeId}]}})],has_more:calls===1,next_cursor:calls===1?'next':null});
  });
  assert.equal((await notion.adapter({accessToken:'test'},()=>{},{}).list(scoped)).length,2);
});
test('Notion direct retrieval recognizes reassignment without marking a page deleted', async t => {
  mockFetch(t, async()=>response(notionPage({owner:{people:[{id:'someone-else'}]}})));
  const r=await notion.adapter({accessToken:'test'},()=>{},{}).get(scoped,'original-page');
  assert.equal(r.inScope,false); assert.equal(r.deleted,false);
});
test('Notion checks paginated people properties beyond the first 25 assignees', async t => {
  mockFetch(t, async url=>response(url.includes('/properties/') ? {results:[{people:{id:assigneeId}}],has_more:false} : notionPage({owner:{people:Array.from({length:25},(_,i)=>({id:String(i)}))}})));
  assert.equal((await notion.adapter({accessToken:'test'},()=>{},{}).get(scoped,'original-page')).inScope,true);
});
test('Notion creates with the chosen assignee but edits preserve all existing assignees', async t => {
  mockFetch(t, async(url,opts)=>{
    const b=JSON.parse(opts.body);
    if(opts.method==='POST') assert.deepEqual(b.properties.owner.people,[{object:'user',id:assigneeId}]);
    else assert.equal(b.properties.owner,undefined);
    return response(notionPage(b.properties));
  });
  const a=notion.adapter({accessToken:'test'},()=>{},{});
  await a.create(scoped,todo); await a.update(scoped,todo,{externalId:'original-page',data:{title:'old'}});
});
test('Notion user picker paginates people and excludes bots', async t=>{
  mockFetch(t, async url=>response(url.includes('start_cursor=next') ? {results:[{id:'b',type:'person',name:'Second'}],has_more:false} : {results:[{id:'bot',type:'bot'},{id:'a',type:'person',name:'First'}],has_more:true,next_cursor:'next'}));
  assert.deepEqual((await notion.adapter({accessToken:'test'},()=>{},{}).users()).map(u=>u.id),['a','b']);
});
test('Notion uncertain creation recovery is not narrowed by the assignee filter',async t=>{
  mockFetch(t,async(url,opts)=>{assert.deepEqual(JSON.parse(opts.body).filter,{property:'appid',rich_text:{equals:todo.id}});return response({results:[notionPage({owner:{people:[]}})],has_more:false});});
  const r=await notion.adapter({accessToken:'test'},()=>{},{}).recover(scoped,todo.id); assert.equal(r.externalId,'original-page');assert.equal(r.inScope,false);
});
