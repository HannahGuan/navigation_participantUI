import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BEARINGS,transition} from '../docs/engine.js';
test('five-trial app flow: failed upload keeps backup and retry gates Prolific return',async()=>{
 const stimuli=JSON.parse(readFileSync(new URL('../docs/stimuli.json',import.meta.url)));
 const elements=new Map(),callbacks=new Map(),data=new Map();let saves=0;
 function el(id){if(!elements.has(id))elements.set(id,{hidden:true,disabled:false,value:'',dataset:{},textContent:'',addEventListener(type,fn){callbacks.set(id+':'+type,fn);},focus(){},setAttribute(){},getContext(){return new Proxy({},{get:(o,k)=>o[k]||(()=>{}),set:(o,k,v)=>(o[k]=v,true)});}});return elements.get(id);}
 const controls=BEARINGS.map(b=>{const e=el(b);e.dataset.direction=b;return e;});
 globalThis.document={getElementById:el,querySelectorAll:()=>controls,addEventListener(){}};
 globalThis.location={search:'?PROLIFIC_PID=TEST&STUDY_ID=TEST&SESSION_ID=TEST'};
 globalThis.window={addEventListener(){},scrollTo(){}};
 globalThis.localStorage={setItem:(k,v)=>data.set(k,v),getItem:k=>data.get(k)||null,removeItem:k=>data.delete(k)};
 Object.defineProperty(globalThis,'navigator',{value:{locks:{request:async(k,o,fn)=>fn({})}},configurable:true});
 globalThis.fetch=async url=>{assert.equal(url,'./stimuli.json');return {ok:true,json:async()=>stimuli};};
 globalThis.DataPipe={createSession:()=>({record(){},flush(){},close:async()=>{}}),saveData:async()=>{saves++;return saves===1?{ok:false,status:400,body:{error:'DATA_COLLECTION_NOT_ACTIVE'}}:{ok:true,status:202};}};
 const original=globalThis.setInterval;globalThis.setInterval=()=>0;
 try{await import('../docs/app.js');}finally{globalThis.setInterval=original;}
 const settle=async()=>{for(let i=0;i<10;i++)await new Promise(setImmediate);};
 await settle();assert.equal(el('begin').disabled,false);
 callbacks.get('start-form:submit')({preventDefault(){}});await settle();
 const stored=()=>JSON.parse([...data.values()][0]);assert.equal(new Set(stored().condition_order).size,5);
 for(let i=0;i<5;i++){
  const t=stored().trials.at(-1),w=stimuli.maps[t.condition.map_id],q=[[t.position,[]]],seen=new Set([String(t.position)]);let path;
  for(let j=0;j<q.length;j++){const [p,r]=q[j];if(String(p)===String(w.goal)){path=r;break;}for(const b of BEARINGS){const n=transition(w,t.condition.profile_id,p,b);if(n.result!=='blocked'&&!seen.has(String(n.position))){seen.add(String(n.position));q.push([n.position,[...r,b]]);}}}
  path.forEach(b=>callbacks.get(b+':click')());assert.equal(stored().trials.at(-1).success,true);
  callbacks.get('next:click')();await settle();
 }
 assert.equal(saves,1);assert.ok(stored().completed_at);assert.equal(el('return-prolific').hidden,true);
 assert.equal(el('submit').hidden,false);assert.match(el('error').textContent,/DATA_COLLECTION_NOT_ACTIVE/);
 const frozen=stored().upload.data;callbacks.get('submit:click')();await settle();
 assert.equal(saves,2);assert.equal(stored().upload.status,'queued');assert.equal(stored().upload.data,frozen);
 assert.equal(el('return-prolific').hidden,false);assert.equal(el('return-prolific').href,'https://app.prolific.com/submissions/complete?cc=CSQGOE1Y');
});
