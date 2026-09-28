import {CONFIG} from './config.js';
import {validateConditions,newTrial,act,observation,abilities} from './engine.js';
import {Collector,prepareUpload} from './storage.js';
import {assignCondition} from './assignment.js';
import {trialClock} from './timing.js';
import {exportRows as makeRows} from './data.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const identifiers={PROLIFIC_PID:params.get('PROLIFIC_PID') || '',STUDY_ID:params.get('STUDY_ID') || '',SESSION_ID:params.get('SESSION_ID') || ''};
const preview=params.get('preview')==='1' || !identifiers.PROLIFIC_PID;
const storageKey=`${CONFIG.studyVersion}:${preview?'preview:'+ (params.get('condition') || 'random'):identifiers.STUDY_ID+':'+identifiers.PROLIFIC_PID}`;
const collector=new Collector(CONFIG,{preview});
let stimuli, conditions, session, busy=false, lockHeld=false, releaseLock;
let clock=null, chunk=[], storageFailed=false;
const pageOpenedAt=new Date().toISOString(),pageOpenedMono=performance.now();
const now=()=>new Date().toISOString();
function error(message){$('error').textContent=message;$('error').hidden=false;}
function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(session));}
  catch{storageFailed=true;throw new Error('The browser backup could not be saved. Please keep this page open and contact the researcher before continuing.');}
}
function current(){return session?.trials.at(-1);}
function world(){return stimuli.maps[current().condition.map_id];}
function checkpoint(record){collector.record({session_id:session.id,study_version:session.study_version,prolific:session.prolific,...record});}
function flushChunk(){if(chunk.length){checkpoint({kind:'actions',trial_index:current().trial_index,actions:chunk});chunk=[];}collector.flush();}
function startStreaming(){
  collector.start(session.id);
  checkpoint({kind:'session',assignment:session.assignment,started_at:session.started_at,source_library_sha256:stimuli.source_library_sha256});
  // A refresh creates a new staging segment. Replay compact records so partial data
  // remains recoverable. Final records are authoritative; deduplicate partials by session_id.
  for(const t of session.trials){
    checkpoint({kind:'trial_start',trial_index:t.trial_index,condition:t.condition,source_sha256:t.source_sha256,started_at:t.started_at});
    for(let i=0;i<t.actions.length;i+=10)checkpoint({kind:'actions',trial_index:t.trial_index,actions:t.actions.slice(i,i+10)});
    if(t.finished)checkpoint({kind:'trial_end',trial_index:t.trial_index,success:t.success,reason:t.reason,finished_at:t.finished_at});
  }
}
function draw(o) {
  const w=world(),ctx=$('board').getContext('2d'),size=600/w.width;
  ctx.fillStyle='#263a35';ctx.fillRect(0,0,600,600);
  for(let y=0;y<w.height;y++)for(let x=0;x<w.width;x++){ctx.strokeStyle='#ffffff06';ctx.strokeRect(x*size,y*size,size,size);}
  const colors={0:'#dce6c8',1:'#c5a579',2:'#82b7cb',3:'#809b68',5:'#dd9370'};
  for(const c of o.cells){
    const x=c.x*size,y=c.y*size;ctx.fillStyle=colors[c.terrain] || colors[0];ctx.fillRect(x+1,y+1,size-2,size-2);
    if(c.terrain===1){ctx.strokeStyle='#735c3d';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x+7,y+10);ctx.lineTo(x+7,y+30);ctx.moveTo(x+32,y+10);ctx.lineTo(x+32,y+30);ctx.moveTo(x+5,y+17);ctx.lineTo(x+34,y+17);ctx.moveTo(x+5,y+25);ctx.lineTo(x+34,y+25);ctx.stroke();}
    if(c.terrain===2){ctx.fillStyle='#397c9a';ctx.font='24px sans-serif';ctx.textAlign='center';ctx.fillText('≋',x+size/2,y+28);}
    if(c.object_label){ctx.fillStyle='#536b4d';ctx.beginPath();ctx.arc(x+size/2,y+size/2,size*.3,0,Math.PI*2);ctx.fill();}
  }
  if(o.goal){const [x,y]=o.goal;ctx.fillStyle='#c99436';ctx.fillRect(x*size+8,y*size+11,24,21);ctx.strokeStyle='#755927';ctx.lineWidth=2;ctx.strokeRect(x*size+8,y*size+11,24,21);ctx.fillStyle='#fff1a9';ctx.fillRect(x*size+18,y*size+18,5,8);}
  const [x,y]=o.position;ctx.beginPath();ctx.arc((x+.5)*size,(y+.5)*size,size*.29,0,Math.PI*2);ctx.fillStyle='#285c49';ctx.fill();ctx.strokeStyle='white';ctx.lineWidth=3;ctx.stroke();
  $('board').setAttribute('aria-label',`You are at column ${x+1}, row ${y+1}. ${o.goal?'The treasure is visible.':'The treasure is not visible.'}`);
}
function render(){
  if(!session)return;
  const t=current(),done=Boolean(session.completed_at);
  $('welcome').hidden=true;$('play').hidden=done;$('complete').hidden=!done;
  if(done){
    $('progress').textContent='Study complete';
    const saved=['stored','queued','already_stored'].includes(session.upload?.status);
    $('return-prolific').hidden=!saved || preview;
    $('return-prolific').href=CONFIG.completionUrl;
    $('submit').hidden=saved || preview;
    $('submit').textContent='Save responses / retry';
    $('completion-status').textContent=preview?'This preview is complete. You can close this page.':saved?'Your responses have been received. You can now return to Prolific.':'Your responses are saved in this browser. Please keep this page open until the upload is confirmed.';
    return;
  }
  const w=world(),last=t.actions.at(-1),o=observation(w,t.condition,t.position,t.actions.length,last?.result,last?.blocked_by);
  $('progress').textContent='Your navigation task';
  $('moves').textContent=`${t.actions.length} / ${CONFIG.maxActions} moves`;
  $('instruction').textContent=t.condition.instruction || 'No directions are provided for this world. Explore to find the treasure.';
  $('abilities').textContent=abilities(stimuli.profiles[t.condition.profile_id]);
  $('visibility').textContent=t.condition.fov_radius===null?'You can see the whole map.':`You can see ${t.condition.fov_radius} tiles in each direction. Previously visited areas become hidden again.`;
  $('trial-end').hidden=!t.finished;$('outcome').textContent=t.success?'Treasure found!':'This world is complete';
  $('next').textContent='Save and finish →';
  document.querySelectorAll('[data-direction]').forEach(b=>b.disabled=t.finished || !lockHeld);
  $('feedback').textContent=t.finished?(t.success?'You reached the chest.':'You reached the move limit.'):last?.result==='blocked'?`Your path is blocked by ${last.blocked_by}. Choose another direction.`:last?.result==='jumped'?'You jumped over the fence.':'Look around, then choose a direction.';
  draw(o);
}
async function run(fn){if(busy)return;busy=true;$('error').hidden=true;try{await fn();}catch(e){error(e.message);}finally{busy=false;}}
async function acquireLock(){
  if(lockHeld)return;
  if(!navigator.locks)throw new Error('Please use a current desktop Chrome, Firefox, Edge, or Safari browser.');
  await new Promise((resolve,reject)=>{
    navigator.locks.request(storageKey,{ifAvailable:true},async lock=>{
      if(!lock){reject(new Error('This study is already open in another tab. Close that tab and reload here.'));return;}
      lockHeld=true;resolve();await new Promise(r=>{releaseLock=r;});lockHeld=false;
    }).catch(reject);
  });
}
function exportRows(){return makeRows(session,stimuli,CONFIG);}
async function submit(){
  if(preview || !session.completed_at)return;
  await prepareUpload(session,exportRows());persist();
  $('save-status').hidden=false;$('save-status').textContent='Saving your responses…';$('submit').disabled=true;
  try{
    session.upload.status=await collector.submit(session.upload);session.upload.confirmed_at=now();persist();
    $('save-status').textContent='Upload confirmed.';
  }finally{$('submit').disabled=false;render();}
}
function addTrial(){
  if(session.trials.length)throw new Error('This session already has its one assigned trial.');
  const c=session.conditions[0];
  const t=newTrial(c,stimuli.maps[c.map_id],session.trials.length);
  session.trials.push(t);clock=trialClock(t);persist();
  checkpoint({kind:'trial_start',trial_index:t.trial_index,condition:c,source_sha256:t.source_sha256,started_at:t.started_at});
}
$('start-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  if(!preview && !globalThis.DataPipe)throw new Error('The data service could not load. Please reload.');
  if(!preview && !CONFIG.collectionEnabled)throw new Error('This study is not open yet.');
  if(!preview && (!identifiers.STUDY_ID || !identifiers.SESSION_ID))throw new Error('Please open the complete study link from Prolific. Study or session ID is missing.');
  await acquireLock();
  const probe=storageKey+':probe';localStorage.setItem(probe,'1');localStorage.removeItem(probe);
  const instructionReadingMs=Math.round(performance.now()-pageOpenedMono);
  const assignmentStartedMono=performance.now();
  const assigned=await assignCondition(conditions,{preview,previewIndex:params.get('condition'),
    client:globalThis.DataPipe,experimentId:CONFIG.experimentId});
  session={schema_version:3,id:crypto.randomUUID(),study_version:CONFIG.studyVersion,prolific:identifiers,
    participant_id:identifiers.PROLIFIC_PID || 'PREVIEW',
    preview,started_at:now(),page_opened_at:pageOpenedAt,
    instruction_reading_ms:instructionReadingMs,assignment_wait_ms:Math.round(performance.now()-assignmentStartedMono),
    conditions:[assigned.condition],assignment:assigned.assignment,trials:[],browser_events:[]};
  session.stimuli=stimuli;
  persist();startStreaming();addTrial();render();$('board').focus({preventScroll:true});window.scrollTo(0,0);
});});
function move(bearing){
  if(storageFailed || busy || !lockHeld || !session || session.completed_at || current().finished)return;
  try{
    const sample=clock.sample();act(current(),world(),bearing,CONFIG.maxActions,sample.timestamp_ms,null,sample);
    persist();chunk.push(current().actions.at(-1));
    if(chunk.length>=10 || current().finished)flushChunk();
    if(current().finished)checkpoint({kind:'trial_end',trial_index:current().trial_index,success:current().success,reason:current().reason,finished_at:current().finished_at});
    render();
    if(current().finished)run(finishStudy);
  }catch(e){error(e.message);}
}
document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>move(b.dataset.direction)));
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,a') || (e.target.matches('button') && !e.target.dataset.direction) || e.altKey || e.ctrlKey || e.metaKey)return;
  const b={ArrowUp:'N',ArrowRight:'E',ArrowDown:'S',ArrowLeft:'W',w:'N',d:'E',s:'S',a:'W'}[e.key];
  if(b && session && !session.completed_at){e.preventDefault();if(!e.repeat)move(b);}
});
async function finishStudy(){
  if(storageFailed || !current()?.finished || session.completed_at)return;
  flushChunk();session.completed_at=now();persist();render();await submit();
}
$('next').addEventListener('click',()=>run(finishStudy));
$('submit').addEventListener('click',()=>run(submit));
document.addEventListener('visibilitychange',()=>{
  if(!session || session.completed_at)return;
  session.browser_events.push({type:'visibility',state:document.visibilityState,at:now(),trial_index:current()?.trial_index});
  try{if(clock && !current().finished)clock.sample();persist();flushChunk();}catch(e){error(e.message);}
});
window.addEventListener('pagehide',()=>{try{if(session && !session.completed_at){clock?.sample();persist();flushChunk();}}catch{}releaseLock?.();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
setInterval(()=>{if(session && !session.completed_at)try{if(clock && !current().finished)clock.sample();persist();flushChunk();}catch(e){error(e.message);}},10000);
async function init(){
  const response=await fetch('./stimuli.json');if(!response.ok)throw new Error('The study maps could not load. Please reload.');
  stimuli=await response.json();conditions=CONFIG.conditions || stimuli.legacy_conditions;validateConditions(conditions,stimuli);
  $('board').tabIndex=0;
  if(preview)document.title='Preview · Navigation study';
  const saved=localStorage.getItem(storageKey);
  if(saved){
    session=JSON.parse(saved);
    if(session.study_version!==CONFIG.studyVersion)throw new Error('The study version changed. Please contact the researcher; your existing browser backup has been preserved.');
    await acquireLock();stimuli=session.stimuli;
    if(current() && !current().finished)clock=trialClock(current(),{resume:true});
    session.browser_events.push({type:'resume',at:now(),trial_index:current()?.trial_index,...clock?.resumeInfo});persist();
    if(!session.upload || !['stored','queued','already_stored'].includes(session.upload.status))startStreaming();
    if(!current())addTrial();render();
    if(current().finished && !session.completed_at)await finishStudy();
  }
  $('begin').disabled=false;

}
init().catch(e=>error(e.message));
