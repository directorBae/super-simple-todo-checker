// 팀버전 (Work): what to tell the person about, from one look at the team state to the next — a new dive (important
// when they were picked), an answer to their own dive ("카톡 가능" / "지금 연락 불가") and a new team invite.
// The desktop app's main process and the web page both use it; the phone gets the same news as server pushes.
// `seen` is a Set of keys kept between looks; the first look only remembers what is already there, except a dive
// that opened in the last minute (it may be why the app was just opened).
export const FRESH_MS = 60_000, DIVE_ALERT_MS = 10 * 60_000;

export function workAlerts(state, seen, { now = Date.now(), first = false } = {}) {
  const out = [], me = state?.me?.id;
  if (!Array.isArray(state?.teams)) return out;
  if (!me) return out;
  const nameIn = (team, id) => state.teams.find((t) => t.id === team)?.members.find((m) => m.id === id)?.name || '팀원';
  const add = (key, alert) => { if (seen.has(key)) return; seen.add(key); if (alert) out.push({ key, ...alert }); };
  for (const d of state.dives || []) {
    const age = now - Date.parse(d.createdAt);
    if (d.by !== me) {
      const picked = d.targets.includes(me), answered = d.replies.some((r) => r.id === me);
      const tell = !answered && age < (first ? FRESH_MS : DIVE_ALERT_MS);
      add('dive:' + d.id, tell && {
        dive: d.id, team: d.team, important: picked,
        title: picked ? `🌊 ${nameIn(d.team, d.by)}님이 다이브를 요청했어요` : `${nameIn(d.team, d.by)}님의 다이브가 열렸어요`, body: d.agenda,
      });
    } else {
      for (const r of d.replies) if (r.answer === 'kakao' || r.answer === 'busy') {
        add(`reply:${d.id}:${r.id}:${r.answer}`, !first && { dive: d.id, team: d.team, title: `${nameIn(d.team, r.id)}: ${r.answer === 'kakao' ? '카톡 가능' : '지금 연락 불가'}`, body: d.agenda });
      }
    }
  }
  for (const i of state.invites || []) add('invite:' + i.team, !first && { team: i.team, invite: true, title: `팀 초대: ${i.name}`, body: 'Team 탭에서 수락할 수 있어요.' });
  return out;
}

// The dive the person is being asked into right now (the incoming-call card): picked, not answered, not in it.
export function incomingDive(state) {
  const me = state?.me?.id;
  return (state?.dives || []).find((d) => d.by !== me && d.targets.includes(me) && !d.replies.some((r) => r.id === me)) || null;
}

// 연결음: the one who opened a room and called people hears a ringback tone while nobody has come in yet — from the
// moment the call is connected until someone joins, everyone called has answered (카톡 가능 / 지금 연락 불가), or the
// ring is over (RINGBACK_MS, the time the phones ring).
export const RINGBACK_MS = 60_000;
export function ringbackWanted(call, dive, meId, now = Date.now()) {
  if (!call || call.state !== 'connected' || !dive || dive.id !== call.dive || dive.by !== meId) return false;
  if ((call.people || []).some((p) => !p.me)) return false;
  if (now - Date.parse(dive.createdAt) > RINGBACK_MS) return false;
  return dive.targets.some((id) => !dive.replies.some((r) => r.id === id));
}
