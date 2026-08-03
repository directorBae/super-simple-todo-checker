import React, { useState } from 'react';
import { Section, TodoForm, TodoRow, Empty, ChipPicker } from '../components.jsx';
import { byDateTime } from '../util.js';

function ProjectCard({ project, db }) {
  const [open, setOpen] = useState(false);
  const team = db.teams.find((t) => t.id === project.teamId);
  const linked = db.todos.filter((t) => t.projectId === project.id && t.status !== 'bucket');
  const doneCount = linked.filter((t) => t.status === 'done').length;
  const pct = linked.length ? Math.round((doneCount / linked.length) * 100) : 0;
  const hlColor = project.important ? (team ? team.color : '#f59e0b') : null;

  const remove = () => {
    if (window.confirm(`'${project.name}' 프로젝트를 삭제할까요? 연결된 할 일은 유지되고 연결만 해제됩니다.`)) {
      window.api.deleteProject(project.id);
    }
  };

  return (
    <div className={'card' + (hlColor ? ' hl' : '')} style={hlColor ? { '--hl': hlColor } : undefined}>
      <div className="card-head" onClick={() => setOpen(!open)}>
        <span className="card-title" style={hlColor ? { color: hlColor } : undefined}>{project.name}</span>
        {hlColor && <span className="hl-star" style={{ color: hlColor }}>★</span>}
        <span className="badge">{project.term === 'long' ? '장기' : '단기'}</span>
        {team && (
          <span className="badge">
            <span className="team-dot" style={{ background: team.color }} /> {team.name}
          </span>
        )}
        {project.status === 'done' && <span className="badge done-badge">완료</span>}
        <span className="meta">
          {doneCount}/{linked.length}
        </span>
        <span className="row-actions" onClick={(e) => e.stopPropagation()}>
          <button
            className={'ghost star' + (project.important ? ' on' : '')}
            title="중요 프로젝트 (할 일 화면에서 하이라이트)"
            onClick={() => window.api.updateProject(project.id, { important: !project.important })}
          >
            ★
          </button>
          {project.status === 'active' && (
            <>
              <button className="ghost" onClick={() => window.api.updateProject(project.id, { status: 'bucket' })}>
                버킷
              </button>
              <button className="ghost" onClick={() => window.api.updateProject(project.id, { status: 'done' })}>
                완료
              </button>
            </>
          )}
          {project.status === 'done' && (
            <button className="ghost" onClick={() => window.api.updateProject(project.id, { status: 'active' })}>
              재개
            </button>
          )}
          <button className="ghost danger" onClick={remove}>
            ✕
          </button>
        </span>
      </div>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      {open && (
        <div className="card-body">
          {linked.length ? (
            [...linked].sort(byDateTime).map((t) => <TodoRow key={t.id} todo={t} db={db} showDate />)
          ) : (
            <Empty>연결된 할 일이 없습니다.</Empty>
          )}
          <TodoForm
            initial={{ projectId: project.id }}
            projects={db.projects}
            teams={db.teams}
            showLinks={false}
            onSubmit={(p) => window.api.addTodo({ ...p, projectId: project.id })}
          />
        </div>
      )}
    </div>
  );
}

export default function Projects({ db }) {
  const [f, setF] = useState({ name: '', term: 'short', teamId: '' });
  const [showDone, setShowDone] = useState(false);

  const active = db.projects.filter((p) => p.status === 'active');
  const doneList = db.projects.filter((p) => p.status === 'done');

  const submit = (e) => {
    e.preventDefault();
    if (!f.name.trim()) return;
    window.api.addProject({ name: f.name.trim(), term: f.term, teamId: f.teamId || null });
    setF({ ...f, name: '' });
  };

  return (
    <div>
      <form className="todo-form" onSubmit={submit}>
        <input className="grow" placeholder="프로젝트 이름" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <select value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })}>
          <option value="short">단기</option>
          <option value="long">장기</option>
        </select>
        <button type="submit" className="primary">
          추가
        </button>
        {db.teams.length > 0 && (
          <div className="picker-rows">
            <ChipPicker
              label="팀"
              options={db.teams.map((t) => ({ id: t.id, label: t.name, color: t.color }))}
              value={f.teamId}
              onChange={(v) => setF({ ...f, teamId: v })}
            />
          </div>
        )}
      </form>

      {active.length ? (
        active.map((p) => <ProjectCard key={p.id} project={p} db={db} />)
      ) : (
        <Empty>진행 중인 프로젝트가 없습니다.</Empty>
      )}

      {doneList.length > 0 && (
        <Section
          title={`완료된 프로젝트 (${doneList.length})`}
          extra={
            <button className="ghost" onClick={() => setShowDone(!showDone)}>
              {showDone ? '접기' : '펼치기'}
            </button>
          }
        >
          {showDone && doneList.map((p) => <ProjectCard key={p.id} project={p} db={db} />)}
        </Section>
      )}
    </div>
  );
}
