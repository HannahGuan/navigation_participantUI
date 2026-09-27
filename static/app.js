'use strict';
const $ = id => document.getElementById(id);
let state = null, busy = false;
let session = sessionStorage.getItem('navigation_session');
async function api(path, payload = {}) {
  const response = await fetch('/api/' + path, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({session_id:session, ...payload})});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Could not contact the study server.');
  return data;
}
async function run(work) {
  if (busy) return;
  busy = true; $('error').hidden = true;
  try { await work(); } catch (error) { $('error').textContent = error.message; $('error').hidden = false; }
  finally { busy = false; }
}
function draw() {
  const ctx = $('board').getContext('2d'), o = state.observation, size = 600 / state.width;
  ctx.fillStyle = '#263a35'; ctx.fillRect(0,0,600,600);
  for(let y=0;y<state.height;y++) for(let x=0;x<state.width;x++) {
    ctx.strokeStyle = '#ffffff06';ctx.strokeRect(x*size,y*size,size,size);
  }
  const colors = {0:'#dce6c8',1:'#c5a579',2:'#82b7cb',3:'#809b68',5:'#dd9370'};
  o.cells.forEach(c => {
    const x=c.x*size,y=c.y*size;
    ctx.fillStyle=colors[c.terrain] || colors[0];ctx.fillRect(x+1,y+1,size-2,size-2);
    if(c.terrain === 1){ctx.strokeStyle='#735c3d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+7,y+10);ctx.lineTo(x+7,y+30);ctx.moveTo(x+32,y+10);ctx.lineTo(x+32,y+30);ctx.moveTo(x+5,y+17);ctx.lineTo(x+34,y+17);ctx.moveTo(x+5,y+25);ctx.lineTo(x+34,y+25);ctx.stroke();}
    if(c.terrain === 2){ctx.fillStyle='#397c9a';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText('≋',x+size/2,y+28);}
    if(c.object_label){ctx.fillStyle='#536b4d';ctx.beginPath();ctx.arc(x+size/2,y+size/2,size*.3,0,Math.PI*2);ctx.fill();}
  });
  if(o.goal){const [x,y]=o.goal;ctx.fillStyle='#c99436';ctx.fillRect(x*size+8,y*size+11,24,21);ctx.strokeStyle='#755927';ctx.lineWidth=2;ctx.strokeRect(x*size+8,y*size+11,24,21);ctx.fillStyle='#fff1a9';ctx.fillRect(x*size+18,y*size+18,5,8);}
  const [x,y]=o.position;ctx.beginPath();ctx.arc((x+.5)*size,(y+.5)*size,size*.29,0,Math.PI*2);ctx.fillStyle='#285c49';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=3;ctx.stroke();
  $('board').setAttribute('aria-label',`You are at column ${x+1}, row ${y+1}. ${o.goal ? 'The treasure is visible.' : 'The treasure is not visible.'}`);
}
function render(data) {
  state=data;session=data.session_id;sessionStorage.setItem('navigation_session',session);
  $('welcome').hidden=true;$('play').hidden=data.complete;$('complete').hidden=!data.complete;
  if(data.complete){$('progress').textContent='Study complete';$('session-label').textContent='Session: '+session;return;}
  $('progress').textContent=`World ${data.trial} of ${data.total}`;
  $('moves').textContent=`${data.observation.step} / ${data.limit} moves`;
  $('instruction').textContent=data.instruction || 'No directions are provided for this world. Explore to find the treasure.';
  $('trial-end').hidden=!data.finished;
  $('outcome').textContent=data.success ? 'Treasure found!' : 'This world is complete';
  $('next').textContent=data.trial===data.total ? 'Finish study →' : 'Next world →';
  document.querySelectorAll('[data-direction]').forEach(b=>b.disabled=data.finished);
  const o=data.observation;
  $('feedback').textContent=data.finished ? (data.success ? 'You reached the chest.' : 'You reached the move limit.') : o.result==='blocked' ? `Your path is blocked by ${o.blocked_by}. Choose another direction.` : o.result==='jumped' ? 'You jumped over the fence.' : 'Look around, then choose a direction.';
  draw();
}
$('start-form').addEventListener('submit',e=>{e.preventDefault();run(async()=>render(await api('start',{participant_id:$('participant').value.trim()})));});
function move(bearing){if(!state || state.complete || state.finished)return;run(async()=>render(await api('action',{bearing,step:state.observation.step})));}
document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>move(b.dataset.direction)));
document.addEventListener('keydown',e=>{if(e.target.matches('input,textarea') || e.altKey || e.ctrlKey || e.metaKey)return;const b={ArrowUp:'N',ArrowRight:'E',ArrowDown:'S',ArrowLeft:'W',w:'N',d:'E',s:'S',a:'W'}[e.key];if(b && state && !state.complete){e.preventDefault();if(!e.repeat)move(b);}});
$('next').addEventListener('click',()=>run(async()=>render(await api('next',{trial:state.trial}))));
$('download').addEventListener('click',()=>run(async()=>{const data=await api('export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`navigation-${session}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}));
const params=new URLSearchParams(location.search);$('participant').value=params.get('PROLIFIC_PID') || params.get('participant_id') || '';
if(session)run(async()=>{try{render(await api('state'));}catch(error){sessionStorage.removeItem('navigation_session');session=null;throw error;}});
