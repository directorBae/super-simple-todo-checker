import React, { useEffect, useState } from 'react';
import MemoBoard from './views/Todos.jsx';
import Teams from './views/Teams.jsx';
import Buckets from './views/Buckets.jsx';
import Missed from './views/Missed.jsx';
import Settings from './views/Settings.jsx';
import Integrations from './views/Integrations.jsx';
import { THEMES } from './themes.js';
export default function App() {
 const [db,setDb] = useState(null), [tab,setTab] = useState('todos'), [popup,setPopup] = useState(null), [menu,setMenu] = useState(false), [pair,setPair] = useState(null);
 useEffect(() => { window.api.getState().then(setDb); window.api.onDbChanged(setDb); window.api.onOpenView(view => setPopup(view)); }, []);
 useEffect(() => { document.documentElement.dataset.theme = db?.settings.theme || 'light'; }, [db?.settings.theme]);
 useEffect(() => { const key = e => { if(e.key === 'Escape') { setPopup(null); setMenu(false); } }; window.addEventListener('keydown',key); return () => window.removeEventListener('keydown',key); }, []);
 if(!db) return null;
 const onboarding = !db.settings.onboardingDone;
 const finish = () => { window.api.updateSettings({ onboardingDone:true }).then(setDb); setTab('todos'); };
 const tabs = [['teams','팀'],['buckets','버킷']];
 const pairing = async () => { setMenu(false); setPopup('pair'); setPair(await window.api.pairDevice()); };
 const sync = db.settings.sync || {};
 return <div className="app-v">
  <header className="topbar"><button className="logo" onClick={() => setTab('todos')}>✓ 체커</button>
   {!onboarding && <nav className="main-tabs">{tabs.map(([key,label]) => <button key={key} className={'main-tab' + (tab === key ? ' active' : '')} onClick={() => setTab(key)}>{label}</button>)}</nav>}
   <div className="top-icons">{!onboarding && <><button className={'sync-indicator' + (sync.error ? ' offline' : '')} onClick={pairing} title={sync.error || '휴대폰 연결'}>{sync.error ? '연결 확인' : sync.lastSync ? '동기화됨' : 'PC 연결'}</button><button className={'connect-nav' + (tab === 'integrations' ? ' active' : '')} onClick={() => setTab('integrations')}>도구 연결 <span>↗</span></button></>}
    <div className="menu-wrap"><button className="icon-btn" aria-label="메뉴" onClick={() => setMenu(!menu)}>☰</button>{menu && <div className="menu-pop"><span className="menu-label">테마</span><div className="menu-themes">{THEMES.map(t => <button key={t.id} title={t.name} aria-label={t.name + ' 테마'} className={db.settings.theme === t.id ? 'selected' : ''} style={{ background:t.swatch }} onClick={() => window.api.updateSettings({ theme:t.id })} />)}</div><button onClick={pairing}>휴대폰 연결</button><button onClick={() => { setMenu(false); setPopup('settings'); }}>설정 · 알림</button><button onClick={() => { setMenu(false); setPopup('missed'); }}>지난 알림</button></div>}</div>
   </div>
  </header>
  {onboarding ? <main className="onboarding"><div className="welcome-mark">✓</div><p className="eyebrow">WELCOME TO CHECKER</p><h1>흩어진 일들을 한곳으로.</h1><p className="welcome-desc">쓰고 있는 도구를 연결해 시작하세요.<br />이제 할 일만 적으면 됩니다.</p><Integrations db={db} /><div className="welcome-actions"><button className="primary" onClick={finish}>시작하기 →</button><button className="ghost" onClick={finish}>지금은 건너뛰기</button></div></main> :
   <main className={'content' + (tab !== 'todos' ? ' padded-content' : '')}>
    {tab === 'todos' ? <MemoBoard db={db} /> : tab === 'teams' ? <><div className="page-heading"><h1>팀</h1><p>함께하는 팀별로 일과 도구를 모아 보세요.</p></div><Teams db={db} /></> : tab === 'buckets' ? <><div className="page-heading"><h1>버킷</h1><p>준비되면 다시 꺼내 볼 일들.</p></div><Buckets db={db} /></> : <><div className="page-heading"><h1>도구 연결</h1><p>쓰고 있는 도구를 선택하세요.</p></div><Integrations db={db} /></>}
   </main>}
  {popup && <div className="popup-overlay" onMouseDown={e => { if(e.target === e.currentTarget) setPopup(null); }}><section className="popup-panel" role="dialog" aria-modal="true"><div className="popup-head"><h2>{popup === 'pair' ? '휴대폰 연결' : popup === 'settings' ? '설정' : '지난 알림'}</h2><button className="icon-btn" aria-label="닫기" onClick={() => setPopup(null)}>✕</button></div><div className="popup-body">
   {popup === 'pair' ? <div className="pair-panel">{!pair ? <p>연결 코드 준비 중…</p> : pair.ok ? <><p>휴대폰 메뉴 → <strong>PC 연결</strong>에서 아래 주소와 코드를 입력하세요.</p><p className="desc">두 기기를 같은 Wi-Fi에 연결해 주세요. 코드는 10분 동안 한 번 사용할 수 있습니다.</p>{pair.urls.map(url => <div key={url} className="pair-address">{url}</div>)}<div className="pair-code">{pair.code}</div><button onClick={pairing}>새 코드 만들기</button></> : <><p role="alert">{pair.error}</p><button onClick={pairing}>다시 시도</button></>}</div> : popup === 'settings' ? <Settings db={db} /> : <Missed db={db} />}
  </div></section></div>}
 </div>;
}
