import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, Animated, Easing } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Text } from '../text.js';
import { useDesign, Surface, Button, Sheet } from '../design.js';
import { useWork } from '../work.js';
import { useDb } from '../store.js';
import { incomingDive } from '../../../shared/work-alerts.mjs';

/*
 * 팀버전 (Work) — the Team screen (tap "체커" in the top bar): teams and invites, who is online, the dive button, and
 * the open dives. Same as the Team tab on PC and web (desktop/src/views/Team.jsx).
 */
const AGENDA_MAX = 50;
const ANSWER = { join: '참여', left: '나감', kakao: '카톡 가능', busy: '지금 연락 불가' };
const ANSWER_COLOR = { join: '#30a46c', left: '#4f5670', kakao: '#d69e0b', busy: '#e5484d' };
const HUES = [222, 262, 192, 152, 32, 340, 12, 282];
const hueOf = (id = '') => HUES[[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % HUES.length];
const ago = (iso) => { const m = Math.floor((Date.now() - Date.parse(iso)) / 60000); return m < 1 ? '방금' : m < 60 ? `${m}분 전` : `${Math.floor(m / 60)}시간 전`; };
const statusOf = (m) => (m.status === 'invited' ? '초대 중' : m.inDive ? '다이브 중' : m.online ? '온라인' : '오프라인');

export function DiveIcon({ size = 72, color = '#6366f1' }) {
  return <Svg width={size} height={size} viewBox="0 0 64 64">
    <Defs><RadialGradient id="core" cx="50%" cy="55%" r="55%"><Stop offset="0" stopColor="#a5f3fc" stopOpacity=".95" /><Stop offset=".6" stopColor="#818cf8" stopOpacity=".55" /><Stop offset="1" stopColor="#6366f1" stopOpacity=".1" /></RadialGradient></Defs>
    <Circle cx="32" cy="36" r="27" fill="none" stroke={color} strokeOpacity={0.3} strokeWidth="1.5" />
    <Circle cx="32" cy="36" r="19" fill="none" stroke={color} strokeOpacity={0.55} strokeWidth="1.8" />
    <Circle cx="32" cy="36" r="11" fill="url(#core)" stroke={color} strokeWidth="2" />
    <Path d="M32 4v22m-7-7 7 7 7-7" fill="none" stroke={color} strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}
// The big button breathes a little so it reads as "dive in here".
function PulsingDive({ size }) {
  const k = useRef(new Animated.Value(0)).current;
  useEffect(() => { const a = Animated.loop(Animated.sequence([Animated.timing(k, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }), Animated.timing(k, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true })])); a.start(); return () => a.stop(); }, []);
  return <Animated.View style={{ transform: [{ scale: k.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1.04] }) }] }}><DiveIcon size={size} /></Animated.View>;
}

export function Avatar({ person, size = 34 }) {
  const hue = hueOf(person?.id || person?.email || person?.name);
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: `hsl(${hue}, 65%, 58%)`, alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>{Array.from(person?.name || '?')[0]}</Text>
    {(person?.online || person?.inDive) && <View style={{ position: 'absolute', right: -1, bottom: -1, width: size * 0.3, height: size * 0.3, borderRadius: size, backgroundColor: person.inDive ? '#6366f1' : '#30c48d', borderWidth: 2, borderColor: '#fff' }} />}
  </View>;
}

function Field({ value, onChangeText, placeholder, maxLength, ...rest }) {
  const d = useDesign();
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={d.muted} maxLength={maxLength} style={{ flex: 1, minHeight: 44, paddingHorizontal: 14, borderRadius: 14, backgroundColor: d.input, borderWidth: 1, borderColor: d.edge, color: d.text, fontSize: 15 }} {...rest} />;
}
const Card = ({ children, style }) => <Surface native style={{ marginBottom: 14, ...style }} contentStyle={{ padding: 16, gap: 10 }}>{children}</Surface>;
function Title({ children, note }) { const d = useDesign(); return <Text style={{ fontSize: 15, fontWeight: '700', color: d.text }}>{children}{note ? <Text style={{ fontSize: 12, fontWeight: '500', color: d.muted }}>  {note}</Text> : null}</Text>; }
const ErrorText = ({ children }) => (children ? <Text style={{ color: '#e5484d', fontSize: 13 }}>{children}</Text> : null);
const run = (setError, f) => f().catch((e) => setError(e.message));

function CreateTeam({ onDone }) {
  const w = useWork(), d = useDesign(), [name, setName] = useState(''), [error, setError] = useState('');
  return <Card><Title>팀 만들기</Title>
    <Text style={{ fontSize: 13, color: d.muted, lineHeight: 19 }}>팀을 만들고 팀원을 이메일로 초대하세요. 초대받은 사람은 같은 이메일로 로그인해 수락하면 함께해요.</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}><Field value={name} onChangeText={setName} placeholder="팀 이름" maxLength={40} /><Button primary title="만들기" disabled={!name.trim()} onPress={() => run(setError, async () => { const r = await w.createTeam(name); setName(''); onDone?.(r.team.id); })} /></View>
    <ErrorText>{error}</ErrorText>
  </Card>;
}

function Invites() {
  const w = useWork(), d = useDesign(), [error, setError] = useState(''), invites = w.state?.invites || [];
  if (!invites.length) return null;
  return <Card>{invites.map((i) => <View key={i.team} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <Text style={{ flex: 1, color: d.text, fontSize: 14 }}><Text style={{ fontWeight: '700' }}>{i.name}</Text>{i.from ? <Text style={{ color: d.muted, fontSize: 12 }}> · {i.from}님의 초대</Text> : null}</Text>
    <Button primary title="수락" onPress={() => run(setError, () => w.acceptInvite(i.team))} /><Button title="거절" onPress={() => run(setError, () => w.declineInvite(i.team))} />
  </View>)}<ErrorText>{error}</ErrorText></Card>;
}

function Members({ team }) {
  const w = useWork(), d = useDesign(), me = w.state.me, [emails, setEmails] = useState(''), [note, setNote] = useState(''), [error, setError] = useState('');
  const sorted = [...team.members].sort((a, b) => (b.online - a.online) || (a.status === 'invited') - (b.status === 'invited'));
  const remove = (m) => Alert.alert(m.id === me.id ? `'${team.name}'에서 나갈까요?` : `${m.name}님을 내보낼까요?`, '', [{ text: '취소', style: 'cancel' }, { text: m.id === me.id ? '나가기' : '내보내기', style: 'destructive', onPress: () => run(setError, () => w.removeMember(team.id, m.email)) }]);
  return <Card><Title note={`${team.members.filter((m) => m.online).length}명 온라인`}>팀원</Title>
    {sorted.map((m) => <Pressable key={m.email} onLongPress={() => (team.mine ? m.id !== me.id : m.id === me.id) && remove(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: m.online ? 1 : 0.6 }}>
      <Avatar person={m} /><View style={{ flex: 1 }}><Text style={{ color: d.text, fontWeight: '600', fontSize: 14 }}>{m.name}{m.id === me.id ? <Text style={{ color: d.muted, fontWeight: '500' }}> (나)</Text> : null}</Text><Text numberOfLines={1} style={{ color: d.muted, fontSize: 12 }}>{m.email}</Text></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.online ? '#30c48d' : '#8a93a6' }} /><Text style={{ color: d.muted, fontSize: 12 }}>{statusOf(m)}</Text></View>
    </Pressable>)}
    {team.mine && <View style={{ flexDirection: 'row', gap: 8 }}><Field value={emails} onChangeText={setEmails} placeholder="초대할 이메일 (쉼표로 여러 명)" autoCapitalize="none" keyboardType="email-address" /><Button title="초대" disabled={!emails.trim()} onPress={() => run(setError, async () => { const r = await w.invite(team.id, emails.split(/[\s,;]+/).filter(Boolean)); setEmails(''); setNote(r.invited.length ? `${r.invited.length}명을 초대했어요.` : '이미 초대한 이메일이에요.'); })} /></View>}
    {team.mine && <Text style={{ color: d.muted, fontSize: 11 }}>팀원을 길게 누르면 내보낼 수 있어요.</Text>}
    {note ? <Text style={{ color: d.muted, fontSize: 13 }}>{note}</Text> : null}<ErrorText>{error}</ErrorText>
  </Card>;
}

function DiveComposer({ team, onClose }) {
  const w = useWork(), d = useDesign(), me = w.state.me;
  const people = team.members.filter((m) => m.status === 'active' && m.id !== me.id).sort((a, b) => b.online - a.online);
  const [picked, setPicked] = useState([]), [agenda, setAgenda] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const start = async () => { setBusy(true); setError(''); try { await w.startDive(team.id, picked, agenda); onClose(); } catch (e) { setError(e.message); setBusy(false); } };
  return <Sheet title="다이브" onClose={onClose}>
    <Text style={{ color: d.muted, fontSize: 13, lineHeight: 19 }}>함께할 팀원을 고르고 안건을 적으세요. 고른 사람에게는 중요한 알림으로, 나머지 팀원에게는 일반 알림으로 가요.</Text>
    {people.map((m) => { const on = picked.includes(m.id); return <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: on ? d.accent : 'transparent', backgroundColor: on ? '#6366f11a' : 'transparent' }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? d.accent : d.muted, backgroundColor: on ? d.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>}</View>
      <Avatar person={m} size={30} /><Text style={{ flex: 1, color: d.text, fontWeight: '600' }}>{m.name}</Text><Text style={{ color: d.muted, fontSize: 12 }}>{statusOf(m)}</Text>
    </Pressable>; })}
    {!people.length && <Text style={{ color: d.muted }}>아직 함께할 팀원이 없어요. 먼저 팀원을 초대해 주세요.</Text>}
    <View style={{ gap: 4 }}><Field value={agenda} onChangeText={setAgenda} placeholder="안건 (예: 내일 발표 자료 5분만 맞춰봐요)" maxLength={AGENDA_MAX} /><Text style={{ alignSelf: 'flex-end', color: d.muted, fontSize: 12 }}>{Array.from(agenda).length}/{AGENDA_MAX}</Text></View>
    <ErrorText>{error}</ErrorText>
    <Button primary title={busy ? '여는 중…' : `다이브 시작 (${picked.length}명)`} disabled={busy || !picked.length || !agenda.trim()} onPress={start} />
  </Sheet>;
}

function Dives({ team }) {
  const w = useWork(), d = useDesign(), me = w.state.me, [error, setError] = useState('');
  const dives = w.state.dives.filter((x) => x.team === team.id);
  if (!dives.length) return null;
  const nameOf = (id) => team.members.find((m) => m.id === id)?.name || '팀원';
  return <Card><Title>열린 다이브</Title>
    {dives.map((x) => { const mine = x.replies.find((r) => r.id === me.id), inIt = w.call?.dive === x.id, picked = x.targets.includes(me.id);
      return <View key={x.id} style={{ gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: picked ? d.accent : d.edge, backgroundColor: '#ffffff0d' }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><DiveIcon size={26} /><View style={{ flex: 1 }}><Text style={{ color: d.text, fontWeight: '700' }}>{x.agenda}</Text><Text style={{ color: d.muted, fontSize: 12 }}>{nameOf(x.by)} · {ago(x.createdAt)} · {x.targets.map(nameOf).join(', ')}</Text></View></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{x.replies.map((r) => <Text key={r.id} style={{ fontSize: 12, color: d.muted }}>{nameOf(r.id)} <Text style={{ fontWeight: '700', color: ANSWER_COLOR[r.answer] }}>{ANSWER[r.answer]}</Text></Text>)}</View>
        {inIt ? <Text style={{ color: d.muted, fontSize: 13 }}>통화 중</Text> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Button primary title="참여" onPress={() => run(setError, () => w.joinDive(x.id))} />
          {x.by !== me.id && mine?.answer !== 'kakao' && <Button title="카톡 가능" onPress={() => run(setError, () => w.reply(x.id, 'kakao'))} />}
          {x.by !== me.id && mine?.answer !== 'busy' && <Button title="지금 연락 불가" onPress={() => run(setError, () => w.reply(x.id, 'busy'))} />}
        </View>}
      </View>; })}
    <ErrorText>{error}</ErrorText>
  </Card>;
}

// Optional tags: any of the person's own 체커 teams (to-do groups) for this Work team, tapped on and off.
// Only links — nothing is shared.
function CheckerLink({ team }) {
  const w = useWork(), d = useDesign(), { db } = useDb(), [error, setError] = useState(''), [links, setLinks] = useState(team.links || []);
  useEffect(() => setLinks(team.links || []), [team.id, (team.links || []).join()]);
  const toggle = (id) => {
    const next = links.includes(id) ? links.filter((x) => x !== id) : [...links, id];
    setLinks(next); setError('');
    w.setLink(team.id, next).catch((e) => { setError(e.message); setLinks(team.links || []); });
  };
  const gone = links.filter((id) => !db.teams.some((t) => t.id === id));
  const chip = (key, label, color, on, onPress) => <Pressable key={key} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: on ? color : d.edge, backgroundColor: on ? color + '29' : 'transparent' }}>
    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: on ? 1 : 0.45 }} /><Text style={{ fontSize: 13, color: on ? d.text : d.muted, fontWeight: on ? '600' : '400' }}>{label}</Text>
  </Pressable>;
  return <View style={{ gap: 6 }}>
    <Text style={{ color: d.muted, fontSize: 12 }}>체커 팀 (여러 개 고를 수 있어요)</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {db.teams.map((t) => chip(t.id, t.name, /^#[0-9a-f]{6}$/i.test(t.color || '') ? t.color : d.accent, links.includes(t.id), () => toggle(t.id)))}
      {gone.map((id) => chip(id, '(지워진 팀)', '#8a93a6', true, () => toggle(id)))}
      {!db.teams.length && !gone.length && <Text style={{ color: d.muted, fontSize: 13 }}>체커에 팀이 아직 없어요.</Text>}
    </View>
    <ErrorText>{error}</ErrorText>
  </View>;
}

function MyName() {
  const w = useWork(), d = useDesign(), [edit, setEdit] = useState(false), [name, setName] = useState(w.state.me.name);
  useEffect(() => { if (!edit) setName(w.state.me.name); }, [w.state.me.name, edit]);
  const save = () => { setEdit(false); if (name.trim() && name.trim() !== w.state.me.name) w.setName(name).catch(() => setName(w.state.me.name)); };
  return edit ? <View style={{ width: 150, flexDirection: 'row' }}><Field value={name} onChangeText={setName} maxLength={20} autoFocus onBlur={save} onSubmitEditing={save} /></View>
    : <Pressable accessibilityLabel="팀에 보이는 내 이름 바꾸기" onPress={() => setEdit(true)} hitSlop={8}><Text style={{ color: d.muted, fontSize: 13 }}>나: {w.state.me.name} ✎</Text></Pressable>;
}

export default function TeamScreen() {
  const w = useWork(), d = useDesign(), s = w.state;
  const [teamId, setTeamId] = useState(null), [composer, setComposer] = useState(false), [adding, setAdding] = useState(false);
  if (!w.available) return <View style={{ flex: 1, padding: 24 }}><Text style={{ color: d.muted }}>팀 기능은 로그인해야 쓸 수 있어요.</Text></View>;
  if (!s) return <View style={{ flex: 1, padding: 24 }}><Text style={{ color: d.muted }}>{w.error || '팀을 불러오는 중…'}</Text></View>;
  const team = s.teams.find((t) => t.id === teamId) || s.teams[0];
  const others = team ? team.members.filter((m) => m.status === 'active' && m.id !== s.me.id) : [];
  const chip = (label, active, onPress, key) => <Pressable key={key} onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: active ? d.accent : d.edge, backgroundColor: d.input }}><Text style={{ color: d.text, fontWeight: '600', fontSize: 13 }}>{label}</Text></Pressable>;
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {s.teams.map((t) => chip(t.name, t.id === team?.id && !adding, () => { setTeamId(t.id); setAdding(false); }, t.id))}
      {s.teams.length > 0 && chip('+ 새 팀', adding, () => setAdding(true), 'add')}
      <View style={{ flex: 1 }} /><MyName />
    </View>
    <Invites />
    {!team || adding ? <CreateTeam onDone={(id) => { setTeamId(id); setAdding(false); }} /> : <>
      <Card style={{ alignItems: 'stretch' }}>
        <CheckerLink team={team} />
        <Pressable accessibilityRole="button" accessibilityLabel="다이브 시작" disabled={!others.length || !!w.call} onPress={() => setComposer(true)} style={({ pressed }) => ({ alignItems: 'center', gap: 6, paddingVertical: 14, opacity: !others.length || w.call ? 0.45 : pressed ? 0.7 : 1 })}>
          <PulsingDive size={104} /><Text style={{ fontSize: 20, fontWeight: '800', color: d.accent, letterSpacing: 1 }}>Dive</Text>
        </Pressable>
        <Text style={{ textAlign: 'center', color: d.muted, fontSize: 13 }}>{w.call ? '지금 다이브 중이에요.' : others.length ? '팀원을 골라 안건과 함께 바로 그룹 통화를 열어요.' : '팀원을 초대하면 다이브할 수 있어요.'}</Text>
      </Card>
      <Dives team={team} />
      <Members team={team} />
      {team.mine && <Button title="팀 없애기" onPress={() => Alert.alert(`'${team.name}' 팀을 없앨까요?`, '팀원과 다이브 기록이 모두 지워져요.', [{ text: '취소', style: 'cancel' }, { text: '없애기', style: 'destructive', onPress: () => w.deleteTeam(team.id) }])} />}
    </>}
    {composer && team && <DiveComposer team={team} onClose={() => setComposer(false)} />}
  </ScrollView>;
}

// Someone picked you for a dive: a card at the bottom until you join or answer.
export function IncomingDive() {
  const w = useWork(), d = useDesign(), [gone, setGone] = useState(() => new Set()), [error, setError] = useState('');
  const x = incomingDive(w.state);
  if (!x || w.call || gone.has(x.id)) return null;
  const team = w.state.teams.find((t) => t.id === x.team), by = team?.members.find((m) => m.id === x.by);
  const go = (f) => f().then(() => setGone((g) => new Set(g).add(x.id)), (e) => setError(e.message));
  return <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: 28, zIndex: 90 }}>
    <Surface native style={{ borderColor: d.accent, borderWidth: 1.5, backgroundColor: '#eef2ffe6' }} contentStyle={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><DiveIcon size={40} /><View style={{ flex: 1 }}><Text style={{ color: d.muted, fontSize: 12 }}>{team?.name} · 다이브 요청</Text><Text style={{ color: d.text, fontWeight: '700', fontSize: 15 }}>{by?.name || '팀원'}님이 불러요</Text></View></View>
      <Text style={{ color: d.text, fontSize: 16, fontWeight: '600', lineHeight: 22 }}>{x.agenda}</Text>
      <Button primary title="참여" onPress={() => go(() => w.joinDive(x.id))} />
      <View style={{ flexDirection: 'row', gap: 8 }}><Button style={{ flex: 1 }} title="카톡 가능" onPress={() => go(() => w.reply(x.id, 'kakao'))} /><Button style={{ flex: 1 }} title="지금 연락 불가" onPress={() => go(() => w.reply(x.id, 'busy'))} /></View>
      <ErrorText>{error}</ErrorText>
    </Surface>
  </View>;
}

// In a dive: who is in it (a ring while they speak), answers, mute, leave, and end for everyone (caller).
export function CallPanel() {
  const w = useWork(), d = useDesign(), c = w.call;
  if (!c) return null;
  const x = w.state?.dives.find((v) => v.id === c.dive), team = w.state?.teams.find((t) => t.id === x?.team);
  const nameOf = (id) => team?.members.find((m) => m.id === id)?.name || '팀원';
  const away = (x?.replies || []).filter((r) => r.answer === 'kakao' || r.answer === 'busy');
  return <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, top: 8, zIndex: 95 }}>
    <Surface native style={{ backgroundColor: '#eef2ffe6' }} contentStyle={{ padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><DiveIcon size={24} /><Text numberOfLines={1} style={{ flex: 1, color: d.text, fontWeight: '700' }}>{x?.agenda || '다이브'}</Text><Text style={{ color: d.muted, fontSize: 12 }}>{c.state === 'connected' ? `${c.people.length}명` : '연결 중…'}</Text></View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{c.people.map((p) => <View key={p.id} style={{ alignItems: 'center', gap: 4 }}>
        <View style={{ borderRadius: 99, padding: 2, borderWidth: 2, borderColor: p.speaking ? '#30c48d' : 'transparent' }}><Avatar person={{ id: p.id, name: p.name }} size={34} /></View>
        <Text style={{ fontSize: 11, color: p.muted ? d.muted : d.text }}>{p.me ? '나' : p.name}{p.muted ? ' 🔇' : ''}</Text>
      </View>)}</View>
      {away.length > 0 && <Text style={{ fontSize: 12, color: d.muted }}>{away.map((r) => `${nameOf(r.id)} ${ANSWER[r.answer]}`).join(' · ')}</Text>}
      {c.micError ? <ErrorText>{c.micError}</ErrorText> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button style={{ flex: 1 }} title={c.muted ? '🔇 음소거 중' : '🎤 마이크 켜짐'} onPress={() => w.mute()} />
        <Button style={{ flex: 1 }} title="나가기" onPress={() => w.leaveDive(false)} />
        {x?.by === w.state?.me.id && <Button title="모두 종료" onPress={() => w.leaveDive(true)} />}
      </View>
    </Surface>
  </View>;
}
