import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CONFIG} from '../docs/config.js';
import {BEARINGS,transition} from '../docs/engine.js';
for(const research of [false,true]) {
test(`${research?'researcher':'participant'} single-trial flow: upload, retry, mode isolation`,async()=>{
 const stimuli=JSON.parse(readFileSync(new URL('../docs/stimuli.json',import.meta.url)));
 const elements=new Map(),callbacks=new Map(),data=new Map();let saves=0,assignments=0;
 function el(id){if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,value:'',dataset:{},textContent:'',addEventListener(type,fn){callbacks.set(id+':'+type,fn);},focus(){},setAttribute(){},getContext(){return new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}});return elements.get(id);}
 const controls=BEARINGS.map(b=>{const e=el(b);e.dataset.direction=b;return e;});
 globalThis.document={getElementById:el,querySelectorAll:()=>controls,addEventListener(){}};
 globalThis.location={search:research?'?condition=1':'?PROLIFIC_PID=TEST&STUDY_ID=TEST&SESSION_ID=TEST'};
 globalThis.window={addEventListener(){},scrollTo(){}};
 globalThis.localStorage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k)};
 Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(k,o,fn)=>fn({})}},configurable:true});
 globalThis.fetch=async url=>{assert.equal(url,'./stimuli.json');return {ok:true,json:async()=>stimuli};};
 globalThis.DataPipe={getCondition:async()=>{assignments++;return 1;},createSession:()=>({record(){},flush(){},close:async()=>{}}),saveData:async()=>{saves++;return saves===1?{ok:false,status:400,body:{error:'DATA_COLLECTION_NOT_ACTIVE'}}:{ok:true,status:202};}};
 const original=globalThis.setInterval;globalThis.setInterval=()=>0;
 try{await import('../docs/app.js?mode-test='+research);}finally{globalThis.setInterval=original;}
 const settle=async()=>{for(let i=0;i<10;i++)await new Promise(setImmediate);};
 await settle();assert.equal(el('begin').disabled,false);
 callbacks.get('start-form:submit')({preventDefault(){}});await settle();
 const stored=()=>JSON.parse([...data.values()][0]);assert.equal(stored().conditions.length,1);assert.equal(stored().assignment.index,CONFIG.fixedConditionId?stimuli.legacy_conditions.findIndex(c=>c.id===CONFIG.fixedConditionId):1);assert.equal(assignments,CONFIG.fixedConditionId||research?0:1);
 for(let i=0;i<1;i++){
  const t=stored().trials.at(-1),w=stimuli.maps[t.condition.map_id],q=[[t.position,[]]],seen=new Set([String(t.position)]);let path;
  for(let j=0;j<q.length;j++){const [p,r]=q[j];if(String(p)===String(w.goal)){path=r;break;}for(const b of BEARINGS){const n=transition(w,t.condition.profile_id,p,b);if(n.result!=='blocked'&&!seen.has(String(n.position))){seen.add(String(n.position));q.push([n.position,[...r,b]]);}}}
  path.slice(0,2).forEach(b=>callbacks.get(b+':click')());
  const savedId=stored().id, savedCondition=stored().assignment.condition_id;
  const oldInterval=globalThis.setInterval;globalThis.setInterval=()=>0;
  try{await import('../docs/app.js?reload-test='+research);}finally{globalThis.setInterval=oldInterval;}
  await settle();assert.equal(assignments,CONFIG.fixedConditionId||research?0:1);assert.equal(stored().id,savedId);assert.equal(stored().assignment.condition_id,savedCondition);
  assert.equal(stored().trials.at(-1).actions.length,2);
  path.slice(2).forEach(b=>callbacks.get(b+':click')());assert.equal(stored().trials.at(-1).success,true);
  await settle();
 }
 assert.equal(saves,1);assert.ok(stored().completed_at);assert.equal(el('return-prolific').hidden,true);
 assert.equal(el('submit').hidden,false);assert.match(el('error').textContent,/DATA_COLLECTION_NOT_ACTIVE/);
 const payload=JSON.parse(stored().upload.data);
 assert.equal(payload.length,1);assert.equal(payload[0].trajectory.length,payload[0].actions.length+1);
 assert.deepEqual(payload[0].actions[0].from,payload[0].map_snapshot.start);
 assert.equal(payload[0].trajectory[0].elapsed_ms,0);assert.ok(payload[0].actions[0].timestamp);
 const frozen=stored().upload.data;callbacks.get('submit:click')();await settle();
 assert.equal(saves,2);assert.equal(stored().upload.status,'queued');assert.equal(stored().upload.data,frozen);
 assert.equal(el('return-prolific').hidden,research);assert.equal(el('another-test').hidden,!research);
 assert.equal(payload[0].is_test,research);assert.equal(payload[0].run_mode,research?'researcher':'participant');
 if(research)assert.match(stored().upload.filename,/navigation-TEST-/);assert.equal(el('return-prolific').href,'https://app.prolific.com/submissions/complete?cc=CSQGOE1Y');
});

}
