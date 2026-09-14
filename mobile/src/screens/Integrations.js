import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, Switch } from 'react-native';
import { useDb } from '../store.js';
import { useDesign, Surface, Sheet, Button, ProviderIcon } from '../design.js';
import { ServerLoginForm } from './Settings.js';
const PROVIDERS = { notion: 'Notion', google: 'Google Calendar', apple: 'Apple Calendar' };
export default function Integrations() {
  const { db, api } = useDb(), d = useDesign();
  const [state, setState] = useState(null), [provider, setProvider] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [token, setToken] = useState(''), [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [connectionId, setConnection] = useState(''), [containers, setContainers] = useState([]), [containerId, setContainer] = useState(''), [teamId, setTeam] = useState('');
  const [mapping, setMapping] = useState({}), [write, setWrite] = useState(true), [showProps, setShowProps] = useState(false);
  const [onlyMine, setOnlyMine] = useState(true), [assigneeProperty, setAssigneeProperty] = useState(''), [assigneeUser, setAssigneeUser] = useState(''), [users, setUsers] = useState([]);
  const refresh = async () => { const r = await api.integrations(); if (r.ok) setState(r); };
  useEffect(() => { refresh(); const timer = setInterval(refresh, 4000); return () => clearInterval(timer); }, [db.settings.sync.url, db.settings.sync.token]);
  const run = async p => { setBusy(true); setError(''); try {
    if (p.action === 'oauth-start' && /^http:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(state?.configured.publicUrl || '')) throw new Error('이 서버의 Google 인증 주소가 localhost로 설정되어 있습니다. 모바일 로그인을 사용하려면 서버의 PUBLIC_URL과 Google 리디렉션 URI를 휴대폰에서 접근 가능한 HTTPS 주소로 설정해 주세요.');
    if (p.action === 'save-target') { const r = await api.syncNow(); if (!r.ok) throw new Error(r.error); }
    const r = await api.integrations(p); if (!r.ok) throw new Error(r.error); await refresh(); await api.syncNow(); return r;
  } catch(e) { setError(e.message); return null; } finally { setBusy(false); } };
  const open = key => { setProvider(key); setError(''); setToken(''); setPassword(''); setConnection(''); setContainer(''); setContainers([]); setUsers([]); setTeam(db.teams[0]?.id || ''); };
  const choose = value => {
    const c = containers.find(c => c.id === value), old = state?.targets.find(t => t.connectionId === connectionId && t.containerId === value);
    const m = old?.mapping || { title: c?.properties?.find(p => p.type === 'title')?.id, date: c?.properties?.find(p => p.type === 'date')?.id, status: c?.properties?.find(p => p.type === 'checkbox')?.id, appId: c?.properties?.find(p => p.type === 'rich_text' && /app.?id|앱.?id/i.test(p.name))?.id };
    setContainer(value); setTeam(old?.teamId || db.teams[0]?.id || ''); setMapping(m); setShowProps(!m.appId); setWrite(old ? old.writeEnabled : !!c?.writable);
    setOnlyMine(old ? !!old.assigneeFilter : true); setAssigneeProperty(old?.assigneeFilter?.propertyId || c?.properties?.find(p => p.type === 'people')?.id || ''); setAssigneeUser(old?.assigneeFilter?.userId || '');
  };
  const container = containers.find(c => c.id === containerId);
  const field = (label, value, onChangeText, secure = false) => <View style={{ gap: 6 }}><Text style={{ color: d.muted, fontSize: 12 }}>{label}</Text><TextInput accessibilityLabel={label} style={{ padding: 14, borderRadius: 14, color: d.text, backgroundColor: d.input }} value={value || ''} onChangeText={onChangeText} secureTextEntry={secure} autoCapitalize="none" autoCorrect={false} /></View>;
  const choices = (label, value, options, onPick) => <View style={{ gap: 8 }}><Text style={{ color: d.muted, fontSize: 12 }}>{label}</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{options.map(o => <Button key={o.id} title={o.label} primary={value === o.id} onPress={() => onPick(o.id)} />)}</View></View>;
  const prop = (key, label, types) => choices(label, mapping[key] || '', [{ id: '', label: '없음' }, ...(container?.properties || []).filter(p => types.includes(p.type)).map(p => ({ id: p.id, label: p.name }))], value => setMapping({ ...mapping, [key]: value }));
  const save = async () => {
    let team = teamId;
    if (!team) { const next = api.addTeam({ name: '개인', color: '#6685e8' }); team = next.teams.find(t => t.name === '개인')?.id; }
    const types = provider === 'notion' ? ['task', 'deadline'] : ['meeting', 'personal'];
    const old = state?.targets.find(t => t.connectionId === connectionId && t.containerId === containerId);
    const existing = state?.targets.some(t => t.teamId === team && t.isDefault && t.taskTypes?.some(k => types.includes(k)));
    if (await run({ action: 'save-target', connectionId, containerId, teamId: team, mapping, ...(provider === 'notion' ? { assigneeFilter: onlyMine ? { propertyId: assigneeProperty, userId: assigneeUser.trim() } : null } : {}), writeEnabled: write && container.writable, autoRoute: write && container.writable, isDefault: old?.isDefault || !existing, taskTypes: types, timeZone: container.timeZone || 'Asia/Seoul', defaultMinutes: 60 })) { setContainer(''); await run({ action: 'run' }); }
  };
  return <><ScrollView contentContainerStyle={{ padding: 22, paddingBottom: 110, gap: 14 }}>
    {Object.entries(PROVIDERS).map(([key, label]) => {
      const count = state?.connections.filter(c => c.enabled && c.provider === key).length || 0;
      return <Pressable accessibilityRole="button" accessibilityLabel={label + ' 연결'} key={key} onPress={() => open(key)}><Surface native contentStyle={{ padding: 22, flexDirection: 'row', alignItems: 'center', gap: 17 }}><ProviderIcon provider={key} /><View style={{ flex: 1, gap: 6 }}><Text style={{ color: d.text, fontWeight: '700', fontSize: 17 }}>{label}</Text><Text style={{ color: count ? d.accent : d.muted, fontSize: 12 }}>{count ? count + '개 계정 연결됨' : '연결하기'}</Text></View><Text style={{ color: d.muted, fontSize: 22 }}>↗</Text></Surface></Pressable>;
    })}
  </ScrollView>{provider && <Sheet title={PROVIDERS[provider]} onClose={() => setProvider(null)}>
    {!db.settings.sync.token ? <ServerLoginForm onDone={refresh} /> : <>
      {!!error && <Text accessibilityRole="alert" style={{ color: '#cc4057' }}>{error}</Text>}
      {!state && <Text style={{ color: d.muted }}>서버 연결을 확인하고 다시 열어 주세요.</Text>}
      {provider === 'google' && <Button title="Google 계정으로 로그인" primary disabled={busy || !state?.configured.google} onPress={() => run({ action: 'oauth-start', provider })} />}
      {provider === 'notion' && <>{field('Notion 연결 토큰', token, setToken, true)}<Text style={{ color: d.muted, lineHeight: 20 }}>Notion에서 사용할 데이터베이스에 이 연결을 추가하세요.</Text><Button title="Notion 연결" primary disabled={busy || !token} onPress={async () => { if (await run({ action: 'connect-notion', token })) setToken(''); }} /></>}
      {provider === 'apple' && <>{field('Apple 계정 이메일', username, setUsername)}{field('Apple 앱 암호', password, setPassword, true)}<Button title="iCloud 연결" primary disabled={busy || !username || !password} onPress={async () => { if (await run({ action: 'connect-apple', username, password })) setPassword(''); }} /></>}
      {state?.connections.filter(c => c.enabled && c.provider === provider).map(c => <Surface key={c.id} contentStyle={{ padding: 16, gap: 12 }}><Text style={{ color: d.text, fontWeight: '600' }}>{c.label}</Text><Button title="위치 선택" disabled={busy} onPress={async () => { const r = await run({ action: 'containers', connectionId: c.id }); if (r) { setConnection(c.id); setUsers([]); setContainers(r.containers); setContainer(''); } }} /><Button title="연결 해제" disabled={busy} onPress={() => run({ action: 'disconnect', connectionId: c.id })} /></Surface>)}
      {!!connectionId && choices(provider === 'notion' ? '데이터베이스' : '캘린더', containerId, containers.map(c => ({ id: c.id, label: c.label })), choose)}
      {!!connectionId && !containers.length && <Text style={{ color: d.muted }}>공유된 위치가 없습니다. 계정의 접근 권한을 확인해 주세요.</Text>}
      {container && <>
        {choices('팀', teamId, [{ id: '', label: '개인' }, ...db.teams.map(t => ({ id: t.id, label: t.name }))], setTeam)}
        {provider === 'notion' && <View style={{gap:10}}><View style={{flexDirection:'row',alignItems:'center',gap:10}}><Switch value={onlyMine} onValueChange={setOnlyMine}/><Text style={{color:d.text,flex:1}}>내가 담당자인 업무만 가져오기</Text></View>{onlyMine && <>
          {choices('담당자 속성', assigneeProperty, (container.properties || []).filter(p => p.type === 'people').map(p => ({id:p.id,label:p.name})), setAssigneeProperty)}
          {!container.properties?.some(p => p.type === 'people') && <Text style={{color:d.muted}}>Notion DB에 사람 유형의 담당자 속성을 추가해 주세요.</Text>}
          <Button title="담당자 목록 불러오기" disabled={busy} onPress={async()=>{const r=await run({action:'notion-users',connectionId});if(r)setUsers(r.users);}}/>
          {choices('내 Notion 계정', assigneeUser, [...(assigneeUser && !users.some(u=>u.id===assigneeUser) ? [{id:assigneeUser,label:state?.targets.find(t=>t.connectionId===connectionId&&t.containerId===containerId)?.assigneeFilter?.userName||assigneeUser}] : []), ...users.map(u=>({id:u.id,label:u.label+(u.email?' · '+u.email:'')}))], setAssigneeUser)}
          {!users.length && <Text style={{color:d.muted,fontSize:12}}>목록을 불러와 본인을 선택하세요. 게스트는 Notion 사용자 ID로 지정할 수 있습니다.</Text>}
          {!users.length && field('Notion 사용자 ID (목록에 없는 경우)', assigneeUser, setAssigneeUser)}
          {!!users.length && <Button title="목록에 없는 계정: 사용자 ID로 입력" onPress={()=>setUsers([])}/>}
          <Text style={{color:d.muted,fontSize:12,lineHeight:18}}>공동 담당자에 내가 포함된 업무도 가져옵니다. 새 업무를 Notion에 만들 때도 이 계정을 담당자로 지정합니다.</Text>
        </>}</View>}
        {provider === 'notion' && <><Button title="데이터베이스 속성" onPress={() => setShowProps(!showProps)} />{showProps && <>{prop('title', '제목', ['title'])}{prop('date', '날짜', ['date'])}{prop('status', '완료', ['checkbox', 'status', 'select'])}{prop('appId', '앱 ID', ['rich_text'])}{prop('notes', '메모', ['rich_text'])}{['status', 'select'].includes(container.properties?.find(p => p.id === mapping.status)?.type) && ['todoValue', 'doneValue'].map((key, i) => <View key={key}>{choices(i ? '완료 값' : '미완료 값', mapping[key], (container.properties.find(p => p.id === mapping.status)?.options || []).map(o => ({ id: o.name, label: o.name })), v => setMapping({ ...mapping, [key]: v }))}</View>)}<Text style={{ color: d.muted, fontSize: 12 }}>양방향 연결에는 메모와 별개의 텍스트 속성 ‘앱 ID’가 필요합니다.</Text></>}</>}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><Switch value={write} disabled={!container.writable} onValueChange={setWrite} /><Text style={{ flex: 1, color: d.text }}>앱에서 작성한 할 일도 이 도구에 반영</Text></View>
        <Button title="저장하고 가져오기" primary disabled={busy || (provider === 'notion' && ((write && !mapping.appId) || (onlyMine && (!assigneeProperty || !assigneeUser.trim()))))} onPress={save} />
      </>}
      {state?.targets.filter(t => t.provider === provider).map(t => <Surface key={t.id} contentStyle={{ padding: 16, gap: 8 }}><Text style={{ color: d.text, fontWeight: '600' }}>{t.label}</Text><Text style={{ color: d.muted }}>{db.teams.find(team => team.id === t.teamId)?.name || '팀 선택 필요'}</Text><Button title={t.readEnabled ? '연결 중지' : '다시 연결'} disabled={busy} onPress={() => run({ action: 'target-toggle', targetId: t.id, enabled: !t.readEnabled })} />{!!t.error && <Text style={{ color: '#cc4057' }}>{t.error}</Text>}</Surface>)}
    </>}
  </Sheet>}</>;
}
