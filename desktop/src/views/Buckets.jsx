import React, { useState } from 'react';
import { Section, Empty } from '../components.jsx';
import { channelColor, todayStr } from '../util.js';

function BucketTodoRow({ todo, db }) {
  const [date, setDate] = useState('');
  const project = db.projects.find((p) => p.id === todo.projectId);
  return (
    <div className="todo-row">
      <div className="todo-line">
        <span className="title">{todo.title}</span>
        {todo.kind === 'content' && (
          <span className="badge" style={{ background: channelColor(todo.channel), color: '#fff' }}>
            {todo.channel || '콘텐츠'}
          </span>
        )}
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
  const [kind, setKind] = useState('todo');
  const [projName, setProjName] = useState('');

  const todoBuckets = db.todos.filter((t) => t.status === 'bucket');
  const projBuckets = db.projects.filter((p) => p.status === 'bucket');

  const addTodoBucket = (e) => {
    e.preventDefault();
    if (!todoTitle.trim()) return;
    window.api.addTodo({ title: todoTitle.trim(), kind, status: 'bucket' });
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

      <Section title={`할 일 · 콘텐츠 버킷 (${todoBuckets.length})`}>
        <form className="todo-form" onSubmit={addTodoBucket}>
          <input
            className="grow"
            placeholder="언젠가 할 일 / 만들 콘텐츠"
            value={todoTitle}
            onChange={(e) => setTodoTitle(e.target.value)}
          />
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="todo">할 일</option>
            <option value="content">콘텐츠</option>
          </select>
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

      <Section title={`프로젝트 버킷 (${projBuckets.length})`}>
        <form className="todo-form" onSubmit={addProjBucket}>
          <input
            className="grow"
            placeholder="언젠가 하고 싶은 프로젝트"
            value={projName}
            onChange={(e) => setProjName(e.target.value)}
          />
          <button type="submit" className="primary">
            담기
          </button>
        </form>
        {projBuckets.length ? (
          projBuckets.map((p) => (
            <div className="todo-row" key={p.id}>
              <div className="todo-line">
                <span className="title">{p.name}</span>
                <span className="row-actions">
                  <button className="ghost" onClick={() => window.api.updateProject(p.id, { status: 'active' })}>
                    활성화
                  </button>
                  <button className="ghost danger" onClick={() => window.api.deleteProject(p.id)}>
                    ✕
                  </button>
                </span>
              </div>
            </div>
          ))
        ) : (
          <Empty>버킷이 비어 있습니다.</Empty>
        )}
      </Section>
    </div>
  );
}
