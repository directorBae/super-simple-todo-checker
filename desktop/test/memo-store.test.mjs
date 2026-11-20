// 회의록 저장소 (shared/memo-store.mjs) and the note as a file (shared/memo-file.cjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { storeLabel, memoOutcome, STORE_OPTIONS, MEMO_STEPS } from '../../shared/memo-store.mjs';
import memoFile from '../../shared/memo-file.cjs';

const { memoFileName, memoMarkdown, MEMO_FOLDER } = memoFile;

test('회의록 저장소: its labels, the three choices, the pet\'s steps, and what it says (and opens) when a note is done', () => {
  assert.equal(storeLabel(null), '정하지 않음'); assert.equal(storeLabel({ kind: 'local' }), '로컬 저장소');
  assert.equal(storeLabel({ kind: 'notion', type: 'database', title: '회의록' }), '노션 DB ‘회의록’'); assert.equal(storeLabel({ kind: 'notion', type: 'page', title: '팀 위키' }), '노션 페이지 ‘팀 위키’');
  assert.deepEqual(STORE_OPTIONS.map((o) => o.kind), ['local', 'notion', null]);
  assert.deepEqual(Object.values(MEMO_STEPS).map((s) => [s.state, s.text]), [['reading', '전사 중…'], ['thinking', '요약 중…']]);
  const memo = { id: 'm1', title: '주간 회의' };
  const notion = memoOutcome({ memo, stored: { kind: 'notion', type: 'database', title: '회의록', url: 'https://notion.so/p' } });
  assert.deepEqual(notion, { mood: 'memo', name: '노션 DB 회의록', tail: '에 정리했어요!', text: '‘노션 DB 회의록’에 정리했어요!', link: { kind: 'notion', url: 'https://notion.so/p' } });
  const local = memoOutcome({ memo, stored: { kind: 'local' } }, { local: { ok: true, path: 'C:/Users/me/Documents/Work 회의록/Studio/x.md', folder: 'Work 회의록/Studio' } });
  assert.deepEqual(local.link, { kind: 'local', path: 'C:/Users/me/Documents/Work 회의록/Studio/x.md' }); assert.equal(local.text, '‘Work 회의록/Studio’에 정리했어요!');
  // On the web (no folder of its own) and without a store, the memo in the Team tab is the place.
  assert.deepEqual(memoOutcome({ memo, stored: { kind: 'local' } }, { teamName: 'Studio' }), { mood: 'memo', name: 'Studio 메모', tail: '에 정리했어요!', text: '‘Studio 메모’에 정리했어요!', link: { kind: 'memo', memo: 'm1' } });
  assert.equal(memoOutcome({ memo, stored: null }).text, '‘메모’에 정리했어요!');
  // Notion failed: the memo is kept, the pet is sad and points at it.
  const failed = memoOutcome({ memo, stored: { kind: 'notion', title: '회의록', error: '연결이 끊겼어요' } });
  assert.equal(failed.mood, 'error'); assert.match(failed.text, /노션에는 못 보냈어요 — 연결이 끊겼어요/); assert.deepEqual(failed.link, { kind: 'memo', memo: 'm1' });
  // Nothing said → no note, said plainly, nothing to open.
  assert.deepEqual(memoOutcome({ memo: null, reason: 'empty' }), { mood: 'done', text: '아무 말도 녹음되지 않아 회의록은 만들지 않았어요' });
  assert.equal(memoOutcome({ memo: null, reason: 'nothing' }).text, '회의 내용이 없어서 회의록은 만들지 않았어요');
});

test('회의록 파일 (로컬 저장소): a safe name with the day and a bit of the id, and markdown with every part', () => {
  const memo = { id: 'abcdef12-3456', title: '발표: 자료/맞추기?', by: 'u1', createdAt: '2026-11-20T03:00:00.000Z', notionUrl: null, transcript: '전체 받아쓴 글', summary: { title: 'x', summary: '내일까지 맞춘다.', decisions: ['디자인은 민지'], todos: ['민지: 시안', '정원: 문구'] } };
  assert.match(memoFileName(memo), /^\d{4}-\d{2}-\d{2} 발표 자료 맞추기 \[abcdef12\]\.md$/);
  assert.equal(memoFileName(memo), memoFileName({ ...memo, summary: null })); // the same memo → the same file
  assert.ok(memoFileName({ id: 'x', createdAt: '2026-11-20T03:00:00.000Z' }).endsWith(' 메모 [x].md'));
  assert.equal(MEMO_FOLDER, 'Work 회의록');
  const md = memoMarkdown(memo, { team: 'Studio', names: { u1: '정원' } });
  for (const want of ['# 발표: 자료/맞추기?', '- 팀: Studio', '- 날짜: 2026-11-20', '- 녹음: 정원', '## 요약', '내일까지 맞춘다.', '## 정해진 것', '- 디자인은 민지', '## 할 일', '- [ ] 민지: 시안', '- [ ] 정원: 문구', '## 전체 기록', '전체 받아쓴 글']) assert.ok(md.includes(want), want);
  assert.ok(!md.includes('노션:'));
  assert.ok(memoMarkdown({ ...memo, notionUrl: 'https://notion.so/p' }).includes('- 노션: https://notion.so/p'));
  const bare = memoMarkdown({ id: 'y', createdAt: '2026-11-20T03:00:00.000Z' });
  assert.ok(bare.startsWith('# 메모\n')); assert.ok(!bare.includes('## '));
});
