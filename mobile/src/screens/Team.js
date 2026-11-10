import React, { useEffect, useRef, useState } from 'react';
import { View, ScrollView, Pressable, TextInput, Alert, Animated, Easing, Vibration, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';
import { Text } from '../text.js';
import { useDesign, Surface, Button, Sheet } from '../design.js';
import { useWork } from '../work.js';
import { useDb } from '../store.js';
import { incomingDive } from '../../../shared/work-alerts.mjs';
import { notificationPermission, pushState, startPush, permissionNote, quietly } from '../notifications.js';
import { available as voipAvailable, callState } from '../voip.js';
import { Linking, AppState } from 'react-native';
import { tools } from '../store.js';
import { todosOn, addDay } from '../../../shared/multi-day.js';

/*
 * 팀버전 (Work) — the Team screen (tap "체커" in the top bar): teams and invites, who is online, the dive button, and
 * the open dives. Same as the Team tab on PC and web (desktop/src/views/Team.jsx).
 */
const AGENDA_MAX = 50;
const ANSWER = { join: '참여', left: '나감', kakao: '카톡 가능', busy: '지금 연락 불가' };
// A room's second line: who is in it, or how long until an empty one goes away (6 hours after the last one left).
const ROOM_IDLE_MS = 6 * 3600_000;
function roomNote(d, nameOf) {
  const inside = d.replies.filter((r) => r.answer === 'join').map((r) => nameOf(r.id));
  if (inside.length) return `안에 ${inside.length}명: ${inside.join(', ')}`;
  if (!d.emptySince) return '비어 있음';
  const left = Math.max(0, Date.parse(d.emptySince) + ROOM_IDLE_MS - Date.now()), h = Math.floor(left / 3600_000), m = Math.ceil((left % 3600_000) / 60_000);
  return `비어 있음 · ${h ? h + '시간 ' : ''}${m}분 후 삭제`;
}
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

// A teammate's to-dos (read only), two weeks ahead, grouped by their 체커 teams. Their private (👁) ones never come.
// Same as the member window on PC and web (desktop/src/views/Team.jsx), without the pet.
const WIN_DAYS = 14, DOW_SHORT = ['일', '월', '화', '수', '목', '금', '토'];
function MemberSheet({ team, member, onClose }) {
  const w = useWork(), d = useDesign(), [board, setBoard] = useState(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const load = () => w.memberBoard(team.id, member.id).then((b) => alive && (setBoard(b), setError('')), (e) => alive && setError(e.message || '불러오지 못했어요.'));
    load(); const t = setInterval(load, 15000);
    return () => { alive = false; clearInterval(t); };
  }, [member.id]);
  const days = board ? Array.from({ length: WIN_DAYS }, (_, i) => addDay(board.today, i)) : [];
  return <Sheet title={member.name + '의 할 일'} onClose={onClose}>
    {board && <Text style={{ color: d.muted, fontSize: 12, marginTop: -8 }}>{member.online ? '온라인' : '오프라인'}{board.hidden ? ` · 숨긴 할 일 ${board.hidden}개` : ''}</Text>}
    {!board ? <Text style={{ color: d.muted }}>{error || '불러오는 중…'}</Text> : days.map((day) => {
      const list = todosOn(board.todos, day).sort((a, b) => (a.startTime || '99').localeCompare(b.startTime || '99') || (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      if (!list.length && day !== board.today) return null;
      const [, m, dd] = day.split('-').map(Number), dow = new Date(day + 'T12:00:00').getDay();
      const groups = [null, ...board.teams].map((tm) => ({ tm, items: list.filter((t) => (board.teams.some((x) => x.id === t.teamId) ? t.teamId : null) === (tm?.id || null)) })).filter((g) => g.items.length);
      return <View key={day} style={{ gap: 4 }}>
        <Text style={{ color: d.text, fontWeight: '700', fontSize: 14 }}>{m}월 {dd}일 <Text style={{ color: dow === 0 ? '#e11d48' : dow === 6 ? '#4f6ef7' : d.muted }}>{DOW_SHORT[dow]}</Text>{day === board.today ? <Text style={{ color: d.accent }}>  오늘</Text> : null}</Text>
        {!list.length && <Text style={{ color: d.muted, fontSize: 13 }}>할 일이 없어요</Text>}
        {groups.map((g) => <View key={g.tm?.id || 'none'} style={{ gap: 2 }}>
          {g.tm && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}><View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: g.tm.color }} /><Text style={{ color: d.muted, fontSize: 12, fontWeight: '700' }}>{g.tm.name}</Text></View>}
          {g.items.map((t) => { const done = t.status === 'done'; return <View key={t.id + day} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
            <View accessibilityLabel={done ? '완료' : '할 일'} style={{ width: 16, height: 16, borderRadius: 5, borderWidth: 1.5, borderColor: done ? d.accent : d.muted, backgroundColor: done ? d.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{done ? <Text style={{ color: '#fff', fontSize: 10 }}>✓</Text> : null}</View>
            <Text style={{ flex: 1, color: done ? d.muted : d.text, fontSize: 14, textDecorationLine: done ? 'line-through' : 'none' }}>{t.title}{t.span ? <Text style={{ color: d.muted, fontSize: 12 }}> ({t.span.n}일차)</Text> : null}</Text>
            {(t.startTime || t.span?.allDay) ? <Text style={{ color: d.muted, fontSize: 12, fontVariant: ['tabular-nums'] }}>{t.span?.allDay ? '종일' : t.startTime}{t.endTime ? '~' + t.endTime : ''}</Text> : null}
          </View>; })}
        </View>)}
      </View>;
    })}
  </Sheet>;
}

function Members({ team }) {
  const w = useWork(), d = useDesign(), me = w.state.me, [emails, setEmails] = useState(''), [note, setNote] = useState(''), [error, setError] = useState(''), [peek, setPeek] = useState(null);
  const sorted = [...team.members].sort((a, b) => (b.online - a.online) || (a.status === 'invited') - (b.status === 'invited'));
  const remove = (m) => Alert.alert(`${m.name}님을 내보낼까요?`, '', [{ text: '취소', style: 'cancel' }, { text: '내보내기', style: 'destructive', onPress: () => run(setError, () => w.removeMember(team.id, m.email)) }]);
  return <Card><Title note={`${team.members.filter((m) => m.online).length}명 온라인`}>팀원</Title>
    {sorted.map((m) => <Pressable key={m.email} accessibilityHint={m.status === 'active' && m.id !== me.id ? '눌러서 할 일 보기' : undefined} onPress={() => m.status === 'active' && m.id !== me.id && setPeek(m)} onLongPress={() => team.mine && m.id !== me.id && remove(m)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, opacity: m.online ? 1 : 0.6 }}>
      <Avatar person={m} /><View style={{ flex: 1 }}><Text style={{ color: d.text, fontWeight: '600', fontSize: 14 }}>{m.name}{m.id === me.id ? <Text style={{ color: d.muted, fontWeight: '500' }}> (나)</Text> : null}</Text><Text numberOfLines={1} style={{ color: d.muted, fontSize: 12 }}>{m.email}</Text></View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: m.online ? '#30c48d' : '#8a93a6' }} /><Text style={{ color: d.muted, fontSize: 12 }}>{statusOf(m)}</Text></View>
    </Pressable>)}
    {team.mine && <View style={{ flexDirection: 'row', gap: 8 }}><Field value={emails} onChangeText={setEmails} placeholder="초대할 이메일 (쉼표로 여러 명)" autoCapitalize="none" keyboardType="email-address" /><Button title="초대" disabled={!emails.trim()} onPress={() => run(setError, async () => { const r = await w.invite(team.id, emails.split(/[\s,;]+/).filter(Boolean)); setEmails(''); setNote(r.invited.length ? `${r.invited.length}명을 초대했어요.` : '이미 초대한 이메일이에요.'); })} /></View>}
    <Text style={{ color: d.muted, fontSize: 11 }}>팀원을 누르면 그 사람의 할 일을 볼 수 있어요{team.mine ? ', 길게 누르면 내보낼 수 있어요' : ''}. 👁로 숨긴 할 일은 보이지 않아요.</Text>
    {peek && <MemberSheet team={team} member={peek} onClose={() => setPeek(null)} />}
    {note ? <Text style={{ color: d.muted, fontSize: 13 }}>{note}</Text> : null}<ErrorText>{error}</ErrorText>
  </Card>;
}

function DiveComposer({ team, onClose }) {
  const w = useWork(), d = useDesign(), me = w.state.me;
  const people = team.members.filter((m) => m.status === 'active' && m.id !== me.id).sort((a, b) => b.online - a.online);
  const [picked, setPicked] = useState([]), [agenda, setAgenda] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const start = async () => { setBusy(true); setError(''); try { await w.startDive(team.id, picked, agenda); onClose(); } catch (e) { setError(e.message); setBusy(false); } };
  return <Sheet title="새 방" onClose={onClose}>
    <Text style={{ color: d.muted, fontSize: 13, lineHeight: 19 }}>안건이 방 이름이에요. 고른 팀원에게는 전화처럼 울리고, 나머지에겐 방이 열렸다고 알려요. 방은 아무도 없는 채 6시간이 지나면 저절로 사라져요.</Text>
    {people.map((m) => { const on = picked.includes(m.id); return <Pressable key={m.id} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => toggle(m.id)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: on ? d.accent : 'transparent', backgroundColor: on ? '#6366f11a' : 'transparent' }}>
      <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: on ? d.accent : d.muted, backgroundColor: on ? d.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{on && <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>✓</Text>}</View>
      <Avatar person={m} size={30} /><Text style={{ flex: 1, color: d.text, fontWeight: '600' }}>{m.name}</Text><Text style={{ color: d.muted, fontSize: 12 }}>{statusOf(m)}</Text>
    </Pressable>; })}
    {!people.length && <Text style={{ color: d.muted }}>아직 함께할 팀원이 없어요. 먼저 팀원을 초대해 주세요.</Text>}
    <View style={{ gap: 4 }}><Field value={agenda} onChangeText={setAgenda} placeholder="안건 = 방 이름 (예: 내일 발표 자료 5분만 맞춰봐요)" maxLength={AGENDA_MAX} /><Text style={{ alignSelf: 'flex-end', color: d.muted, fontSize: 12 }}>{Array.from(agenda).length}/{AGENDA_MAX}</Text></View>
    <ErrorText>{error}</ErrorText>
    <Button primary title={busy ? '여는 중…' : `방 만들기 (${picked.length}명 부르기)`} disabled={busy || !picked.length || !agenda.trim()} onPress={start} />
  </Sheet>;
}

function Dives({ team }) {
  const w = useWork(), d = useDesign(), me = w.state.me, [error, setError] = useState('');
  const dives = w.state.dives.filter((x) => x.team === team.id);
  if (!dives.length) return null;
  const nameOf = (id) => team.members.find((m) => m.id === id)?.name || '팀원';
  const remove = (x) => Alert.alert(`'${x.agenda}' 방을 없앨까요?`, '안에 있는 사람도 나가게 돼요.', [{ text: '취소', style: 'cancel' }, { text: '없애기', style: 'destructive', onPress: () => run(setError, () => w.deleteDive(x.id)) }]);
  return <Card><Title note={`${dives.length}개`}>열린 방</Title>
    {dives.map((x) => { const mine = x.replies.find((r) => r.id === me.id), inIt = w.call?.dive === x.id, picked = x.targets.includes(me.id), opened = x.by === me.id;
      const answers = x.replies.filter((r) => r.answer === 'kakao' || r.answer === 'busy');
      return <View key={x.id} style={{ gap: 8, padding: 12, borderRadius: 16, borderWidth: 1, borderColor: picked || inIt ? d.accent : d.edge, backgroundColor: '#ffffff0d' }}>
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><DiveIcon size={26} /><View style={{ flex: 1 }}><Text style={{ color: d.text, fontWeight: '700' }}>{x.agenda}</Text><Text style={{ color: d.muted, fontSize: 12 }}>{nameOf(x.by)}님이 엶 · {ago(x.createdAt)}{x.targets.length ? ' · ' + x.targets.map(nameOf).join(', ') + ' 부름' : ''}</Text><Text style={{ color: d.accent, fontSize: 12 }}>{roomNote(x, nameOf)}</Text></View></View>
        {answers.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>{answers.map((r) => <Text key={r.id} style={{ fontSize: 12, color: d.muted }}>{nameOf(r.id)} <Text style={{ fontWeight: '700', color: ANSWER_COLOR[r.answer] }}>{ANSWER[r.answer]}</Text></Text>)}</View>}
        {inIt ? <Text style={{ color: d.muted, fontSize: 13 }}>통화 중</Text> : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Button primary title="들어가기" onPress={() => run(setError, () => w.joinDive(x.id))} />
          {picked && !opened && mine?.answer !== 'kakao' && <Button title="카톡 가능" onPress={() => run(setError, () => w.reply(x.id, 'kakao'))} />}
          {picked && !opened && mine?.answer !== 'busy' && <Button title="지금 연락 불가" onPress={() => run(setError, () => w.reply(x.id, 'busy'))} />}
          {opened && <Button title="방 삭제" onPress={() => remove(x)} />}
        </View>}
      </View>; })}
    <ErrorText>{error}</ErrorText>
  </Card>;
}

// Optional tags: any of the person's own 체커 teams (to-do groups) for this Work team, tapped on and off.
// Only links — nothing is shared.
function CheckerLink({ team }) {
  const w = useWork(), d = useDesign(), { db } = useDb(), links = team.links || [];
  const toggle = (id) => w.setLink(team.id, links.includes(id) ? links.filter((x) => x !== id) : [...links, id]);
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
  </View>;
}

function MyName() {
  const w = useWork(), d = useDesign(), [edit, setEdit] = useState(false), [name, setName] = useState(w.state.me.name);
  useEffect(() => { if (!edit) setName(w.state.me.name); }, [w.state.me.name, edit]);
  const save = () => { setEdit(false); if (name.trim() && name.trim() !== w.state.me.name) w.setName(name).catch(() => setName(w.state.me.name)); };
  return edit ? <View style={{ width: 150, flexDirection: 'row' }}><Field value={name} onChangeText={setName} maxLength={20} autoFocus onBlur={save} onSubmitEditing={save} /></View>
    : <Pressable accessibilityLabel="팀에 보이는 내 이름 바꾸기" onPress={() => setEdit(true)} hitSlop={8}><Text style={{ color: d.muted, fontSize: 13 }}>나: {w.state.me.name} ✎</Text></Pressable>;
}

// ⚙ next to the team's name: rename (the maker), leave (others), and — set apart, behind typing the name — delete.
function TeamSettings({ team, onClose }) {
  const w = useWork(), d = useDesign(), me = w.state.me, [name, setName] = useState(team.name), [typed, setTyped] = useState(''), [error, setError] = useState('');
  const go = (f, close = true) => f().then(() => close && onClose(), (e) => setError(e.message));
  return <Sheet title="팀 설정" onClose={onClose}>
    <Text style={{ color: d.muted, fontSize: 12 }}>팀 이름</Text>
    <View style={{ flexDirection: 'row', gap: 8 }}><Field value={name} onChangeText={setName} maxLength={40} editable={team.mine} />{team.mine && <Button title="저장" disabled={!name.trim() || name.trim() === team.name} onPress={() => go(() => w.renameTeam(team.id, name), false)} />}</View>
    {!team.mine && <Text style={{ color: d.muted, fontSize: 12 }}>팀 이름은 팀을 만든 사람이 바꿀 수 있어요.</Text>}
    {!team.mine && <Button title="팀 나가기" onPress={() => Alert.alert(`'${team.name}'에서 나갈까요?`, '다시 들어오려면 초대를 받아야 해요.', [{ text: '취소', style: 'cancel' }, { text: '나가기', style: 'destructive', onPress: () => go(() => w.removeMember(team.id, (me.email || '').toLowerCase())) }])} />}
    {team.mine && <View style={{ gap: 8, marginTop: 8, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e5484d59', backgroundColor: '#e5484d0f' }}>
      <Text style={{ color: '#e5484d', fontWeight: '700' }}>팀 없애기</Text>
      <Text style={{ color: d.muted, fontSize: 13, lineHeight: 19 }}>팀원, 초대, 다이브 기록이 모두 지워지고 되돌릴 수 없어요. 없애려면 팀 이름 <Text style={{ fontWeight: '700', color: d.text }}>{team.name}</Text>을(를) 그대로 적어 주세요.</Text>
      <Field value={typed} onChangeText={setTyped} placeholder={team.name} />
      <Button title="팀 없애기" disabled={typed.trim() !== team.name} onPress={() => go(() => w.deleteTeam(team.id))} />
    </View>}
    <ErrorText>{error}</ErrorText>
  </Sheet>;
}

// Without notifications a dive cannot ring this phone: say so on the Team screen, with the way to turn them on.
function AlertsOff() {
  const d = useDesign(), [state, setState] = useState(null), [busy, setBusy] = useState(false);
  const look = () => notificationPermission(false).then((p) => setState(p === 'granted' ? (pushState().registered ? 'ok' : 'unregistered') : p)).catch(() => {});
  useEffect(() => { look(); const sub = AppState.addEventListener('change', (s) => s === 'active' && setTimeout(look, 1200)); return () => sub.remove(); }, []);
  if (state === 'ok' && quietly()) return <Pressable accessibilityRole="button" onPress={() => Linking.openSettings()} style={{ marginBottom: 12, padding: 12, borderRadius: 16, backgroundColor: '#fff7e6cc', gap: 2 }}><Text style={{ color: '#9a5b00', fontWeight: '700' }}>🔔 알림이 '조용히 전달'로 되어 있어요</Text><Text style={{ color: d.text, fontSize: 13 }}>다이브가 화면에 뜨려면 눌러서 아이폰 설정 > Work > 알림에서 잠금 화면·배너를 켜 주세요.</Text></Pressable>;
  if (!state || state === 'ok' || Platform.OS !== 'ios') return null;
  const fix = async () => {
    if (state === 'denied') return Linking.openSettings();
    const p = state === 'default' ? await notificationPermission(true).catch(() => 'default') : 'granted';
    if (p !== 'granted') return Linking.openSettings(); // the prompt did not come up or was refused: turn it on there
    setBusy(true);
    try { await startPush(tools); } finally { setBusy(false); look(); }
  };
  return <Pressable accessibilityRole="button" disabled={busy} onPress={fix} style={{ marginBottom: 12, padding: 14, borderRadius: 16, borderWidth: 1, borderColor: '#e5484d59', backgroundColor: '#fff1f1cc', gap: 4, opacity: busy ? 0.7 : 1 }}>
    <Text style={{ color: '#c4262e', fontWeight: '700' }}>🔕 다이브 알림을 받을 수 없어요</Text>
    <Text style={{ color: d.text, fontSize: 13 }}>{busy ? (pushState().step || '등록하는 중') + '…' : state === 'denied' ? '눌러서 아이폰 설정 > Work > 알림 > 알림 허용을 켜 주세요.' : state === 'default' ? '눌러서 알림을 허용해 주세요. 창이 안 뜨면 아이폰 설정이 열려요.' : '눌러서 이 휴대폰을 알림에 다시 등록해 주세요.'}</Text>
    {!busy && state === 'unregistered' && !!pushState().error && <Text style={{ color: '#c4262e', fontSize: 12 }}>{pushState().error}</Text>}
    <Text style={{ color: d.muted, fontSize: 11 }}>{permissionNote()}</Text>
  </Pressable>;
}

export default function TeamScreen() {
  const w = useWork(), d = useDesign(), s = w.state;
  const [teamId, setTeamId] = useState(null), [composer, setComposer] = useState(false), [adding, setAdding] = useState(false), [settings, setSettings] = useState(false);
  if (!w.available) return <View style={{ flex: 1, padding: 24 }}><Text style={{ color: d.muted }}>팀 기능은 로그인해야 쓸 수 있어요.</Text></View>;
  if (!s) return <View style={{ flex: 1, padding: 24 }}><Text style={{ color: d.muted }}>{w.error || '팀을 불러오는 중…'}</Text></View>;
  const team = s.teams.find((t) => t.id === teamId) || s.teams[0];
  const others = team ? team.members.filter((m) => m.status === 'active' && m.id !== s.me.id) : [];
  const chip = (label, active, onPress, key) => <Pressable key={key} onPress={onPress} style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: active ? d.accent : d.edge, backgroundColor: d.input }}><Text style={{ color: d.text, fontWeight: '600', fontSize: 13 }}>{label}</Text></Pressable>;
  return <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
      {s.teams.map((t) => <React.Fragment key={t.id}>{chip(t.name, t.id === team?.id && !adding, () => { setTeamId(t.id); setAdding(false); }, t.id)}
        {t.id === team?.id && !adding && <Pressable accessibilityRole="button" accessibilityLabel={t.name + ' 팀 설정'} hitSlop={8} onPress={() => setSettings(true)} style={{ padding: 4 }}><Text style={{ fontSize: 17, color: d.muted }}>⚙︎</Text></Pressable>}</React.Fragment>)}
      {s.teams.length > 0 && chip('+ 새 팀', adding, () => setAdding(true), 'add')}
      <View style={{ flex: 1 }} /><MyName />
    </View>
    <AlertsOff />
    <Invites />
    {!team || adding ? <CreateTeam onDone={(id) => { setTeamId(id); setAdding(false); }} /> : <>
      <Card style={{ alignItems: 'stretch' }}>
        <CheckerLink team={team} />
        {w.call ? <CallPanel inline /> : <>
          <Pressable accessibilityRole="button" accessibilityLabel="다이브 시작" disabled={!others.length} onPress={() => setComposer(true)} style={({ pressed }) => ({ alignItems: 'center', gap: 6, paddingVertical: 14, opacity: !others.length ? 0.45 : pressed ? 0.7 : 1 })}>
            <PulsingDive size={104} /><Text style={{ fontSize: 20, fontWeight: '800', color: d.accent, letterSpacing: 1 }}>Dive</Text>
          </Pressable>
          <Text style={{ textAlign: 'center', color: d.muted, fontSize: 13 }}>{others.length ? '안건으로 방을 열고 팀원을 불러요. 방은 비어 있는 채 6시간이 지나면 사라져요.' : '팀원을 초대하면 다이브할 수 있어요.'}</Text>
        </>}
      </Card>
      <Dives team={team} />
      <Members team={team} />
    </>}
    {composer && team && <DiveComposer team={team} onClose={() => setComposer(false)} />}
    {settings && team && <TeamSettings team={team} onClose={() => setSettings(false)} />}
  </ScrollView>;
}

// Someone picked you for a dive. Like a phone call: while it is new (RING_MS) it fills the screen and the phone
// vibrates (the push itself brings the ringtone, mobile/assets/dive-ring.wav); after that it waits as a card at the
// bottom until you join or answer.
const RING_MS = 45_000;
function Ringing({ x, team, by, go, w, error }) {
  const d = useDesign();
  useEffect(() => {
    if (Platform.OS === 'android') { Vibration.vibrate([0, 700, 900], true); return () => Vibration.cancel(); }
    Vibration.vibrate(); const t = setInterval(() => Vibration.vibrate(), 1600);
    return () => { clearInterval(t); Vibration.cancel(); };
  }, []);
  const round = (bg, label, sub, onPress) => <View style={{ alignItems: 'center', gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => ({ width: 74, height: 74, borderRadius: 37, backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.75 : 1, shadowColor: bg, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } })}><Text style={{ color: '#fff', fontSize: 28 }}>{sub}</Text></Pressable>
    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }}>{label}</Text>
  </View>;
  return <View accessibilityViewIsModal accessibilityRole="alert" style={[StyleSheet.absoluteFill, { zIndex: 120, backgroundColor: '#0b1636e6', paddingHorizontal: 28, paddingTop: 90, paddingBottom: 60, justifyContent: 'space-between' }]}>
    <View style={{ alignItems: 'center', gap: 14 }}>
      <Text style={{ color: '#c7d2fe', fontSize: 14 }}>{team?.name} · 다이브 요청</Text>
      <Text style={{ color: '#fff', fontSize: 30, fontWeight: '700', textAlign: 'center' }}>{by?.name || '팀원'}</Text>
      <PulsingDive size={120} />
      <Text style={{ color: '#fff', fontSize: 19, fontWeight: '600', lineHeight: 27, textAlign: 'center' }}>{x.agenda}</Text>
    </View>
    <View style={{ gap: 26 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
        {round('#e5484d', '지금 연락 불가', '✕', () => go(() => w.reply(x.id, 'busy')))}
        {round('#30a46c', '참여', '🌊', () => go(() => w.joinDive(x.id)))}
      </View>
      <Pressable accessibilityRole="button" onPress={() => go(() => w.reply(x.id, 'kakao'))} style={{ alignSelf: 'center', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 99, backgroundColor: '#ffffff26' }}><Text style={{ color: '#fff', fontWeight: '600' }}>💬 카톡 가능</Text></Pressable>
      <ErrorText>{error}</ErrorText>
    </View>
  </View>;
}
export function IncomingDive() {
  const w = useWork(), d = useDesign(), [gone, setGone] = useState(() => new Set()), [error, setError] = useState('');
  const x = incomingDive(w.state), showing = !!x && !w.call && !gone.has(x.id);
  // Ringing: from when the card first shows for a dive still under a minute old, for RING_MS.
  const [ringing, setRinging] = useState(null);
  useEffect(() => {
    if (!showing || Date.now() - Date.parse(x.createdAt) > 60_000) { setRinging(null); return undefined; }
    setRinging(x.id); const t = setTimeout(() => setRinging(null), RING_MS);
    return () => clearTimeout(t);
  }, [showing, x?.id]);
  if (!showing) return null;
  const team = w.state.teams.find((t) => t.id === x.team), by = team?.members.find((m) => m.id === x.by);
  const go = (f) => f().then(() => setGone((g) => new Set(g).add(x.id)), (e) => setError(e.message));
  // On an iPhone the system call screen (CallKit) rings for it; the in-app one is for when that could not.
  if (ringing === x.id && !(voipAvailable && callState().dive === x.id)) return <Ringing x={x} team={team} by={by} go={go} w={w} error={error} />;
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
// In a dive: a small bar at the bottom (the screen stays usable — the Team tab, the to-dos, everything). Tapping
// it shows who is in, who answered what, the mic error, and for the one who opened the room, 방 삭제.
// inline: in the Team tab's hub, as the room itself, opened out (the bottom bar is hidden there); hidden: not at all.
export function CallPanel({ inline = false, hidden = false }) {
  const w = useWork(), d = useDesign(), c = w.call, [open, setOpen] = useState(inline);
  if (!c || hidden) return null;
  const x = w.state?.dives.find((v) => v.id === c.dive), team = w.state?.teams.find((t) => t.id === x?.team);
  const nameOf = (id) => team?.members.find((m) => m.id === id)?.name || '팀원';
  const away = (x?.replies || []).filter((r) => r.answer === 'kakao' || r.answer === 'busy');
  const others = c.people.filter((p) => !p.me);
  const summary = c.state !== 'connected' ? '연결 중…' : others.length ? `${others.length}명과 통화 중` : '아직 혼자예요';
  return <View pointerEvents="box-none" style={inline ? { marginTop: 4 } : { position: 'absolute', left: 12, right: 12, bottom: 28, zIndex: 95 }}>
    <Surface native style={{ backgroundColor: inline ? '#ffffff66' : '#eef2ffee' }} contentStyle={{ padding: 10, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={open ? '통화 정보 접기' : '통화 정보 펼치기'} onPress={() => setOpen(!open)} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <DiveIcon size={22} />
          <View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: d.text, fontWeight: '700', fontSize: 13 }}>{x?.agenda || '다이브'}</Text><Text numberOfLines={1} style={{ color: d.muted, fontSize: 11 }}>{summary}{c.muted ? ' · 음소거' : ''}</Text></View>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={c.muted ? '음소거 해제' : '음소거'} hitSlop={6} onPress={() => w.mute()} style={{ padding: 6 }}><Text style={{ fontSize: 17 }}>{c.muted ? '🔇' : '🎤'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="나가기" hitSlop={6} onPress={() => w.leaveDive(false)} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, backgroundColor: '#e5484d' }}><Text style={{ color: '#fff', fontWeight: '700', fontSize: 12 }}>나가기</Text></Pressable>
      </View>
      {open && <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{c.people.map((p) => <View key={p.id} style={{ alignItems: 'center', gap: 4 }}>
          <View style={{ borderRadius: 99, padding: 2, borderWidth: 2, borderColor: p.speaking ? '#30c48d' : 'transparent' }}><Avatar person={{ id: p.id, name: p.name }} size={34} /></View>
          <Text style={{ fontSize: 11, color: p.muted ? d.muted : d.text }}>{p.me ? '나' : p.name}{p.muted ? ' 🔇' : ''}</Text>
        </View>)}</View>
        {away.length > 0 && <Text style={{ fontSize: 12, color: d.muted }}>{away.map((r) => `${nameOf(r.id)} ${ANSWER[r.answer]}`).join(' · ')}</Text>}
        {c.micError ? <ErrorText>{c.micError}</ErrorText> : null}
        {x?.by === w.state?.me.id && <Button title="방 삭제" onPress={() => Alert.alert('방을 없앨까요?', '모두 나가게 돼요.', [{ text: '취소', style: 'cancel' }, { text: '없애기', style: 'destructive', onPress: () => w.leaveDive(true) }])} />}
      </>}
    </Surface>
  </View>;
}
