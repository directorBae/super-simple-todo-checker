import React from 'react';
import Teams from './Teams.jsx';
import Buckets from './Buckets.jsx';

// The room to the left of the main screen: teams on the left half, buckets on the right half.
export default function Manage({ db, onClose }) {
  return <div className="manage-window">
    <header className="clock-window-head manage-head"><span>팀 · 버킷</span><button aria-label="팀 · 버킷 닫기" title="Ctrl + → 또는 Esc" onClick={onClose}>×</button></header>
    <div className="manage-cols">
      <section className="manage-col" aria-label="팀"><h2>팀</h2><p className="desc">함께하는 팀별로 일을 모아 보세요.</p><Teams db={db} /></section>
      <section className="manage-col" aria-label="버킷"><h2>버킷</h2><Buckets db={db} /></section>
    </div>
  </div>;
}
