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

export const CHANNELS = ['Instagram', 'YouTube', 'X', '블로그', 'TikTok', '기타'];

const CHANNEL_COLORS = ['#e1306c', '#ef4444', '#111827', '#22c55e', '#8b5cf6', '#f59e0b'];
export function channelColor(channel) {
  if (!channel) return '#94a3b8';
  const i = CHANNELS.indexOf(channel);
  if (i >= 0) return CHANNEL_COLORS[i];
  let h = 0;
  for (const c of channel) h = (h * 31 + c.charCodeAt(0)) % 997;
  return CHANNEL_COLORS[h % CHANNEL_COLORS.length];
}

// 프로젝트를 통해 소속된 팀까지 고려한 실제 팀 id
export function effectiveTeamId(todo, db) {
  const p = db.projects.find((x) => x.id === todo.projectId);
  return (p && p.teamId) || todo.teamId || null;
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
