import React, { useEffect, useState } from 'react';
import { ProviderIcon } from '../icons.jsx';
export const PROVIDERS = { notion: 'Notion', google: 'Google Calendar', apple: 'Apple Calendar' };
export const STATES = { local: '저장됨', pending: '동기화 중', synced: '동기화됨', error: '연결 확인' };
export default function Integrations({ db }) {
  const [state, setState] = useState(null), [provider, setProvider] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [token, setToken] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [connectionId, setConnection] = useState(''), [containers, setContainers] = useState([]), [containerId, setContainer] = useState(''), [teamId, setTeam] = useState('');
  const [mapping, setMapping] = useState({}), [write, setWrite] = useState(true);
  const [onlyMine, setOnlyMine] = useState(true), [assigneeProperty, setAssigneeProperty] = useState(''), [assigneeUser, setAssigneeUser] = useState(''), [users, setUsers] = useState([]);
  const refresh = async () => { const r = await window.api.integrations(); if (r.ok) setState(r); };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 4000); return () => clearInterval(timer); }, []);
  const run = async p => { setBusy(true); setError(''); try { const r = await window.api.integrations(p); if (!r.ok) throw new Error(r.error); await refresh(); return r; } catch (e) { setError(e.message); return null; } finally { setBusy(false); } };
  const open = key => { setProvider(key); setError(''); setToken(''); setPassword(''); setConnection(''); setContainer(''); setContainers([]); setUsers([]); setTeam(db.teams[0]?.id || ''); };
  const select = value => {
    setContainer(value); const c = containers.find(c => c.id === value), old = state?.targets.find(t => t.connectionId === connectionId && t.containerId === value);
    setTeam(old?.teamId || db.teams[0]?.id || '');
    setMapping(old?.mapping || { title: c?.properties?.find(p => p.type === 'title')?.id, date: c?.properties?.find(p => p.type === 'date')?.id, status: c?.properties?.find(p => p.type === 'checkbox')?.id, appId: c?.properties?.find(p => p.type === 'rich_text' && /app.?id|앱.?id/i.test(p.name))?.id });
    setWrite(old ? old.writeEnabled : !!c?.writable);
    setOnlyMine(old ? !!old.assigneeFilter : true); setAssigneeProperty(old?.assigneeFilter?.propertyId || c?.properties?.find(p => p.type === 'people')?.id || ''); setAssigneeUser(old?.assigneeFilter?.userId || '');
  };
  const container = containers.find(c => c.id === containerId);
  const property = (key, label, types) => <label className="integration-field">{label}<select value={mapping[key] || ''} onChange={e => setMapping({ ...mapping, [key]: e.target.value })}><option value="">선택 안 함</option>{container?.properties?.filter(p => types.includes(p.type)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>;
  const save = async () => {
    let team = teamId;
    if (!team) { const next = await window.api.addTeam({ name: '개인', color: '#6685e8' }); team = next.teams.find(t => t.name === '개인')?.id; }
    const types = provider === 'notion' ? ['task', 'deadline'] : ['meeting', 'personal'];
    const old = state?.targets.find(t => t.connectionId === connectionId && t.containerId === containerId);
    const existingDefault = state?.targets.some(t => t.teamId === team && t.isDefault && t.taskTypes?.some(k => types.includes(k)));
    if (await run({ action: 'save-target', connectionId, containerId, teamId: team, mapping, ...(provider === 'notion' ? { assigneeFilter: onlyMine ? { propertyId: assigneeProperty, userId: assigneeUser.trim() } : null } : {}), writeEnabled: write && container.writable, autoRoute: write && container.writable, isDefault: old?.isDefault || !existingDefault, taskTypes: types, timeZone: container.timeZone || 'Asia/Seoul', defaultMinutes: 60 })) { setContainer(''); await run({ action: 'run' }); }
  };
  return <div className="tool-grid">{Object.entries(PROVIDERS).map(([key, label]) => {
    const count = state?.connections.filter(c => c.enabled && c.provider === key).length || 0;
    return <button className="tool-card" key={key} onClick={() => open(key)}><ProviderIcon provider={key} /><strong>{label}</strong><span className={count ? 'connected-label' : 'meta'}>{count ? count + '개 계정 연결됨' : '연결하기'} ↗</span></button>;
  })}{provider && <div className="provider-overlay" onMouseDown={e => { if (e.target === e.currentTarget) setProvider(null); }}><section className="provider-dialog" role="dialog" aria-modal="true" aria-label={PROVIDERS[provider]} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); setProvider(null); } }}>
    <div className="popup-head"><div className="provider-heading"><ProviderIcon provider={provider} size={36} /><h2>{PROVIDERS[provider]}</h2></div><button className="icon-btn" aria-label="연결 창 닫기" onClick={() => setProvider(null)}>✕</button></div>
    <div className="popup-body provider-body">
      {error && <p role="alert" className="integration-error">{error}</p>}
      {!state && <p className="desc">PC 동기화 서버를 실행한 후 다시 시도해 주세요.</p>}
      {provider === 'google' && <button className="primary" disabled={busy || !state?.configured.google} onClick={() => run({ action: 'oauth-start', provider })}>Google 계정으로 로그인</button>}
      {provider === 'notion' && <><label className="integration-field">연결 토큰<input type="password" autoComplete="off" value={token} onChange={e => setToken(e.target.value)} placeholder="Notion 연결 토큰" /></label><p className="desc">Notion에서 사용할 데이터베이스에 이 연결을 추가하세요.</p><button className="primary" disabled={busy || !token} onClick={async () => { if (await run({ action: 'connect-notion', token })) setToken(''); }}>Notion 연결</button></>}
      {provider === 'apple' && <><label className="integration-field">Apple 계정<input value={username} onChange={e => setUsername(e.target.value)} placeholder="이메일" /></label><label className="integration-field">앱 암호<input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="off" placeholder="Apple 계정에서 발급한 앱 암호" /></label><button className="primary" disabled={busy || !username || !password} onClick={async () => { if (await run({ action: 'connect-apple', username, password })) setPassword(''); }}>iCloud 연결</button></>}
      {state?.connections.filter(c => c.enabled && c.provider === provider).map(c => <div className="account-card" key={c.id}><strong>{c.label}</strong><div className="btn-row"><button disabled={busy} onClick={async () => { const r = await run({ action: 'containers', connectionId: c.id }); if (r) { setConnection(c.id); setUsers([]); setContainers(r.containers); setContainer(''); } }}>위치 선택</button><button className="ghost" disabled={busy} onClick={() => run({ action: 'disconnect', connectionId: c.id })}>연결 해제</button></div></div>)}
      {connectionId && <div className="integration-form"><label className="integration-field">{provider === 'notion' ? '데이터베이스' : '캘린더'}<select value={containerId} onChange={e => select(e.target.value)}><option value="">선택하세요</option>{containers.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>{!containers.length && <p className="desc">공유된 위치가 없습니다. 계정의 접근 권한을 확인해 주세요.</p>}
        {container && <><label className="integration-field">팀<select value={teamId} onChange={e => setTeam(e.target.value)}><option value="">개인</option>{db.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          {provider === 'notion' && <div className="integration-form"><label className="setting-row"><input type="checkbox" checked={onlyMine} onChange={e => setOnlyMine(e.target.checked)} />내가 담당자인 업무만 가져오기</label>{onlyMine && <>
            <label className="integration-field">담당자 속성<select value={assigneeProperty} onChange={e => setAssigneeProperty(e.target.value)}><option value="">사람 속성을 선택하세요</option>{container.properties?.filter(p => p.type === 'people').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <button disabled={busy} onClick={async () => { const r = await run({ action: 'notion-users', connectionId }); if (r) setUsers(r.users); }}>담당자 목록 불러오기</button>
            <label className="integration-field">내 Notion 계정<select value={assigneeUser} onChange={e => setAssigneeUser(e.target.value)}><option value="">본인을 선택하세요</option>{assigneeUser && !users.some(u => u.id === assigneeUser) && <option value={assigneeUser}>{state?.targets.find(t => t.connectionId === connectionId && t.containerId === containerId)?.assigneeFilter?.userName || assigneeUser}</option>}{users.map(u => <option key={u.id} value={u.id}>{u.label}{u.email ? ' · ' + u.email : ''}</option>)}</select></label>
            <details><summary>목록에 없는 게스트 계정</summary><label className="integration-field">Notion 사용자 ID<input value={assigneeUser} onChange={e => setAssigneeUser(e.target.value)} placeholder="Notion 사용자 UUID" /></label></details>
            <p className="desc">공동 담당자에 내가 포함된 업무도 가져옵니다. 새 업무를 Notion에 만들 때도 이 계정을 담당자로 지정합니다.</p>
          </>}</div>}
          {provider === 'notion' && <details open={!mapping.appId && write}><summary>데이터베이스 속성</summary><div className="integration-grid">{property('title', '제목', ['title'])}{property('date', '날짜', ['date'])}{property('status', '완료', ['checkbox', 'status', 'select'])}{property('appId', '앱 ID', ['rich_text'])}{property('notes', '메모', ['rich_text'])}</div>{['status', 'select'].includes(container.properties?.find(p => p.id === mapping.status)?.type) && <div className="integration-grid">{['todoValue', 'doneValue'].map((key, index) => <label className="integration-field" key={key}>{index ? '완료 값' : '미완료 값'}<select value={mapping[key] || ''} onChange={e => setMapping({ ...mapping, [key]: e.target.value })}><option value="">선택</option>{container.properties.find(p => p.id === mapping.status)?.options?.map(o => <option key={o.id} value={o.name}>{o.name}</option>)}</select></label>)}</div>}<p className="desc">양방향 연결에는 메모와 별개의 텍스트 속성 ‘앱 ID’가 필요합니다.</p></details>}
          <label className="setting-row"><input type="checkbox" checked={write} disabled={!container.writable} onChange={e => setWrite(e.target.checked)} />앱에서 작성한 할 일도 이 도구에 반영</label><button className="primary" disabled={busy || (provider === 'notion' && ((write && !mapping.appId) || (onlyMine && (!assigneeProperty || !assigneeUser.trim()))))} onClick={save}>저장하고 가져오기</button></>}
      </div>}
      {state?.targets.filter(t => t.provider === provider).map(t => <div className="connected-source" key={t.id}><span><strong>{t.label}</strong><small>{db.teams.find(team => team.id === t.teamId)?.name || '팀 선택 필요'}</small></span><button className="ghost" disabled={busy} onClick={() => run({ action: 'target-toggle', targetId: t.id, enabled: !t.readEnabled })}>{t.readEnabled ? '연결 중지' : '다시 연결'}</button>{t.error && <p role="alert">{t.error}</p>}</div>)}
    </div>
  </section></div>}</div>;
}
