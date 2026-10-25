import React, { useEffect, useRef, useState } from 'react';
import MemoBoard from './views/Todos.jsx';
import Settings from './views/Settings.jsx';
import Integrations from './views/Integrations.jsx';
import Bell from './views/Bell.jsx';
import ClockWindow from './focus/ClockWindow.jsx';
import RoomDock from './focus/RoomDock.jsx';
import RoamingPet from './focus/RoamingPet.jsx';
import OfflineEgg from './focus/OfflineEgg.jsx';
import MusicPlayer from './focus/MusicPlayer.jsx';
import { wallpaperSrc } from './wallpapers.js';
import './focus/focus.css';
export default function App() {
 const [db,setDb] = useState(null), [popup,setPopup] = useState(null), [menu,setMenu] = useState(false), [bell,setBell] = useState(false), [room,setRoom] = useState(0);
 const [nowPlaying,setNowPlaying] = useState(null), music = useRef(null);
 const open = view => { setMenu(false); setBell(false); if(view === 'missed') setBell(true); else if(view === 'today') { setPopup(null); setRoom(0); } else setPopup(view); };
 useEffect(() => { window.api.getState().then(setDb); window.api.onDbChanged(setDb); window.api.onOpenView(open); }, []);
 useEffect(() => { const key = e => { if(e.key === 'Escape') { setPopup(null); setMenu(false); setBell(false); } }; window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key); }, []);
 const wallpaper = wallpaperSrc(db?.settings.wallpaper);
 useEffect(() => { if(db) document.body.style.setProperty('--wallpaper', `url("${wallpaper}")`); }, [wallpaper, !!db]);
 if(!db) return null;
 const onboarding = !db.settings.onboardingDone;
 const finish = () => { window.api.updateSettings({ onboardingDone:true }).then(setDb); };
 if(new URLSearchParams(window.location.search).get('view') === 'clock') return <ClockWindow db={db} />;
 const close = () => setPopup(null);
 return <div className="app-v">
  <header className="topbar"><button className="logo" onClick={() => setRoom(0)}>✓ 체커</button>
   <div className="top-icons">
    {nowPlaying && popup !== 'music' && <div className="now-playing"><button className="now-playing-title" title="음악 창 열기" onClick={() => open('music')}>♪ {nowPlaying}</button><button className="now-playing-pause" aria-label="음악 일시정지" onClick={() => music.current?.pause()}>Ⅱ</button></div>}
    {!onboarding && <Bell db={db} open={bell} setOpen={v => { setMenu(false); setBell(v); }} />}
    <div className="menu-wrap"><button className="icon-btn" aria-label="메뉴" aria-expanded={menu} onClick={() => { setBell(false); setMenu(!menu); }}>☰</button>{menu && <div className="menu-pop"><button onClick={() => open('music')}>음악</button><button onClick={() => open('settings')}>설정</button><button onClick={() => { setMenu(false); window.dispatchEvent(new Event('checker:open-game')); }}>게임 (테스트)</button></div>}</div>
   </div>
  </header>
  {onboarding ? <main className="onboarding"><div className="welcome-mark">✓</div><p className="eyebrow">WELCOME TO CHECKER</p><h1>흩어진 일들을 한곳으로.</h1><p className="welcome-desc">쓰고 있는 도구를 연결해 시작하세요.<br />이제 할 일만 적으면 됩니다.</p><Integrations db={db} /><div className="welcome-actions"><button className="primary" onClick={finish}>시작하기 →</button><button className="ghost" onClick={finish}>지금은 건너뛰기</button></div></main> :
   <main className="content notebook-content"><MemoBoard db={db} onOpenTeams={() => setRoom(-1)} /></main>}
  <div hidden={popup !== 'music'} className="popup-overlay music-overlay" onMouseDown={e => { if(e.target === e.currentTarget) close(); }}><section className="popup-panel music-panel" role="dialog" aria-modal="true" aria-label="음악"><div className="popup-head"><h2>음악</h2><button className="icon-btn" aria-label="음악 창 닫기" onClick={close}>✕</button></div><div className="popup-body"><MusicPlayer db={db} onNowPlaying={setNowPlaying} controls={music} /></div></section></div>
  {!onboarding && <OfflineEgg db={db} />}
  <RoomDock db={db} blocked={onboarding || !!popup || menu || bell} room={room} setRoom={setRoom} />
  {!onboarding && <RoamingPet db={db} room={room} />}
  {popup === 'settings' && <div className="popup-overlay" onMouseDown={e => { if(e.target === e.currentTarget) close(); }}><section className="popup-panel settings-panel" role="dialog" aria-modal="true" aria-label="설정"><div className="popup-head"><h2>설정</h2><button className="icon-btn" aria-label="닫기" onClick={close}>✕</button></div><div className="popup-body"><Settings db={db} /></div></section></div>}
 </div>;
}
