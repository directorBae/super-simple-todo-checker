import React, { useEffect, useRef, useState } from 'react';
import { ProviderIcon, PROVIDER_NAMES } from '../SourceIcons.jsx';
import { useToolsState, refreshTools, toolAction } from '../tools-state.js';
import { toolAccounts, connectionIds, stillWaiting } from '../tool-accounts.mjs';
import '../tool-accounts.css';

// 노션 · 구글 캘린더 — 각자 자기 계정(여러 개도)으로 연결하고, 펫이 고른 페이지 · 캘린더를 지켜보며 할 일로 옮긴다.
const TOOLS = ['notion', 'google'];
const WAIT_MS = 2 * 60_000; // how long we look for a connection made in the browser

// "방금 읽음", "5분 전 읽음", "10월 27일 14:05 읽음"
export function readAgo(iso, now = Date.now()) {
  const t = Date.parse(iso);
  if (!t) return '아직 안 읽음';
  const m = Math.floor((now - t) / 60_000);
  if (m < 1) return '방금 읽음';
  if (m < 60) return `${m}분 전 읽음`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}시간 전 읽음`;
  const d = new Date(t);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} 읽음`;
}
const subState = s => s.state === 'syncing' ? '읽는 중…' : s.state === 'error' ? '오류: ' + (s.last_error || '읽지 못했어요') : '지켜보는 중';
const KIND = { page: '페이지', database: 'DB', calendar: '캘린더' };

function Subscription({ sub, busy, run }) {
  return <div className={'tool-sub' + (sub.state === 'error' ? ' is-error' : '')}>
    <span className="tool-sub-kind">{KIND[sub.resource_type] || '페이지'}</span>
    <div className="tool-sub-text">
      {sub.url ? <button className="tool-sub-title" title="원본 열기" onClick={() => window.api.openExternal(sub.url)}>{sub.title || '제목 없음'}</button> : <strong className="tool-sub-title">{sub.title || '제목 없음'}</strong>}
      <small><span className={'tool-sub-state ' + (sub.state || 'idle')}>{subState(sub)}</span> · {readAgo(sub.last_synced_at)}</small>
    </div>
    <div className="tool-sub-actions">
      <button className="ghost" disabled={busy || sub.state === 'syncing'} onClick={() => run('sync', { id: sub.id })}>지금 다시 읽기</button>
      <button className="ghost" disabled={busy} onClick={() => run('unsubscribe', { id: sub.id })}>그만 보기</button>
    </div>
  </div>;
}

// Notion pages and databases the person shared with the app in one workspace; a click subscribes.
function PagePicker({ connectionId, title, subs, busy, run, onClose }) {
  const [q, setQ] = useState(''), [pages, setPages] = useState(null), [error, setError] = useState(''), input = useRef(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      const r = await window.api.tools('pages', { q: q.trim(), connectionId }).catch(e => ({ ok: false, error: e.message }));
      if (!live) return;
      if (r.ok) { setPages(r.pages || []); setError(''); } else setError(r.error);
    }, q ? 300 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q]);
  const watched = new Set(subs.map(s => s.resource_id.replace(/-/g, '')));
  return <div className="tool-picker">
    <strong className="tool-picker-title">{title}</strong>
    <div className="tool-picker-head"><input ref={input} type="search" value={q} placeholder="페이지나 DB 검색" aria-label="노션 페이지 검색" onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }} /><button className="ghost" onClick={onClose}>닫기</button></div>
    {error && <p role="alert" className="integration-error">{error}</p>}
    <div className="tool-pages" role="list">
      {!pages && !error && <p className="meta tool-empty">불러오는 중…</p>}
      {pages && !pages.length && <p className="meta tool-empty">{q ? '찾는 페이지가 없어요.' : '노션에서 이 앱에 공유한 페이지가 없어요.'}</p>}
      {pages?.map(p => { const on = watched.has(String(p.id).replace(/-/g, '')); return <button key={p.id} role="listitem" className={'tool-page' + (on ? ' on' : '')} disabled={busy || on} onClick={() => run('subscribe', { resourceId: p.id, type: p.type, connectionId })}>
        <span className="tool-page-icon" aria-hidden="true">{p.icon || (p.type === 'database' ? '🗂️' : '📄')}</span>
        <span className="tool-page-title">{p.title || '제목 없음'}</span>
        <span className={'tool-badge' + (p.type === 'database' ? ' db' : '')}>{p.type === 'database' ? 'DB' : '페이지'}</span>
        {on && <span className="meta">지켜보는 중</span>}
      </button>; })}
    </div>
  </div>;
}

// One connected account: its own 연결 끊기, what it watches, and (Notion) its own page picker.
function Account({ provider, conn, subs, busy, run }) {
  const [picking, setPicking] = useState(false), name = conn.account || '연결된 계정';
  const leave = () => { if (window.confirm(`${PROVIDER_NAMES[provider]} ‘${name}’ 연결을 끊을까요? 가져온 할 일은 그대로 남아요.`)) run('disconnect', { id: conn.id }); };
  return <div className="tool-account" role="group" aria-label={name}>
    <div className="tool-account-head"><span className="tool-account-name connected-label" title={name}>{name}</span><button className="ghost" disabled={busy} onClick={leave}>연결 끊기</button></div>
    {subs.map(s => <Subscription key={s.id} sub={s} busy={busy} run={run} />)}
    {provider === 'google' && !subs.length && <p className="meta tool-empty">캘린더를 불러오는 중…</p>}
    {provider === 'notion' && (picking ? <PagePicker connectionId={conn.id} title={`${name} 페이지 고르기`} subs={subs} busy={busy} run={run} onClose={() => setPicking(false)} />
      : <button className="ghost tool-pick" onClick={() => setPicking(true)}>+ 지켜볼 페이지 고르기</button>)}
  </div>;
}

function ToolCard({ provider, state, waiting, busy, run, connect }) {
  const accounts = toolAccounts(state, provider), on = accounts.length > 0;
  return <section className={'tool-card tool-row' + (on ? ' is-connected' : '')} aria-label={PROVIDER_NAMES[provider]}>
    <div className="tool-head">
      <ProviderIcon provider={provider} size={40} />
      <div className="tool-name"><strong>{PROVIDER_NAMES[provider]}</strong>
        <span className={on && !waiting ? 'connected-label' : 'meta'}>{!state ? '확인하는 중…' : waiting ? '브라우저에서 연결을 마쳐 주세요' : on ? (accounts.length > 1 ? `계정 ${accounts.length}개 연결됨` : '연결됨') : '연결 안 됨'}</span></div>
      <button className={on ? 'ghost' : 'primary'} disabled={busy || !!waiting} onClick={() => connect(provider)}>{waiting ? '기다리는 중…' : on ? '+ 계정 추가' : '연결하기'}</button>
    </div>
    {on && <div className="tool-body">{accounts.map(a => <Account key={a.conn.id} provider={provider} conn={a.conn} subs={a.subs} busy={busy} run={run} />)}</div>}
  </section>;
}

export default function Integrations() {
  const state = useToolsState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [waiting, setWaiting] = useState({});
  const run = async (action, payload) => {
    setBusy(true); setError('');
    try { const r = await toolAction(action, payload); if (!r.ok) setError(r.error); return r; } finally { setBusy(false); }
  };
  // After "연결하기" / "+ 계정 추가" the browser finishes the sign-in: look every 2 s (for up to 2 minutes) until a NEW connection shows up.
  const pending = Object.keys(waiting).length > 0;
  useEffect(() => {
    if (!pending) return undefined;
    const timer = setInterval(refreshTools, 2000);
    return () => clearInterval(timer);
  }, [pending]);
  useEffect(() => {
    const still = stillWaiting(waiting, state, Date.now(), WAIT_MS);
    if (Object.keys(still).length !== Object.keys(waiting).length) setWaiting(still);
    if (!pending) return undefined;
    const t = setTimeout(() => setWaiting(w => ({ ...w })), 2500); // re-check the 2-minute limit
    return () => clearTimeout(t);
  }, [state, waiting]);
  const connect = async provider => { const known = connectionIds(state, provider), r = await run('start', { provider }); if (r.ok) setWaiting(w => ({ ...w, [provider]: { at: Date.now(), known } })); };
  const problem = error || (state && !state.ok ? state.error : '');
  return <div className="tools-list">
    {TOOLS.map(p => <ToolCard key={p} provider={p} state={state?.ok ? state : state && { connections: [], subscriptions: [] }} waiting={waiting[p]} busy={busy} run={run} connect={connect} />)}
    {problem && <p role="alert" className="integration-error">{problem}</p>}
    <p className="desc tools-hint">연결한 곳이 바뀌면 펫이 읽고 할 일로 옮겨 적어요.</p>
  </div>;
}
