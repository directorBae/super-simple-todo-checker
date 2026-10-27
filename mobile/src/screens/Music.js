import React, { useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Text, TextInput } from '../text.js';
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

// Just the player, one play button and "음악 링크 넣기"; the queue behind it (the person's links, then the built-in
// picks) always plays on by itself. Stays mounted once opened so the music keeps playing while the panel is closed.
// onNowPlaying lets the header show what is playing while the panel is closed; controls lets it pause.
export default function MusicPanel({ visible, onClose, onNowPlaying, controls }) {
  const { db, api } = useDb(), d = useDesign(), web = useRef(null);
  const items = db.settings.music ?? DEFAULT_MUSIC;
  const [index, setIndex] = useState(0), [link, setLink] = useState(''), [adding, setAdding] = useState(false), [volume, setVolume] = useState(60), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [error, setError] = useState('');
  const latest = useRef({ items, index, volume }); latest.current = { items, index, volume };
  const send = (command) => web.current?.injectJavaScript(`window.cmd(${JSON.stringify(command)});true;`);
  const start = (i) => { const item = latest.current.items[i]; if (!item) return; setIndex(i); setError(''); send({ type: 'load', videoId: item.videoId, listId: item.listId }); };
  const step = (delta) => { const n = latest.current.items.length; if (n) start((latest.current.index + delta + n) % n); };
  const onMessage = (e) => {
    const m = JSON.parse(e.nativeEvent.data);
    if (m.type === 'ready') { setReady(true); send({ type: 'volume', value: latest.current.volume }); }
    if (m.type === 'state') {
      setPlaying(m.state === 1);
      const { items: list, index: i } = latest.current;
      if (m.state === 1 || m.state === 2) onNowPlaying?.({ title: m.title || list[i]?.title || 'YouTube', playing: m.state === 1 }); // playing or paused
      if (m.state === 1 && m.title && list[i] && !list[i].title && !list[i].listId) api.updateSettings({ music: list.map((x, k) => (k === i ? { ...x, title: m.title } : x)) });
      if (m.state === 0) { if (list.length > 1) step(1); else send({ type: 'play' }); } // always plays on
    }
    if (m.type === 'error') { setError(BLOCKED[m.code] || '재생할 수 없는 영상입니다.'); if (latest.current.items.length > 1) setTimeout(() => step(1), 2500); }
  };
  // Volume in steps of 10 (no slider widget needed). iPhones may keep using the side buttons for loudness.
  const louder = (delta) => { const v = Math.max(0, Math.min(100, volume + delta)); setVolume(v); send({ type: 'volume', value: v }); };
  const add = () => {
    const parsed = parseYouTube(link);
    if (!parsed) { setError('YouTube 영상이나 재생목록 링크를 붙여 넣어 주세요.'); return; }
    const next = [...items, { id: Date.now().toString(36), ...parsed, title: parsed.listId && !parsed.videoId ? '재생목록' : '' }];
    api.updateSettings({ music: next }); setLink(''); setError(''); setAdding(false);
    if (ready) setTimeout(() => start(next.length - 1), 0);
  };
  if (controls) controls.current = { pause: () => send({ type: 'pause' }), play: () => send({ type: 'play' }) };
  return <View pointerEvents={visible ? 'auto' : 'none'} style={{ position: 'absolute', left: 12, right: 12, bottom: visible ? 18 : -2000, zIndex: 70 }}>
    <Surface native contentStyle={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: d.text, fontSize: 17, fontWeight: '700' }}>음악</Text><Pressable accessibilityLabel="음악 닫기" hitSlop={12} onPress={onClose}><Text style={{ fontSize: 20, color: d.muted }}>×</Text></Pressable></View>
      <View style={{ aspectRatio: 16 / 9, minHeight: 180, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
        <WebView ref={web} source={{ html: PLAYER_HTML, baseUrl: 'https://checker.app' }} onMessage={onMessage} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled originWhitelist={['*']} style={{ backgroundColor: '#000' }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityLabel={playing ? '일시정지' : '음악 재생'} disabled={!ready || !items.length} onPress={() => (playing ? send({ type: 'pause' }) : start(index))} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: d.accent, opacity: ready ? 1 : 0.5 }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{playing ? 'Ⅱ' : '▶'}</Text></Pressable>
        {!adding && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable accessibilityLabel="소리 줄이기" hitSlop={6} onPress={() => louder(-10)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: d.input }}><Text style={{ fontSize: 18, color: d.text }}>－</Text></Pressable>
          <Text accessibilityLabel={`소리 ${volume}`} style={{ minWidth: 30, textAlign: 'center', fontSize: 12, color: d.muted, fontVariant: ['tabular-nums'] }}>{volume}</Text>
          <Pressable accessibilityLabel="소리 키우기" hitSlop={6} onPress={() => louder(10)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: d.input }}><Text style={{ fontSize: 18, color: d.text }}>＋</Text></Pressable>
        </View>}
        {adding
          ? <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
              <TextInput autoFocus accessibilityLabel="YouTube 링크" value={link} onChangeText={setLink} onSubmitEditing={add} placeholder="YouTube 링크 붙여넣기" placeholderTextColor={d.muted} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: d.input, color: d.text }} />
              <Button title="넣기" primary onPress={add} />
            </View>
          : <Button title="음악 링크 넣기" onPress={() => { setAdding(true); setError(''); }} />}
      </View>
      {!!error && <Text accessibilityRole="alert" style={{ color: '#cc4057' }}>{error}</Text>}
    </Surface>
  </View>;
}
