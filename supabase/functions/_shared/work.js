// 팀버전 (Work): teams, email invites, who is online, and dives — a group call (LiveKit) that one member starts for the
// teammates they pick, with an agenda of up to 50 characters. The picked people get an important push (time-sensitive
// on iPhone), everyone else in the team an ordinary one; anyone can join, or answer "카톡 가능" / "지금 연락 불가".
// Only this function touches the work_* tables (service key); each request is checked against the person's membership.
import { HttpError } from './http.js';
import { db, eq } from './db.js';

export const ONLINE_MS = 45_000, DIVE_TTL_MS = 3 * 3600_000, AGENDA_MAX = 50, NAME_MAX = 20, TEAM_NAME_MAX = 40, INVITE_MAX = 20;
export const ANSWERS = ['kakao', 'busy'];
const EXPO_PUSH = 'https://exp.host/--/api/v2/push/send';

const clean = (s, max) => Array.from(String(s ?? '').replace(/\s+/g, ' ').trim()).slice(0, max).join('');
const emailOf = (s) => { const e = String(s || '').trim().toLowerCase(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 200 ? e : null; };
const uuid = (s) => { const v = String(s || ''); if (!/^[0-9a-f-]{36}$/i.test(v)) throw new HttpError('항목을 찾을 수 없어요.', 404); return v; };
const iso = (ms) => new Date(ms).toISOString();
const list = (ids) => `in.(${[...new Set(ids)].map(encodeURIComponent).join(',')})`;
const nameOf = (presence, email) => presence?.name || String(email || '').split('@')[0] || '팀원';

// ---------- LiveKit: a room token, signed here (HS256 JWT with the API key/secret) ----------
const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64json = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
export async function livekitToken(env, { room, identity, name }) {
  if (!env.LIVEKIT_URL || !env.LIVEKIT_API_KEY || !env.LIVEKIT_API_SECRET) throw new HttpError('통화 서버(LiveKit)가 아직 설정되지 않았어요.', 503);
  const now = Math.floor(env.now() / 1000);
  const body = `${b64json({ alg: 'HS256', typ: 'JWT' })}.${b64json({
    iss: env.LIVEKIT_API_KEY, sub: identity, name, nbf: now - 10, exp: now + 6 * 3600,
    video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: true },
  })}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.LIVEKIT_API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return { url: env.LIVEKIT_URL, token: `${body}.${b64url(sig)}`, room };
}

// ---------- pushes ----------
async function push(env, store, userIds, message) {
  if (!userIds.length) return 0;
  const devices = await store.select('push_devices', `user_id=${list(userIds)}&disabled_at=is.null&select=user_id,token`);
  if (!devices.length) return 0;
  const messages = devices.map((d) => ({ to: d.token, sound: 'default', ...message(d.user_id) }));
  await env.fetch(EXPO_PUSH, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(messages) }).catch(() => null);
  return messages.length;
}

// ---------- reading ----------
async function membership(store, user) {
  const email = (user.email || '').toLowerCase();
  const [active, invited] = await Promise.all([
    store.select('work_members', `user_id=${eq(user.id)}&status=eq.active&select=*`),
    email ? store.select('work_members', `email=${eq(email)}&status=eq.invited&select=*`) : [],
  ]);
  return { active, invited };
}
async function activeMember(store, user, teamId) {
  const rows = await store.select('work_members', `team_id=${eq(uuid(teamId))}&user_id=${eq(user.id)}&status=eq.active&select=*`);
  if (!rows.length) throw new HttpError('이 팀의 팀원이 아니에요.', 403);
  return rows[0];
}
async function diveFor(store, user, diveId) {
  const [dive] = await store.select('work_dives', `id=${eq(uuid(diveId))}&select=*`);
  if (!dive) throw new HttpError('다이브를 찾을 수 없어요.', 404);
  await activeMember(store, user, dive.team_id);
  return dive;
}

// Everything the Team tab shows, and the heartbeat that makes the person "online".
export async function workState(env, user) {
  const store = db(env), now = env.now();
  const [mine] = await store.select('work_presence', `user_id=${eq(user.id)}&select=*`);
  await store.insert('work_presence', [{ user_id: user.id, last_seen: iso(now), name: mine?.name ?? null }], { upsert: true, onConflict: 'user_id' });
  const { active, invited } = await membership(store, user);
  const teamIds = [...new Set([...active, ...invited].map((r) => r.team_id))];
  const teams = teamIds.length ? await store.select('work_teams', `id=${list(teamIds)}&select=*&order=created_at.asc`) : [];
  const activeIds = active.map((r) => r.team_id);
  const members = activeIds.length ? await store.select('work_members', `team_id=${list(activeIds)}&select=team_id,email,user_id,role,status,joined_at,created_at&order=created_at.asc`) : [];
  const people = [...new Set([...members.map((m) => m.user_id), ...invited.map((r) => r.invited_by)].filter(Boolean))];
  const presence = new Map((people.length ? await store.select('work_presence', `user_id=${list(people)}&select=*`) : []).map((p) => [p.user_id, p]));
  const dives = activeIds.length ? await store.select('work_dives', `team_id=${list(activeIds)}&ended_at=is.null&created_at=gte.${iso(now - DIVE_TTL_MS)}&select=*&order=created_at.desc`) : [];
  const replies = dives.length ? await store.select('work_replies', `dive_id=${list(dives.map((d) => d.id))}&select=*`) : [];
  const online = (id) => { const p = presence.get(id); return !!p && now - Date.parse(p.last_seen) < ONLINE_MS; };
  return {
    me: { id: user.id, email: user.email, name: nameOf(mine, user.email) },
    teams: teams.filter((t) => activeIds.includes(t.id)).map((t) => ({
      id: t.id, name: t.name, owner: t.owner, mine: t.owner === user.id,
      // The 체커 team (one of this person's own to-do groups) they tagged this team with, if any.
      link: active.find((r) => r.team_id === t.id)?.checker_team || null,
      members: members.filter((m) => m.team_id === t.id).map((m) => ({
        id: m.user_id, email: m.email, role: m.role, status: m.status, name: m.user_id ? nameOf(presence.get(m.user_id), m.email) : m.email,
        online: m.user_id ? online(m.user_id) : false, inDive: m.user_id && online(m.user_id) ? presence.get(m.user_id)?.in_dive || null : null,
      })),
    })),
    invites: invited.map((r) => ({ team: r.team_id, name: teams.find((t) => t.id === r.team_id)?.name || '팀', from: nameOf(presence.get(r.invited_by), '') })),
    dives: dives.map((d) => ({
      id: d.id, team: d.team_id, by: d.created_by, agenda: d.agenda, targets: d.targets || [], createdAt: d.created_at,
      replies: replies.filter((r) => r.dive_id === d.id).map((r) => ({ id: r.user_id, answer: r.answer, at: r.at })),
    })),
  };
}

// ---------- changes ----------
export async function setName(env, user, name) {
  const n = clean(name, NAME_MAX);
  if (!n) throw new HttpError('이름을 적어 주세요.');
  await db(env).insert('work_presence', [{ user_id: user.id, name: n, last_seen: iso(env.now()) }], { upsert: true, onConflict: 'user_id' });
  return { name: n };
}

// Tags the Work team with one of the person's own 체커 teams (or clears it). Just a link, kept per member.
export async function setLink(env, user, teamId, checkerTeam) {
  const store = db(env), me = await activeMember(store, user, teamId);
  const link = checkerTeam == null || checkerTeam === '' ? null : String(checkerTeam).slice(0, 64);
  await store.update('work_members', `team_id=${eq(me.team_id)}&user_id=${eq(user.id)}`, { checker_team: link });
  return { link };
}

export async function createTeam(env, user, name) {
  const store = db(env), n = clean(name, TEAM_NAME_MAX);
  if (!n) throw new HttpError('팀 이름을 적어 주세요.');
  if (!user.email) throw new HttpError('이메일로 로그인한 계정만 팀을 만들 수 있어요.');
  const [team] = await store.insert('work_teams', [{ name: n, owner: user.id }]);
  await store.insert('work_members', [{ team_id: team.id, email: user.email.toLowerCase(), user_id: user.id, role: 'owner', status: 'active', invited_by: user.id, joined_at: iso(env.now()) }]);
  return { team: { id: team.id, name: team.name } };
}

export async function deleteTeam(env, user, teamId) {
  const store = db(env), me = await activeMember(store, user, teamId);
  if (me.role !== 'owner') throw new HttpError('팀을 만든 사람만 팀을 없앨 수 있어요.', 403);
  await store.remove('work_teams', `id=${eq(me.team_id)}`);
  return { ok: true };
}

// The team's maker invites people by email. People who already have an account get a push; everyone sees the
// invite in the Team tab once signed in with that email (and accepts it there).
export async function invite(env, user, teamId, emails) {
  const store = db(env), me = await activeMember(store, user, teamId);
  if (me.role !== 'owner') throw new HttpError('팀을 만든 사람만 초대할 수 있어요.', 403);
  const wanted = [...new Set((Array.isArray(emails) ? emails : [emails]).map(emailOf).filter(Boolean))].slice(0, INVITE_MAX);
  if (!wanted.length) throw new HttpError('초대할 이메일을 적어 주세요.');
  const added = await store.insert('work_members', wanted.map((email) => ({ team_id: me.team_id, email, role: 'member', status: 'invited', invited_by: user.id })), { ignore: true, onConflict: 'team_id,email' });
  const known = added.length ? await store.rpc('work_user_ids', { emails: added.map((r) => r.email) }) : [];
  const [team] = await store.select('work_teams', `id=${eq(me.team_id)}&select=name`);
  const [mine] = await store.select('work_presence', `user_id=${eq(user.id)}&select=name`);
  await push(env, store, known.map((k) => k.id).filter((id) => id !== user.id), () => ({
    title: `${nameOf(mine, user.email)}님이 팀에 초대했어요`, body: `'${team?.name || '팀'}' — Work 앱의 Team 탭에서 수락할 수 있어요.`, data: { kind: 'work-invite', team: me.team_id },
  }));
  return { invited: added.map((r) => r.email), already: wanted.filter((e) => !added.some((r) => r.email === e)) };
}

export async function answerInvite(env, user, teamId, accept) {
  const store = db(env), email = (user.email || '').toLowerCase(), q = `team_id=${eq(uuid(teamId))}&email=${eq(email)}&status=eq.invited`;
  const [row] = await store.select('work_members', q + '&select=team_id');
  if (!row) throw new HttpError('초대를 찾을 수 없어요.', 404);
  if (accept) await store.update('work_members', q, { user_id: user.id, status: 'active', joined_at: iso(env.now()) });
  else await store.remove('work_members', q);
  return { ok: true };
}

// The maker removes someone (or a pending invite); anyone else can leave. The maker leaves by deleting the team.
export async function removeMember(env, user, teamId, email) {
  const store = db(env), me = await activeMember(store, user, teamId), target = emailOf(email) || '';
  const self = target === (user.email || '').toLowerCase();
  if (self && me.role === 'owner') throw new HttpError('팀을 만든 사람은 팀을 없애야 나갈 수 있어요.');
  if (!self && me.role !== 'owner') throw new HttpError('팀을 만든 사람만 팀원을 내보낼 수 있어요.', 403);
  await store.remove('work_members', `team_id=${eq(me.team_id)}&email=${eq(target)}`);
  return { ok: true };
}

// Dive: the caller picks teammates and writes the agenda; the room opens with the caller in it.
export async function startDive(env, user, { team, targets, agenda }) {
  const store = db(env), me = await activeMember(store, user, team), text = clean(agenda, AGENDA_MAX);
  if (!text) throw new HttpError('안건을 적어 주세요 (50자까지).');
  const members = await store.select('work_members', `team_id=${eq(me.team_id)}&status=eq.active&select=user_id`);
  const ids = members.map((m) => m.user_id).filter(Boolean);
  const picked = [...new Set((Array.isArray(targets) ? targets : []).map(String))].filter((id) => ids.includes(id) && id !== user.id);
  if (!picked.length) throw new HttpError('함께할 팀원을 한 명 이상 골라 주세요.');
  const [dive] = await store.insert('work_dives', [{ team_id: me.team_id, created_by: user.id, agenda: text, targets: picked, room: 'dive-' + crypto.randomUUID() }]);
  await store.insert('work_replies', [{ dive_id: dive.id, user_id: user.id, answer: 'join', at: iso(env.now()) }], { upsert: true, onConflict: 'dive_id,user_id' });
  await store.update('work_presence', `user_id=${eq(user.id)}`, { in_dive: dive.id });
  const [mine] = await store.select('work_presence', `user_id=${eq(user.id)}&select=name`), who = nameOf(mine, user.email);
  // Picked people: important (time-sensitive — shows through Focus on iPhone). The rest of the team: an ordinary one.
  await push(env, store, ids.filter((id) => id !== user.id), (to) => picked.includes(to)
    ? { title: `🌊 ${who}님이 다이브를 요청했어요`, body: text, priority: 'high', interruptionLevel: 'time-sensitive', data: { kind: 'dive', dive: dive.id, team: me.team_id, picked: true } }
    : { title: `${who}님의 다이브가 열렸어요`, body: text, data: { kind: 'dive', dive: dive.id, team: me.team_id, picked: false } });
  return { dive: { id: dive.id }, call: await livekitToken(env, { room: dive.room, identity: user.id, name: who }) };
}

export async function joinDive(env, user, diveId) {
  const store = db(env), dive = await diveFor(store, user, diveId);
  if (dive.ended_at) throw new HttpError('이미 끝난 다이브예요.', 410);
  await store.insert('work_replies', [{ dive_id: dive.id, user_id: user.id, answer: 'join', at: iso(env.now()) }], { upsert: true, onConflict: 'dive_id,user_id' });
  await store.update('work_presence', `user_id=${eq(user.id)}`, { in_dive: dive.id });
  const [mine] = await store.select('work_presence', `user_id=${eq(user.id)}&select=name`);
  return { dive: { id: dive.id }, call: await livekitToken(env, { room: dive.room, identity: user.id, name: nameOf(mine, user.email) }) };
}

// "카톡 가능" (kakao) or "지금 연락 불가" (busy); the caller sees it on the dive.
export async function replyDive(env, user, diveId, answer) {
  if (!ANSWERS.includes(answer)) throw new HttpError('답을 골라 주세요.');
  const store = db(env), dive = await diveFor(store, user, diveId);
  await store.insert('work_replies', [{ dive_id: dive.id, user_id: user.id, answer, at: iso(env.now()) }], { upsert: true, onConflict: 'dive_id,user_id' });
  const [mine] = await store.select('work_presence', `user_id=${eq(user.id)}&select=name`);
  await push(env, store, [dive.created_by].filter((id) => id !== user.id), () => ({
    title: `${nameOf(mine, user.email)}: ${answer === 'kakao' ? '카톡 가능' : '지금 연락 불가'}`, body: dive.agenda, data: { kind: 'dive-reply', dive: dive.id },
  }));
  return { ok: true };
}

// Leaving the call; when nobody is left in it the dive is over (the caller can also end it for everyone).
export async function leaveDive(env, user, diveId, end = false) {
  const store = db(env), dive = await diveFor(store, user, diveId), now = iso(env.now());
  await store.update('work_replies', `dive_id=${eq(dive.id)}&user_id=${eq(user.id)}&answer=eq.join`, { answer: 'left', at: now });
  await store.update('work_presence', `user_id=${eq(user.id)}&in_dive=${eq(dive.id)}`, { in_dive: null });
  const still = await store.select('work_replies', `dive_id=${eq(dive.id)}&answer=eq.join&select=user_id`);
  if ((end && dive.created_by === user.id) || !still.length) await store.update('work_dives', `id=${eq(dive.id)}&ended_at=is.null`, { ended_at: now });
  return { ok: true };
}
