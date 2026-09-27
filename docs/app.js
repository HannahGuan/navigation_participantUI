import {CONFIG} from './config.js';
import {shuffle,validateConditions,newTrial,act,observation,abilities} from './engine.js';
import {Collector,prepareUpload} from './storage.js';
const $=id=>document.getElementById(id);
const params=new URLSearchParams(location.search);
const identifiers={PROLIFIC_PID:params.get('PROLIFIC_PID') || '',STUDY_ID:params.get('STUDY_ID') || '',SESSION_ID:params.get('SESSION_ID') || ''};
const preview=params.get('preview')==='1' || !identifiers.PROLIFIC_PID;
const storageKey=`navigation-v2:${preview?'preview':identifiers.STUDY_ID+':'+identifiers.SESSION_ID+':'+identifiers.PROLIFIC_PID}`;
const collector=new Collector(CONFIG,{preview});
let stimuli, conditions, session, busy=false, lockHeld=false, releaseLock;
let lastActionAt=performance.now(), chunk=[], storageFailed=false;
const now=()=>new Date().toISOString();
function error(message){$('error').textContent=message;$('error').hidden=false;}
function persist(){
  try{localStorage.setItem(storageKey,JSON.stringify(session));}
  catch{storageFailed=true;throw new Error('The browser backup could not be saved. Please download your backup and contact the researcher before continuing.');}
}
function current(){return session?.trials.at(-1);}
function world(){return stimuli.maps[current().condition.map_id];}
function checkpoint(record){collector.record({session_id:session.id,study_version:session.study_version,prolific:session.prolific,...record});}
function flushChunk(){if(chunk.length){checkpoint({kind:'actions',trial_index:current().trial_index,actions:chunk});chunk=[];}collector.flush();}
function startStreaming(){
  collector.start(session.id);
  checkpoint({kind:'session',condition_order:session.condition_order,started_at:session.started_at,source_library_sha256:stimuli.source_library_sha256});
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
  $('welcome').hidden=true;$('play').hidden=done;$('complete').hidden=!done;$('backup').hidden=false;
  if(done){
    $('progress').textContent='Study complete';$('session-label').textContent=`Session: ${session.id}`;
    const saved=['stored','queued','already_stored'].includes(session.upload?.status);
    $('return-prolific').hidden=!saved || preview;
    $('return-prolific').href=CONFIG.completionUrl;
    $('submit').hidden=saved || preview;
    $('submit').textContent='Save responses / retry';
    $('completion-status').textContent=preview?'Preview complete. No data was uploaded to the study.':saved?'Your responses have been received. You can now return to Prolific.':'Your responses are saved in this browser. Please keep this page open until the upload is confirmed.';
    return;
  }
  const w=world(),last=t.actions.at(-1),o=observation(w,t.condition,t.position,t.actions.length,last?.result,last?.blocked_by);
  $('progress').textContent=`World ${t.trial_index} of ${session.conditions.length}`;
  $('moves').textContent=`${t.actions.length} / ${CONFIG.maxActions} moves`;
  $('instruction').textContent=t.condition.instruction || 'No directions are provided for this world. Explore to find the treasure.';
  $('abilities').textContent=abilities(stimuli.profiles[t.condition.profile_id]);
  $('visibility').textContent=t.condition.fov_radius===null?'You can see the whole map.':`You can see ${t.condition.fov_radius} tiles in each direction. Previously visited areas become hidden again.`;
  $('trial-end').hidden=!t.finished;$('outcome').textContent=t.success?'Treasure found!':'This world is complete';
  $('next').textContent=t.trial_index===session.conditions.length?'Finish study →':'Next world →';
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
function exportRows(){
  return session.trials.map(t=>({...t,session_id:session.id,study_version:session.study_version,
    experiment_id:CONFIG.experimentId,prolific:session.prolific,participant_id:session.participant_id,
    condition_order:session.condition_order,completed_at:session.completed_at,
    capabilities:stimuli.profiles[t.condition.profile_id],max_actions:CONFIG.maxActions,
    source_library_sha256:stimuli.source_library_sha256,
    browser_events:session.browser_events,display:{current_fov_only:true,persistent_instructions:true}}));
}
async function submit(){
  if(preview || !session.completed_at)return;
  await prepareUpload(session,exportRows());persist();
  $('save-status').textContent='Uploading your responses…';$('submit').disabled=true;
  try{
    session.upload.status=await collector.submit(session.upload);session.upload.confirmed_at=now();persist();
    $('save-status').textContent='Upload confirmed.';
  }finally{$('submit').disabled=false;render();}
}
function addTrial(){
  const c=session.conditions[session.trials.length];
  const t=newTrial(c,stimuli.maps[c.map_id],session.trials.length);
  session.trials.push(t);persist();lastActionAt=performance.now();
  checkpoint({kind:'trial_start',trial_index:t.trial_index,condition:c,source_sha256:t.source_sha256,started_at:t.started_at});
}
$('start-form').addEventListener('submit',event=>{event.preventDefault();run(async()=>{
  if(!preview && !globalThis.DataPipe)throw new Error('The data service could not load. Please reload.');
  if(!preview && !CONFIG.collectionEnabled)throw new Error('This study is not open yet.');
  if(!preview && (!identifiers.STUDY_ID || !identifiers.SESSION_ID))throw new Error('Please open the complete study link from Prolific. Study or session ID is missing.');
  await acquireLock();
  const probe=storageKey+':probe';localStorage.setItem(probe,'1');localStorage.removeItem(probe);
  session={schema_version:2,id:crypto.randomUUID(),study_version:CONFIG.studyVersion,prolific:identifiers,
    participant_id:identifiers.PROLIFIC_PID || $('participant').value.trim() || 'PREVIEW',
    preview,started_at:now(),conditions:shuffle(conditions),trials:[],browser_events:[]};
  session.condition_order=session.conditions.map(c=>c.id);
  // Store the map snapshots used for this session so refreshes cannot silently change stimuli.
  session.stimuli=stimuli;
  persist();startStreaming();addTrial();render();$('board').focus({preventScroll:true});window.scrollTo(0,0);
});});
function move(bearing){
  if(storageFailed || busy || !lockHeld || !session || session.completed_at || current().finished)return;
  try{
    const stamp=performance.now();act(current(),world(),bearing,CONFIG.maxActions,Date.now(),Math.round(stamp-lastActionAt));
    lastActionAt=stamp;persist();chunk.push(current().actions.at(-1));
    if(chunk.length>=10 || current().finished)flushChunk();
    if(current().finished)checkpoint({kind:'trial_end',trial_index:current().trial_index,success:current().success,reason:current().reason,finished_at:current().finished_at});
    render();
  }catch(e){error(e.message);}
}
document.querySelectorAll('[data-direction]').forEach(b=>b.addEventListener('click',()=>move(b.dataset.direction)));
document.addEventListener('keydown',e=>{
  if(e.target.matches('input,textarea,a') || (e.target.matches('button') && !e.target.dataset.direction) || e.altKey || e.ctrlKey || e.metaKey)return;
  const b={ArrowUp:'N',ArrowRight:'E',ArrowDown:'S',ArrowLeft:'W',w:'N',d:'E',s:'S',a:'W'}[e.key];
  if(b && session && !session.completed_at){e.preventDefault();if(!e.repeat)move(b);}
});
$('next').addEventListener('click',()=>run(async()=>{
  if(storageFailed || !current()?.finished || session.completed_at)return;
  flushChunk();
  if(session.trials.length===session.conditions.length){session.completed_at=now();persist();render();await submit();}
  else{addTrial();render();$('board').focus({preventScroll:true});window.scrollTo(0,0);}
}));
$('submit').addEventListener('click',()=>run(submit));
function download(){if(!session)return;const blob=new Blob([JSON.stringify(exportRows(),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`navigation-${session.id}-backup.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('download').addEventListener('click',download);$('backup').addEventListener('click',download);
document.addEventListener('visibilitychange',()=>{
  if(!session || session.completed_at)return;
  session.browser_events.push({type:'visibility',state:document.visibilityState,at:now(),trial_index:current()?.trial_index});
  try{persist();flushChunk();}catch(e){error(e.message);}
});
window.addEventListener('pagehide',()=>{try{flushChunk();}catch{}releaseLock?.();});
window.addEventListener('pageshow',e=>{if(e.persisted)location.reload();});
setInterval(()=>{if(session && !session.completed_at)try{flushChunk();}catch(e){error(e.message);}},10000);
async function init(){
  const response=await fetch('./stimuli.json');if(!response.ok)throw new Error('The study maps could not load. Please reload.');
  stimuli=await response.json();conditions=CONFIG.conditions || stimuli.legacy_conditions;validateConditions(conditions,stimuli);
  $('board').tabIndex=0;
  $('participant').required=false;
  if(preview){$('mode-note').hidden=false;$('mode-note').textContent='Preview mode — no participant data will be uploaded and no Prolific completion will be submitted.';$('participant').value='PREVIEW';}
  else{$('participant-field').hidden=true;$('participant').value=identifiers.PROLIFIC_PID;}
  const saved=localStorage.getItem(storageKey);
  if(saved){
    session=JSON.parse(saved);
    if(session.study_version!==CONFIG.studyVersion)throw new Error('The study version changed. Please contact the researcher; your existing browser backup has been preserved.');
    await acquireLock();stimuli=session.stimuli;
    session.browser_events.push({type:'resume',at:now(),trial_index:current()?.trial_index});persist();
    if(!session.upload || !['stored','queued','already_stored'].includes(session.upload.status))startStreaming();
    if(!current())addTrial();render();
  }
  $('begin').disabled=false;
  $('save-status').textContent=preview?'Preview saves stay in this browser.':'Your progress is backed up in this browser and uploaded during the study.';
}
init().catch(e=>error(e.message));
