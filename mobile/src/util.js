// desktop/src/util.js와 동일한 데이터 헬퍼 — 크로스 플랫폼 공유 예정
export function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const todayStr = () => localDateStr(new Date());

export function addDays(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return localDateStr(new Date(y, m - 1, d + n));
}

export function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const wd = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
  return `${m}/${d}(${wd})`;
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${fmtDate(localDateStr(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function dateParts(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return { y, m, d, dow: new Date(y, m - 1, d).getDay() };
}

export const DOW_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

export const lineSort = (a, b) => {
  const ka = a.startTime || '99:99';
  const kb = b.startTime || '99:99';
  if (ka !== kb) return ka < kb ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
};

export const byDateTime = (a, b) =>
  (a.date || '9999') + (a.startTime || '99') < (b.date || '9999') + (b.startTime || '99') ? -1 : 1;


// 프로젝트를 통해 소속된 팀까지 고려한 실제 팀 id
export function effectiveTeamId(todo, db) {
  const p = db.projects.find((x) => x.id === todo.projectId), id = (p && p.teamId) || todo.teamId || null;
  // A team that no longer exists counts as no team, so its lines still show (first, with the lines without a team).
  return id && db.teams.some((t) => t.id === id) ? id : null;
}

// 팀 색상 팔레트: 무지개 계열 11색 + 검은색
export const TEAM_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e',
  '#14b8a6', '#0ea5e9', '#3b82f6', '#8b5cf6', '#ec4899', '#111111',
];

// 중요 팀/프로젝트 소속이면 하이라이트 색을, 아니면 null 반환
export function importantHighlight(todo, db) {
  const p = db.projects.find((x) => x.id === todo.projectId);
  const teamId = (p && p.teamId) || todo.teamId || null;
  const team = db.teams.find((t) => t.id === teamId);
  if (team && team.important) return team.color;
  if (p && p.important) return (team && team.color) || '#f59e0b';
  return null;
}

/* 입력한 한 줄이 팀/프로젝트 이름이면 그룹 컨텍스트를 돌려준다 (desktop Todos.jsx와 동일) */
export function resolveGroup(v, kind, db) {

  const team = db.teams.find((t) => t.name === v);
  if (team) return { label: team.name, color: team.color, teamId: team.id, projectId: null, channel: null };
  const proj = db.projects.find((p) => p.status === 'active' && p.name === v);
  if (proj) {
    const pTeam = db.teams.find((t) => t.id === proj.teamId);
    return {
      label: proj.name,
      color: pTeam ? pTeam.color : '#94a3b8',
      teamId: null,
      projectId: proj.id,
      channel: null,
    };
  }
  return null;
}

/* 입력 중 자동완성 후보 — 팀/프로젝트 이름 부분일치, 앞글자 일치 우선 */
export function suggestGroups(q, kind, db) {
  const v = q.trim().toLowerCase();
  if (!v) return [];
  const names = [];

  names.push(...db.teams.map((t) => t.name));
  names.push(...db.projects.filter((p) => p.status === 'active').map((p) => p.name));
  const rank = (n) => (n.toLowerCase().startsWith(v) ? 0 : 1);
  return [...new Set(names)]
    .filter((n) => n.toLowerCase().includes(v) && n !== q.trim())
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
    .slice(0, 4)
    .map((n) => resolveGroup(n, kind, db))
    .filter(Boolean);
}

/* 여러 줄 텍스트: 줄마다 할 일로 추가하되, 팀/프로젝트/채널 이름 줄은 그룹 전환으로 처리.
   add(payload)로 실제 추가를 위임하고 마지막 그룹 컨텍스트를 반환 */
export function pasteLines(text, { date, kind, db, ctx, add, firstPrefix = '' }) {
  const lines = text.split(/\r?\n/).map((s) => s.trim());
  let cur = ctx;
  let first = true;
  for (let line of lines) {
    if (first) {
      line = (firstPrefix + line).trim();
      first = false;
    }
    if (!line) continue;
    const g = resolveGroup(line, kind, db);
    if (g) {
      cur = g;
      continue;
    }
    add({
      title: line,
      date,
      kind,
      teamId: cur ? cur.teamId : null,
      projectId: cur ? cur.projectId : null,
      channel: cur ? cur.channel : null,
    });
  }
  return cur;
}
