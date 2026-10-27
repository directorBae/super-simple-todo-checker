import React from 'react';
import apple from './assets/providers/apple-calendar.png';
import google from './assets/providers/google-calendar.png';
import notion from './assets/providers/notion.png';

export const PROVIDER_LOGOS = { apple, google, notion };
export const PROVIDER_NAMES = { notion: '노션', google: '구글 캘린더', apple: 'Apple 캘린더' };
export function ProviderIcon({ provider, size = 52 }) {
  if (!PROVIDER_LOGOS[provider]) return null;
  return <span aria-hidden="true" className="provider-logo" style={{ width:size, height:size, borderRadius:size*.2 }}><img src={PROVIDER_LOGOS[provider]} alt="" draggable={false} style={{ width:'100%', height:'100%', objectFit:'contain', transform:provider==='apple'?'scale(1.22)':undefined }} /></span>;
}
// Where an imported to-do came from (todo.origin, written by the tool connections).
export const sourceOf = todo => { const o = todo?.origin; return o && PROVIDER_LOGOS[o.provider] ? o : null; };
// The small logo at the right end of an imported to-do: a click opens the original page (and does nothing else).
export function SourceMark({ todo, size = 14 }) {
  const o = sourceOf(todo);
  if (!o) return null;
  const label = PROVIDER_NAMES[o.provider] + (o.url ? '에서 열기' : '에서 가져옴');
  const stop = e => e.stopPropagation();
  return <button type="button" className="source-mark" title={label} aria-label={label} aria-disabled={!o.url || undefined} onPointerDown={stop} onMouseDown={stop}
    onClick={e => { e.stopPropagation(); e.preventDefault(); if (o.url) window.api.openExternal?.(o.url); }}><ProviderIcon provider={o.provider} size={size}/></button>;
}
export const SourceIcons = SourceMark;
