import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { Text, TextInput } from '../text.js';
import { useDesign, Surface, Sheet, Button, ProviderIcon } from '../design.js';
import { useTools } from '../tools.js';
import { subscriptionLine, accountsOf } from '../tool-jobs.js';

// 도구 연결: each person connects their own Notion and Google Calendar (OAuth in the browser; several accounts per
// tool, e.g. personal + work), then picks the Notion pages or databases to watch per workspace; every Google
// calendar is watched. New and changed to-dos come in by themselves.
const PROVIDERS = [['notion', '노션'], ['google', '구글 캘린더']];
const SIGN_IN = /^https:\/\/(api\.notion\.com|accounts\.google\.com)\//;
const RED = '#cc4057';

// Alert has no buttons on the web, so the browser asks there.
function confirm(title, message, action, onYes) {
  if (Platform.OS === 'web') { if (window.confirm(message ? `${title}\n${message}` : title)) onYes(); return; }
  Alert.alert(title, message, [{ text: '취소', style: 'cancel' }, { text: action, style: 'destructive', onPress: onYes }]);
}

function Link({ title, onPress, color, disabled }) {
  const d = useDesign();
  return <Pressable accessibilityRole="button" accessibilityLabel={title} hitSlop={8} disabled={disabled} onPress={onPress} style={({ pressed }) => ({ opacity: disabled ? .4 : pressed ? .55 : 1 })}><Text style={{ fontSize: 13, fontWeight: '600', color: color || d.accent }}>{title}</Text></Pressable>;
}

function Watched({ sub, busy, act }) {
  const d = useDesign(), { client } = useTools(), line = subscriptionLine(sub);
  const icon = sub.resource_type === 'calendar' ? '📅' : sub.resource_type === 'database' ? '🗂️' : '📄';
  const stop = () => {
    const go = () => act('stop:' + sub.id, () => client.unsubscribe(sub.id));
    if (sub.provider === 'google') confirm(`"${sub.title}" 그만 볼까요?`, '다시 보려면 구글 캘린더를 다시 연결해야 해요.', '그만 보기', go); else go();
  };
  return <View style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ffffff99' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <Text style={{ fontSize: 15 }}>{icon}</Text>
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '600', color: d.text }}>{sub.title || '제목 없음'}</Text>
    </View>
    <Text numberOfLines={2} style={{ fontSize: 12, color: line.error ? RED : d.muted }}>{line.text}</Text>
    <View style={{ flexDirection: 'row', gap: 16 }}>
      <Link title="지금 다시 읽기" disabled={!!busy || sub.state === 'syncing'} onPress={() => act('sync:' + sub.id, () => client.syncNow(sub.id))} />
      <Link title="그만 보기" color={d.muted} disabled={!!busy} onPress={stop} />
    </View>
  </View>;
}

// Notion pages and databases one workspace may read, newest first; a tap starts watching one.
function PagePicker({ account, onClose }) {
  const d = useDesign(), { client, state, refresh } = useTools(), connectionId = account.conn.id;
  const [q, setQ] = useState(''), [list, setList] = useState(null), [error, setError] = useState(''), [busy, setBusy] = useState('');
  useEffect(() => {
    let live = true;
    const t = setTimeout(() => client.pages(q.trim(), connectionId).then((p) => { if (live) { setList(p || []); setError(''); } }, (e) => { if (live) { setList([]); setError(e.message); } }), q ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, connectionId]);
  const watched = new Set((accountsOf(state, 'notion').find((a) => a.conn.id === connectionId)?.subs || account.subs).map((s) => s.resource_id));
  const pick = async (item) => {
    if (watched.has(item.id) || busy) return;
    setBusy(item.id); setError('');
    try { await client.subscribe(item.id, item.type, connectionId); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  return <Sheet title={account.conn.account ? `${account.conn.account} 페이지 고르기` : '지켜볼 페이지 고르기'} onClose={onClose}>
    <TextInput accessibilityLabel="노션 페이지 검색" placeholder="페이지나 DB 이름으로 찾기" placeholderTextColor={d.muted} value={q} onChangeText={setQ} autoCapitalize="none" autoCorrect={false} returnKeyType="search" style={{ padding: 13, borderRadius: 14, color: d.text, backgroundColor: d.input, fontSize: 15 }} />
    {!!error && <Text accessibilityRole="alert" style={{ color: RED }}>{error}</Text>}
    {list === null ? <Text style={{ color: d.muted }}>불러오는 중…</Text>
      : !list.length && !error ? <Text style={{ color: d.muted }}>찾은 페이지가 없어요. 노션 연결 때 허용한 페이지만 보여요.</Text>
      : list.map((item) => {
        const on = watched.has(item.id);
        return <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: on, busy: busy === item.id }} accessibilityLabel={(item.title || '제목 없음') + (on ? ', 지켜보는 중' : '')} onPress={() => pick(item)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11, borderRadius: 14, backgroundColor: on ? '#ffffffcc' : d.input, opacity: pressed ? .6 : 1 })}>
          <Text style={{ fontSize: 17, width: 24, textAlign: 'center' }}>{item.icon || (item.type === 'database' ? '🗂️' : '📄')}</Text>
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: d.text }}>{item.title || '제목 없음'}</Text>
          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: item.type === 'database' ? '#e0e7ff' : '#ffffffb3' }}><Text style={{ fontSize: 10.5, fontWeight: '700', color: item.type === 'database' ? d.accent : d.muted }}>{item.type === 'database' ? 'DB' : '페이지'}</Text></View>
          <Text style={{ width: 18, textAlign: 'center', fontSize: 14, fontWeight: '700', color: on ? d.accent : d.muted }}>{busy === item.id ? '…' : on ? '✓' : '+'}</Text>
        </Pressable>;
      })}
  </Sheet>;
}

// One connected account: its name and own 연결 끊기, then what it watches.
function Account({ provider, account, busy, act, onPick }) {
  const d = useDesign(), { client } = useTools(), { conn, subs } = account, label = conn.account || '이름 없는 계정';
  const disconnect = () => confirm(`"${label}" 연결을 끊을까요?`, '이 계정에서는 더 이상 새 할 일을 가져오지 않아요.', '연결 끊기', () => act('disconnect:' + conn.id, () => client.disconnect(conn.id)));
  return <View style={{ gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#ffffff99' }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Text numberOfLines={1} style={{ flex: 1, color: d.accent, fontWeight: '700', fontSize: 13 }}>{label}</Text>
      <Link title="연결 끊기" color={RED} disabled={!!busy} onPress={disconnect} />
    </View>
    {provider === 'notion' && <Button title="지켜볼 페이지 고르기" onPress={onPick} />}
    {!subs.length && <Text style={{ color: d.muted, fontSize: 12 }}>{provider === 'notion' ? '아직 고른 페이지가 없어요.' : '캘린더를 찾는 중이에요.'}</Text>}
    {subs.map((sub) => <Watched key={sub.id} sub={sub} busy={busy} act={act} />)}
  </View>;
}

export default function Integrations() {
  const d = useDesign(), { client, state, error, waiting, refresh, waitFor } = useTools();
  const [busy, setBusy] = useState(''), [problem, setProblem] = useState(''), [picker, setPicker] = useState(null);
  if (!client) return <Text style={{ color: d.muted }}>로그인하면 노션과 구글 캘린더를 연결할 수 있어요.</Text>;
  const act = async (key, fn) => {
    setBusy(key); setProblem('');
    try { await fn(); await refresh(); return true; } catch (e) { setProblem(e.message); return false; } finally { setBusy(''); }
  };
  // The browser opens the tool's sign-in page (Google always asks which account); back in the app, the new
  // account shows up by itself.
  const connect = (provider) => {
    const tab = Platform.OS === 'web' ? window.open('', '_blank') : null; // opened during the tap, or the browser blocks it
    act('connect:' + provider, async () => {
      const url = await client.start(provider);
      if (!SIGN_IN.test(url || '')) throw new Error('연결 주소가 올바르지 않아요.');
      waitFor(provider);
      if (tab) tab.location.href = url; else await Linking.openURL(url);
    }).then((ok) => { if (!ok) tab?.close(); });
  };
  const pickerAccount = picker && accountsOf(state, 'notion').find((a) => a.conn.id === picker);
  return <View style={{ gap: 12 }}>
    <Text style={{ color: d.muted, fontSize: 12 }}>연결해 두면 새로 생긴 할 일을 알아서 가져와요.</Text>
    {!!(problem || (error && !state)) && <Text accessibilityRole="alert" style={{ color: RED, fontSize: 13 }}>{problem || error}</Text>}
    {PROVIDERS.map(([provider, name]) => {
      const accounts = accountsOf(state, provider), wait = waiting === provider;
      return <Surface key={provider} native contentStyle={{ padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ProviderIcon provider={provider} size={38} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: d.text, fontWeight: '700', fontSize: 16 }}>{name}</Text>
            <Text numberOfLines={1} style={{ color: accounts.length && !wait ? d.accent : d.muted, fontSize: 12 }}>{!state && !error ? '확인하는 중…' : wait ? '브라우저에서 연결을 마쳐 주세요' : accounts.length > 1 ? `계정 ${accounts.length}개 연결됨` : accounts.length ? '연결됨' : '연결 안 됨'}</Text>
          </View>
          {!!accounts.length && <Link title={wait ? '기다리는 중…' : '+ 계정 추가'} disabled={!!busy || wait} onPress={() => connect(provider)} />}
        </View>
        {!!(state || error) && !accounts.length && <Button title={wait ? '연결 기다리는 중…' : '연결하기'} primary={!wait} disabled={!!busy} onPress={() => connect(provider)} />}
        {accounts.map((account) => <Account key={account.conn.id} provider={provider} account={account} busy={busy} act={act} onPick={() => setPicker(account.conn.id)} />)}
      </Surface>;
    })}
    {!!pickerAccount && <PagePicker account={pickerAccount} onClose={() => setPicker(null)} />}
  </View>;
}
