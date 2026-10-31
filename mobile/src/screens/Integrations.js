import React, { useEffect, useState } from 'react';
import { Alert, Linking, Platform, Pressable, View } from 'react-native';
import { Text, TextInput } from '../text.js';
import { useDesign, Surface, Sheet, Button, ProviderIcon } from '../design.js';
import { useTools } from '../tools.js';
import { subscriptionLine, accountsOf } from '../tool-jobs.js';
import * as Clipboard from 'expo-clipboard';

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

// ChatGPT: a secret link (an MCP server address) to paste into ChatGPT → 플러그인 → + → Add custom MCP server. Shown once.
const shortDate = (iso) => { if (!iso) return ''; const t = new Date(iso); return `${t.getMonth() + 1}월 ${t.getDate()}일`; };
function ChatGpt({ client, busy, act }) {
  const d = useDesign(), [links, setLinks] = useState(null), [grants, setGrants] = useState([]), [fresh, setFresh] = useState(null), [copied, setCopied] = useState(false);
  const load = () => Promise.all([client.mcpLinks().then(setLinks).catch(() => setLinks([])), client.oauthGrants().then(setGrants).catch(() => {})]);
  useEffect(() => { load(); }, []);
  const make = () => act('mcp', async () => { const link = await client.createMcpLink('ChatGPT'); if (!/\/functions\/v1\/integrations\/mcp\/[A-Za-z0-9_-]{20,}$/.test(link?.url || '')) throw new Error('연결 주소를 만들지 못했어요.'); setFresh(link); setCopied(false); await load(); });
  const cut = (id) => confirm('연결 끊기', '이 주소로는 ChatGPT가 더 이상 할 일을 넣지 못해요.', '끊기', () => act('mcp', async () => { await client.revokeMcpLink(id); if (fresh?.id === id) setFresh(null); await load(); }));
  const cutGrant = (id) => confirm('연결 끊기', 'ChatGPT가 더 이상 체커에 접근하지 못해요.', '끊기', () => act('mcp', async () => { await client.revokeOauthGrant(id); await load(); }));
  const on = (links || []).length > 0 || grants.length > 0;
  return <Surface native contentStyle={{ padding: 16, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 38, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: '#10a37f' }}><Text style={{ color: '#fff', fontSize: 18 }}>✦</Text></View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: d.text, fontWeight: '700', fontSize: 16 }}>ChatGPT</Text>
        <Text numberOfLines={2} style={{ color: on ? d.accent : d.muted, fontSize: 12 }}>{!links ? '확인하는 중…' : on ? [grants.length && `로그인 연결 ${grants.length}개`, links.length && `연결 주소 ${links.length}개`].filter(Boolean).join(' · ') : '대화하다가 "체커에 넣어줘" 하면 바로 들어와요'}</Text>
      </View>
      {on && <Link title="+ 주소 추가" disabled={!!busy} onPress={make} />}
    </View>
    {!!links && !on && !fresh && <Button title="연결 주소 만들기" primary disabled={!!busy} onPress={make} />}
    {!!fresh && <View style={{ gap: 8 }}>
      <Text style={{ color: RED, fontSize: 12, fontWeight: '600' }}>이 주소는 지금 한 번만 보여요. 다른 사람에게 알려 주지 마세요.</Text>
      <Text selectable style={{ color: d.text, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>{fresh.url}</Text>
      <Button title={copied ? '복사됨' : '주소 복사'} primary onPress={() => Clipboard.setStringAsync(fresh.url).then(() => setCopied(true))} />
      <Text style={{ color: d.text, fontSize: 12, lineHeight: 18 }}>{'1. ChatGPT 웹 → 플러그인 → + → Add custom MCP server\n2. 이름은 체커, Server URL에 이 주소, 인증은 없음(No authentication)\n3. 대화에서 @체커를 부르고 "체커에 넣어줘"'}</Text>
    </View>}
    {grants.map((g) => <View key={g.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ffffff4d' }}>
      <View style={{ flex: 1 }}><Text style={{ color: d.text, fontSize: 13, fontWeight: '600' }}>{(g.client_name || 'ChatGPT') + ' · 로그인으로 연결'}</Text><Text style={{ color: d.muted, fontSize: 11 }}>{shortDate(g.created_at)} 허락함 · {g.last_used_at ? `마지막 사용 ${shortDate(g.last_used_at)}` : '아직 안 씀'}</Text></View>
      <Link title="끊기" color={RED} disabled={!!busy} onPress={() => cutGrant(g.id)} />
    </View>)}
    {(links || []).map((l) => <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#ffffff4d' }}>
      <View style={{ flex: 1 }}><Text style={{ color: d.text, fontSize: 13, fontWeight: '600' }}>{l.label || 'ChatGPT'}</Text><Text style={{ color: d.muted, fontSize: 11 }}>{shortDate(l.created_at)} 만듦 · {l.last_used_at ? `마지막 사용 ${shortDate(l.last_used_at)}` : '아직 안 씀'}</Text></View>
      <Link title="끊기" color={RED} disabled={!!busy} onPress={() => cut(l.id)} />
    </View>)}
  </Surface>;
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
    <ChatGpt client={client} busy={busy} act={act} />
    {!!pickerAccount && <PagePicker account={pickerAccount} onClose={() => setPicker(null)} />}
  </View>;
}
