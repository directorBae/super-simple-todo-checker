import React, { useEffect, useState } from 'react';
import { useWork } from '../work/work-state.jsx';
import { incomingDive } from '../../../shared/work-alerts.mjs';

/*
 * 팀버전 (Work) — the Team tab: teams and invites, who is online, and the dive button in the middle. A dive is a group
 * call one member opens for the teammates they pick, with an agenda of up to 50 characters; the picked people get an
 * important alert, everyone else in the team an ordinary one, and anyone can join or answer "카톡 가능" / "지금 연락 불가".
 */
const AGENDA_MAX = 50;
const ANSWER = { join: '참여', left: '나감', kakao: '카톡 가능', busy: '지금 연락 불가' };
const HUES = [222, 262, 192, 152, 32, 340, 12, 282];
const hueOf = (id = '') => HUES[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
const ago = (iso) => { const m = Math.floor((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`; };

// "Diving in": a portal of rings with an arrow going into it.
export function DiveIcon({ size = 72 }) {
  return <svg className="dive-icon" viewBox="0 0 64 64" width={size} height={size} aria-hidden="true">
    <defs><radialGradient id="dive-core" cx="50%" cy="55%" r="55%"><stop offset="0" stopColor="#a5f3fc" stopOpacity=".95" /><stop offset=".6" stopColor="#818cf8" stopOpacity=".55" /><stop offset="1" stopColor="#6366f1" stopOpacity=".1" /></radialGradient></defs>
    <circle className="dive-ring r3" cx="32" cy="36" r="27" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle className="dive-ring r2" cx="32" cy="36" r="19" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <circle cx="32" cy="36" r="11" fill="url(#dive-core)" stroke="currentColor" strokeWidth="2" />
    <path className="dive-arrow" d="M32 4v22m-7-7 7 7 7-7" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>;
}

export function Avatar({ person, size = 34 }) {
  const name = person?.name || '?';
  return <span className={'work-avatar' + (person?.online ? ' online' : '') + (person?.inDive ? ' in-dive' : '')} style={{ '--hue': hueOf(person?.id || person?.email || name), width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{Array.from(name)[0]}</span>;
}

const statusOf = (m) => (m.status === 'invited' ? '초대 중' : m.inDive ? '다이브 중' : m.online ? '온라인' : '오프라인');

function CreateTeam({ onDone }) {
  const w = useWork(), [name, setName] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const make = async (e) => { e.preventDefault(); setBusy(true); setError(''); try { const r = await w.createTeam(name); onDone?.(r.team.id); setName(''); } catch (x) { setError(x.message); } finally { setBusy(false); } };
  return <form className="work-card team-create" onSubmit={make}>
    <h3>팀 만들기</h3>
    <p className="desc">팀을 만들고 팀원을 이메일로 초대하세요. 초대받은 사람은 같은 이메일로 로그인해 수락하면 함께해요.</p>
    <div className="work-row"><input value={name} maxLength={40} placeholder="팀 이름" aria-label="팀 이름" onChange={(e) => setName(e.target.value)} /><button className="primary" disabled={busy || !name.trim()}>만들기</button></div>
    {error && <p className="work-error" role="alert">{error}</p>}
  </form>;
}

function Invites() {
  const w = useWork(), invites = w.state?.invites || [], [error, setError] = useState('');
  if (!invites.length) return null;
  const go = (f) => f().catch((e) => setError(e.message));
  return <section className="work-card work-invites" aria-label="팀 초대">
    {invites.map((i) => <div key={i.team} className="work-invite"><span><b>{i.name}</b>{i.from && <small> · {i.from}님의 초대</small>}</span>
      <button className="primary" onClick={() => go(() => w.acceptInvite(i.team))}>수락</button><button className="ghost" onClick={() => go(() => w.declineInvite(i.team))}>거절</button></div>)}
    {error && <p className="work-error" role="alert">{error}</p>}
  </section>;
}

function Members({ team }) {
  const w = useWork(), me = w.state.me, [emails, setEmails] = useState(''), [note, setNote] = useState(''), [error, setError] = useState('');
  const send = async (e) => {
    e.preventDefault(); setError(''); setNote('');
    try {
      const r = await w.invite(team.id, emails.split(/[\s,;]+/).filter(Boolean));
      setEmails(''); setNote(r.invited.length ? `${r.invited.length}명을 초대했어요.` : '이미 초대한 이메일이에요.');
    } catch (x) { setError(x.message); }
  };
  const remove = (m) => { if (confirm(m.email === me.email?.toLowerCase() ? `'${team.name}'에서 나갈까요?` : `${m.name}님을 팀에서 내보낼까요?`)) w.removeMember(team.id, m.email).catch((x) => setError(x.message)); };
  const sorted = [...team.members].sort((a, b) => (b.online - a.online) || (a.status === 'invited') - (b.status === 'invited'));
  return <section className="work-card work-members" aria-label="팀원">
    <h3>팀원 <small>{team.members.filter((m) => m.online).length}명 온라인</small></h3>
    <ul>{sorted.map((m) => <li key={m.email} className={'work-member ' + (m.status === 'invited' ? 'invited' : m.online ? 'online' : 'offline')}>
      <Avatar person={m} /><span className="work-member-name"><b>{m.name}{m.id === me.id && <em> (나)</em>}</b><small>{m.email}</small></span>
      <span className="work-status"><i />{statusOf(m)}</span>
      {(team.mine ? m.id !== me.id : m.id === me.id) && <button className="icon-btn work-remove" aria-label={m.id === me.id ? '팀에서 나가기' : m.name + ' 내보내기'} title={m.id === me.id ? '팀에서 나가기' : '내보내기'} onClick={() => remove(m)}>✕</button>}
    </li>)}</ul>
    {team.mine && <form className="work-row work-invite-form" onSubmit={send}><input value={emails} placeholder="초대할 이메일 (쉼표로 여러 명)" aria-label="초대할 이메일" onChange={(e) => setEmails(e.target.value)} /><button className="ghost" disabled={!emails.trim()}>초대</button></form>}
    {note && <p className="desc">{note}</p>}
    {error && <p className="work-error" role="alert">{error}</p>}
  </section>;
}

export function DiveComposer({ team, onClose }) {
  const w = useWork(), me = w.state.me;
  const people = team.members.filter((m) => m.status === 'active' && m.id !== me.id).sort((a, b) => b.online - a.online);
  const [picked, setPicked] = useState([]), [agenda, setAgenda] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const length = Array.from(agenda).length;
  const start = async (e) => {
    e.preventDefault(); setBusy(true); setError('');
    try { await w.startDive(team.id, picked, agenda); onClose(); } catch (x) { setError(x.message); setBusy(false); }
  };
  return <div className="popup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <form className="popup-panel dive-composer" role="dialog" aria-modal="true" aria-label="다이브 시작" onSubmit={start}>
      <div className="popup-head"><h2><DiveIcon size={22} /> 다이브</h2><button type="button" className="icon-btn" aria-label="닫기" onClick={onClose}>✕</button></div>
      <div className="popup-body">
        <p className="desc">함께할 팀원을 고르고 안건을 적으세요. 고른 사람에게는 중요한 알림으로, 나머지 팀원에게는 일반 알림으로 가요.</p>
        {people.length ? <ul className="dive-pick">{people.map((m) => <li key={m.id}><label className={(picked.includes(m.id) ? 'on' : '') + (m.online ? ' online' : '')}>
          <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} /><Avatar person={m} size={30} /><span className="dive-pick-name">{m.name}</span><span className="work-status"><i />{statusOf(m)}</span>
        </label></li>)}</ul> : <p className="desc">아직 함께할 팀원이 없어요. 먼저 팀원을 초대해 주세요.</p>}
        <label className="dive-agenda"><span>안건</span><input value={agenda} maxLength={AGENDA_MAX} placeholder="예: 내일 발표 자료 5분만 맞춰봐요" onChange={(e) => setAgenda(e.target.value)} autoFocus /><small>{length}/{AGENDA_MAX}</small></label>
        {error && <p className="work-error" role="alert">{error}</p>}
        <div className="dive-actions"><button type="button" className="ghost" onClick={onClose}>취소</button><button className="primary" disabled={busy || !picked.length || !agenda.trim()}>{busy ? '여는 중…' : `다이브 시작 (${picked.length}명)`}</button></div>
      </div>
    </form>
  </div>;
}

function Dives({ team }) {
  const w = useWork(), me = w.state.me, [error, setError] = useState('');
  const dives = w.state.dives.filter((d) => d.team === team.id);
  if (!dives.length) return null;
  const nameOf = (id) => team.members.find((m) => m.id === id)?.name || '팀원';
  const go = (f) => f().catch((e) => setError(e.message));
  return <section className="work-card work-dives" aria-label="열린 다이브">
    <h3>열린 다이브</h3>
    {dives.map((d) => {
      const mine = d.replies.find((r) => r.id === me.id), inIt = w.call?.dive === d.id, picked = d.targets.includes(me.id);
      return <article key={d.id} className={'work-dive' + (picked ? ' picked' : '')}>
        <div className="work-dive-head"><DiveIcon size={26} /><div><b>{d.agenda}</b><small>{nameOf(d.by)} · {ago(d.createdAt)} · {d.targets.map(nameOf).join(', ')}</small></div></div>
        <ul className="work-replies">{d.replies.map((r) => <li key={r.id} className={'answer-' + r.answer}>{nameOf(r.id)} <span>{ANSWER[r.answer]}</span></li>)}</ul>
        <div className="work-row">
          {inIt ? <span className="desc">통화 중</span> : <button className="primary" onClick={() => go(() => w.joinDive(d.id))}>참여</button>}
          {!inIt && d.by !== me.id && mine?.answer !== 'kakao' && <button className="ghost" onClick={() => go(() => w.reply(d.id, 'kakao'))}>카톡 가능</button>}
          {!inIt && d.by !== me.id && mine?.answer !== 'busy' && <button className="ghost" onClick={() => go(() => w.reply(d.id, 'busy'))}>지금 연락 불가</button>}
        </div>
      </article>;
    })}
    {error && <p className="work-error" role="alert">{error}</p>}
  </section>;
}

// Optional tags: any of the person's own 체커 teams (to-do groups) for this Work team, tapped on and off.
// Only links — nothing is shared. A tag whose 체커 team was deleted shows until it is tapped off.
function CheckerLink({ team, checkerTeams = [] }) {
  const w = useWork(), [error, setError] = useState(''), [links, setLinks] = useState(team.links || []);
  useEffect(() => setLinks(team.links || []), [team.id, (team.links || []).join()]);
  const toggle = (id) => {
    const next = links.includes(id) ? links.filter((x) => x !== id) : [...links, id];
    setLinks(next); setError('');
    w.setLink(team.id, next).catch((x) => { setError(x.message); setLinks(team.links || []); });
  };
  const gone = links.filter((id) => !checkerTeams.some((t) => t.id === id));
  return <div className="work-link" role="group" aria-label="연결할 체커 팀">
    <span>체커 팀</span>
    <div className="work-link-chips">
      {checkerTeams.map((t) => { const on = links.includes(t.id); return <button key={t.id} type="button" className={'work-link-chip' + (on ? ' on' : '')} aria-pressed={on} style={{ '--team': t.color || 'var(--accent)' }} onClick={() => toggle(t.id)}><i />{t.name}</button>; })}
      {gone.map((id) => <button key={id} type="button" className="work-link-chip on gone" aria-pressed="true" title="지워진 체커 팀 — 눌러서 빼기" onClick={() => toggle(id)}><i />(지워진 팀)</button>)}
      {!checkerTeams.length && !gone.length && <small>체커에 팀이 아직 없어요</small>}
    </div>
    {error && <small className="work-error">{error}</small>}
  </div>;
}

function MyName() {
  const w = useWork(), [name, setName] = useState(w.state.me.name), [edit, setEdit] = useState(false);
  useEffect(() => { if (!edit) setName(w.state.me.name); }, [w.state.me.name, edit]);
  const save = () => { setEdit(false); if (name.trim() && name.trim() !== w.state.me.name) w.setName(name).catch(() => setName(w.state.me.name)); };
  return edit ? <input className="work-my-name" value={name} maxLength={20} autoFocus aria-label="팀에 보이는 내 이름" onChange={(e) => setName(e.target.value)} onBlur={save} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setName(w.state.me.name); setEdit(false); } }} />
    : <button className="work-my-name ghost" title="팀에 보이는 이름 바꾸기" onClick={() => setEdit(true)}>나: {w.state.me.name} ✎</button>;
}

export default function Team({ checkerTeams = [] }) {
  const w = useWork(), s = w.state;
  const [teamId, setTeamId] = useState(null), [composer, setComposer] = useState(false), [adding, setAdding] = useState(false);
  if (!s) return <main className="content team-view"><p className="team-empty">{w.error || '팀을 불러오는 중…'}</p></main>;
  const team = s.teams.find((t) => t.id === teamId) || s.teams[0];
  const others = team ? team.members.filter((m) => m.status === 'active' && m.id !== s.me.id) : [];
  return <main className="content team-view">
    <div className="team-head">
      <nav className="team-tabs" aria-label="팀">
        {s.teams.map((t) => <button key={t.id} className={'team-chip' + (t.id === team?.id && !adding ? ' active' : '')} onClick={() => { setTeamId(t.id); setAdding(false); }}>{t.name}</button>)}
        {s.teams.length > 0 && <button className={'team-chip add' + (adding ? ' active' : '')} onClick={() => setAdding(true)}>+ 새 팀</button>}
      </nav>
      <MyName />
    </div>
    <Invites />
    {!team || adding ? <CreateTeam onDone={(id) => { setTeamId(id); setAdding(false); }} /> : <div className="team-grid">
      <Members team={team} />
      <section className="work-card dive-hub" aria-label="다이브">
        <CheckerLink team={team} checkerTeams={checkerTeams} />
        <button className="dive-button" disabled={!others.length || !!w.call} onClick={() => setComposer(true)} aria-label="다이브 시작">
          <DiveIcon size={96} /><span>Dive</span>
        </button>
        <p className="desc">{w.call ? '지금 다이브 중이에요.' : others.length ? '팀원을 골라 안건과 함께 바로 그룹 통화를 열어요.' : '팀원을 초대하면 다이브할 수 있어요.'}</p>
        {team.mine && <button className="ghost team-delete" onClick={() => { if (confirm(`'${team.name}' 팀을 없앨까요? 팀원과 다이브 기록이 모두 지워져요.`)) w.deleteTeam(team.id); }}>팀 없애기</button>}
      </section>
      <Dives team={team} />
    </div>}
    {composer && team && <DiveComposer team={team} onClose={() => setComposer(false)} />}
  </main>;
}

// The important one: someone picked you for a dive. Stays until you join or answer (or the dive ends).
export function IncomingDive({ focus, onSeen }) {
  const w = useWork(), [gone, setGone] = useState(() => new Set()), [error, setError] = useState('');
  const d = incomingDive(w.state);
  useEffect(() => { if (focus && d?.id === focus) onSeen?.(); }, [focus, d?.id]);
  if (!d || w.call || gone.has(d.id)) return null;
  const team = w.state.teams.find((t) => t.id === d.team), by = team?.members.find((m) => m.id === d.by);
  const go = (f) => f().then(() => setGone((g) => new Set(g).add(d.id)), (e) => setError(e.message));
  return <section className="dive-incoming" role="alertdialog" aria-label="다이브 요청">
    <div className="dive-incoming-head"><DiveIcon size={40} /><div><small>{team?.name} · 다이브 요청</small><b>{by?.name || '팀원'}님이 불러요</b></div></div>
    <p className="dive-incoming-agenda">{d.agenda}</p>
    <div className="dive-incoming-actions">
      <button className="primary" onClick={() => go(() => w.joinDive(d.id))}>참여</button>
      <button className="ghost" onClick={() => go(() => w.reply(d.id, 'kakao'))}>카톡 가능</button>
      <button className="ghost" onClick={() => go(() => w.reply(d.id, 'busy'))}>지금 연락 불가</button>
    </div>
    {error && <p className="work-error" role="alert">{error}</p>}
  </section>;
}

// In a dive: who is in it (a ring while they speak), who answered what, mute, leave, and end for everyone (caller).
export function CallPanel() {
  const w = useWork(), c = w.call;
  if (!c) return null;
  const d = w.state?.dives.find((x) => x.id === c.dive), team = w.state?.teams.find((t) => t.id === d?.team);
  const nameOf = (id) => team?.members.find((m) => m.id === id)?.name || '팀원';
  const away = (d?.replies || []).filter((r) => r.answer === 'kakao' || r.answer === 'busy');
  return <section className="dive-call" aria-label="다이브 통화">
    <div className="dive-call-head"><DiveIcon size={24} /><b>{d?.agenda || '다이브'}</b><small>{c.state === 'connected' ? `${c.people.length}명` : '연결 중…'}</small></div>
    <ul className="dive-people">{c.people.map((p) => <li key={p.id} className={(p.speaking ? 'speaking' : '') + (p.muted ? ' muted' : '')}><Avatar person={{ id: p.id, name: p.name, online: true }} size={36} /><span>{p.me ? '나' : p.name}</span>{p.muted && <i aria-label="음소거">🔇</i>}</li>)}</ul>
    {away.length > 0 && <ul className="work-replies">{away.map((r) => <li key={r.id} className={'answer-' + r.answer}>{nameOf(r.id)} <span>{ANSWER[r.answer]}</span></li>)}</ul>}
    {c.micError && <p className="work-error">{c.micError}</p>}
    <div className="dive-call-actions">
      <button className={'ghost' + (c.muted ? ' on' : '')} aria-pressed={c.muted} onClick={() => w.mute()}>{c.muted ? '🔇 음소거 중' : '🎤 마이크 켜짐'}</button>
      <button className="ghost danger" onClick={() => w.leaveDive(false)}>나가기</button>
      {d?.by === w.state?.me.id && <button className="ghost" onClick={() => w.leaveDive(true)}>모두 종료</button>}
    </div>
  </section>;
}
