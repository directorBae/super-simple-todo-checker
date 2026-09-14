import React, { useState } from 'react';

const teamOf = (db, t) => db.projects.find(p => p.id === t.projectId)?.teamId || t.teamId || null;
const label = t => `${t.title} · ${t.date || '날짜 없음'} · ${t.integration?.targetLabel || '앱'}`;
function Preview({ todo }) {
  return <div className="integration-target"><strong>{todo.title}</strong><span>{todo.date || '날짜 없음'} {todo.startTime || '종일 / 시간 없음'} {todo.endDate || ''} {todo.endTime || ''}</span><span className="meta">{todo.status === 'done' ? '완료' : '미완료'} · {todo.integration?.targetLabel || '앱에서 작성'}</span><p style={{ whiteSpace: 'pre-wrap' }}>{todo.notes || '메모 없음'}</p></div>;
}
export default function Duplicates({ db, state, run, busy }) {
  const [todoId, setTodoId] = useState(''), [otherId, setOtherId] = useState(''), [reason, setReason] = useState('');
  const [result, setResult] = useState(null);
  const todo = db.todos.find(t => t.id === todoId), other = db.todos.find(t => t.id === otherId);
  const candidates = todo ? db.todos.filter(t => t.id !== todo.id && teamOf(db, t) === teamOf(db, todo)) : [];
  const scan = async (offset = 0) => { const r = await run({ action: 'duplicate-candidates', todoId, offset }); if (r) setResult(previous => ({ ...r, matches: offset ? [...(previous?.matches || []), ...r.matches] : r.matches, scanned: offset + r.scanned })); };
  const decide = async action => {
    if (!todo || !other) return;
    if (action === 'merge-duplicates' && !window.confirm(`“${todo.title}”의 제목·날짜·메모를 유지하고 두 업무를 합칠까요? 각 원본과 병합 전 내용은 보관합니다. 이후 앱에서 수정하면 쓰기 가능한 원본들에 반영됩니다.`)) return;
    const r = await run({ action, todoId, otherTodoId: other.id, reason, revisions: { [todo.id]: todo.syncRevision, [other.id]: other.syncRevision } });
    if (r) { setOtherId(''); setReason(''); setResult(null); }
  };
  return <section className="section"><h2>중복 업무 · 개인 메모리</h2>
    <p className="desc">표현이 다른 같은 업무를 찾아 하나로 합칩니다. 같은 조직 안에서 비교하며, 확인한 원본 내용과 판단을 이 서버의 개인 메모리에 보관합니다. AI 검사 시 업무 내용과 같은 조직의 기억을 OpenAI에 전달합니다.</p>
    <label className="integration-field">유지할 업무<select aria-label="중복 검사 기준 업무" disabled={busy} value={todoId} onChange={e => { setTodoId(e.target.value); setOtherId(''); setResult(null); setReason(''); }}><option value="">업무 선택</option>{db.todos.map(t => <option key={t.id} value={t.id}>{db.teams.find(x => x.id === teamOf(db, t))?.name || '조직 없음'} · {label(t)}</option>)}</select></label>
    {todo && <><Preview todo={todo} /><button disabled={busy || !state?.configured.openai} onClick={() => scan()}>AI로 중복 후보 찾기</button>{result && <><p className="desc">{result.total}개 중 {result.scanned}개 검사 · 후보 {result.matches.length}개</p>{result.matches.map(m => { const candidate = candidates.find(t => t.id === m.todoId); return candidate && <div className="integration-target" key={m.todoId}><strong>{label(candidate)}</strong><p>{m.reason}</p><button disabled={busy} onClick={() => { setOtherId(m.todoId); setReason(m.reason); }}>내용 비교</button></div>; })}{result.nextOffset !== null && <button disabled={busy} onClick={() => scan(result.nextOffset)}>다음 업무들도 검사</button>}</>}
      <label className="integration-field">직접 비교할 업무<select aria-label="병합할 업무" disabled={busy} value={otherId} onChange={e => { setOtherId(e.target.value); setReason(''); }}><option value="">같은 조직의 업무 선택</option>{candidates.map(t => <option key={t.id} value={t.id}>{label(t)}</option>)}</select></label>
      {other && candidates.includes(other) && <><Preview todo={other} /><label className="integration-field">기억할 판단 이유<input value={reason} maxLength={1000} onChange={e => setReason(e.target.value)} placeholder="예: 고객사 킥오프와 프로젝트 착수 회의는 같은 일정" /></label><div className="btn-row"><button className="primary" disabled={busy || state?.busy} onClick={() => decide('merge-duplicates')}>같은 업무로 병합</button><button disabled={busy} onClick={() => decide('different-duplicates')}>다른 업무로 기억</button></div></>}
    </>}
    <h3>저장된 개인 메모리 · {state?.duplicateMemories?.length || 0}개</h3>{[...(state?.duplicateMemories || [])].reverse().map(m => <details key={m.id} className="integration-target"><summary>{m.decision === 'merged' ? '같은 업무' : '다른 업무'} · {m.members.map(x => x.snapshot.title).join(' ↔ ')}</summary><p>{db.teams.find(t => t.id === m.teamId)?.name || '조직 없음'} · {m.reason} · {new Date(m.createdAt).toLocaleString()}</p>{m.members.map((member, index) => <div key={index}><Preview todo={member.snapshot} />{member.sources.map(source => <p className="meta" key={source.key}>{source.provider} · {source.targetLabel} · 원본: {source.content?.title}<br />{source.externalId}</p>)}</div>)}</details>)}
  </section>;
}
