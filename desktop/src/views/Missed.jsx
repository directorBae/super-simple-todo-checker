import React from 'react';
import { fmtDateTime } from '../util.js';

// Alerts that went by while the computer was off or the app was closed (shown under the bell).
export default function Missed({ db }) {
  const missed = db.notifLog.filter((n) => n.missed && !n.ackAt).sort((a, b) => b.due - a.due);
  const titleOf = (n) => db.todos.find((x) => x.id === n.todoId)?.title || '(삭제된 할 일)';
  if (!missed.length) return <p className="missed-empty">밀린 알림이 없어요</p>;
  return (
    <>
      <ul className="missed-list">
        {missed.map((n) => (
          <li key={n.key + n.firedAt}>
            <span className="missed-title">{titleOf(n)}</span>
            <span className="missed-meta"><b className={n.type === 'start' ? 'is-start' : 'is-end'}>{n.type === 'start' ? '시작' : '마무리'}</b>{fmtDateTime(n.due)}</span>
          </li>
        ))}
      </ul>
      <button className="primary missed-ack" onClick={() => window.api.ackMissed()}>모두 확인 ({missed.length})</button>
    </>
  );
}
