import React from 'react';
import Missed from './Missed.jsx';

// Notifications live behind a chime next to the menu; the badge counts alerts not yet seen.
export default function Bell({ db, open, setOpen }) {
  const count = db.notifLog.filter((n) => n.missed && !n.ackAt).length;
  return <div className="menu-wrap">
    <button className="icon-btn bell-btn" aria-label={count ? `알림 ${count}건` : '알림'} aria-expanded={open} onClick={() => setOpen(!open)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.6 1.8H4.4zM9.8 20.2a2.4 2.4 0 0 0 4.4 0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {count > 0 && <span className="bell-badge">{count > 99 ? '99+' : count}</span>}
    </button>
    {open && <div className="menu-pop bell-pop" role="dialog" aria-label="알림"><h3>알림</h3><Missed db={db} /></div>}
  </div>;
}
