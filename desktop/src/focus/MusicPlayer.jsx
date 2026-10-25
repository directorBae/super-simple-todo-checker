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

// onNowPlaying tells the app what is playing so a closed music window never plays unseen; controls lets it pause.
export default function MusicPlayer({ db, onNowPlaying, controls }) {
  const items = db?.settings.music ?? DEFAULT_MUSIC;
  const host = useRef(null), player = useRef(null), state = useRef({ items, index: 0 });
  const [index, setIndex] = useState(0), [link, setLink] = useState(''), [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(60), [error, setError] = useState(''), [ready, setReady] = useState(false);
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
            onNowPlaying?.(e.data === YT.PlayerState.PLAYING ? (e.target.getVideoData?.().title || state.current.items[state.current.index]?.title || 'YouTube') : null);
            if (e.data === YT.PlayerState.PLAYING) {
              // Remember the real title the first time an item plays.
              const title = e.target.getVideoData?.().title, { items: list, index: i } = state.current;
              if (title && list[i] && !list[i].title && !list[i].listId) save(list.map((x, k) => k === i ? { ...x, title } : x));
            }
            if (e.data === YT.PlayerState.ENDED && state.current.items.length > 1) step(1);
          },
          onError: (e) => { setError(BLOCKED[e.data] || '재생할 수 없는 영상입니다.'); if (state.current.items.length > 1) setTimeout(() => step(1), 2500); },
        },
      });
    }).catch((e) => setError(e.message));
    return () => { alive = false; player.current?.destroy?.(); player.current = null; };
  }, []);
  useEffect(() => { player.current?.setVolume?.(volume); }, [volume]);
  if (controls) controls.current = { pause: () => player.current?.pauseVideo?.() };
  const add = (e) => {
    e.preventDefault();
    const parsed = parseYouTube(link);
    if (!parsed) { setError('YouTube 영상이나 재생목록 링크를 붙여 넣어 주세요.'); return; }
    const next = [...items, { id: Date.now().toString(36), ...parsed, title: parsed.listId && !parsed.videoId ? '재생목록' : '' }];
    save(next); setLink(''); setError('');
    if (ready && !playing) setTimeout(() => start(next.length - 1), 0);
  };
  const remove = (i) => { save(items.filter((_, k) => k !== i)); if (i < index) setIndex(index - 1); };
  const label = (item) => item.title || (item.listId ? '재생목록' : 'YouTube 영상');
  return <section className="focus-card music-card" aria-label="음악 플레이어">
    <div className="focus-card-head"><div><span className="focus-eyebrow">YOUTUBE</span><h3>집중의 리듬</h3></div></div>
    <form className="music-add" onSubmit={add}>
      <input aria-label="YouTube 링크" placeholder="YouTube 영상·재생목록 링크 붙여넣기" value={link} onChange={(e) => setLink(e.target.value)} />
      <button type="submit" className="primary">추가</button>
    </form>
    <div className="youtube-frame"><div ref={host} /></div>
    <div className="player-controls">
      <small>{items.length ? `${index + 1} / ${items.length}` : '목록이 비어 있어요'}</small>
      <div>
        <button aria-label="이전 곡" disabled={!ready || !items.length} onClick={() => step(-1)}>‹</button>
        <button className="play-button" aria-label={playing ? '일시정지' : '음악 재생'} disabled={!ready || !items.length} onClick={() => { if (playing) player.current.pauseVideo(); else if (player.current.getPlayerState?.() === window.YT?.PlayerState.PAUSED) player.current.playVideo(); else start(index); }}>{playing ? 'Ⅱ' : '▶'}</button>
        <button aria-label="다음 곡" disabled={!ready || !items.length} onClick={() => step(1)}>›</button>
      </div>
      <label className="volume-control">♪<input aria-label="음량" type="range" min="0" max="100" value={volume} onChange={(e) => setVolume(Number(e.target.value))} /></label>
    </div>
    {items.length > 0 && <ol className="music-list">{items.map((item, i) => <li key={item.id} className={i === index ? 'active' : ''}>
      <button className="music-item" onClick={() => start(i)} disabled={!ready}>{label(item)}</button>
      <button className="music-remove" aria-label={label(item) + ' 삭제'} onClick={() => remove(i)}>×</button>
    </li>)}</ol>}
    {error && <p className="focus-error" role="alert">{error}</p>}
  </section>;
}
