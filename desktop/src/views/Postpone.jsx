import React, { useState } from 'react';
import { postponePatches } from '../../../shared/reminders.js';
import { todayStr } from '../util.js';

// "오늘 할 일을 내일로 미룰까요?" — what the evening wrap-up reminder opens (system notification in the app, browser
// notification on the web). Every open to-do of that day moves one day on (shared/reminders.js).
export default function Postpone({ db, date, onClose }) {
  const [busy, setBusy] = useState(false);
  const left = db.todos.filter((t) => t.status === 'todo' && t.date === date);
  const moves = postponePatches(db.todos, date);
  const [, m, d] = date.split('-').map(Number);
  const day = date === todayStr() ? '오늘' : `${m}월 ${d}일`;
  const go = async () => {
    setBusy(true);
    for (const { id, patch } of moves) await window.api.updateTodo(id, patch);
    onClose();
  };
  return <div className="popup-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <section className="popup-panel postpone-panel" role="dialog" aria-modal="true" aria-label="내일로 미루기">
      <h2>{day} 할 일을 {day === '오늘' ? '내일' : '다음 날'}로 미룰까요?</h2>
      {left.length ? <>
        <p className="postpone-desc">남은 할 일 {left.length}건{moves.length < left.length ? ` 중 ${moves.length}건` : ''}을 옮겨요.{moves.length < left.length && ' (다음 날에 이미 있는 반복 할 일은 그대로 둬요.)'}</p>
        <ul className="postpone-list">
          {left.slice(0, 5).map((t) => <li key={t.id}>{t.title}</li>)}
          {left.length > 5 && <li className="more">외 {left.length - 5}건</li>}
        </ul>
      </> : <p className="postpone-desc">남은 할 일이 없어요.</p>}
      <div className="postpone-actions">
        <button type="button" className="ghost" onClick={onClose}>{moves.length ? '그대로 두기' : '닫기'}</button>
        {moves.length > 0 && <button type="button" className="primary" disabled={busy} onClick={go}>내일로 미루기</button>}
      </div>
    </section>
  </div>;
}
