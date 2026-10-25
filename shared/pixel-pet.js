export const PET_PALETTE = { mint:['#98ddc5','#65a991','#d5f3df'], peach:['#ffc2a7','#cf947e','#ffe7cb'], lavender:['#c6b8f0','#9688bf','#eee5ff'] };
export function petPixels(pet = {}, pose = 'idle', frame = 0) {
  const [body,shade,light]=PET_PALETTE[pet.color]||PET_PALETTE.mint;
  const grid=Array.from({length:24},()=>Array(24).fill(null));
  const rect=(x,y,w,h,color)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)if(grid[j]&&i>=0&&i<24)grid[j][i]=color;};
  const ink='#263f3c',pink='#e69ca4',walk=['walk','enter','hide','summon'].includes(pose),step=walk?frame%4:0;
  rect(5,22,15,1,'#152c3030');
  if(pet.species==='dino') {
    rect(9,4,11,10,ink);rect(10,5,9,8,body);rect(17,8,6,6,ink);rect(17,9,5,4,body);
    rect(6,11,12,10,ink);rect(7,12,10,8,body);rect(4,15,5,5,ink);rect(2,16,6,3,body);
    rect(7,9,2,3,shade);rect(5,12,2,3,shade);rect(3,15,2,2,shade);rect(11,14,5,5,light);
    rect(16,7,2,pose==='sleep'?1:2,ink);rect(20,11,2,1,ink);
  } else {
    if(pet.species==='bunny') {rect(6,0,4,9,ink);rect(7,1,2,7,body);rect(14,0,4,9,ink);rect(15,1,2,7,body);rect(7,2,1,4,pink);rect(15,2,1,4,pink);}
    else {rect(4,2,5,7,ink);rect(5,3,3,5,body);rect(6,4,1,3,pink);rect(15,2,5,7,ink);rect(16,3,3,5,body);rect(17,4,1,3,pink);}
    rect(6,14,12,7,ink);rect(7,15,10,5,body);rect(10,16,5,3,light);
    rect(18,15,4,4,ink);rect(20,12+(step===1?1:0),2,5,ink);rect(19,15,2,3,body);rect(21,13+(step===1?1:0),1,3,shade);
    rect(4,6,16,10,ink);rect(3,8,18,6,ink);rect(5,7,14,8,body);rect(4,9,16,5,body);rect(6,8,6,2,light);
    const blink=pose==='sleep'||pose==='idle'&&frame%10===9;
    rect(7,11,2,blink?1:2,ink);rect(15,11,2,blink?1:2,ink);
    if(pose==='jump'){rect(6,10,3,1,ink);rect(15,10,3,1,ink);}
    rect(5,13,2,1,pink);rect(17,13,2,1,pink);rect(11,13,2,1,ink);rect(10,14,1,1,ink);rect(13,14,1,1,ink);
  }
  rect(6-(step===1?1:0),20-(step===3?1:0),5,2,ink);rect(7-(step===1?1:0),20-(step===3?1:0),3,1,shade);
  rect(14+(step===3?1:0),20-(step===1?1:0),5,2,ink);rect(15+(step===3?1:0),20-(step===1?1:0),3,1,body);
  if(pose==='jump'){rect(1,4,1,3,'#f3d982');rect(0,5,3,1,'#f3d982');rect(21,2,1,3,'#f3d982');rect(20,3,3,1,'#f3d982');}
  return grid.flatMap((row,y)=>row.flatMap((color,x)=>color?[{x,y,color}]:[]));
}

const clamp=(n,min,max)=>Math.max(min,Math.min(Math.max(min,max),n));
// Three rooms side by side, sharing one x axis: teams/buckets (room -1), the main screen (room 0)
// and the clock (room 1). The pet rests just past the clock room's right wall.
export const FIRST_ROOM=-1,LAST_ROOM=1;
export const petRoom=(pet,width)=>clamp(Math.floor((pet.x+36)/width),FIRST_ROOM,LAST_ROOM);
const roomSpot=(room,width,ratio)=>room*width+clamp(width*ratio,8,width-80);
export function createPet(width,height,random=Math.random) {
  const y=clamp(height*.65,24,height-90);
  return {x:width+12,y,targetX:width*.74,targetY:y,mode:'enter',direction:-1,age:0,wait:0,frame:0,travel:0,hidden:false};
}
export function summonPet(pet,width,height,room=0) {
  // Keep its real position: both the hop and the trip (through the doorway if needed) begin where it was.
  pet.mode='jump';pet.age=0;pet.hidden=false;pet.afterJump='summon';
  pet.targetX=roomSpot(room,width,.7);pet.targetY=clamp(height*.7,48,height-100);
}
export function hidePet(pet,width) {pet.mode='hide';pet.age=0;pet.hidden=false;pet.targetX=(LAST_ROOM+1)*width+20;pet.targetY=pet.y;}
export function movePetTo(pet,x,y,width,height,room=0) {pet.x=clamp(x,room*width,room*width+width-72);pet.y=clamp(y,0,height-72);pet.mode='drag';pet.hidden=false;pet.age=0;}
export function releasePet(pet) {pet.mode='jump';pet.age=0;pet.afterJump='idle';pet.wait=3;pet.targetX=pet.x;pet.targetY=pet.y;}
export function stepPet(pet,dt,width,height,random=Math.random,reduced=false,view=0) {
  dt=clamp(dt,0,.1);pet.age+=dt;pet.frame=Math.floor(pet.age*(pet.mode==='idle'?2:9));
  if(pet.mode==='drag')return pet;
  if(pet.mode==='jump') {if(pet.age>=.65){pet.mode=pet.afterJump||'idle';pet.age=0;pet.wait=3;}return pet;}
  if(pet.mode==='hidden') {if(!reduced&&pet.age>pet.wait){pet.mode='enter';pet.age=0;pet.hidden=false;pet.targetX=roomSpot(view,width,.76);pet.targetY=clamp(pet.y,20,height-100);}return pet;}
  if(pet.mode==='idle'||pet.mode==='sleep') {
    if(reduced||pet.age<pet.wait)return pet;
    if(random()<.18){hidePet(pet,width);return pet;}
    // Mostly wander where the person is looking, sometimes wander off to a neighbouring room.
    const others=[FIRST_ROOM,0,LAST_ROOM].filter(r=>r!==view),room=random()<.7?view:others[Math.floor(random()*others.length)];
    pet.mode='walk';pet.age=0;pet.targetX=room*width+clamp(16+random()*(width-100),8,width-80);pet.targetY=clamp(55+random()*(height-160),24,height-90);return pet;
  }
  pet.targetY=clamp(pet.targetY,20,height-80);
  if(pet.mode!=='hide')pet.targetX=clamp(pet.targetX,FIRST_ROOM*width+8,(LAST_ROOM+1)*width-80);
  const dx=pet.targetX-pet.x,dy=pet.targetY-pet.y,distance=Math.hypot(dx,dy);
  // A summoned pet dashes through the other room and slows down as it reaches you.
  const speed=pet.mode==='summon'?Math.max(220,distance*1.6):pet.mode==='enter'||pet.mode==='hide'?95:58;
  if(dx)pet.direction=dx>0?1:-1;
  if(distance<=speed*dt+1) {
    pet.x=pet.targetX;pet.y=pet.targetY;pet.age=0;
    if(pet.mode==='hide'){pet.mode='hidden';pet.hidden=true;pet.wait=10+random()*14;}
    else{pet.mode='idle';pet.wait=2+random()*4;}
  } else if(distance) {const delta=reduced?distance:speed*dt;pet.x+=dx/distance*delta;pet.y+=dy/distance*delta;pet.travel+=delta;}
  return pet;
}
export function petHop(pet,reduced=false){return pet.mode==='jump'&&!reduced?Math.sin(Math.min(1,pet.age/.65)*Math.PI)*28:0;}
