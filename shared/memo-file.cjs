// 회의록 as a file (로컬 저장소): the folder under the person's documents, a file's name and its markdown. Shared by the
// desktop app's main process (which writes the files) and the tests. Dates are the computer's own local day.
const MEMO_FOLDER = 'Work 회의록';
const safeName = (s, max = 60) => String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const pad = (n) => String(n).padStart(2, '0');
const localDay = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const localTime = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// "2026-11-20 발표 자료 [abcdef12].md" — the same memo always gets the same name (so saving again changes nothing).
function memoFileName(memo) {
  const title = safeName(memo.title || memo.summary?.title || '메모') || '메모';
  return `${localDay(memo.createdAt)} ${title} [${String(memo.id || '').slice(0, 8)}].md`.trim();
}
function memoMarkdown(memo, { team = '', names = {} } = {}) {
  const s = memo.summary || {}, lines = [`# ${memo.title || s.title || '메모'}`, ''];
  if (team) lines.push(`- 팀: ${team}`);
  lines.push(`- 날짜: ${localDay(memo.createdAt)} ${localTime(memo.createdAt)}`.trim());
  if (names[memo.by]) lines.push(`- 녹음: ${names[memo.by]}`);
  if (memo.notionUrl) lines.push(`- 노션: ${memo.notionUrl}`);
  lines.push('');
  if (s.summary) lines.push('## 요약', '', s.summary, '');
  if (s.decisions?.length) lines.push('## 정해진 것', '', ...s.decisions.map((d) => `- ${d}`), '');
  if (s.todos?.length) lines.push('## 할 일', '', ...s.todos.map((t) => `- [ ] ${t}`), '');
  if (memo.transcript) lines.push('## 전체 기록', '', memo.transcript, '');
  return lines.join('\n');
}
module.exports = { MEMO_FOLDER, safeName, memoFileName, memoMarkdown, localDay };
