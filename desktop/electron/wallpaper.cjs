const colors = { mint: '#98ddc5', peach: '#ffc2a7', lavender: '#c6b8f0' };
// Pixels come from the renderer (shared/pixel-pet.js); keep only well-formed cells.
const cleanPixels = list => (Array.isArray(list) ? list : []).filter(p => p && Number.isInteger(p.x) && Number.isInteger(p.y) && p.x >= 0 && p.x < 24 && p.y >= 0 && p.y < 24 && /^#[0-9a-f]{3,8}$/i.test(p.color)).slice(0, 576).map(({ x, y, color }) => ({ x, y, color }));
function wallpaperHtml(payload = {}) {
  const p = payload.pet || {};
  const data = JSON.stringify({ name: String(p.name || '모모').slice(0, 40), greeting: String(p.greeting || '오늘의 속도는, 내가 정해요.').slice(0, 150), color: colors[p.color] || colors.mint, pixels: cleanPixels(payload.pixels), x: Number.isFinite(p.x) ? Math.max(.08, Math.min(.92, p.x)) : .78, y: Number.isFinite(p.y) ? Math.max(.15, Math.min(.87, p.y)) : .78 }).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Checker · 시계 월페이퍼</title>
<style>*{box-sizing:border-box}
:root{--bg:linear-gradient(135deg,#f2f3fd,#eef1fb 50%,#f6effa);--blob1:#c7d2fe;--blob2:#fbcfe8;--text:#1e293b;--muted:#64748b;--accent:#6366f1;--accent2:#8b5cf6;--disk:radial-gradient(circle at 30% 22%,rgba(255,255,255,.5),rgba(255,255,255,.26) 62%);--edge:rgba(255,255,255,.65);--glow:rgba(255,255,255,.7);--fill:linear-gradient(165deg,rgba(99,102,241,.26),rgba(139,92,246,.12) 45%,rgba(255,255,255,.4) 60%,rgba(99,102,241,.2));--rim:rgba(99,102,241,.38);--shade:rgba(49,46,129,.2)}
body{margin:0;height:100vh;overflow:hidden;background:var(--bg);color:var(--text);font-family:'Segoe UI','Malgun Gothic',sans-serif;display:grid;place-items:center}
body::before,body::after{content:'';position:fixed;border-radius:50%;filter:blur(90px);opacity:.55;pointer-events:none}
body::before{width:46vmax;height:46vmax;left:-12vmax;top:-14vmax;background:var(--blob1);animation:drift 26s ease-in-out infinite alternate}
body::after{width:52vmax;height:52vmax;right:-16vmax;bottom:-18vmax;background:var(--blob2);animation:drift 32s ease-in-out infinite alternate-reverse}
@keyframes drift{to{transform:translate(6vmax,4vmax) scale(1.08)}}
#dial{position:relative;width:min(100vw - 32px,100vh - 32px);aspect-ratio:1;border-radius:50%;container-type:size;background:var(--disk);border:1px solid var(--edge);box-shadow:inset 0 2px 2px var(--glow),0 24px 70px rgba(49,46,129,.25);backdrop-filter:blur(28px) saturate(170%);-webkit-backdrop-filter:blur(28px) saturate(170%)}
#text{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.4cqw;pointer-events:none;user-select:none}
#date,#time{color:transparent;background:var(--fill);-webkit-background-clip:text;background-clip:text;-webkit-text-stroke:.6px var(--rim);filter:drop-shadow(0 .5cqw 1.4cqw var(--shade)) drop-shadow(0 0 .3cqw rgba(255,255,255,.35))}
#date{font-size:2.6cqw;font-weight:500;letter-spacing:.35em;margin-bottom:-.6cqw}
#time{font-size:13cqw;font-weight:200;font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-.02em}#time small{font-size:.26em;font-weight:300;margin-left:.25em}
#greeting{margin-top:2cqw;font-size:1.9cqw;letter-spacing:.08em;color:var(--muted);opacity:.75}
#clock{position:relative;z-index:1;display:block;width:100%;height:100%;pointer-events:none}
.tick{stroke:var(--muted);stroke-width:1;opacity:.35}.tick.major{stroke:var(--text);stroke-width:2;stroke-linecap:round;opacity:.55}.num{fill:var(--muted);font-size:12px;font-weight:500}
#hour{stroke:var(--text);stroke-width:5;stroke-linecap:round;opacity:.85}#minute{stroke:var(--accent);stroke-width:3;stroke-linecap:round}#second{stroke:var(--accent2);stroke-width:1}#pivot{fill:var(--accent2)}
#pet{position:fixed;z-index:2;width:72px;height:72px;transform:translate(-50%,-50%);touch-action:none;cursor:grab}#pet svg{width:100%;height:100%;image-rendering:pixelated;animation:breathe 4s ease-in-out infinite;transform-origin:50% 90%}
@keyframes breathe{50%{transform:translateY(-3px) scale(1.02,.98)}}
@media(prefers-reduced-motion:reduce){#pet svg,body::before,body::after{animation:none}}</style>
<body><div id="dial"><div id="text"><div id="date"></div><div id="time"></div><div id="greeting"></div></div><svg id="clock" viewBox="0 0 280 280" aria-label="시계"><g id="ticks"></g><line id="hour" x1="140" y1="140" x2="140" y2="82"/><line id="minute" x1="140" y1="140" x2="140" y2="52"/><line id="second" x1="140" y1="156" x2="140" y2="44"/><circle id="pivot" cx="140" cy="140" r="3.5"/></svg></div>
<div id="pet" role="img"><svg viewBox="0 0 24 24" shape-rendering="crispEdges"></svg></div>
<script>const pet=${data};const ns='http://www.w3.org/2000/svg',$=id=>document.getElementById(id),el=$('pet'),add=(parent,tag,attrs)=>{const n=document.createElementNS(ns,tag);for(const k in attrs)n.setAttribute(k,attrs[k]);parent.appendChild(n);return n;};
for(let i=0;i<60;i++){const a=i*Math.PI/30,r=i%5?122:116;add($('ticks'),'line',{class:i%5?'tick':'tick major',x1:140+Math.sin(a)*r,y1:140-Math.cos(a)*r,x2:140+Math.sin(a)*126,y2:140-Math.cos(a)*126});}
[12,3,6,9].forEach(n=>{add($('ticks'),'text',{class:'num',x:140+Math.sin(n*Math.PI/6)*102,y:145-Math.cos(n*Math.PI/6)*102,'text-anchor':'middle'}).textContent=n;});
pet.pixels.forEach(p=>add(el.firstChild,'rect',{x:p.x,y:p.y,width:1,height:1,fill:p.color}));if(!pet.pixels.length)el.style.display='none';
el.setAttribute('aria-label',pet.name);el.title=pet.name;el.style.filter='drop-shadow(0 0 10px '+pet.color+'66)';el.style.left=pet.x*100+'%';el.style.top=pet.y*100+'%';$('greeting').textContent=pet.greeting;
let dragging=false;el.onpointerdown=e=>{dragging=true;el.setPointerCapture(e.pointerId)};el.onpointerup=el.onpointercancel=()=>dragging=false;el.onpointermove=e=>{if(!dragging)return;el.style.left=Math.max(4,Math.min(96,e.clientX/innerWidth*100))+'%';el.style.top=Math.max(6,Math.min(94,e.clientY/innerHeight*100))+'%'};
const pad=x=>String(x).padStart(2,'0'),turn=(id,deg)=>$(id).setAttribute('transform','rotate('+deg+' 140 140)');
function tick(){const n=new Date(),h=n.getHours(),m=n.getMinutes(),s=n.getSeconds();$('date').textContent=(n.getMonth()+1)+'월 '+n.getDate()+'일 '+n.toLocaleDateString('ko-KR',{weekday:'long'});$('time').innerHTML=pad(h)+':'+pad(m)+'<small>'+pad(s)+'</small>';turn('hour',h%12*30+m/2);turn('minute',m*6+s/10);turn('second',s*6);}tick();setInterval(tick,1000);</script></body></html>`;
}
module.exports = { wallpaperHtml };
