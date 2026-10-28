import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { Gesture, GestureDetector, ScrollView } from 'react-native-gesture-handler';
import * as Haptics from 'expo-haptics';
import { Text, TextInput } from '../text.js';
import { WebView } from 'react-native-webview';
import { useDesign, Surface, Button } from '../design.js';
import { entryOf, fetchTitle, queueOf, nextIndex, moveItem, dropIndex, MAX_ENTRIES } from '../playlist.js';

// The official YouTube IFrame player inside a WebView. The https base URL gives YouTube the referrer it requires.
// Inside a YouTube playlist, the end of a video that is not the last is reported as `mid` (the player goes on by itself).
const PLAYER_HTML = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}#p{width:100%;height:100%}</style><div id="p"></div>
<script src="https://www.youtube.com/iframe_api"></script><script>
var player,isList=false;function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m));}
function mid(){try{var pl=isList&&player.getPlaylist();return !!(pl&&pl.length&&player.getPlaylistIndex()<pl.length-1);}catch(e){return false;}}
function onYouTubeIframeAPIReady(){player=new YT.Player('p',{width:'100%',height:'100%',playerVars:{playsinline:1,rel:0},events:{onReady:function(){post({type:'ready'});},onStateChange:function(e){var m=e.data===0&&mid();post({type:'state',state:e.data,mid:m,title:player.getVideoData?player.getVideoData().title:''});if(m)setTimeout(function(){if(player.getPlayerState()===0)player.nextVideo();},1500);},onError:function(e){post({type:'error',code:e.data,mid:mid()});}}});}
window.cmd=function(c){if(!player)return;if(c.type==='load'){isList=!!c.listId;if(c.listId)player.loadPlaylist({list:c.listId,listType:'playlist'});else player.loadVideoById(c.videoId);}else if(c.type==='play')player.playVideo();else if(c.type==='pause')player.pauseVideo();else if(c.type==='next'){var s=player.getPlayerState();if(s!==1&&s!==3)player.nextVideo();}else if(c.type==='volume')player.setVolume(c.value);};
</script>`;
const BLOCKED = { 2: '링크가 올바르지 않습니다.', 5: '이 영상은 재생할 수 없습니다.', 100: '영상이 삭제되었거나 비공개입니다.', 101: '이 영상은 다른 앱에서 재생하지 못하게 설정되어 있어요.', 150: '이 영상은 다른 앱에서 재생하지 못하게 설정되어 있어요.', 153: 'YouTube 플레이어 설정 오류입니다.' };
const ROW = 40, HOLD_MS = 350;

// One line of the playlist: tap plays it, hold and move reorders, ✕ removes.
function Row({ item, index, playing, offset, lifted, dragY, onPlay, onLift, onMove, onDrop, onSettle, onRemove, d }) {
  const latest = useRef(null);
  latest.current = { index, onPlay, onLift, onMove, onDrop, onSettle };
  const move = Gesture.Pan().activateAfterLongPress(HOLD_MS).runOnJS(true)
    .onStart(() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); latest.current.onLift(latest.current.index); })
    .onUpdate((e) => latest.current.onMove(latest.current.index, e.translationY))
    .onEnd((e) => latest.current.onDrop(latest.current.index, e.translationY))
    .onFinalize(() => latest.current.onSettle());
  const tap = Gesture.Tap().maxDuration(HOLD_MS).maxDistance(10).runOnJS(true).onEnd((_, ok) => { if (ok) latest.current.onPlay(latest.current.index); });
  return <Animated.View style={{ height: ROW, flexDirection: 'row', alignItems: 'center', borderRadius: 12, zIndex: lifted ? 10 : 1, transform: [{ translateY: lifted ? dragY : offset }], backgroundColor: lifted ? '#ffffffd9' : playing ? '#ffffffa6' : 'transparent', borderWidth: 1, borderColor: lifted || playing ? d.edge : 'transparent', shadowColor: '#1e1b4b', shadowOpacity: lifted ? 0.18 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: lifted ? 6 : 0 }}>
    <GestureDetector gesture={Gesture.Exclusive(move, tap)}>
      <View accessible accessibilityRole="button" accessibilityState={{ selected: playing }} accessibilityLabel={item.title} style={{ flex: 1, alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 10 }}>
        {playing && <Text style={{ fontSize: 12, color: d.accent }}>♪</Text>}
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: playing ? d.accent : d.text, fontWeight: playing ? '700' : '500' }}>{item.title}</Text>
      </View>
    </GestureDetector>
    <Pressable accessibilityLabel={item.title + ' 빼기'} hitSlop={8} onPress={() => onRemove(item.id)} style={{ paddingHorizontal: 12, alignSelf: 'stretch', justifyContent: 'center' }}><Text style={{ fontSize: 13, color: d.muted }}>✕</Text></Pressable>
  </Animated.View>;
}

// The player, play/volume, "링크 추가" and my playlist under it. The queue (my list, or the built-in music while it is
// empty) always plays on by itself, wrapping to the top. Stays mounted once opened so the music keeps playing while the
// panel is closed. onNowPlaying lets the header show what is playing while the panel is closed; controls lets it pause.
export default function MusicPanel({ visible, onClose, onNowPlaying, controls, playlist }) {
  const d = useDesign(), web = useRef(null), { list } = playlist;
  const queue = queueOf(list);
  const [playingId, setPlayingId] = useState(null), [link, setLink] = useState(''), [adding, setAdding] = useState(false), [volume, setVolume] = useState(60), [ready, setReady] = useState(false), [playing, setPlaying] = useState(false), [error, setError] = useState('');
  const lastIndex = useRef(-1), loaded = useRef(false);
  const latest = useRef(null); latest.current = { queue, list, playingId, volume, playlist };
  useEffect(() => { if (visible) playlist.reload(); }, [visible]);
  const send = (command) => web.current?.injectJavaScript(`window.cmd(${JSON.stringify(command)});true;`);
  const start = (i) => { const item = latest.current.queue[i]; if (!item) return; lastIndex.current = i; loaded.current = true; latest.current.playingId = item.id; setPlayingId(item.id); setError(''); send({ type: 'load', videoId: item.videoId, listId: item.listId }); };
  const next = () => { const { queue: q, playingId: id } = latest.current; const i = nextIndex(q, id, lastIndex.current); if (i >= 0) start(i); };
  const onMessage = (e) => {
    const m = JSON.parse(e.nativeEvent.data);
    if (m.type === 'ready') { setReady(true); send({ type: 'volume', value: latest.current.volume }); }
    if (m.type === 'state') {
      setPlaying(m.state === 1);
      const { queue: q, list: mine, playingId: id } = latest.current, item = q.find((x) => x.id === id);
      if (m.state === 1 || m.state === 2) onNowPlaying?.({ title: m.title || item?.title || 'YouTube', playing: m.state === 1 }); // playing or paused
      // A title that is still the link (YouTube didn't answer when it was added): take the player's.
      if (m.state === 1 && m.title && item && !item.listId && item.title === item.url && mine.includes(item)) latest.current.playlist.set((l) => l.map((x) => (x.id === id && x.title === x.url ? { ...x, title: m.title } : x)));
      if (m.state === 0 && !m.mid) next(); // always plays on (a YouTube playlist first plays to its end)
    }
    if (m.type === 'error') {
      setError(BLOCKED[m.code] || '재생할 수 없는 영상입니다.');
      if (m.mid) setTimeout(() => send({ type: 'next' }), 2500);
      else if (latest.current.queue.length > 1) setTimeout(next, 2500);
    }
  };
  // Volume in steps of 10 (no slider widget needed). iPhones may keep using the side buttons for loudness.
  const louder = (delta) => { const v = Math.max(0, Math.min(100, volume + delta)); setVolume(v); send({ type: 'volume', value: v }); };
  // Adds to the end of my list; what is playing goes on.
  const add = () => {
    const entry = entryOf(link);
    if (!entry) { setError('YouTube 영상이나 재생목록 링크를 붙여 넣어 주세요.'); return; }
    setLink(''); setError(''); setAdding(false);
    if (list.some((x) => x.url === entry.url)) return;
    if (list.length >= MAX_ENTRIES) { setError(`${MAX_ENTRIES}개까지 넣을 수 있어요.`); return; }
    playlist.set((l) => [...l, entry]);
    fetchTitle(entry.url).then((title) => { if (title) latest.current.playlist.set((l) => l.map((x) => (x.id === entry.id && x.title === x.url ? { ...x, title } : x))); });
  };
  const remove = (id) => playlist.set((l) => l.filter((x) => x.id !== id));
  // Hold a line and move it: the others make room; letting go puts it there.
  const dragY = useRef(new Animated.Value(0)).current, [drag, setDrag] = useState(null);
  const dragRef = useRef(null); dragRef.current = drag;
  const lift = (i) => { dragY.setValue(0); setDrag({ from: i, to: i }); };
  const moveTo = (i, dy) => { dragY.setValue(dy); const to = dropIndex(i, dy, ROW, latest.current.list.length); if (dragRef.current?.to !== to) { dragRef.current = { from: i, to }; setDrag(dragRef.current); } };
  const drop = (i, dy) => { const to = dropIndex(i, dy, ROW, latest.current.list.length); if (to !== i) playlist.set((l) => moveItem(l, i, to)); };
  const settle = () => { dragY.setValue(0); setDrag(null); };
  const offsetOf = (i) => (!drag || i === drag.from ? 0 : drag.from < drag.to && i > drag.from && i <= drag.to ? -ROW : drag.from > drag.to && i >= drag.to && i < drag.from ? ROW : 0);
  if (controls) controls.current = { pause: () => send({ type: 'pause' }), play: () => (loaded.current ? send({ type: 'play' }) : start(0)) };
  return <View pointerEvents={visible ? 'auto' : 'none'} style={{ position: 'absolute', left: 12, right: 12, bottom: visible ? 18 : -2000, zIndex: 70 }}>
    <Surface native contentStyle={{ padding: 16, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}><Text style={{ flex: 1, color: d.text, fontSize: 17, fontWeight: '700' }}>음악</Text><Pressable accessibilityLabel="음악 닫기" hitSlop={12} onPress={onClose}><Text style={{ fontSize: 20, color: d.muted }}>×</Text></Pressable></View>
      <View style={{ aspectRatio: 16 / 9, minHeight: 180, borderRadius: 14, overflow: 'hidden', backgroundColor: '#000' }}>
        <WebView ref={web} source={{ html: PLAYER_HTML, baseUrl: 'https://checker.app' }} onMessage={onMessage} allowsInlineMediaPlayback mediaPlaybackRequiresUserAction={false} javaScriptEnabled originWhitelist={['*']} style={{ backgroundColor: '#000' }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable accessibilityLabel={playing ? '일시정지' : '음악 재생'} disabled={!ready} onPress={() => (playing ? send({ type: 'pause' }) : loaded.current ? send({ type: 'play' }) : start(0))} style={{ width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: d.accent, opacity: ready ? 1 : 0.5 }}><Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{playing ? 'Ⅱ' : '▶'}</Text></Pressable>
        {!adding && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Pressable accessibilityLabel="소리 줄이기" hitSlop={6} onPress={() => louder(-10)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: d.input }}><Text style={{ fontSize: 18, color: d.text }}>－</Text></Pressable>
          <Text accessibilityLabel={`소리 ${volume}`} style={{ minWidth: 30, textAlign: 'center', fontSize: 12, color: d.muted, fontVariant: ['tabular-nums'] }}>{volume}</Text>
          <Pressable accessibilityLabel="소리 키우기" hitSlop={6} onPress={() => louder(10)} style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: d.input }}><Text style={{ fontSize: 18, color: d.text }}>＋</Text></Pressable>
        </View>}
        {adding
          ? <View style={{ flex: 1, flexDirection: 'row', gap: 8 }}>
              <TextInput autoFocus accessibilityLabel="YouTube 링크" value={link} onChangeText={setLink} onSubmitEditing={add} onBlur={() => { if (!link.trim()) setAdding(false); }} placeholder="YouTube 링크 붙여넣기" placeholderTextColor={d.muted} autoCapitalize="none" autoCorrect={false} style={{ flex: 1, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: d.input, color: d.text }} />
              <Button title="넣기" primary onPress={add} />
            </View>
          : <Button title="링크 추가" style={{ flex: 1 }} onPress={() => { setAdding(true); setError(''); }} />}
      </View>
      {!!error && <Text accessibilityRole="alert" style={{ color: '#cc4057' }}>{error}</Text>}
      {!!list.length && <ScrollView style={{ maxHeight: ROW * 5 + 2, marginHorizontal: -6 }} scrollEnabled={!drag} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {list.map((item, i) => <Row key={item.id} item={item} index={i} playing={loaded.current && item.id === playingId} offset={offsetOf(i)} lifted={drag?.from === i} dragY={dragY} onPlay={start} onLift={lift} onMove={moveTo} onDrop={drop} onSettle={settle} onRemove={remove} d={d} />)}
      </ScrollView>}
    </Surface>
  </View>;
}
