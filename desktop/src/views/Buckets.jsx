import { SourceIcons } from '../icons.jsx';
import React, { useState } from 'react';
import { Section, Empty } from '../components.jsx';
import { todayStr } from '../util.js';
import { compactTitle } from '../focus-utils.mjs';

function BucketTodoRow({ todo, db }) {
  const [date, setDate] = useState('');
  const project = db.projects.find((p) => p.id === todo.projectId);
  return (
    <div className="todo-row">
      <div className="todo-line">
        <SourceIcons todo={todo}/><span className="title" title={todo.title}>{compactTitle(todo.title)}</span>

        {project && <span className="badge">{project.name}</span>}
        <span className="row-actions">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} title="활성화할 날짜 (선택)" />
          <button
            className="ghost"
            title="날짜를 고르지 않으면 오늘로 활성화됩니다"
            onClick={() =>
              // 날짜 없이 활성화하면 아무 날에도 안 보여 사라진 것처럼 되므로 오늘로 보낸다
              window.api.updateTodo(todo.id, { status: 'todo', date: date || todo.date || todayStr() })
            }
          >
            활성화
          </button>
          <button className="ghost danger" onClick={() => window.api.deleteTodo(todo.id)}>
            ✕
          </button>
        </span>
      </div>
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
      <p className="desc">앞으로 챙기고 싶지만 아직 애매한 일들을 담아 두는 곳. 준비가 되면 활성화하세요.</p>

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
