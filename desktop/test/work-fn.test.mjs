// 팀버전 (Work) on the server (supabase/functions/_shared/work.js): teams, email invites, online state, dives with a
// LiveKit room token, pushes (important for the picked people), the two declines, and leaving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, environment } from '../../supabase/functions/_shared/router.js';

let NOW = Date.parse('2026-11-06T03:00:00Z');
const USERS = { 'tok-a': { id: '00000000-0000-4000-8000-00000000000a', email: 'a@x.com' }, 'tok-b': { id: '00000000-0000-4000-8000-00000000000b', email: 'B@x.com' }, 'tok-c': { id: '00000000-0000-4000-8000-00000000000c', email: 'c@x.com' } };
const KEYS = { work_members: ['team_id', 'email'], work_presence: ['user_id'], work_replies: ['dive_id', 'user_id'], voip_devices: ['user_id', 'token'] };
// An APNs key for the tests (a P-256 key in a .p8, as Apple hands it out).
async function apnsKey() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).toString('base64')}\n-----END PRIVATE KEY-----\n`;
}

function world({ sleep = () => new Promise(() => {}), waitUntil = (p) => p, env: extraEnv = {} } = {}) {
  const tables = { todos: [], teams: [], work_teams: [], work_members: [], work_presence: [], work_dives: [], work_replies: [], voip_devices: [], push_devices: [{ user_id: USERS['tok-a'].id, token: 'ExponentPushToken[a]', disabled_at: null }, { user_id: USERS['tok-b'].id, token: 'ExponentPushToken[b]', disabled_at: null }, { user_id: USERS['tok-c'].id, token: 'ExponentPushToken[c]', disabled_at: null }] };
  const pushes = [], receipts = {}, voips = [], apns = {}; let ticketNo = 0;
  const match = (row, [key, cond]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
    if (key === 'or') return cond.slice(1, -1).split(',').some((c) => { const [k, ...r] = c.split('.'); return match(row, [k, r.join('.')]); });
    const v = row[key], [op, ...rest] = cond.split('.'), arg = decodeURIComponent(rest.join('.'));
    if (op === 'eq') return String(v) === arg;
    if (op === 'is') return v === null || v === undefined;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(v));
    if (op === 'gte') return v != null && v >= arg;
    if (op === 'lte') return v != null && v <= arg;
    if (op === 'neq') return String(v) !== arg;
    throw new Error('filter ' + op);
  };
  const rows = (table, search) => tables[table].filter((r) => [...new URLSearchParams(search)].every((f) => match(r, f)));
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  async function fetch(url, init = {}) {
    const u = new URL(url), method = init.method || 'GET';
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
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc', SUPABASE_ANON_KEY: 'pub', STATE_SECRET: 's', HOOK_SECRET: 'h', LIVEKIT_URL: 'wss://work.livekit.cloud', LIVEKIT_API_KEY: 'APIkey', LIVEKIT_API_SECRET: 'secret', ...extraEnv })[k], { fetch, now: () => NOW, sleep, waitUntil });
  const as = (who) => async (path, body = {}) => {
    const res = await handle(new Request('https://x.supabase.co/functions/v1/integrations/work' + path, { method: 'POST', headers: { Authorization: 'Bearer tok-' + who, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
    const out = await res.json(); if (!res.ok) throw Object.assign(new Error(out.error), { status: res.status }); return out;
  };
  return { tables, pushes, receipts, voips, apns, a: as('a'), b: as('b'), c: as('c') };
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
  const w = world({ env: { APNS_KEY: await apnsKey(), APNS_KEY_ID: 'K', APNS_TEAM_ID: 'T' } });
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
  assert.equal(toB.interruptionLevel, 'time-sensitive'); assert.equal(toB.data.picked, true); assert.equal(toB.sound, 'dive-ring.wav');
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
  // When the last one in the call leaves, the dive is over.
  await w.a('/dive/leave', { dive: dive.id });
  assert.equal((await w.a('/state')).dives.length, 1, 'C is still in it');
  await w.c('/dive/leave', { dive: dive.id });
  assert.equal((await w.a('/state')).dives.length, 0);
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
