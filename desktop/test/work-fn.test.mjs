// 팀버전 (Work) on the server (supabase/functions/_shared/work.js): teams, email invites, online state, dives with a
// LiveKit room token, pushes (important for the picked people), the two declines, and leaving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, environment } from '../../supabase/functions/_shared/router.js';

let NOW = Date.parse('2026-11-06T03:00:00Z');
const USERS = { 'tok-a': { id: '00000000-0000-4000-8000-00000000000a', email: 'a@x.com' }, 'tok-b': { id: '00000000-0000-4000-8000-00000000000b', email: 'B@x.com' }, 'tok-c': { id: '00000000-0000-4000-8000-00000000000c', email: 'c@x.com' } };
const KEYS = { work_members: ['team_id', 'email'], work_presence: ['user_id'], work_replies: ['dive_id', 'user_id'], voip_devices: ['user_id', 'token'] };
import { missedDives } from '../../shared/work-alerts.mjs';
// An APNs key for the tests (a P-256 key in a .p8, as Apple hands it out).
async function apnsKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----\n`;
}

function world({ sleep = () => new Promise(() => {}), waitUntil = (p) => p, env: extraEnv = {} } = {}) {
  const tables = { todos: [], teams: [], work_teams: [], work_members: [], work_presence: [], work_dives: [], work_replies: [], voip_devices: [], work_memos: [], connections: [], push_devices: [{ user_id: USERS['tok-a'].id, token: 'ExponentPushToken[a]', disabled_at: null }, { user_id: USERS['tok-b'].id, token: 'ExponentPushToken[b]', disabled_at: null }, { user_id: USERS['tok-c'].id, token: 'ExponentPushToken[c]', disabled_at: null }] };
  const pushes = [], receipts = {}, voips = [], apns = {}, livekit = [], openai = [], notionCalls = [], clock = { now: null }; let ticketNo = 0; // clock.now: a test's own time; otherwise NOW (which some tests move)
  const match = (row, [key, cond]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
    if (key === 'or') return cond.slice(1, -1).split(',').some((c) => { const [k, ...r] = c.split('.'); return match(row, [k, r.join('.')]); });
    const v = row[key], [op, ...rest] = cond.split('.'), arg = decodeURIComponent(rest.join('.'));
    if (op === 'eq') return String(v) === arg;
    if (op === 'is') return v === null || v === undefined;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(v));
    if (op === 'gte') return v != null && v >= arg;
    if (op === 'lt') return v != null && v < arg;
    if (op === 'neq') return String(v) !== arg;
    if (op === 'cs') return Array.isArray(v) && arg.replace(/[{}]/g, '').split(',').every((w) => v.includes(w));
    if (op === 'lte') return v != null && v <= arg;
    if (op === 'neq') return String(v) !== arg;
    throw new Error('filter ' + op);
  };
  const rows = (table, search) => tables[table].filter((r) => [...new URLSearchParams(search)].every((f) => match(r, f)));
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  async function fetch(url, init = {}) {
    const u = new URL(url), method = init.method || 'GET';
    if (u.hostname === 'api.openai.com') {
      // The fake ear: a piece saying 'silence' is silence; 'mic-test' is only a mic test (GPT then says nothing was said).
      if (u.pathname.endsWith('/audio/transcriptions')) { const f = init.body.get('file'), raw = await f.text(); openai.push({ kind: 'transcribe', size: f.size, type: f.type, model: init.body.get('model') }); return reply({ text: raw === 'silence' ? '' : raw === 'mic-test' ? '들려요? 마이크 테스트 하나 둘' : `받아쓴 ${openai.filter((o) => o.kind === 'transcribe').length}번째 조각` }); }
      if (u.pathname.endsWith('/responses')) { const body = JSON.parse(init.body); openai.push({ kind: 'summary', input: body.input }); if (/마이크 테스트/.test(body.input[1].content)) return reply({ output_text: JSON.stringify({ nothing: true, title: '', summary: '', decisions: [], todos: [] }) }); return reply({ output_text: JSON.stringify({ nothing: false, title: '발표 자료 회의', summary: '발표 자료를 내일까지 맞추기로 했다.', decisions: ['디자인은 민지가 맡는다'], todos: ['민지: 시안 보내기', '정원: 문구 다듬기'] }) }); }
    }
    if (u.hostname === 'api.notion.com') {
      notionCalls.push({ path: u.pathname, method, body: init.body ? JSON.parse(init.body) : null });
      if (u.pathname === '/v1/search') return reply({ results: [{ object: 'page', id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', url: 'https://notion.so/meeting-notes', properties: { title: { type: 'title', title: [{ plain_text: '회의록' }] } } }] });
      if (u.pathname === '/v1/pages' && method === 'POST') return reply({ id: '11111111-2222-3333-4444-555555555555', url: 'https://notion.so/new-memo' });
      if (u.pathname.startsWith('/v1/databases/')) return reply({ object: 'database', id: u.pathname.split('/').pop(), url: 'https://notion.so/db-meetings', title: [{ plain_text: '회의록 DB' }], properties: { 이름: { type: 'title' }, 날짜: { type: 'date' } } });
      if (u.pathname.startsWith('/v1/pages/') && method === 'GET') return reply({ object: 'page', id: u.pathname.split('/').pop(), url: 'https://notion.so/meeting-notes', properties: { title: { type: 'title', title: [{ plain_text: '회의록' }] } } });
      return reply({});
    }
    if (u.hostname === 'work.livekit.cloud') { livekit.push({ path: u.pathname, body: JSON.parse(init.body), auth: init.headers.Authorization }); return reply({}); }
    if (u.hostname === 'api.push.apple.com') { const token = u.pathname.split('/').pop(), a = apns[token] || { status: 200, body: '' }; voips.push({ token, headers: init.headers, body: JSON.parse(init.body) }); return { ok: a.status < 400, status: a.status, text: async () => a.body }; }
    if (u.hostname === 'exp.host' && u.pathname.endsWith('/getReceipts')) return reply({ data: Object.fromEntries(JSON.parse(init.body).ids.map((id) => [id, receipts[id] || { status: 'ok' }])) });
    if (u.hostname === 'exp.host') { const msgs = JSON.parse(init.body); const tickets = msgs.map(() => ({ status: 'ok', id: 'ticket-' + ++ticketNo })); pushes.push(...msgs.map((m, i) => ({ ...m, ticket: tickets[i].id }))); return reply({ data: tickets }); }
    if (u.pathname === '/auth/v1/user') { const who = USERS[init.headers.Authorization.replace('Bearer ', '')]; return who ? reply(who) : reply({}, 401); }
    if (u.pathname === '/rest/v1/rpc/work_user_ids') {
      const { emails } = JSON.parse(init.body);
      return reply(Object.values(USERS).filter((x) => emails.includes(x.email.toLowerCase())).map((x) => ({ email: x.email.toLowerCase(), id: x.id })));
    }
    const table = u.pathname.split('/').pop(), prefer = init.headers.Prefer || '';
    if (method === 'GET') return reply(rows(table, u.search).map((r) => structuredClone(r)));
    if (method === 'POST') {
      const out = [];
      for (const r of JSON.parse(init.body)) {
        const keys = KEYS[table], same = keys && tables[table].find((x) => keys.every((k) => x[k] === r[k]));
        if (same && prefer.includes('ignore-duplicates')) continue;
        if (same && prefer.includes('merge-duplicates')) { Object.assign(same, r); out.push(structuredClone(same)); continue; }
        const row = { id: crypto.randomUUID(), created_at: new Date(NOW).toISOString(), ended_at: null, ...r };
        tables[table].push(row); out.push(structuredClone(row));
      }
      return reply(out, 201);
    }
    if (method === 'PATCH') { const r = rows(table, u.search); r.forEach((x) => Object.assign(x, JSON.parse(init.body))); return reply(r.map((x) => structuredClone(x))); }
    if (method === 'DELETE') { const gone = new Set(rows(table, u.search)); tables[table] = tables[table].filter((x) => !gone.has(x)); if (table === 'work_teams') tables.work_members = tables.work_members.filter((m) => !([...gone].some((t) => t.id === m.team_id))); return reply(undefined, 204); }
  }
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc', SUPABASE_ANON_KEY: 'pub', STATE_SECRET: 's', HOOK_SECRET: 'h', LIVEKIT_URL: 'wss://work.livekit.cloud', LIVEKIT_API_KEY: 'APIkey', LIVEKIT_API_SECRET: 'secret', ...extraEnv })[k], { fetch, now: () => clock.now ?? NOW, sleep, waitUntil });
  const as = (who) => async (path, body = {}) => {
    const res = await handle(new Request('https://x.supabase.co/functions/v1/integrations/work' + path, { method: 'POST', headers: { Authorization: 'Bearer tok-' + who, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
    const out = await res.json(); if (!res.ok) throw Object.assign(new Error(out.error), { status: res.status }); return out;
  };
  return { tables, pushes, receipts, voips, apns, livekit, openai, notionCalls, clock, a: as('a'), b: as('b'), c: as('c') };
}

test('work: make a team, invite by email, accept, and see who is online', async () => {
  const w = world();
  const { team } = await w.a('/team', { name: '  UO   BioLabs ' });
  assert.equal(team.name, 'UO BioLabs');
  const inv = await w.a('/invite', { team: team.id, emails: ['b@x.com', 'not-an-email', 'new@x.com', 'b@x.com'] });
  assert.deepEqual(inv.invited.sort(), ['b@x.com', 'new@x.com']);
  assert.deepEqual(w.pushes.map((p) => p.to), ['ExponentPushToken[b]'], 'only someone who already has an account gets the invite push');
  assert.match(w.pushes[0].title, /팀에 초대/);
  await assert.rejects(w.b('/invite', { team: team.id, emails: ['c@x.com'] }), /팀원이 아니에요/);
  // B (who signed up as B@x.com) sees the invite, accepts, and the team shows both, A online (just asked), B too.
  let s = await w.b('/state'); assert.deepEqual(s.invites.map((i) => i.name), ['UO BioLabs']); assert.equal(s.teams.length, 0);
  await w.b('/invite/accept', { team: team.id });
  await w.b('/name', { name: '비' });
  s = await w.a('/state');
  const t = s.teams[0];
  assert.deepEqual(t.members.map((m) => [m.email, m.status, m.online]), [['a@x.com', 'active', true], ['b@x.com', 'active', true], ['new@x.com', 'invited', false]]);
  assert.equal(t.members[1].name, '비');
  NOW += 60_000; await w.a('/state'); s = await w.a('/state');
  assert.equal(s.teams[0].members[1].online, false, 'offline once its app stopped asking');
  await assert.rejects(w.b('/member/remove', { team: team.id, email: 'a@x.com' }), /만든 사람만/);
  await w.b('/member/remove', { team: team.id, email: 'b@x.com' }); // B leaves
  assert.equal((await w.a('/state')).teams[0].members.length, 2);
});

test('work: 나에게 테스트 알림 goes to the caller\'s own phones and says how many there are', async () => {
  const w = world({ sleep: () => Promise.resolve() });
  const r = await w.b('/ping');
  assert.equal(r.devices, 1); assert.equal(r.reached, true);
  assert.deepEqual(w.pushes.map((p) => p.to), ['ExponentPushToken[b]']);
  assert.deepEqual(r.receipts, [{ ok: true, error: null, message: null }], 'Expo\'s receipt comes back with the answer');
  // APNs says the address is dead: the receipt says so, and the phone is switched off for pushes.
  w.receipts['ticket-2'] = { status: 'error', message: 'not registered', details: { error: 'DeviceNotRegistered' } };
  const dead = await w.b('/ping');
  assert.deepEqual(dead.receipts, [{ ok: false, error: 'DeviceNotRegistered', message: 'not registered' }]);
  assert.ok(w.tables.push_devices.find((d) => d.token.includes('[b]')).disabled_at, 'switched off');
  assert.equal((await w.b('/ping')).devices, 0);
});

test('work: a picked iPhone with a VoIP address gets the dive as a phone call (APNs), the others the push; a dead address falls back', async () => {
  const w = world({ env: { APNS_KEY: await apnsKey(), APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' }, waitUntil: () => {} });
  w.tables.voip_devices.push({ user_id: USERS['tok-b'].id, token: 'voip-b', disabled_at: null });
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com', 'c@x.com'] });
  await w.b('/invite/accept', { team: team.id }); await w.c('/invite/accept', { team: team.id });
  w.pushes.length = 0;
  const { dive } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id, USERS['tok-c'].id], agenda: '회의' });
  assert.equal(w.voips.length, 1); assert.equal(w.voips[0].token, 'voip-b');
  assert.equal(w.voips[0].headers['apns-push-type'], 'voip'); assert.equal(w.voips[0].headers['apns-topic'], 'com.todochecker.app.voip');
  assert.deepEqual(w.voips[0].body, { aps: {}, kind: 'dive', dive: dive.id, uuid: dive.id, team: team.id, caller: 'a', agenda: '회의' });
  assert.ok(!w.pushes.some((p) => p.to.includes('[b]')), 'B rings as a call: no push on top');
  assert.equal(w.pushes.find((p) => p.to.includes('[c]')).data.picked, true, 'C (no VoIP address) gets the push');
  // 나에게 테스트 전화: Apple's answer per phone.
  assert.deepEqual((await w.b('/ping', { voip: true })).voip, { configured: true, devices: 1, results: [{ ok: true, status: 200, reason: null }] });
  assert.equal(w.voips[1].body.test, true);
  assert.deepEqual((await w.c('/ping', { voip: true })).voip, { configured: true, devices: 0, results: [] });
  // Apple says the address is gone: it is switched off and B gets the push instead.
  w.apns['voip-b'] = { status: 410, body: '{"reason":"Unregistered"}' };
  w.pushes.length = 0;
  await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '다시' });
  assert.ok(w.tables.voip_devices[0].disabled_at, 'switched off');
  assert.equal(w.pushes.find((p) => p.to.includes('[b]')).data.picked, true);
  // Without an APNs key on the server: everyone gets the push, the test call says it is not set up.
  const plain = world(); plain.tables.voip_devices.push({ user_id: USERS['tok-b'].id, token: 'voip-b', disabled_at: null });
  const t2 = (await plain.a('/team', { name: 'S2' })).team;
  await plain.a('/invite', { team: t2.id, emails: ['b@x.com'] }); await plain.b('/invite/accept', { team: t2.id }); plain.pushes.length = 0;
  await plain.a('/dive', { team: t2.id, targets: [USERS['tok-b'].id], agenda: '회의' });
  assert.equal(plain.voips.length, 0); assert.equal(plain.pushes.find((p) => p.to.includes('[b]')).data.picked, true);
  assert.deepEqual((await plain.b('/ping', { voip: true })).voip, { configured: false, devices: 0, results: [] });
});

test('work: a dive rings the picked people again (20 s, 40 s) until they answer, like a call', async () => {
  const later = [], waits = [];
  let go = null;
  // Only the ring's own waits count (the receipts check sleeps too, and never wakes here).
  const w = world({ sleep: (ms) => { if (ms !== 20_000) return new Promise(() => {}); waits.push(ms); return new Promise((r) => { go = r; }); }, waitUntil: (p) => later.push(p) });
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com', 'c@x.com'] });
  await w.b('/invite/accept', { team: team.id }); await w.c('/invite/accept', { team: team.id });
  const { dive } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id, USERS['tok-c'].id], agenda: '급한 회의' });
  const rings = () => w.pushes.filter((p) => p.data?.picked).map((p) => p.to.slice(-2, -1)).sort().join('');
  assert.equal(rings(), 'bc');
  // 20 s on: nobody answered → both again. Then C answers "busy"; 40 s on: only B.
  w.pushes.length = 0; go(); await new Promise((r) => setTimeout(r, 0)); await new Promise((r) => setTimeout(r, 0));
  for (let i = 0; i < 20 && !waits[1]; i++) await new Promise((r) => setTimeout(r, 0));
  assert.equal(rings(), 'bc');
  await w.c('/dive/reply', { dive: dive.id, answer: 'busy' });
  w.pushes.length = 0; go(); await Promise.race(later); // the ring task ends; the receipts checks never wake here
  assert.equal(rings(), 'b');
  assert.deepEqual(waits, [20_000, 20_000]);
});

test('work: a dive picks teammates and an agenda, pushes them first, and anyone can join or decline', async () => {
  const w = world();
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com', 'c@x.com'] });
  await w.b('/invite/accept', { team: team.id }); await w.c('/invite/accept', { team: team.id });
  w.pushes.length = 0;
  await assert.rejects(w.a('/dive', { team: team.id, targets: [], agenda: '회의' }), /한 명 이상/);
  await assert.rejects(w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '   ' }), /안건/);
  const long = '가'.repeat(80);
  const { dive, call } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: long });
  assert.equal(w.tables.work_dives[0].agenda.length, 50, 'agenda is cut to 50 characters');
  // The LiveKit token: an HS256 JWT for this room, as A.
  const [, payload] = call.token.split('.').map((p, i) => (i < 2 ? JSON.parse(Buffer.from(p, 'base64url').toString()) : p));
  assert.equal(call.url, 'wss://work.livekit.cloud');
  assert.deepEqual([payload.iss, payload.sub, payload.video.room, payload.video.roomJoin], ['APIkey', USERS['tok-a'].id, w.tables.work_dives[0].room, true]);
  // B (picked) gets the important one, C an ordinary one.
  assert.ok(!w.pushes.some((p) => p.to.includes('[a]')), 'not to the caller');
  const toB = w.pushes.find((p) => p.to.includes('[b]')), toC = w.pushes.find((p) => p.to.includes('[c]'));
  assert.equal(toB.interruptionLevel, 'time-sensitive'); assert.equal(toB.data.picked, true); assert.equal(toB.sound, 'dive_ring.wav');
  assert.equal(toC.interruptionLevel, undefined); assert.equal(toC.data.kind, 'dive');
  // Everyone in the team sees it; B declines with "카톡 가능", C joins (not picked, but allowed).
  let s = await w.c('/state'); assert.equal(s.dives[0].agenda.length, 50); assert.deepEqual(s.dives[0].targets, [USERS['tok-b'].id]);
  w.pushes.length = 0;
  await w.b('/dive/reply', { dive: dive.id, answer: 'kakao' });
  assert.match(w.pushes[0].title, /카톡 가능/); assert.deepEqual(w.pushes.map((p) => p.to), ['ExponentPushToken[a]'], 'the answer goes to the caller');
  await assert.rejects(w.b('/dive/reply', { dive: dive.id, answer: 'maybe' }), /답을 골라/);
  const joined = await w.c('/dive/join', { dive: dive.id });
  assert.ok(joined.call.token);
  s = await w.a('/state');
  assert.deepEqual(Object.fromEntries(s.dives[0].replies.map((r) => [r.id.slice(-1), r.answer])), { a: 'join', b: 'kakao', c: 'join' });
  assert.equal(s.teams[0].members.find((m) => m.email === 'c@x.com').inDive, dive.id);
  // Someone outside the team can't see or join it.
  await assert.rejects(world().b('/dive/join', { dive: dive.id }), /찾을 수 없어요|팀원이 아니에요/);
  // The dive is a room: leaving does not close it. Empty, it says so and goes away by itself 6 hours later.
  await w.a('/dive/leave', { dive: dive.id });
  let st = await w.a('/state'); assert.equal(st.dives.length, 1, 'C is still in it'); assert.equal(st.dives[0].emptySince, null);
  await w.c('/dive/leave', { dive: dive.id });
  st = await w.a('/state'); assert.equal(st.dives.length, 1, 'the room stays'); assert.equal(st.dives[0].emptySince, new Date(NOW).toISOString());
  assert.equal(st.teams[0].members.find((m) => m.email === 'c@x.com').inDive, null);
  // Someone comes back in: not empty any more; out again: empty from now.
  w.clock.now = NOW + 3600_000;
  await w.c('/dive/join', { dive: dive.id }); assert.equal((await w.a('/state')).dives[0].emptySince, null);
  await w.c('/dive/leave', { dive: dive.id }); assert.equal((await w.a('/state')).dives[0].emptySince, new Date(NOW + 3600_000).toISOString());
  // Only the one who opened the room can delete it; everyone else just leaves.
  await assert.rejects(w.c('/dive/delete', { dive: dive.id }), /방을 연 사람만/);
  // 6 hours empty: gone (and a late join finds no room).
  w.clock.now = NOW + 3600_000 + 6 * 3600_000 + 1;
  assert.equal((await w.a('/state')).dives.length, 0);
  await assert.rejects(w.c('/dive/join', { dive: dive.id }), /사라진 방/);
});

test('work: someone whose app went quiet is no longer in the room (so it can empty out); deleting a room closes the call for everyone', async () => {
  const w = world(), B = USERS['tok-b'].id;
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  const { dive } = await w.a('/dive', { team: team.id, targets: [B], agenda: '회의' });
  await w.b('/dive/join', { dive: dive.id });
  let s = await w.a('/state');
  assert.deepEqual(s.dives[0].replies.filter((r) => r.answer === 'join').map((r) => r.id.slice(-1)).sort(), ['a', 'b']);
  assert.equal(s.teams[0].members.find((m) => m.email === 'b@x.com').inDive, dive.id, 'B shows as 다이브 중');
  // B's phone is closed mid-call (no leave, no more looks): two minutes on, B is out of the room.
  w.clock.now = NOW + 130_000;
  s = await w.a('/state');
  assert.equal(s.dives[0].replies.find((r) => r.id === B).answer, 'left');
  assert.equal(s.teams[0].members.find((m) => m.email === 'b@x.com').inDive, null);
  assert.equal(s.dives[0].emptySince, null, 'A is still in (A just looked)');
  assert.equal(w.tables.work_replies.find((r) => r.user_id === B).answer, 'left', 'written, not only shown');
  // A leaves: the room is empty from now.
  await w.a('/dive/leave', { dive: dive.id });
  s = await w.a('/state'); assert.equal(s.dives[0].emptySince, new Date(NOW + 130_000).toISOString());
  // Deleting the room closes the LiveKit room too, with a token allowed to manage it.
  await w.a('/dive/delete', { dive: dive.id });
  const closed = w.livekit.find((c) => c.path.endsWith('/DeleteRoom'));
  assert.equal(closed.body.room, w.tables.work_dives[0].room);
  const payload = JSON.parse(Buffer.from(closed.auth.replace('Bearer ', '').split('.')[1], 'base64url').toString());
  assert.deepEqual([payload.iss, payload.video.roomAdmin, payload.video.room], ['APIkey', true, w.tables.work_dives[0].room]);
});

test('work: 부재중 — a picked person who did not answer sees the dive after the ring, open or gone; answered or seen ones are not listed', async () => {
  const w = world(), B = USERS['tok-b'].id;
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com', 'c@x.com'] }); await w.b('/invite/accept', { team: team.id }); await w.c('/invite/accept', { team: team.id });
  const { dive } = await w.a('/dive', { team: team.id, targets: [B], agenda: '급한 회의' });
  assert.deepEqual((await w.b('/state')).missed, [], 'still ringing: not missed yet');
  w.clock.now = NOW + 61_000;
  let s = await w.b('/state');
  assert.deepEqual(s.missed.map((m) => [m.id, m.by.slice(-1), m.agenda, m.open]), [[dive.id, 'a', '급한 회의', true]]);
  assert.deepEqual((await w.c('/state')).missed, [], 'C was not called');
  assert.deepEqual((await w.a('/state')).missed, [], 'the caller never misses their own');
  assert.deepEqual(missedDives(s, [dive.id]), [], 'seen on the device: gone from the list');
  // The room is deleted: still listed as missed (closed), until the day is over.
  await w.a('/dive/delete', { dive: dive.id });
  assert.equal((await w.b('/state')).missed[0].open, false);
  w.clock.now = NOW + 25 * 3600_000;
  assert.deepEqual((await w.b('/state')).missed, [], 'a day later it is history');
  // Answering (joining or replying) in time: not missed.
  w.clock.now = NOW + 25 * 3600_000;
  const { dive: d2 } = await w.a('/dive', { team: team.id, targets: [B], agenda: '둘' });
  await w.b('/dive/reply', { dive: d2.id, answer: 'busy' });
  w.clock.now = NOW + 25 * 3600_000 + 61_000;
  assert.deepEqual((await w.b('/state')).missed, []);
});

test('memo: a recording comes in pieces and is written down as it goes, summed up at the end, listed for the team, and sent to Notion', async () => {
  const w = world({ env: { OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-test' } });
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  const { dive } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '발표 자료' });
  const { memo } = await w.a('/memo/start', { team: team.id, dive: dive.id, title: '발표 자료' });
  assert.equal(memo.state, 'recording');
  const piece = Buffer.from('fake-opus-bytes').toString('base64');
  const one = await w.a('/memo/chunk', { memo: memo.id, index: 0, audio: piece, mime: 'audio/webm;codecs=opus' });
  assert.equal(one.text, '받아쓴 1번째 조각');
  assert.deepEqual(w.openai[0], { kind: 'transcribe', size: 15, type: 'audio/webm;codecs=opus', model: 'gpt-4o-mini-transcribe' });
  // Pieces may arrive out of order; the text keeps their order.
  await w.a('/memo/chunk', { memo: memo.id, index: 2, audio: piece, mime: 'audio/webm' });
  const two = await w.a('/memo/chunk', { memo: memo.id, index: 1, audio: piece, mime: 'audio/webm' });
  assert.equal(two.memo.transcript, '받아쓴 1번째 조각 받아쓴 3번째 조각 받아쓴 2번째 조각');
  await assert.rejects(w.a('/memo/chunk', { memo: memo.id, index: 3, audio: '', mime: 'audio/webm' }), /비어/);
  const done = await w.a('/memo/finish', { memo: memo.id });
  assert.equal(done.memo.state, 'done'); assert.equal(done.memo.summary.title, '발표 자료 회의'); assert.deepEqual(done.memo.summary.todos, ['민지: 시안 보내기', '정원: 문구 다듬기']);
  assert.match(w.openai.find((o) => o.kind === 'summary').input[1].content, /안건: 발표 자료/);
  await assert.rejects(w.a('/memo/chunk', { memo: memo.id, index: 4, audio: piece }), /끝난 메모/);
  // Teammates see it; outsiders do not.
  assert.deepEqual((await w.b('/memos', { team: team.id })).memos.map((m) => [m.title, m.state]), [['발표 자료', 'done']]);
  await assert.rejects(w.c('/memos', { team: team.id }), /팀원이 아니에요/);
  // To Notion: through the person's own connection, as a page under the page they pick.
  await assert.rejects(w.a('/memo/notion/search', { q: '회의' }), /노션이 연결/);
  w.tables.connections.push({ id: 'conn-1', user_id: USERS['tok-a'].id, provider: 'notion', account: 'Studio 워크스페이스', secret: { access_token: 'ntn-token' }, meta: {} });
  const found = (await w.a('/memo/notion/search', { q: '회의' })).results;
  assert.deepEqual(found.map((r) => [r.title, r.type, r.connection, r.workspace]), [['회의록', 'page', 'conn-1', 'Studio 워크스페이스']]);
  const sent = await w.a('/memo/notion', { memo: memo.id, page: found[0].id, type: 'page', connection: 'conn-1' });
  assert.equal(sent.url, 'https://notion.so/new-memo');
  const made = w.notionCalls.find((c) => c.path === '/v1/pages' && c.method === 'POST');
  assert.equal(made.body.parent.page_id, 'aaaaaaaabbbbccccddddeeeeeeeeeeee');
  assert.match(made.body.properties.title.title[0].text.content, /발표 자료 · /);
  assert.deepEqual(made.body.children.map((b) => b.type).slice(0, 6), ['heading_2', 'paragraph', 'heading_2', 'bulleted_list_item', 'heading_2', 'to_do']);
  assert.equal((await w.a('/memos', { team: team.id })).memos[0].notionUrl, 'https://notion.so/new-memo');
  // Into a database: its title property is found by type.
  await w.a('/memo/notion', { memo: memo.id, page: 'dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb', type: 'database', connection: 'conn-1' });
  const row = w.notionCalls.filter((c) => c.path === '/v1/pages').at(-1);
  assert.deepEqual(Object.keys(row.body.properties), ['이름', '날짜']); assert.equal(row.body.parent.database_id, 'dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb');
  assert.equal(row.body.properties.날짜.date.start, memo.createdAt); // its date property (found by type) gets the memo's day
  // Only the one who recorded deletes it.
  await assert.rejects(w.b('/memo/delete', { memo: memo.id }), /녹음한 사람/);
  await w.a('/memo/delete', { memo: memo.id });
  assert.deepEqual((await w.a('/memos', { team: team.id })).memos, []);
});

test('memo store: one place per team (anyone sets it, everyone sees it), one recording per room, the note goes to the team\'s Notion DB by itself, nothing said → no note, a dead recording is finished by the server', async () => {
  const w = world({ env: { OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-test' } });
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  // Not chosen yet: no store, so rooms are not recorded by themselves.
  assert.equal((await w.a('/state')).teams[0].memoStore, null);
  // b (not the owner) picks a Notion DB through their own connection; its title is read now and kept for everyone.
  await assert.rejects(w.b('/team/memo-store', { team: team.id, store: { kind: 'notion', page: 'dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb', type: 'database' } }), /노션이 연결/);
  w.tables.connections.push({ id: 'conn-b', user_id: USERS['tok-b'].id, provider: 'notion', account: 'B 워크스페이스', secret: { access_token: 'ntn-b' }, meta: {} });
  const set = await w.b('/team/memo-store', { team: team.id, store: { kind: 'notion', page: 'dbdbdbdb-dbdb-dbdb-dbdb-dbdbdbdbdbdb', type: 'database', connection: 'conn-b' } });
  assert.deepEqual([set.store.kind, set.store.type, set.store.page, set.store.title, set.store.url, set.store.by, 'connection' in set.store], ['notion', 'database', 'dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb', '회의록 DB', 'https://notion.so/db-meetings', USERS['tok-b'].id, false]);
  const seenByA = (await w.a('/state')).teams[0].memoStore;
  assert.equal(seenByA.title, '회의록 DB'); assert.equal(seenByA.by, USERS['tok-b'].id); assert.equal(typeof seenByA.byName, 'string');
  // A room: a's computer starts recording; b's, joining too, is told a records instead of starting a second one.
  const { dive } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '주간 회의' });
  const first = await w.a('/memo/start', { team: team.id, dive: dive.id, title: '주간 회의', auto: true });
  assert.equal(first.memo.state, 'recording');
  assert.deepEqual(await w.b('/memo/start', { team: team.id, dive: dive.id, title: '주간 회의', auto: true }), { memo: null, recorder: USERS['tok-a'].id });
  await assert.rejects(w.b('/memo/start', { team: team.id, dive: dive.id, title: '주간 회의' }), /이미 다른 사람이/);
  assert.equal((await w.b('/state')).dives[0].recording, USERS['tok-a'].id);
  // Pieces → the end: GPT is told the note is a row of that DB (and the team), and the row is made, with its date.
  const piece = Buffer.from('fake-opus-bytes').toString('base64');
  await w.a('/memo/chunk', { memo: first.memo.id, index: 0, audio: piece, mime: 'audio/webm' });
  const done = await w.a('/memo/finish', { memo: first.memo.id });
  assert.equal(done.memo.state, 'done'); assert.deepEqual(done.stored, { kind: 'notion', type: 'database', title: '회의록 DB', url: 'https://notion.so/new-memo' });
  assert.equal(done.memo.notionUrl, 'https://notion.so/new-memo'); assert.deepEqual(done.memo.stored, done.stored); assert.equal('nothing' in done.memo.summary, false);
  const rules = w.openai.find((o) => o.kind === 'summary').input[0].content;
  assert.match(rules, /노션 데이터베이스 '회의록 DB'/); assert.match(rules, /팀: Studio/); assert.match(rules, /nothing/);
  const row = w.notionCalls.filter((c) => c.path === '/v1/pages' && c.method === 'POST').at(-1);
  assert.equal(row.body.parent.database_id, 'dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb');
  assert.equal(row.body.properties.이름.title[0].text.content, '발표 자료 회의'); // a DB row's title is the summary's own (no date in it)
  assert.ok(row.body.properties.날짜.date.start);
  assert.equal((await w.b('/state')).dives[0].recording, null);
  // Finishing again changes nothing (no second row).
  assert.equal((await w.a('/memo/finish', { memo: first.memo.id })).memo.notionUrl, 'https://notion.so/new-memo');
  assert.equal(w.notionCalls.filter((c) => c.path === '/v1/pages' && c.method === 'POST').length, 1);
  // Nothing said: silence is thrown away without asking GPT; a mic test is thrown away by GPT (nothing: true).
  const silent = await w.a('/memo/start', { team: team.id, dive: dive.id, title: '빈 방' });
  await w.a('/memo/chunk', { memo: silent.memo.id, index: 0, audio: Buffer.from('silence').toString('base64'), mime: 'audio/webm' });
  const summaries = w.openai.filter((o) => o.kind === 'summary').length;
  assert.deepEqual(await w.a('/memo/finish', { memo: silent.memo.id }), { memo: null, reason: 'empty' });
  assert.equal(w.openai.filter((o) => o.kind === 'summary').length, summaries);
  const mic = await w.a('/memo/start', { team: team.id, dive: dive.id, title: '테스트' });
  await w.a('/memo/chunk', { memo: mic.memo.id, index: 0, audio: Buffer.from('mic-test').toString('base64'), mime: 'audio/webm' });
  assert.deepEqual(await w.a('/memo/finish', { memo: mic.memo.id }), { memo: null, reason: 'nothing' });
  assert.deepEqual((await w.a('/memos', { team: team.id })).memos.map((m) => m.title), ['주간 회의']);
  // A recording whose pieces stopped coming 5 minutes ago (the computer slept) is finished by the server on the next look.
  const dead = await w.a('/memo/start', { team: team.id, dive: dive.id, title: '끊긴 녹음' });
  await w.a('/memo/chunk', { memo: dead.memo.id, index: 0, audio: piece, mime: 'audio/webm' });
  assert.equal((await w.b('/state')).dives[0].recording, USERS['tok-a'].id);
  w.tables.work_memos.find((m) => m.id === dead.memo.id).updated_at = new Date(NOW - 6 * 60_000).toISOString();
  await w.b('/state');
  for (let i = 0; i < 50 && w.tables.work_memos.find((m) => m.id === dead.memo.id).state !== 'done'; i++) await new Promise((r) => setImmediate(r));
  assert.equal(w.tables.work_memos.find((m) => m.id === dead.memo.id).state, 'done');
  assert.equal((await w.b('/state')).dives[0].recording, null);
  assert.equal(w.notionCalls.filter((c) => c.path === '/v1/pages' && c.method === 'POST').length, 2);
  // 로컬 저장소: the server keeps the note (the computers write the files); GPT is told it is a markdown file.
  await w.a('/team/memo-store', { team: team.id, store: { kind: 'local' } });
  assert.equal((await w.b('/state')).teams[0].memoStore.kind, 'local');
  const local = await w.a('/memo/start', { team: team.id, dive: dive.id, title: '로컬' });
  await w.a('/memo/chunk', { memo: local.memo.id, index: 0, audio: piece, mime: 'audio/webm' });
  const localDone = await w.a('/memo/finish', { memo: local.memo.id });
  assert.deepEqual(localDone.stored, { kind: 'local' }); assert.equal(localDone.memo.notionUrl, null);
  assert.match(w.openai.filter((o) => o.kind === 'summary').at(-1).input[0].content, /마크다운/);
  // The store's Notion connection gone: the note is kept as a memo, the answer says Notion failed (the app can send it by hand).
  await w.b('/team/memo-store', { team: team.id, store: { kind: 'notion', page: 'dbdbdbdbdbdbdbdbdbdbdbdbdbdbdbdb', type: 'database', connection: 'conn-b' } });
  w.tables.connections = w.tables.connections.filter((c) => c.id !== 'conn-b');
  const orphan = await w.a('/memo/start', { team: team.id, dive: dive.id, title: '연결 끊김' });
  await w.a('/memo/chunk', { memo: orphan.memo.id, index: 0, audio: piece, mime: 'audio/webm' });
  const orphanDone = await w.a('/memo/finish', { memo: orphan.memo.id });
  assert.equal(orphanDone.memo.state, 'done'); assert.equal(orphanDone.stored.kind, 'notion'); assert.match(orphanDone.stored.error, /노션 연결이 끊겼어요/); assert.equal(orphanDone.memo.notionUrl, null);
  // Cleared by anyone in the team; outsiders and unknown kinds are refused. The owner may delete a teammate's memo.
  await w.b('/team/memo-store', { team: team.id, store: null });
  assert.equal((await w.a('/state')).teams[0].memoStore, null);
  await assert.rejects(w.c('/team/memo-store', { team: team.id, store: { kind: 'local' } }), /팀원이 아니/);
  await assert.rejects(w.a('/team/memo-store', { team: team.id, store: { kind: 'dropbox' } }), /로컬 저장소나 노션/);
  await assert.rejects(w.b('/memo/delete', { memo: orphan.memo.id }), /녹음한 사람/);
  w.tables.work_memos.find((m) => m.id === orphan.memo.id).user_id = USERS['tok-b'].id;
  await w.a('/memo/delete', { memo: orphan.memo.id });
});

test('work: the one who opened a room deletes it — from inside the call or from the list — and everyone in it is out', async () => {
  const w = world();
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  const { dive } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '회의' });
  await w.b('/dive/join', { dive: dive.id });
  // A leaves; the room stays with B in it. Then A deletes it from the list.
  await w.a('/dive/leave', { dive: dive.id });
  assert.equal((await w.b('/state')).dives.length, 1);
  await w.a('/dive/delete', { dive: dive.id });
  const st = await w.b('/state');
  assert.equal(st.dives.length, 0);
  assert.equal(st.teams[0].members.find((m) => m.email === 'B@x.com'.toLowerCase()).inDive, null, 'B is out too');
  // From inside: end = true on leave does the same.
  const { dive: d2 } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '둘' });
  await w.a('/dive/leave', { dive: d2.id, end: true });
  assert.equal((await w.a('/state')).dives.length, 0);
});

test('work: a VoIP-rung iPhone that does not answer gets a missed-call push 70 s on, while the room is still open', async () => {
  const later = [], waits = [];
  const w = world({ env: { APNS_KEY: await apnsKey(), APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' }, sleep: (ms) => { waits.push(ms); return Promise.resolve(); }, waitUntil: (p) => later.push(p) });
  w.tables.voip_devices.push({ user_id: USERS['tok-b'].id, token: 'voip-b', disabled_at: null });
  const { team } = await w.a('/team', { name: 'Studio' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  w.pushes.length = 0;
  const { dive } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '회의' });
  await Promise.all(later);
  assert.ok(waits.includes(70_000));
  const missed = w.pushes.find((p) => p.to.includes('[b]'));
  assert.match(missed.title, /부재중/); assert.equal(missed.data.dive, dive.id);
  // Answered (or declined) in time: nothing.
  later.length = 0; w.pushes.length = 0;
  const { dive: d2 } = await w.a('/dive', { team: team.id, targets: [USERS['tok-b'].id], agenda: '둘' });
  await w.b('/dive/reply', { dive: d2.id, answer: 'busy' }); w.pushes.length = 0;
  await Promise.all(later);
  assert.equal(w.pushes.filter((p) => p.to.includes('[b]')).length, 0);
});

test('work: without LiveKit settings a dive says the call server is not set up', async () => {
  const w = world();
  const { team } = await w.a('/team', { name: 'T' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc' })[k], {});
  const { livekitToken } = await import('../../supabase/functions/_shared/work.js');
  await assert.rejects(livekitToken(env, { room: 'r', identity: 'i', name: 'n' }), /LiveKit/);
});

test('work: the desktop/web bridge only passes the Work routes, and only a wss:// call server', async () => {
  const { createRequire } = await import('node:module');
  const tools = createRequire(import.meta.url)('../electron/tools.cjs');
  const calls = [];
  const fake = { work: async (path, body) => { calls.push([path, body]); return path === '/dive/join' ? { call: { url: body.bad ? 'https://evil.example' : 'wss://work.livekit.cloud', token: 't' } } : { ok: true }; } };
  assert.equal((await tools.run(fake, 'work', { path: '/state' })).ok, true);
  assert.match((await tools.run(fake, 'work', { path: '/../oauth/start' })).error, /찾을 수 없어요/);
  assert.equal((await tools.run(fake, 'work', { path: '/dive/join', body: { dive: 'x' } })).call.url, 'wss://work.livekit.cloud');
  assert.match((await tools.run(fake, 'work', { path: '/dive/join', body: { dive: 'x', bad: 1 } })).error, /통화 서버 주소/);
  assert.match((await tools.run(fake, 'work', { path: '/name', body: { name: 'x'.repeat(5000) } })).error, /너무 길어요/);
  assert.deepEqual(calls.map((c) => c[0]), ['/state', '/dive/join', '/dive/join']);
});

test('work alerts: a new dive (important when picked), answers to my dive, invites — each once; the first look stays quiet', async () => {
  const { workAlerts, incomingDive } = await import('../../shared/work-alerts.mjs');
  const now = Date.parse('2026-11-06T03:00:00Z'), at = (s) => new Date(now - s * 1000).toISOString();
  const team = { id: 't', members: [{ id: 'me', name: '나' }, { id: 'b', name: '민지' }, { id: 'c', name: '서준' }] };
  const state = (dives, invites = []) => ({ me: { id: 'me' }, teams: [team], invites, dives });
  const seen = new Set();
  // First look: an old dive is only remembered; one from 30 s ago still rings.
  let a = workAlerts(state([{ id: 'old', team: 't', by: 'b', agenda: '어제 것', targets: ['me'], createdAt: at(600), replies: [] }, { id: 'new', team: 't', by: 'b', agenda: '지금', targets: ['me'], createdAt: at(30), replies: [] }]), seen, { now, first: true });
  assert.deepEqual(a.map((x) => [x.dive, x.important]), [['new', true]]);
  assert.match(a[0].title, /민지님이 다이브를 요청/);
  // Next look: a dive I wasn't picked for (ordinary), an answer to my dive, an invite.
  a = workAlerts(state([{ id: 'other', team: 't', by: 'c', agenda: '공유', targets: ['b'], createdAt: at(5), replies: [] }, { id: 'mine', team: 't', by: 'me', agenda: '내 안건', targets: ['b'], createdAt: at(60), replies: [{ id: 'b', answer: 'busy' }] }], [{ team: 't2', name: 'Studio' }]), seen, { now });
  assert.deepEqual(a.map((x) => x.title), ['서준님의 다이브가 열렸어요', '민지: 지금 연락 불가', '팀 초대: Studio']);
  assert.equal(a[0].important, false);
  assert.equal(workAlerts(state([{ id: 'other', team: 't', by: 'c', agenda: '공유', targets: ['b'], createdAt: at(5), replies: [] }]), seen, { now }).length, 0, 'nothing twice');
  assert.equal(incomingDive(state([{ id: 'x', team: 't', by: 'b', targets: ['me'], replies: [{ id: 'me', answer: 'kakao' }] }])), null, 'answered: no incoming card');
  assert.deepEqual(workAlerts({ ok: true }, new Set()), [], 'an empty answer is no news');
});

test('work: each member can tag the team with one of their own 체커 teams (or none) — only a link', async () => {
  const w = world();
  const { team } = await w.a('/team', { name: 'UO BioLabs' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  assert.deepEqual((await w.a('/state')).teams[0].links, [], 'untagged by default');
  await w.a('/link', { team: team.id, checkerTeams: ['k-uo', 'k-studio', 'k-uo', 7, ''] });
  await w.b('/link', { team: team.id, checkerTeam: '울트원' }); // an older app: one tag
  let s = (await w.a('/state')).teams[0];
  assert.deepEqual([s.links, s.link], [['k-uo', 'k-studio'], 'k-uo'], 'several, without repeats; the first one for older apps');
  assert.deepEqual((await w.b('/state')).teams[0].links, ['울트원'], 'per person');
  await w.a('/link', { team: team.id, checkerTeams: [] });
  s = (await w.a('/state')).teams[0];
  assert.deepEqual([s.links, s.link], [[], null]);
  await assert.rejects(w.c('/link', { team: team.id, checkerTeam: 'x' }), /팀원이 아니에요/);
});

test('work: only the maker renames the team', async () => {
  const w = world();
  const { team } = await w.a('/team', { name: 'Old' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  await assert.rejects(w.b('/team/rename', { team: team.id, name: 'Mine' }), /만든 사람만/);
  await assert.rejects(w.a('/team/rename', { team: team.id, name: '   ' }), /팀 이름/);
  await w.a('/team/rename', { team: team.id, name: '  UO   BioLabs ' });
  assert.equal((await w.b('/state')).teams[0].name, 'UO BioLabs');
});

test('work: a teammate board — their to-dos except private ones, their 체커 teams and their pet; only for teammates', async () => {
  const w = world();
  const { team } = await w.a('/team', { name: 'T' });
  await w.a('/invite', { team: team.id, emails: ['b@x.com'] }); await w.b('/invite/accept', { team: team.id });
  const B = USERS['tok-b'].id, today = '2026-11-06';
  w.tables.todos.push(
    { id: 't1', user_id: B, title: '실험', date: today, end_date: null, start_time: '10:00', end_time: null, status: 'todo', team_id: 'k1', deleted_at: null, extra: {} },
    { id: 't2', user_id: B, title: '비밀', date: today, status: 'todo', deleted_at: null, extra: { private: true } },
    { id: 't3', user_id: B, title: '학회', date: '2026-11-01', end_date: '2026-11-08', status: 'todo', deleted_at: null, extra: { doneDays: ['2026-11-02'] } },
    { id: 't4', user_id: B, title: '옛날', date: '2026-09-01', end_date: null, status: 'todo', deleted_at: null, extra: {} },
    { id: 't5', user_id: B, title: '버킷', date: today, status: 'bucket', deleted_at: null, extra: {} },
    { id: 't6', user_id: USERS['tok-a'].id, title: '남의 것', date: today, status: 'todo', deleted_at: null, extra: {} },
  );
  w.tables.teams.push({ id: 'k1', user_id: B, name: 'UO', color: '#6685e8', deleted_at: null });
  await w.b('/state', { pet: { species: 'dog', design: 0, name: '보리', extra: 'x'.repeat(500) } });
  const board = await w.a('/member', { team: team.id, member: B });
  assert.deepEqual(board.todos.map((t) => t.title).sort(), ['실험', '학회']);
  assert.equal(board.hidden, 1, 'one private to-do left out');
  assert.deepEqual(board.todos.find((t) => t.id === 't3').doneDays, ['2026-11-02']);
  assert.deepEqual(board.teams, [{ id: 'k1', name: 'UO', color: '#6685e8' }]);
  assert.deepEqual(board.pet, { species: 'dog', design: 0, color: null, name: '보리' });
  await assert.rejects(w.c('/member', { team: team.id, member: B }), /팀원이 아니에요/);
  await assert.rejects(w.a('/member', { team: team.id, member: USERS['tok-c'].id }), /팀원이 아니에요/);
});
