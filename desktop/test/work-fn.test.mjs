// 팀버전 (Work) on the server (supabase/functions/_shared/work.js): teams, email invites, online state, dives with a
// LiveKit room token, pushes (important for the picked people), the two declines, and leaving.
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle, environment } from '../../supabase/functions/_shared/router.js';

let NOW = Date.parse('2026-11-06T03:00:00Z');
const USERS = { 'tok-a': { id: '00000000-0000-4000-8000-00000000000a', email: 'a@x.com' }, 'tok-b': { id: '00000000-0000-4000-8000-00000000000b', email: 'B@x.com' }, 'tok-c': { id: '00000000-0000-4000-8000-00000000000c', email: 'c@x.com' } };
const KEYS = { work_members: ['team_id', 'email'], work_presence: ['user_id'], work_replies: ['dive_id', 'user_id'] };

function world() {
  const tables = { work_teams: [], work_members: [], work_presence: [], work_dives: [], work_replies: [], push_devices: [{ user_id: USERS['tok-a'].id, token: 'ExponentPushToken[a]', disabled_at: null }, { user_id: USERS['tok-b'].id, token: 'ExponentPushToken[b]', disabled_at: null }, { user_id: USERS['tok-c'].id, token: 'ExponentPushToken[c]', disabled_at: null }] };
  const pushes = [];
  const match = (row, [key, cond]) => {
    if (['select', 'order', 'limit', 'on_conflict'].includes(key)) return true;
    const v = row[key], [op, ...rest] = cond.split('.'), arg = decodeURIComponent(rest.join('.'));
    if (op === 'eq') return String(v) === arg;
    if (op === 'is') return v === null || v === undefined;
    if (op === 'in') return arg.slice(1, -1).split(',').includes(String(v));
    if (op === 'gte') return v >= arg;
    throw new Error('filter ' + op);
  };
  const rows = (table, search) => tables[table].filter((r) => [...new URLSearchParams(search)].every((f) => match(r, f)));
  const reply = (body, status = 200) => ({ ok: status < 400, status, json: async () => body, text: async () => (body === undefined ? '' : JSON.stringify(body)) });
  async function fetch(url, init = {}) {
    const u = new URL(url), method = init.method || 'GET';
    if (u.hostname === 'exp.host') { pushes.push(...JSON.parse(init.body)); return reply({ data: [] }); }
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
  const env = environment((k) => ({ SUPABASE_URL: 'https://x.supabase.co', SB_SECRET_KEY: 'svc', SUPABASE_ANON_KEY: 'pub', STATE_SECRET: 's', HOOK_SECRET: 'h', LIVEKIT_URL: 'wss://work.livekit.cloud', LIVEKIT_API_KEY: 'APIkey', LIVEKIT_API_SECRET: 'secret' })[k], { fetch, now: () => NOW, waitUntil: (p) => p });
  const as = (who) => async (path, body = {}) => {
    const res = await handle(new Request('https://x.supabase.co/functions/v1/integrations/work' + path, { method: 'POST', headers: { Authorization: 'Bearer tok-' + who, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env);
    const out = await res.json(); if (!res.ok) throw Object.assign(new Error(out.error), { status: res.status }); return out;
  };
  return { tables, pushes, a: as('a'), b: as('b'), c: as('c') };
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
  assert.equal(toB.interruptionLevel, 'time-sensitive'); assert.equal(toB.data.picked, true);
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
