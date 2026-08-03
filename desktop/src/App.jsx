import React, { useEffect, useState } from 'react';
import MemoBoard from './views/Todos.jsx';
import Projects from './views/Projects.jsx';
import Buckets from './views/Buckets.jsx';
import Missed from './views/Missed.jsx';
import Settings from './views/Settings.jsx';

const POPUPS = {
  projects: ['프로젝트', Projects],
  buckets: ['버킷', Buckets],
  missed: ['밀린 알림', Missed],
  settings: ['설정', Settings],
};

export default function App() {
  const [db, setDb] = useState(null);
  const [tab, setTab] = useState('todos');
  const [popup, setPopup] = useState(null);

  useEffect(() => {
    window.api.getState().then(setDb);
    window.api.onDbChanged(setDb);
    window.api.onOpenView((view) => {
      if (view === 'missed') setPopup('missed');
      else setTab('todos');
    });
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setPopup(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // 설정된 배경 테마를 <html data-theme>으로 반영
  useEffect(() => {
    document.documentElement.dataset.theme = (db && db.settings.theme) || 'light';
  }, [db]);

  if (!db) return null;

  const missedCount = db.notifLog.filter((n) => n.missed && !n.ackAt).length;
  const bucketCount =
    db.todos.filter((t) => t.status === 'bucket').length + db.projects.filter((p) => p.status === 'bucket').length;

  const [popupTitle, PopupView] = popup ? POPUPS[popup] : [null, null];

  return (
    <div className="app-v">
      <header className="topbar">
        <div className="logo">✓ 체커</div>
        <button className={'main-tab' + (tab === 'todos' ? ' active' : '')} onClick={() => setTab('todos')}>
          할 일
        </button>
        <button className={'main-tab' + (tab === 'content' ? ' active' : '')} onClick={() => setTab('content')}>
          콘텐츠 캘린더
        </button>
        <div className="top-icons">
          <button className="icon-btn" title="프로젝트" onClick={() => setPopup('projects')}>
            📁
          </button>
          <button className="icon-btn" title="버킷" onClick={() => setPopup('buckets')}>
            🪣
            {bucketCount > 0 && <span className="icon-badge muted">{bucketCount}</span>}
          </button>
          <button className="icon-btn" title="밀린 알림" onClick={() => setPopup('missed')}>
            🔔
            {missedCount > 0 && <span className="icon-badge">{missedCount}</span>}
          </button>
          <button className="icon-btn" title="설정 (팀 관리 포함)" onClick={() => setPopup('settings')}>
            ⚙️
          </button>
        </div>
      </header>
      <main className="content">
        <MemoBoard key={tab} db={db} kind={tab === 'content' ? 'content' : 'todo'} />
      </main>
      {popup && (
        <div
          className="popup-overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPopup(null);
          }}
        >
          <div className="popup-panel">
            <div className="popup-head">
              <h2>{popupTitle}</h2>
              <button className="ghost" onClick={() => setPopup(null)}>
                ✕
              </button>
            </div>
            <div className="popup-body">
              <PopupView db={db} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
