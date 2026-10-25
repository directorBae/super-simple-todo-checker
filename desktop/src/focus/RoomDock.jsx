import React, { useEffect, useRef, useState } from 'react';
import ClockWindow from './ClockWindow.jsx';
import Manage from '../views/Manage.jsx';
import { TODO_DRAG_TYPE } from '../focus-utils.mjs';
import { isClockShortcut, isHorizontalSwipe } from './clock-gestures.mjs';

// Three rooms side by side: teams/buckets (-1) ← main (0) → clock (1).
// Ctrl+←/→ (or edge swipes on touch) moves one room at a time; each side room is a full-window glass sheet.
export default function RoomDock({ db, blocked = false, room, setRoom }) {
  const [todoId, setTodoId] = useState('');
  const state = useRef({ room, blocked }); state.current = { room, blocked };
  useEffect(() => {
    if (blocked) setRoom(0);
  }, [blocked]);
  useEffect(() => {
    let pointer = null, dragged = null, suppressClickUntil = 0;
    const editing = target => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])');
    const go = next => { if (!state.current.blocked) setRoom(Math.max(-1, Math.min(1, next))); };
    const reveal = id => { if (state.current.blocked) return; if (id) setTodoId(id); setRoom(1); };
    const keyboard = e => {
      if (e.key === 'Escape') { setRoom(0); return; }
      if (state.current.blocked || editing(e.target) || e.defaultPrevented) return;
      if (isClockShortcut(e)) { e.preventDefault(); go(state.current.room + 1); }
      else if (isClockShortcut(e, 'ArrowLeft')) { e.preventDefault(); go(state.current.room - 1); }
    };
    const context = e => { if (e.ctrlKey && !e.altKey && !e.metaKey && !state.current.blocked && !editing(e.target)) { e.preventDefault(); reveal(); } };
    const requested = e => reveal(e.detail?.id);
    const down = e => {
      if (state.current.blocked || e.button !== 0 || editing(e.target)) return;
      const target = e.target instanceof Element ? e.target : null;
      const edge = target?.closest('.clock-edge-handle') ? 1 : target?.closest('.manage-edge-handle') ? -1 : 0;
      // Dragging to-do rows (and dropping them on the clock) is handled by the notebook's drag (useTodoDrag).
      pointer = { x:e.clientX, y:e.clientY, moved:false, edge, touch:e.pointerType === 'touch', target, swipeAllowed:!target?.closest('.clock-dial,button,a,input,select,textarea') };
    };
    const move = e => {
      if (!pointer) return;
      if (document.body.classList.contains('todo-dragging')) { pointer.moved=true; return; }
      const dx=e.clientX-pointer.x, dy=e.clientY-pointer.y;
      // Pulling an edge handle toward the middle opens that side's room.
      if (pointer.edge === 1 && dx < -32 && Math.abs(dx)>Math.abs(dy)) { reveal(); pointer.moved=true; }
      if (pointer.edge === -1 && dx > 32 && Math.abs(dx)>Math.abs(dy)) { go(-1); pointer.moved=true; }
      // Edge-only opening keeps horizontal task actions and vertical scrolling independent.
      if (pointer.touch && state.current.room === 0 && !pointer.moved && isHorizontalSwipe(dx,dy)) {
        if (pointer.x>innerWidth-36 && dx < -64) { reveal(); pointer.moved=true; }
        else if (pointer.x<36 && dx > 64) { go(-1); pointer.moved=true; }
      }
    };
    const release = e => {
      if (!pointer) return;
      const dx=e.clientX-pointer.x, dy=e.clientY-pointer.y;
      if (pointer.moved) suppressClickUntil=Date.now()+350;
      if (document.body.classList.contains('todo-dragging')) { pointer=null; return; }
      // Swiping a side room back toward the middle returns to the main screen.
      if (pointer.touch && pointer.swipeAllowed && isHorizontalSwipe(dx,dy)) {
        if (pointer.target?.closest('.clock-dock') && dx>64) setRoom(0);
        else if (pointer.target?.closest('.manage-dock') && dx<-64) setRoom(0);
      }
      pointer=null;
    };
    const cancel = () => { pointer=null; };
    const toRoom = e => go(e.detail?.room ?? 0);
    const click = e => { if (Date.now()<suppressClickUntil) { e.preventDefault(); e.stopImmediatePropagation(); } };
    const dragStart = e => { if (Array.from(e.dataTransfer?.types || []).includes(TODO_DRAG_TYPE)) dragged=e.dataTransfer.getData(TODO_DRAG_TYPE); cancel(); };
    const dragOver = e => { if (Array.from(e.dataTransfer?.types || []).includes(TODO_DRAG_TYPE) && e.clientX>innerWidth-120) { e.preventDefault(); reveal(dragged); } };
    const dragEnd = () => { dragged=null; };
    const listeners = [['keydown',keyboard],['contextmenu',context],['checker:clock-open',requested],['checker:room',toRoom],['pointerdown',down],['pointermove',move],['pointerup',release],['pointercancel',cancel],['blur',cancel],['click',click],['dragstart',dragStart],['dragover',dragOver],['dragend',dragEnd]];
    listeners.forEach(([name,fn])=>window.addEventListener(name,fn,{capture:name==='click',passive:false}));
    return () => { cancel(); listeners.forEach(([name,fn])=>window.removeEventListener(name,fn,{capture:name==='click'})); };
  }, []);
  if (blocked) return null;
  return <>
    <button className={'manage-edge-handle'+(room!==0?' is-open':'')} aria-label="팀 · 버킷 펼치기" title="Ctrl + ← · 오른쪽으로 당겨 열기" onClick={()=>setRoom(-1)}>⠿</button>
    <button className={'clock-edge-handle'+(room!==0?' is-open':'')} aria-label={room===1?'시계 접기':'시계 펼치기'} aria-expanded={room===1} title="Ctrl + → 또는 Ctrl + 우클릭 · 왼쪽으로 당겨 열기" onClick={()=>setRoom(room===1?0:1)}>⠿</button>
    {/* Full-window glass sheets over the main screen; they stay mounted so they can slide back out. */}
    <aside className={'manage-dock'+(room===-1?' is-open':'')} role="dialog" aria-label="팀 · 버킷" aria-hidden={room!==-1}>
      <div className="manage-popup"><Manage db={db} onClose={()=>setRoom(0)} /></div>
    </aside>
    <aside className={'clock-dock'+(room===1?' is-open':'')} role="dialog" aria-label="시계" aria-hidden={room!==1}>
      <div className="clock-popup"><ClockWindow db={db} embedded selectedTodoId={todoId} onClose={()=>setRoom(0)} /></div>
    </aside>
  </>;
}
