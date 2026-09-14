import React from 'react';
import apple from './assets/providers/apple-calendar.png';
import google from './assets/providers/google-calendar.png';
import notion from './assets/providers/notion.png';

const logos = { apple, google, notion };
const names = { apple: 'Apple Calendar', google: 'Google Calendar', notion: 'Notion' };
export function ProviderIcon({ provider, size = 52 }) {
  if (!logos[provider]) return null;
  return <span aria-hidden="true" className="provider-logo" style={{ width:size, height:size, borderRadius:size*.2 }}><img src={logos[provider]} alt="" draggable={false} style={{ width:'100%', height:'100%', objectFit:'contain', transform:provider==='apple'?'scale(1.22)':undefined }} /></span>;
}
export function SourceIcons({ todo, size = 16 }) {
  const sources = todo.integration?.sources || [];
  const providers = [...new Set((sources.length ? sources.map(s=>s.provider) : [todo.integration?.provider || (todo.origin?.type==='external' ? todo.origin.provider : null)]).filter(p=>logos[p]))];
  if (!providers.length) return null;
  const label = '출처: ' + providers.map(p=>names[p]).join(', ');
  return <span className="source-icons" role="img" aria-label={label} title={label} style={{gap:size<12?2:4}}>{providers.map(p=><ProviderIcon key={p} provider={p} size={size}/>)}</span>;
}
