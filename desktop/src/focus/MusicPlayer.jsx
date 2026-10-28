import React, { useEffect, useRef, useState } from 'react';
import { entryFromLink, cleanList, localList, addEntry, removeEntry, moveEntry, setTitle, queueOf, nextIndex, rowLabel } from './playlist.mjs';

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
const DRAG_TYPE = 'application/x-checker-music';

// The player, one play button, the volume, "음악 링크 넣기" and the person's playlist (one per person, saved to the account;
// settings.music when signed out). It plays down the list and wraps to the top, always; a YouTube playlist row plays its
// whole list first. An empty list plays the built-in picks.
// onNowPlaying({ title, playing }) tells the bar what is on, playing or paused, so a closed window never plays unseen
// and a paused track can be resumed from the bar; controls lets the bar pause and play.
export default function MusicPlayer({ db, open, onNowPlaying, controls }) {
  const host = useRef(null), player = useRef(null);
  const [list, setList] = useState([]), [playingId, setPlayingId] = useState(null), [drag, setDrag] = useState(null);
  const [link, setLink] = useState(''), [adding, setAdding] = useState(false), [playing, setPlaying] = useState(false);
  const [error, setError] = useState(''), [ready, setReady] = useState(false), [volume, setVolume] = useState(60);
  // mode: 'account' once the account answered, 'local' when signed out / no server. pending: an edit not yet saved.
  const sync = useRef({ mode: null, timer: null, seq: 0, pending: false, localWrites: 0, flush: null });
  const queue = queueOf(list), state = useRef({});
  state.current = { list, queue, playingId, last: state.current.last ?? 0, settings: db?.settings || {} };

  // ---- the list: kept in the account (debounced) or in settings.music ----
  const commit = (next) => {
    state.current.list = next; state.current.queue = queueOf(next); setList(next);
    const s = sync.current;
    if (s.mode === 'account') {
      s.pending = true; clearTimeout(s.timer);
      const seq = ++s.seq;
      s.flush = () => { s.flush = null; window.api.tools('savePlaylist', { list: next }).then((r) => { if (!r?.ok) setError(r?.error || '재생목록을 저장하지 못했어요.'); }, () => setError('재생목록을 저장하지 못했어요.')).finally(() => { if (seq === s.seq) s.pending = false; }); };
      s.timer = setTimeout(() => s.flush?.(), 500);
    } else { s.localWrites++; Promise.resolve(window.api.updateSettings({ music: next })).finally(() => { s.localWrites--; }); }
  };
  const load = async () => {
    const s = sync.current;
    if (s.pending) return;
    const r = await Promise.resolve(window.api.tools?.('playlist')).catch(() => null);
    if (s.pending) return;
    const settings = state.current.settings, local = localList(settings.music);
    if (!r?.ok) { s.mode = 'local'; setList(local); return; }
    s.mode = 'account';
    let next = cleanList(r.playlist);
    // First time on this device: its own links start the account list (once).
    if (local.length && !settings.musicSeeded) {
      window.api.updateSettings({ musicSeeded: true });
      if (!next.length) { commit(local); return; }
    }
    setList(next);
  };
  useEffect(() => { if (open || !sync.current.mode) load(); }, [open, db?.auth?.email]);
  // Signed out: another window may change settings.music.
  useEffect(() => { const s = sync.current; if (s.mode === 'local' && !s.localWrites) setList(localList(db?.settings.music)); }, [db?.settings.music]);
  useEffect(() => () => { clearTimeout(sync.current.timer); sync.current.flush?.(); }, []);

  // ---- playback ----
  const play = (item, i) => {
    if (!item || !player.current) return;
    state.current.last = i; state.current.playingId = item.id; setPlayingId(item.id); setError('');
    if (item.listId) player.current.loadPlaylist({ list: item.listId, listType: 'playlist', index: 0 });
    else player.current.loadVideoById(item.videoId);
  };
  const start = (i) => play(state.current.queue[i], i);
  const step = () => { const { queue: q, playingId: id, last } = state.current, i = nextIndex(q, id, last); if (i >= 0) start(i); };
  const current = () => state.current.queue.find((x) => x.id === state.current.playingId);
  // Inside a YouTube playlist row: true while more of its videos are still to come.
  const midList = (p) => { const all = p.getPlaylist?.() || [], at = p.getPlaylistIndex?.() ?? -1; return !!current()?.listId && all.length > 0 && at >= 0 && at < all.length - 1; };
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
            if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) onNowPlaying?.({ title: e.target.getVideoData?.().title || current()?.title || 'YouTube', playing: e.data === YT.PlayerState.PLAYING });
            if (e.data === YT.PlayerState.PLAYING) {
              // Remember the real title the first time a row plays (when oEmbed couldn't tell).
              const title = e.target.getVideoData?.().title, item = state.current.list.find((x) => x.id === state.current.playingId);
              if (title && item && !item.title && !item.listId) commit(setTitle(state.current.list, item.id, title));
            }
            // Always plays on: the rest of a YouTube playlist, then the next row, wrapping to the top.
            if (e.data === YT.PlayerState.ENDED) {
              if (midList(e.target)) setTimeout(() => { if (player.current?.getPlayerState?.() === YT.PlayerState.ENDED) player.current.nextVideo(); }, 1500);
              else step();
            }
          },
          onError: (e) => {
            setError(BLOCKED[e.data] || '재생할 수 없는 영상입니다.');
            if (midList(e.target)) setTimeout(() => player.current?.nextVideo?.(), 2500);
            else if (state.current.queue.length > 1) setTimeout(step, 2500);
          },
        },
      });
    }).catch((e) => setError(e.message));
    return () => { alive = false; player.current?.destroy?.(); player.current = null; };
  }, []);
  useEffect(() => { player.current?.setVolume?.(volume); }, [volume]);
  if (controls) controls.current = { pause: () => player.current?.pauseVideo?.(), play: () => player.current?.playVideo?.() };

  // ---- editing ----
  const add = (e) => {
    e.preventDefault();
    const entry = entryFromLink(link);
    if (!entry) { setError('YouTube 영상이나 재생목록 링크를 붙여 넣어 주세요.'); return; }
    const { list: next, index } = addEntry(state.current.list, entry);
    if (index < 0) { setError('재생목록이 가득 찼어요.'); return; }
    setLink(''); setError(''); setAdding(false);
    if (next !== state.current.list) {
      commit(next);
      Promise.resolve(window.api.tools?.('musicTitle', { url: entry.url })).then((r) => { if (r?.ok && r.title) commit(setTitle(state.current.list, entry.id, r.title)); }, () => {});
    }
    // Added to the list; it plays now only if nothing else is playing.
    if (ready && !playing) play(next[index], index);
  };
  const remove = (id) => commit(removeEntry(state.current.list, id));
  const move = (from, to) => { const next = moveEntry(state.current.list, from, to); if (next !== state.current.list) commit(next); };
  const toggle = () => {
    if (playing) player.current.pauseVideo();
    else if (player.current.getPlayerState?.() === window.YT?.PlayerState.PAUSED) player.current.playVideo();
    else { const i = queue.findIndex((x) => x.id === playingId); start(i >= 0 ? i : 0); }
  };
  return <section className="focus-card music-card" aria-label="음악">
    <div className="youtube-frame"><div ref={host} /></div>
    <div className="music-simple">
      <button className="play-button" aria-label={playing ? '일시정지' : '음악 재생'} disabled={!ready} onClick={toggle}>{playing ? 'Ⅱ' : '▶'}</button>
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
    {list.length > 0 && <ol className="music-list" aria-label="재생목록" onDragOver={(e) => { if (drag) e.preventDefault(); }}>
      {list.map((x, i) => <li key={x.id} draggable className={[x.id === playingId && 'is-playing', drag?.from === i && 'is-dragging', drag?.over === i && drag.from !== i && (drag.from < i ? 'is-drop-after' : 'is-drop')].filter(Boolean).join(' ')} aria-current={x.id === playingId || undefined}
        onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, x.id); e.dataTransfer.effectAllowed = 'move'; setDrag({ from: i, over: i }); }}
        onDragEnter={() => drag && setDrag({ ...drag, over: i })}
        onDragOver={(e) => { if (drag) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; } }}
        onDrop={(e) => { e.preventDefault(); if (drag) move(drag.from, i); setDrag(null); }}
        onDragEnd={() => setDrag(null)}>
        <button className="music-row" title={x.url} onClick={() => start(i)}
          onKeyDown={(e) => { if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); move(i, i + (e.key === 'ArrowUp' ? -1 : 1)); } }}>{rowLabel(x)}</button>
        <button className="music-remove" aria-label="재생목록에서 빼기" onClick={() => remove(x.id)}>✕</button>
      </li>)}
    </ol>}
  </section>;
}
