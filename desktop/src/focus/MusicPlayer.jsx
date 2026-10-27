import React, { useEffect, useRef, useState } from 'react';
import { parseYouTube } from '../focus-utils.mjs';
import { DEFAULT_MUSIC } from '../../../shared/youtube.js';

// The YouTube IFrame API is loaded once and shared.
let youtubeApi;
function loadYouTube() {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  youtubeApi ||= new Promise((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { previous?.(); resolve(window.YT); };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => { youtubeApi = null; reject(new Error('YouTube에 연결할 수 없습니다. 인터넷 연결을 확인해 주세요.')); };
    document.head.appendChild(script);
  });
  return youtubeApi;
}
const BLOCKED = { 2: '링크가 올바르지 않습니다.', 5: '이 영상은 재생할 수 없습니다.', 100: '영상이 삭제되었거나 비공개입니다.', 101: '이 영상은 다른 앱에서 재생하지 못하게 설정되어 있어요.', 150: '이 영상은 다른 앱에서 재생하지 못하게 설정되어 있어요.', 153: 'YouTube 플레이어 설정 오류입니다. 앱을 다시 시작해 주세요.' };

// Just the player, one play button, the volume and "음악 링크 넣기". Behind it a queue (the person's links, then the built-in
// picks) plays on by itself — the next track starts when one ends, always; there is no list to manage.
// (YouTube's own "autoplay related videos" isn't available in embedded players, so the queue does that job.)
// onNowPlaying({ title, playing }) tells the bar what is on, playing or paused, so a closed window never plays unseen
// and a paused track can be resumed from the bar; controls lets the bar pause and play.
export default function MusicPlayer({ db, onNowPlaying, controls }) {
  const items = db?.settings.music ?? DEFAULT_MUSIC;
  const host = useRef(null), player = useRef(null), state = useRef({ items, index: 0 });
  const [index, setIndex] = useState(0), [link, setLink] = useState(''), [adding, setAdding] = useState(false), [playing, setPlaying] = useState(false);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [volume, setVolume] = useState(60);
  state.current = { items, index };
  const save = (next) => window.api.updateSettings({ music: next });
  const start = (i) => {
    const item = state.current.items[i]; if (!item || !player.current) return;
    setIndex(i); setError('');
    if (item.listId) player.current.loadPlaylist({ list: item.listId, listType: 'playlist', index: 0 });
    else player.current.loadVideoById(item.videoId);
  };
  const step = (delta) => { const n = state.current.items.length; if (n) start((state.current.index + delta + n) % n); };
  useEffect(() => {
    let alive = true;
    loadYouTube().then((YT) => {
      if (!alive) return;
      player.current = new YT.Player(host.current, {
        width: '100%', height: '100%',
        playerVars: { playsinline: 1, rel: 0, modestbranding: 1, ...(location.protocol.startsWith('http') ? { origin: location.origin } : {}) },
        events: {
          onReady: (e) => { e.target.setVolume(volume); setReady(true); },
          onStateChange: (e) => {
            setPlaying(e.data === YT.PlayerState.PLAYING);
            if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) onNowPlaying?.({ title: e.target.getVideoData?.().title || state.current.items[state.current.index]?.title || 'YouTube', playing: e.data === YT.PlayerState.PLAYING });
            if (e.data === YT.PlayerState.PLAYING) {
              // Remember the real title the first time an item plays.
              const title = e.target.getVideoData?.().title, { items: list, index: i } = state.current;
              if (title && list[i] && !list[i].title && !list[i].listId) save(list.map((x, k) => k === i ? { ...x, title } : x));
            }
            // Always plays on: the next track, or the same one again if it is the only one.
            if (e.data === YT.PlayerState.ENDED) { if (state.current.items.length > 1) step(1); else e.target.playVideo(); }
          },
          onError: (e) => { setError(BLOCKED[e.data] || '재생할 수 없는 영상입니다.'); if (state.current.items.length > 1) setTimeout(() => step(1), 2500); },
        },
      });
    }).catch((e) => setError(e.message));
    return () => { alive = false; player.current?.destroy?.(); player.current = null; };
  }, []);
  useEffect(() => { player.current?.setVolume?.(volume); }, [volume]);
  if (controls) controls.current = { pause: () => player.current?.pauseVideo?.(), play: () => player.current?.playVideo?.() };
  const add = (e) => {
    e.preventDefault();
    const parsed = parseYouTube(link);
    if (!parsed) { setError('YouTube 영상이나 재생목록 링크를 붙여 넣어 주세요.'); return; }
    // The new link plays right away, then the queue carries on after it.
    const next = [...items, { id: Date.now().toString(36), ...parsed, title: parsed.listId && !parsed.videoId ? '재생목록' : '' }];
    save(next); setLink(''); setError(''); setAdding(false);
    if (ready) setTimeout(() => start(next.length - 1), 0);
  };
  const toggle = () => {
    if (playing) player.current.pauseVideo();
    else if (player.current.getPlayerState?.() === window.YT?.PlayerState.PAUSED) player.current.playVideo();
    else start(index);
  };
  return <section className="focus-card music-card" aria-label="음악">
    <div className="youtube-frame"><div ref={host} /></div>
    <div className="music-simple">
      <button className="play-button" aria-label={playing ? '일시정지' : '음악 재생'} disabled={!ready || !items.length} onClick={toggle}>{playing ? 'Ⅱ' : '▶'}</button>
      <label className="music-volume" title={`소리 ${volume}`}>
        <span aria-hidden="true">{volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}</span>
        <input type="range" aria-label="소리 크기" min="0" max="100" step="5" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
      </label>
      {adding
        ? <form className="music-add" onSubmit={add}>
            <input autoFocus aria-label="YouTube 링크" placeholder="YouTube 링크 붙여넣기" value={link} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); setAdding(false); } }} />
            <button type="submit" className="primary">넣기</button>
          </form>
        : <button className="ghost music-link" onClick={() => { setAdding(true); setError(''); }}>음악 링크 넣기</button>}
    </div>
    {error && <p className="focus-error" role="alert">{error}</p>}
  </section>;
}
