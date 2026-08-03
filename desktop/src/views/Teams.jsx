import React, { useState } from 'react';
import { Empty } from '../components.jsx';
import { effectiveTeamId, TEAM_COLORS } from '../util.js';

function Swatches({ value, onPick }) {
  return (
    <div className="swatches">
      {TEAM_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          className={'swatch' + (value === c ? ' active' : '')}
          style={{ background: c }}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  );
}

export default function Teams({ db }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(TEAM_COLORS[db.teams.length % TEAM_COLORS.length]);
  const [recolorId, setRecolorId] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    window.api.addTeam({ name: name.trim(), color });
    setName('');
    setColor(TEAM_COLORS[(db.teams.length + 1) % TEAM_COLORS.length]);
  };

  const remove = (team) => {
    if (window.confirm(`'${team.name}' 팀을 삭제할까요? 소속 프로젝트/할 일은 유지되고 연결만 해제됩니다.`)) {
      window.api.deleteTeam(team.id);
    }
  };

  return (
    <div>
      <form className="todo-form" onSubmit={submit}>
        <input className="grow" placeholder="팀 이름" value={name} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="primary">
          추가
        </button>
        <Swatches value={color} onPick={setColor} />
      </form>

      {db.teams.length === 0 && <Empty>등록된 팀이 없습니다.</Empty>}
      {db.teams.map((team) => {
        const projCount = db.projects.filter((p) => p.teamId === team.id && p.status !== 'done').length;
        const todoCount = db.todos.filter((t) => effectiveTeamId(t, db) === team.id && t.status === 'todo').length;
        const hl = team.important;
        return (
          <div className={'card' + (hl ? ' hl' : '')} style={hl ? { '--hl': team.color } : undefined} key={team.id}>
            <div className="card-head">
              <button
                type="button"
                className="team-dot big clickable"
                style={{ background: team.color }}
                title="색상 변경"
                onClick={() => setRecolorId(recolorId === team.id ? null : team.id)}
              />
              <span className="card-title" style={hl ? { color: team.color } : undefined}>
                {team.name}
              </span>
              {hl && <span className="hl-star" style={{ color: team.color }}>★</span>}
              <span className="meta">
                프로젝트 {projCount} · 할 일 {todoCount}
              </span>
              <span className="row-actions">
                <button
                  className={'ghost star' + (hl ? ' on' : '')}
                  title="중요 팀 (할 일 화면에서 하이라이트)"
                  onClick={() => window.api.updateTeam(team.id, { important: !team.important })}
                >
                  ★
                </button>
                <button className="ghost danger" onClick={() => remove(team)}>
                  ✕
                </button>
              </span>
            </div>
            {recolorId === team.id && (
              <Swatches
                value={team.color}
                onPick={(c) => {
                  window.api.updateTeam(team.id, { color: c });
                  setRecolorId(null);
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
