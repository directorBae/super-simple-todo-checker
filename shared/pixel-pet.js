// The pastel colours the first pets came in. A pet picked before the species designs (no `design`) keeps its look.
export const PET_PALETTE = { mint:['#98ddc5','#65a991','#d5f3df'], peach:['#ffc2a7','#cf947e','#ffe7cb'], lavender:['#c6b8f0','#9688bf','#eee5ff'] };
// Every animal comes in three designs, each [name, [body, shade, light (muzzle and belly), marking]].
export const PET_SPECIES = [
  { id: 'cat', name: '고양이', designs: [['치즈 고양이', ['#f6b25e', '#c97f2c', '#ffe9c4', '#d07a28']], ['턱시도 고양이', ['#3d4250', '#262a33', '#f6f5f0', '#262a33']], ['삼색 고양이', ['#f8f4ec', '#d2c9b8', '#ffffff', '#e8964a']]] },
  { id: 'dog', name: '강아지', designs: [['시바견', ['#e9a15c', '#b8743a', '#fff3e0', '#fff3e0']], ['달마시안', ['#f8f8f4', '#cfcfc8', '#ffffff', '#2d2f36']], ['비글', ['#f6ecdc', '#c2b096', '#ffffff', '#9a5d2e']]] },
  { id: 'mouse', name: '쥐', designs: [['회색 쥐', ['#b9bcc6', '#878b97', '#e8eaef', '#f2a8b6']], ['흰 쥐', ['#f8f7f3', '#d4d1c8', '#ffffff', '#f4a3b5']], ['햄스터', ['#e9b97f', '#b98547', '#fff6e6', '#f5b6a8']]] },
  { id: 'bunny', name: '토끼', designs: [['흰 토끼', ['#f8f7f4', '#d6d3cb', '#ffffff', '#f2a2b2']], ['갈색 토끼', ['#c49a76', '#94704f', '#f2e2cf', '#f2a2b2']], ['회색 토끼', ['#a9adb8', '#7c8090', '#eceef2', '#f2a2b2']]] },
  { id: 'fox', name: '여우', designs: [['붉은 여우', ['#ec8a3c', '#b75f1f', '#fff6ea', '#3a3330']], ['북극 여우', ['#f2f5f8', '#c6ced8', '#ffffff', '#8a94a3']], ['사막여우', ['#ecd09a', '#bf9d63', '#fff8ea', '#e0a58c']]] },
  { id: 'bear', name: '곰', designs: [['갈색 곰', ['#a8754d', '#7a5133', '#e9c9a5', '#7a5133']], ['판다', ['#f8f8f4', '#d0d1cc', '#ffffff', '#2a2e37']], ['북극곰', ['#f4f2eb', '#d0ccbe', '#ffffff', '#d0ccbe']]] },
  { id: 'penguin', name: '펭귄', designs: [['황제펭귄', ['#39404f', '#242a35', '#f8f8f3', '#f3c24a']], ['쇠푸른펭귄', ['#5585bd', '#3a6195', '#f3f7fb', '#3a6195']], ['바위뛰기펭귄', ['#363941', '#22242a', '#f7f7f2', '#f5d33c']]] },
  { id: 'dino', name: '공룡', designs: [['초록 공룡', ['#8fd18a', '#5d9c59', '#e2f4d6', '#5d9c59']], ['보라 공룡', ['#b9a2ec', '#8a72c0', '#eee7ff', '#8a72c0']], ['주황 공룡', ['#f6a86a', '#c47a3d', '#ffe8d2', '#c47a3d']]] },
];
const speciesOf = (pet = {}) => PET_SPECIES.find((s) => s.id === pet.species) || PET_SPECIES[0];
const designOf = (pet = {}) => pet.design == null ? -1 : Math.min(2, Math.max(0, pet.design | 0)); // -1: the old pastel look
// The colours a pet is drawn in ([body, shade, light, marking]).
export function petColors(pet = {}) {
  const d = designOf(pet);
  if (d < 0 && ['cat', 'bunny', 'dino'].includes(speciesOf(pet).id)) { const p = PET_PALETTE[pet.color] || PET_PALETTE.mint; return [...p, p[1]]; }
  return speciesOf(pet).designs[Math.max(0, d)][1];
}
// What the pet is called in the picker: "치즈 고양이", "판다"… (an old pastel pet is just its animal).
export function petLabel(pet = {}) {
  const s = speciesOf(pet), d = designOf(pet);
  return d < 0 && ['cat', 'bunny', 'dino'].includes(s.id) ? s.name : s.designs[Math.max(0, d)][0];
}
const mix = (a, b, t) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');

export function petPixels(pet = {}, pose = 'idle', frame = 0) {
  const species = speciesOf(pet).id, old = designOf(pet) < 0 && ['cat', 'bunny', 'dino'].includes(species), design = old ? -1 : Math.max(0, designOf(pet));
  const [body, shade, light, mark] = petColors(pet), shine = old ? light : mix(body, '#ffffff', .35);
  const grid=Array.from({length:24},()=>Array(24).fill(null));
  const rect=(x,y,w,h,color)=>{for(let j=y;j<y+h;j++)for(let i=x;i<x+w;i++)if(grid[j]&&i>=0&&i<24)grid[j][i]=color;};
  const ink='#263f3c',pink='#e69ca4',walk=['walk','enter','hide','summon'].includes(pose),step=walk?frame%4:0;
  const blink=pose==='sleep'||pose==='idle'&&frame%10===9,up=step===1?1:0,eyes=pose!=='eyeless';
  let feet=[shade,body];
  rect(5,22,15,1,'#152c3030');
  if(species==='dino') {
    if(!old){rect(11,3,2,2,ink);rect(14,3,2,2,ink);rect(8,6,2,2,ink);rect(11,4,1,1,mark);rect(14,4,1,1,mark);rect(8,7,1,1,mark);} // back plates
    rect(9,4,11,10,ink);rect(10,5,9,8,body);rect(17,8,6,6,ink);rect(17,9,5,4,body);
    rect(6,11,12,10,ink);rect(7,12,10,8,body);rect(4,15,5,5,ink);rect(2,16,6,3,body);
    rect(7,9,2,3,shade);rect(5,12,2,3,shade);rect(3,15,2,2,shade);rect(11,14,5,5,light);
    if(eyes)rect(16,7,2,pose==='sleep'?1:2,ink);rect(20,11,2,1,ink);
  } else if(species==='penguin') {
    // A round dark body with a white face and belly, flippers at the sides, an orange beak and feet.
    rect(4,5,16,11,ink);rect(3,7,18,7,ink);rect(5,6,14,9,body);rect(4,8,16,5,body);rect(7,6,5,1,shine);
    rect(5,14,14,7,ink);rect(6,15,12,5,body);rect(2,14,3,5,ink);rect(3,15,1,3,shade);rect(19,14,3,5,ink);rect(20,15,1,3,shade);
    rect(6,9,12,5,light);rect(8,8,3,1,light);rect(13,8,3,1,light);rect(8,14,8,6,light);
    if(design===0){rect(5,10,2,3,mark);rect(17,10,2,3,mark);rect(9,14,6,1,mix(mark,'#ffffff',.5));} // emperor: gold at the cheeks and neck
    if(design===1){rect(6,9,12,1,body);rect(8,8,8,1,body);}                                         // little blue: a smaller white face
    if(design===2){rect(4,7,5,1,mark);rect(15,7,5,1,mark);rect(3,6,2,1,mark);rect(19,6,2,1,mark);}   // rockhopper: yellow crests
    if(eyes){rect(7,10,2,blink?1:2,ink);rect(15,10,2,blink?1:2,ink);}
    if(pose==='jump'){rect(6,9,3,1,ink);rect(15,9,3,1,ink);}
    rect(5,12,2,1,pink);rect(17,12,2,1,pink);rect(10,12,4,1,'#f0a24a');rect(11,13,2,1,'#c97a2a');
    feet=['#f0a24a','#f6bd6e'];
  } else {
    // Mammals share one head and face (the eyes stay where PetWork redraws them); ears, tails, muzzles and markings differ.
    if(species==='fox') {rect(17,11,6,9,ink);rect(18,12,4,7,body);rect(18,12,4,2,design===1?shade:light);}
    else if(species==='mouse') {if(design===2){rect(18,16,3,3,ink);rect(19,17,1,1,body);}else{rect(17,19,5,1,mark);rect(21,16,1,3,mark);rect(22,15-up,1,1,mark);}}
    else if(species==='bunny'&&!old||species==='bear') {rect(18,15,3,3,ink);rect(19,16,1,1,species==='bunny'?light:body);}
    else {rect(18,15,4,4,ink);rect(20,12+up,2,5,ink);rect(19,15,2,3,body);rect(21,13+up,1,3,old?shade:species==='dog'&&design!==1?light:design===1&&species==='cat'?light:shade);}
    rect(6,14,12,7,ink);rect(7,15,10,5,body);rect(10,16,5,3,light);
    if(species==='bunny') {rect(6,0,4,9,ink);rect(7,1,2,7,body);rect(14,0,4,9,ink);rect(15,1,2,7,body);rect(7,2,1,4,old?pink:mark);rect(15,2,1,4,old?pink:mark);}
    else if(species==='mouse'&&design!==2) {rect(3,1,5,7,ink);rect(2,2,7,5,ink);rect(3,2,5,5,body);rect(4,3,3,3,mark);rect(16,1,5,7,ink);rect(15,2,7,5,ink);rect(16,2,5,5,body);rect(17,3,3,3,mark);}
    else if(species==='bear'||species==='mouse') {const ear=species==='bear'&&design===1?mark:body,inner=species==='mouse'?mark:species==='bear'&&design===1?mark:shade;rect(4,3,5,5,ink);rect(5,4,3,3,ear);rect(6,5,1,1,inner);rect(15,3,5,5,ink);rect(16,4,3,3,ear);rect(17,5,1,1,inner);}
    else if(species==='fox'&&design===2) {rect(2,0,7,9,ink);rect(3,1,5,7,body);rect(4,2,3,5,mark);rect(15,0,7,9,ink);rect(16,1,5,7,body);rect(17,2,3,5,mark);}
    else if(species==='fox') {rect(4,1,5,8,ink);rect(5,2,3,6,body);rect(6,3,1,4,light);rect(5,2,3,1,design===0?mark:shade);rect(15,1,5,8,ink);rect(16,2,3,6,body);rect(17,3,1,4,light);rect(16,2,3,1,design===0?mark:shade);}
    else if(species==='dog'&&design!==0) {} // floppy ears go on after the head
    else {const inner=species==='dog'?light:species==='cat'&&design===1?mark:pink;rect(4,2,5,7,ink);rect(5,3,3,5,body);rect(6,4,1,3,inner);rect(15,2,5,7,ink);rect(16,3,3,5,body);rect(17,4,1,3,inner);}
    rect(4,6,16,10,ink);rect(3,8,18,6,ink);rect(5,7,14,8,body);rect(4,9,16,5,body);rect(6,8,6,2,shine);
    if(species==='dog'&&design!==0) {const ear=design===1?mark:mark;rect(1,7,5,8,ink);rect(2,8,3,6,ear);rect(18,7,5,8,ink);rect(19,8,3,6,ear);}
    // Markings.
    if(!old&&species==='cat') {
      if(design===0){rect(9,7,1,2,mark);rect(11,7,2,2,mark);rect(14,7,1,2,mark);rect(8,15,1,4,mark);rect(15,15,1,4,mark);}
      if(design===1){rect(9,12,6,3,light);rect(9,15,6,5,light);feet=[light,light];}
      if(design===2){rect(5,7,5,3,mark);rect(14,7,5,3,'#3a3633');rect(13,15,4,3,mark);rect(7,17,3,2,'#3a3633');}
    }
    if(species==='dog') {
      if(design===0){rect(4,12,5,3,mark);rect(15,12,5,3,mark);rect(9,12,6,3,mark);rect(7,9,2,1,mark);rect(15,9,2,1,mark);}
      if(design===1){rect(8,7,2,1,mark);rect(14,8,2,1,mark);rect(16,14,1,1,mark);rect(8,16,2,1,mark);rect(14,18,2,1,mark);rect(11,19,1,1,mark);rect(9,12,6,3,light);}
      if(design===2){rect(5,7,14,3,mark);rect(11,7,2,4,light);rect(9,12,6,3,light);rect(7,15,4,3,mark);}
    }
    if(species==='fox'){rect(4,12,5,3,light);rect(15,12,5,3,light);rect(9,13,6,2,light);if(design===0)feet=[mark,mark];}
    if(species==='bear'){rect(9,12,6,3,light);if(design===1){rect(6,10,4,3,mark);rect(14,10,4,3,mark);rect(6,14,12,2,mark);feet=[mark,mark];}}
    if(species==='mouse'){rect(9,12,6,3,light);if(design===2){rect(4,12,4,3,light);rect(16,12,4,3,light);}}
    if(species==='bunny'&&!old)rect(9,12,6,3,light);
    // Face.
    if(eyes)rect(7,11,2,blink?1:2,ink),rect(15,11,2,blink?1:2,ink);
    if(eyes&&!blink&&species==='mouse'&&design===1){rect(8,11,1,1,'#c44d64');rect(16,11,1,1,'#c44d64');}
    if(eyes&&!blink&&species==='bear'&&design===1){rect(8,11,1,1,'#ffffff');rect(16,11,1,1,'#ffffff');}
    if(pose==='jump'){rect(6,10,3,1,ink);rect(15,10,3,1,ink);}
    rect(5,13,2,1,pink);rect(17,13,2,1,pink);
    if(species==='dog'||species==='bear'||species==='fox'){rect(11,12,2,2,ink);rect(10,14,1,1,ink);rect(13,14,1,1,ink);}
    else {rect(11,13,2,1,species==='mouse'||species==='bunny'&&!old?'#e07d93':ink);rect(10,14,1,1,ink);rect(13,14,1,1,ink);}
  }
  rect(6-(step===1?1:0),20-(step===3?1:0),5,2,ink);rect(7-(step===1?1:0),20-(step===3?1:0),3,1,feet[0]);
  rect(14+(step===3?1:0),20-(step===1?1:0),5,2,ink);rect(15+(step===3?1:0),20-(step===1?1:0),3,1,feet[1]);
  if(pose==='jump'){rect(1,4,1,3,'#f3d982');rect(0,5,3,1,'#f3d982');rect(21,2,1,3,'#f3d982');rect(20,3,3,1,'#f3d982');}
  return grid.flatMap((row,y)=>row.flatMap((color,x)=>color?[{x,y,color}]:[]));
}

// Where the eyes are, and the sprite as it looks under them, for the working pet's own moving eyes (PetWork).
export function petEyes(pet = {}) {
  const species = speciesOf(pet).id, box = species === 'dino' ? [[16, 7]] : [[7, species === 'penguin' ? 10 : 11], [15, species === 'penguin' ? 10 : 11]];
  const under = petPixels(pet, 'eyeless').filter((p) => box.some(([x, y]) => p.x >= x - 1 && p.x <= x + 2 && p.y >= y && p.y <= y + 1));
  return { y: box[0][1], x: box.map(([x]) => x), under };
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
