import React, { useEffect, useRef, useState } from 'react';
import { DEFAULT_PET, PetSprite } from './Pet.jsx';
import { createPet, stepPet, summonPet, hidePet, movePetTo, releasePet, petHop, petRoom } from '../../../shared/pixel-pet.js';

export default function RoamingPet({ db, room = 0 }) {
  const pet={...DEFAULT_PET,...db.settings.focusPet};
  const model=useRef(createPet(innerWidth,innerHeight)),element=useRef(null),drag=useRef(null),moved=useRef(false),reduced=useRef(false);
  const instance=useRef('pet-'+Math.random().toString(36).slice(2)),view=useRef(room);view.current=room;
  const [sprite,setSprite]=useState({pose:'enter',frame:0,direction:-1,hidden:false});
  const completed=useRef(db.todos.filter(t=>t.status==='done').length);
  const call=()=>summonPet(model.current,innerWidth,innerHeight,view.current);
  useEffect(()=>{
    const count=db.todos.filter(t=>t.status==='done').length;
    if(count>completed.current)call();completed.current=count;
  },[db.todos]);
  useEffect(()=>{
    let frame,last=0,report=0;
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const preference=()=>{reduced.current=media.matches;};preference();media.addEventListener('change',preference);
    const leave=()=>hidePet(model.current,innerWidth);
    window.addEventListener('checker:pet-call',call);window.addEventListener('checker:pet-hide',leave);
    const tick=time=>{
      const s=model.current;
      if(!document.hidden)stepPet(s,last?(time-last)/1000:0,innerWidth,innerHeight,Math.random,reduced.current,view.current);
      last=time;
      if(element.current){
        const spot=place(s),style=element.current.style;
        style.visibility=s.hidden||!spot?'hidden':'visible';
        if(spot){style.transform=`translate3d(${Math.round(spot.x)}px,${Math.round(spot.y-petHop(s,reduced.current))}px,0)`;style.zIndex=spot.under?'70':'120';}
        element.current.dataset.x=String(Math.round(s.x));element.current.dataset.y=String(Math.round(s.y));element.current.dataset.phase=s.mode;element.current.dataset.room=['manage','main','clock'][petRoom(s,innerWidth)+1];
      }
      if(time-report>110){report=time;setSprite({pose:s.mode,frame:s.frame,direction:s.direction,hidden:s.hidden});}
      frame=requestAnimationFrame(tick);
    };
    frame=requestAnimationFrame(tick);
    return()=>{cancelAnimationFrame(frame);media.removeEventListener('change',preference);window.removeEventListener('checker:pet-call',call);window.removeEventListener('checker:pet-hide',leave);};
  },[]);
  // Rooms: teams/buckets (-1), main (0), clock (1). The room being viewed shows its pet on top; a
  // main-room pet stays visible but under the frosted side sheet; a pet in another side room is out of sight.
  const place=s=>{
    const r=petRoom(s,innerWidth);
    if(r===view.current)return {x:s.x-r*innerWidth,y:s.y};
    return r===0?{x:s.x,y:s.y,under:true}:null;
  };
  const toWorld=(x,y)=>({x:x+view.current*innerWidth,y});
  const grab=(e,s)=>{const spot=place(s)||s;drag.current={x:e.clientX-spot.x,y:e.clientY-spot.y,startX:e.clientX,startY:e.clientY};};
  const dragTo=e=>{const w=toWorld(e.clientX-drag.current.x,e.clientY-drag.current.y);movePetTo(model.current,w.x,w.y,innerWidth,innerHeight,view.current);};
  return <div className="pet-world" aria-label="화면을 돌아다니는 도트 펫">
    <button ref={element} className="roaming-pet" data-pet-instance={instance.current} aria-label={`${pet.name} 도트 펫`} title={`${pet.name} · 끌어서 이동 · 우클릭하면 쉬러 가요`} style={{visibility:'hidden'}}
      onPointerDown={e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();grab(e,model.current);moved.current=false;movePetTo(model.current,model.current.x,model.current.y,innerWidth,innerHeight,view.current);try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}}}
      onPointerMove={e=>{if(!drag.current)return;e.preventDefault();e.stopPropagation();if(Math.hypot(e.clientX-drag.current.startX,e.clientY-drag.current.startY)>5)moved.current=true;dragTo(e);}}
      onPointerUp={e=>{if(!drag.current)return;e.stopPropagation();drag.current=null;releasePet(model.current);}}
      onPointerCancel={()=>{drag.current=null;releasePet(model.current);}}
      onClick={()=>{if(moved.current){moved.current=false;return;}call();}}
      onContextMenu={e=>{if(e.ctrlKey)return;e.preventDefault();e.stopPropagation();hidePet(model.current,innerWidth);}}>
      <PetSprite pet={pet} pose={sprite.pose} frame={sprite.frame} direction={sprite.direction}/>
    </button>
    <button className="pet-call-button" aria-label="펫 부르기" title={`${pet.name} 부르기`} onClick={call}>
      <svg viewBox="0 0 16 16" aria-hidden="true" shapeRendering="crispEdges"><path d="M2 3h3v4H2zM6 1h3v4H6zM11 3h3v4h-3zM5 8h6v2h2v4H3v-4h2z" fill="currentColor"/></svg>
    </button>
  </div>;
}
