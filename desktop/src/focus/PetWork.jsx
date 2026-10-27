import React from 'react';
import { PET_PALETTE } from '../../../shared/pixel-pet.js';
import { PROVIDER_LOGOS } from '../SourceIcons.jsx';

/*
 * The pet doing the tool connections' work (pet_jobs), drawn in the sprite's own 24×24 pixel grid
 * (3 px a pixel on the 72 px pet) and moved by CSS steps in focus.css:
 *   reading  — holds a little page with the tool's logo, eyes scanning the lines
 *   thinking — a thought cloud with … appearing, sparkles around
 *   writing  — a pencil scribbling on a notepad, to-do lines popping in
 *   error    — a tear and sad eyes (with the bubble)
 */
const INK = '#263f3c', PAPER = '#fbfaf4', LINE = '#9aa6b8', GOLD = '#f3d982';
const r = (x, y, w, h, fill, key) => <rect key={key} x={x} y={y} width={w} height={h} fill={fill} />;

// Eyes redrawn over the sprite's (cat and bunny share a face; the dino has one eye at the side).
function Eyes({ pet, look }) {
  const body = (PET_PALETTE[pet.color] || PET_PALETTE.mint)[0];
  if (pet.species === 'dino') return <g>{r(15, 7, 4, 1, body)}<g className={'pet-eyes ' + look}>{r(16, 7, 2, 1, INK)}</g></g>;
  const y = look === 'up' ? 11 : 12;
  return <g>{r(6, 11, 12, 2, body)}
    <g className={'pet-eyes ' + look}>{r(7, y, 2, 1, INK)}{r(15, y, 2, 1, INK)}</g>
    {look === 'sad' && <g>{r(7, 10, 1, 1, INK)}{r(8, 9, 1, 1, INK)}{r(16, 10, 1, 1, INK)}{r(15, 9, 1, 1, INK)}</g>}
  </g>;
}

function Reading({ provider }) {
  return <g className="pet-prop-reading">
    {r(5, 16, 2, 2, INK)}{r(17, 16, 2, 2, INK)}
    {r(6, 14, 12, 9, INK)}{r(7, 15, 10, 7, PAPER)}
    {PROVIDER_LOGOS[provider] && <image href={PROVIDER_LOGOS[provider]} x="8" y="16" width="3" height="3" preserveAspectRatio="xMidYMid meet" />}
    {r(12, 16, 4, 1, LINE)}{r(12, 18, 3, 1, LINE)}{r(8, 20, 8, 1, LINE)}
    <g className="pet-scan">{r(7, 16, 10, 1, '#f3d98266')}</g>
  </g>;
}
function Thinking() {
  return <g className="pet-prop-thinking">
    {r(19, 5, 1, 1, INK)}{r(21, 2, 2, 2, INK)}{r(21.5, 2.5, 1, 1, '#fff')}
    {r(23, -9, 11, 9, INK)}{r(22, -8, 13, 7, INK)}{r(23, -8, 11, 7, '#fff')}
    {[24, 27, 30].map((x, i) => <g key={x} className={'pet-dot d' + i}>{r(x + 0.5, -5, 2, 2, INK)}</g>)}
    {[[-3, 3], [20, 9], [1, -2]].map(([x, y], i) => <g key={i} className={'pet-spark s' + i}>{r(x, y + 1, 3, 1, GOLD)}{r(x + 1, y, 1, 3, GOLD)}</g>)}
  </g>;
}
function Writing() {
  return <g className="pet-prop-writing">
    {r(3, 16, 14, 7, INK)}{r(4, 17, 12, 5, PAPER)}
    {[18, 20].map((y, i) => <g key={y}>{r(5, y, 1, 1, INK)}<g className={'pet-line l' + i}>{r(7, y, i ? 5 : 7, 1, LINE)}</g></g>)}
    <g transform="translate(-1 4)"><g className="pet-pencil">
      {r(19, 9, 1, 1, '#e69ca4')}{r(20, 9, 1, 1, '#e69ca4')}
      {[1, 2, 3].map(k => <g key={k}>{r(19 - k, 9 + k, 1, 1, '#f3c84b')}{r(20 - k, 9 + k, 1, 1, '#d9a632')}</g>)}
      {r(15, 13, 2, 1, '#e8c9a0')}{r(15, 14, 1, 1, INK)}
    </g></g>
  </g>;
}
function Tear() {
  return <g className="pet-tear">{r(8, 13, 1, 2, '#7cc4f2')}</g>;
}

export function PetWork({ pet, work, direction = 1 }) {
  if (!work) return null;
  const { state, provider } = work;
  return <svg className={'pet-work ' + state} viewBox="-12 -14 48 40" shapeRendering="crispEdges" aria-hidden="true" style={{ transform: direction < 0 ? 'scaleX(-1)' : undefined }}>
    {state === 'reading' && <><Reading provider={provider} /><Eyes pet={pet} look="scan" /></>}
    {state === 'thinking' && <><Thinking /><Eyes pet={pet} look="up" /></>}
    {state === 'writing' && <><Writing /><Eyes pet={pet} look="down" /></>}
    {state === 'error' && <><Eyes pet={pet} look="sad" /><Tear /></>}
  </svg>;
}

// Tiny 9×9 pixel icons for the bubble and the phone toast.
export function JobIcon({ kind, provider }) {
  const icon = {
    reading: <>{r(1, 0, 7, 9, INK)}{r(2, 1, 5, 7, PAPER)}{r(3, 3, 3, 1, LINE)}{r(3, 5, 3, 1, LINE)}<g className="pet-scan small">{r(2, 2, 5, 1, '#f3c84baa')}</g></>,
    thinking: <>{[1, 4, 7].map((x, i) => <g key={x} className={'pet-dot d' + i}>{r(x - 0.5, 4, 2, 2, INK)}</g>)}</>,
    writing: <>{r(0, 6, 7, 3, INK)}{r(1, 7, 5, 1, PAPER)}<g className="pet-pencil">{r(6, 0, 2, 2, '#e69ca4')}{r(5, 2, 2, 2, '#f3c84b')}{r(4, 4, 2, 1, '#f3c84b')}{r(4, 5, 1, 1, INK)}</g></>,
    done: <>{[[0, 4], [1, 5], [2, 6], [3, 5], [4, 4], [5, 3], [6, 2], [7, 1]].map(([x, y]) => r(x, y, 2, 2, '#22a06b', x))}</>,
    push: <>{r(0, 4, 6, 1, '#5b5bd6')}{r(5, 2, 1, 5, '#5b5bd6')}{r(6, 3, 1, 3, '#5b5bd6')}{r(7, 4, 1, 1, '#5b5bd6')}</>,
    error: <>{r(1, 0, 7, 9, '#f3d982')}{r(0, 1, 9, 7, '#f3d982')}{r(2, 3, 1, 1, INK)}{r(6, 3, 1, 1, INK)}{r(3, 6, 3, 1, INK)}{r(2, 7, 1, 1, INK)}{r(6, 7, 1, 1, INK)}</>,
  }[kind];
  return <span className="job-icon" aria-hidden="true">
    <svg viewBox="0 0 9 9" shapeRendering="crispEdges">{icon}</svg>
    {provider && PROVIDER_LOGOS[provider] && kind !== 'error' && <img src={PROVIDER_LOGOS[provider]} alt="" draggable={false} />}
  </span>;
}

// What the pet says: a finished import, a change sent back to the tool, or a failure (sad face).
export function PetSay({ say }) {
  if (!say) return null;
  return <span className={'pet-say ' + say.mood} aria-hidden="true"><JobIcon kind={say.mood} provider={say.provider} /><span>{say.text}</span></span>;
}

// Phones have no pet: the same news as a small glass toast at the top.
export function PetToast({ working, bubble }) {
  const show = bubble ? { kind: bubble.mood, text: bubble.text, provider: bubble.provider, key: bubble.id } : working ? { kind: working.state, text: working.text, provider: working.provider, key: working.id + working.state } : null;
  return <div className="pet-toast-slot" role="status" aria-live="polite">
    {show && <div key={show.key} className={'pet-toast ' + show.kind}><JobIcon kind={show.kind} provider={show.provider} /><span>{show.text}</span></div>}
  </div>;
}
