import React, { useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useDb } from '../store.js';
import { useDesign, Surface, Button } from '../design.js';
import { parseYouTube, DEFAULT_MUSIC } from '../../../shared/youtube.js';

// The official YouTube IFrame player inside a WebView. The https base URL gives YouTube the referrer it requires.
const PLAYER_HTML = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}#p{width:100%;height:100%}</style><div id="p"></div>
<script src="https://www.youtube.com/iframe_api"></script><script>
var player;function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function onYouTubeIframeAPIReady(){player=new YT.Player('p',{width:'100%',height:'100%',playerVars:{playsinline:1,rel:0},events:{onReady:function(){post({type:'ready'});},onStateChange:function(e){post({type:'state',state:e.data,title:player.getVideoData?player.getVideoData().title:''});},onError:function(e){post({type:'error',code:e.data});}}});}
window.cmd=function(c){if(!player)return;if(c.type==='load'){if(c.listId)player.loadPlaylist({list:c.listId,listType:'playlist'});else player.loadVideoById(c.videoId);}else if(c.type==='play')player.playVideo();else if(c.type==='pause')player.pauseVideo();else if(c.type==='volume')player.setVolume(c.value);};
</script>`;
const BLOCKED = { 2: '링크가 올바르지 않습니다.', 5: '이 영상은 재생할 수 없습니다.', 100: '영상이 삭제되었거나 비공개입니다.', 101: '이 영상은 다른 앱에서 재생하지 못하게 설정되어 있어요.', 150: '이 영상은 다른 앱에서 재생하지 못하게 설정되어 있어요.', 153: 'YouTube 플레이어 설정 오류입니다.' };

// Stays mounted once opened so the music keeps playing while the panel is closed.
// onNowPlaying lets the header show what is playing while the panel is closed; controls lets it pause.
export default function MusicPanel({ visible, onClose, onNowPlaying, controls }) {
  const { db, api } = useDb(), d = useDesign(), web = useRef(null);
  const items = db.settings.music ?? DEFAULT_MUSIC;
  const [index, setIndex] = useState(0), [link, setLink] = useState(''), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [error, setError] = useState('');
  const latest = useRef({ items, index }); latest.current = { items, index };
  const send = (command) => web.current?.injectJavaScript(`window.cmd(${JSON.stringify(command)});true;`);
  const start = (i) => { const item = latest.current.items[i]; if (!item) return; setIndex(i); setError(''); send({ type: 'load', videoId: item.videoId, listId: item.listId }); };
  const step = (delta) => { const n = latest.current.items.length; if (n) start((latest.current.index + delta + n) % n); };
  const onMessage = (e) => {
    const m = JSON.parse(e.nativeEvent.data);
    if (m.type === 'ready') setReady(true);
    if (m.type === 'state') {
      setPlaying(m.state === 1);
      const { items: list, index: i } = latest.current;
      onNowPlaying?.(m.state === 1 ? (m.title || list[i]?.title || 'YouTube') : null);
      if (m.state === 1 && m.title && list[i] && !list[i].title && !list[i].listId) api.updateSettings({ music: list.map((x, k) => (k === i ? { ...x, title: m.title } : x)) });
      if (m.state === 0 && list.length > 1) step(1);
    }
    if (m.type === 'error') { setError(BLOCKED[m.code] || '재생할 수 없는 영상입니다.'); if (latest.current.items.length > 1) setTimeout(() => step(1), 2500); }
  };
  const add = () => {
    const parsed = parseYouTube(link);
    if (!parsed) { setError('YouTube 영상이나 재생목록 링크를 붙여 넣어 주세요.'); return; }
    const next = [...items, { id: Date.now().toString(36), ...parsed, title: parsed.listId && !parsed.videoId ? '재생목록' : '' }];
    api.updateSettings({ music: next }); setLink(''); setError('');
    if (ready && !playing) setTimeout(() => start(next.length - 1), 0);
  };
  const label = (item) => item.title || (item.listId ? '재생목록' : 'YouTube 영상');
  if (controls) controls.current = { pause: () => send({ type: 'pause' }) };
  return <View pointerEvents={visible ? 'auto' : 'none'} style={{ position: 'absolute', left: 12, right: 12, bottom: visible ? 18 : -2000, zIndex: 70 }}>
    <Surface native contentStyle={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: d.text, fontSize: 17, fontWeight: '700' }}>음악</Text><Pressable accessibilityLabel="음악 닫기" hitSlop={12} onPress={onClose}><Text style={{ fontSize: 20, color: d.muted }}>×</Text></Pressable></View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput accessibilityLabel="YouTube 링크" value={link} onChangeText={setLink} onSubmitEditing={add} placeholder="YouTube 링크 붙여넣기" placeholderTextColor={d.muted} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: d.input, color: d.text }} />
        <Button title="추가" primary onPress={add} />
      </View>
      <View style={{ aspectRatio: 16 / 9, minHeight: 180, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
        <WebView ref={web} source={{ html: PLAYER_HTML, baseUrl: 'https://checker.app' }} onMessage={onMessage} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled originWhitelist={['*']} style={{ backgroundColor: '#000' }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <Pressable accessibilityLabel="이전 곡" disabled={!ready || !items.length} onPress={() => step(-1)}><Text style={{ fontSize: 24, color: d.text }}>‹</Text></Pressable>
        <Pressable accessibilityLabel={playing ? '일시정지' : '음악 재생'} disabled={!ready || !items.length} onPress={() => (playing ? send({ type: 'pause' }) : start(index))} style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: d.input }}><Text style={{ fontSize: 16, color: d.accent }}>{playing ? 'Ⅱ' : '▶'}</Text></Pressable>
        <Pressable accessibilityLabel="다음 곡" disabled={!ready || !items.length} onPress={() => step(1)}><Text style={{ fontSize: 24, color: d.text }}>›</Text></Pressable>
      </View>
      {items.map((item, i) => <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 10, backgroundColor: i === index ? d.input : 'transparent' }}>
        <Pressable style={{ flex: 1, padding: 9 }} onPress={() => start(i)}><Text numberOfLines={1} style={{ color: i === index ? d.accent : d.text, fontSize: 13, fontWeight: i === index ? '700' : '400' }}>{label(item)}</Text></Pressable>
        <Pressable accessibilityLabel={label(item) + ' 삭제'} hitSlop={8} style={{ padding: 9 }} onPress={() => api.updateSettings({ music: items.filter((_, k) => k !== i) })}><Text style={{ color: d.muted }}>×</Text></Pressable>
      </View>)}
      {!!error && <Text accessibilityRole="alert" style={{ color: '#cc4057' }}>{error}</Text>}
    </Surface>
  </View>;
}
