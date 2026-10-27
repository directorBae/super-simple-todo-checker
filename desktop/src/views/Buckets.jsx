import { SourceIcons } from '../icons.jsx';
import React, { useState } from 'react';
import { Section, Empty, DateCalendar } from '../components.jsx';
import { todayStr } from '../util.js';
import { compactTitle } from '../focus-utils.mjs';

// 활성화 opens the calendar; the to-do leaves the bucket for the picked day when 확정 is pressed.
function BucketTodoRow({ todo, db }) {
  const [picking, setPicking] = useState(false), [date, setDate] = useState(todayStr());
  const project = db.projects.find((p) => p.id === todo.projectId);
  return (
    <div className="todo-row">
      <div className="todo-line">
        <SourceIcons todo={todo}/><span className="title" title={todo.title}>{compactTitle(todo.title)}</span>

        {project && <span className="badge">{project.name}</span>}
        <span className="row-actions">
          <button className="ghost" aria-expanded={picking} onClick={() => setPicking((v) => !v)}>
            활성화
          </button>
          <button className="ghost danger" onClick={() => window.api.deleteTodo(todo.id)}>
            ✕
          </button>
        </span>
      </div>
      {picking && (
        <div className="todo-editor date-only bucket-date">
          <DateCalendar value={date} onPick={setDate} />
          <div className="date-cal-actions">
            <span className="date-cal-spacer" />
            <button type="button" className="ghost" onClick={() => setPicking(false)}>취소</button>
            <button type="button" className="primary" onClick={() => { window.api.updateTodo(todo.id, { status: 'todo', date }); setPicking(false); }}>확정</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Buckets({ db }) {
  const [todoTitle, setTodoTitle] = useState('');
  const [projName, setProjName] = useState('');

  const todoBuckets = db.todos.filter((t) => t.status === 'bucket');
  const projBuckets = db.projects.filter((p) => p.status === 'bucket');

  const addTodoBucket = (e) => {
    e.preventDefault();
    if (!todoTitle.trim()) return;
    window.api.addTodo({ title: todoTitle.trim(), kind: 'todo', status: 'bucket' });
    setTodoTitle('');
  };

  const addProjBucket = (e) => {
    e.preventDefault();
    if (!projName.trim()) return;
    window.api.addProject({ name: projName.trim(), status: 'bucket' });
    setProjName('');
  };

  return (
    <div>
      <Section title={`할 일 버킷 (${todoBuckets.length})`}>
        <form className="todo-form" onSubmit={addTodoBucket}>
          <input
            className="grow"
            placeholder="언젠가 할 일"
            maxLength={50}
            value={todoTitle}
            onChange={(e) => setTodoTitle(e.target.value)}
          />

          <button type="submit" className="primary">
            담기
          </button>
        </form>
        {todoBuckets.length ? (
          todoBuckets.map((t) => <BucketTodoRow key={t.id} todo={t} db={db} />)
        ) : (
          <Empty>버킷이 비어 있습니다.</Empty>
        )}
      </Section>


    </div>
  );
}
