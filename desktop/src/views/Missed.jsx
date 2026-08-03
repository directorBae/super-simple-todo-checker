import React from 'react';
import { Empty } from '../components.jsx';
import { fmtDateTime } from '../util.js';

export default function Missed({ db }) {
  const missed = db.notifLog.filter((n) => n.missed && !n.ackAt).sort((a, b) => b.due - a.due);

  const titleOf = (n) => {
    const t = db.todos.find((x) => x.id === n.todoId);
    return t ? t.title : '(삭제된 항목)';
  };

  return (
    <div>
      <p className="desc">컴퓨터가 꺼져 있거나 앱이 실행 중이 아닐 때 지나간 알림들입니다.</p>

      {missed.length > 0 && (
        <button className="primary" style={{ marginBottom: 12 }} onClick={() => window.api.ackMissed()}>
          모두 확인 ({missed.length})
        </button>
      )}

      {missed.length === 0 && <Empty>밀린 알림이 없습니다. 🎉</Empty>}
      {missed.map((n) => (
        <div className="todo-row" key={n.key + n.firedAt}>
          <div className="todo-line">
            <span className={'badge ' + (n.type === 'start' ? 'badge-start' : 'badge-end')}>
              {n.type === 'start' ? '시작' : '마무리'}
            </span>
            <span className="title">{titleOf(n)}</span>
            <span className="meta">{fmtDateTime(n.due)} 예정</span>
          </div>
        </div>
      ))}
    </div>
  );
}
