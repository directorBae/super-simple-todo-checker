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

export function fmtTime(iso) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function fmtDateTime(ms) {
  const d = new Date(ms);
  return `${fmtDate(localDateStr(d))} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function eventOnDate(ev, dateStr) {
  if (!ev.start) return false;
  if (ev.allDay) {
    const start = ev.start.slice(0, 10);
    const end = ev.end ? ev.end.slice(0, 10) : start;
    return start <= dateStr && (dateStr < end || start === dateStr);
  }
  return localDateStr(new Date(ev.start)) === dateStr;
}

export const byTime = (a, b) => ((a.startTime || '99') < (b.startTime || '99') ? -1 : 1);
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
  '#ef4444', // 빨강
  '#f97316', // 주황
  '#f59e0b', // 호박
  '#eab308', // 노랑
  '#84cc16', // 연두
  '#22c55e', // 초록
  '#14b8a6', // 청록
  '#0ea5e9', // 하늘
  '#3b82f6', // 파랑
  '#8b5cf6', // 보라
  '#ec4899', // 분홍
  '#111111', // 검정
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
