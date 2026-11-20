// 회의록 저장소 — where a team's dive notes go (one choice for the whole team) — as the apps show it, and what the pet
// says when a note is done. Pure; shared by the desktop/web app and the phone app.
export const STORE_OPTIONS = [
  { kind: 'local', label: '로컬 저장소', desc: '각 PC의 문서 폴더 “Work 회의록/팀 이름”에 마크다운 파일로 저장돼요. Team 탭의 메모에도 남아요.' },
  { kind: 'notion', label: '노션 DB', desc: '고른 노션 데이터베이스(또는 페이지)에 새 행으로 들어가요. 노션 연결이 필요해요.' },
  { kind: null, label: '정하지 않음', desc: '자동으로 녹음하지 않아요. 통화 중 ⏺ 녹음을 직접 누를 수 있어요.' },
];
export function storeLabel(store) {
  if (!store?.kind) return '정하지 않음';
  if (store.kind === 'local') return '로컬 저장소';
  return `노션 ${store.type === 'database' ? 'DB' : '페이지'} ‘${store.title || '노션'}’`;
}
// The pet while the note is being made (RoamingPet's working states).
export const MEMO_STEPS = { transcribing: { state: 'reading', text: '전사 중…' }, summarizing: { state: 'thinking', text: '요약 중…' } };
// What the pet says once /memo/finish answered. r = { memo, stored, reason }; local = what this computer saved
// ({ ok, path, folder }). The link is what a click opens: notion — the page; local — the folder; memo — the memo in the Team tab.
export function memoOutcome(r, { local = null, teamName = '' } = {}) {
  if (!r?.memo) return { mood: 'done', text: r?.reason === 'empty' ? '아무 말도 녹음되지 않아 회의록은 만들지 않았어요' : '회의 내용이 없어서 회의록은 만들지 않았어요' };
  const s = r.stored, said = (name, link) => ({ mood: 'memo', name, tail: '에 정리했어요!', text: `‘${name}’에 정리했어요!`, link });
  if (s?.kind === 'notion' && s.url) return said(`노션 ${s.type === 'database' ? 'DB ' : ''}${s.title || ''}`.trim(), { kind: 'notion', url: s.url });
  if (s?.kind === 'notion') return { mood: 'error', text: `회의록은 메모에 남겼지만 노션에는 못 보냈어요${s.error ? ' — ' + s.error : ''}`, link: { kind: 'memo', memo: r.memo.id } };
  if (s?.kind === 'local' && local?.ok) return said(local.folder, { kind: 'local', path: local.path });
  return said(`${teamName ? teamName + ' ' : ''}메모`, { kind: 'memo', memo: r.memo.id });
}
