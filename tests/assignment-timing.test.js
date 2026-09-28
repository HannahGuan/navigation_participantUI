import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {assignCondition} from '../docs/assignment.js';
import {trialClock} from '../docs/timing.js';
import {newTrial,act} from '../docs/engine.js';
import {exportRows} from '../docs/data.js';
import {CONFIG} from '../docs/config.js';
const s=JSON.parse(readFileSync(new URL('../docs/stimuli.json',import.meta.url)));
test('15 shared round-robin assignments give 3 starts per condition and exactly one task each',async()=>{
 let index=0;const counts=Array(5).fill(0),client={getCondition:async()=>index++%5};
 for(let i=0;i<15;i++){const a=await assignCondition(s.legacy_conditions,{preview:false,client,experimentId:'test'});counts[a.assignment.index]++;assert.equal(a.condition.id,a.assignment.condition_id);}
 assert.deepEqual(counts,[3,3,3,3,3]);
});
test('preview can select a case offline; live errors and invalid assignment never fall back',async()=>{
 const preview=await assignCondition(s.legacy_conditions,{preview:true,previewIndex:'4',client:null});assert.deepEqual(preview.condition,s.legacy_conditions[4]);assert.equal(preview.assignment.index,4);
 for(const value of [-1,5,NaN,'1',undefined])await assert.rejects(assignCondition(s.legacy_conditions,{preview:false,client:{getCondition:async()=>value}}));
 await assert.rejects(assignCondition(s.legacy_conditions,{preview:false,client:{getCondition:async()=>{throw new Error('offline');}}}),/offline/);
});
test('action timing and trajectory retain blocked moves and jumps; resume gap remains in elapsed and response time',()=>{
 const c=s.legacy_conditions[0],w=s.maps[c.map_id],t=newTrial(c,w,0,1000);
 let wall=1000,mono=0;let clock=trialClock(t,{wall:()=>wall,mono:()=>mono});
 wall=1300;mono=300;let stamp=clock.sample();act(t,w,'N',400,wall,null,stamp);
 assert.equal(t.actions[0].response_ms,300);assert.deepEqual(t.actions[0].from,[2,2]);assert.deepEqual(t.actions[0].to,[2,1]);
 wall=1500;mono=500;clock.sample();
 wall=6500;mono=0;clock=trialClock(t,{wall:()=>wall,mono:()=>mono,resume:true});assert.equal(clock.resumeInfo.resume_gap_ms,5000);
 wall=6700;mono=200;stamp=clock.sample();act(t,w,'N',400,wall,null,stamp);
 assert.equal(t.actions[1].elapsed_ms,5700);assert.equal(t.actions[1].response_ms,5400);
 wall=6900;mono=400;act(t,w,'N',400,wall,null,clock.sample());
 assert.equal(t.actions[2].result,'blocked');assert.deepEqual(t.trajectory[2].position,t.trajectory[3].position);
 assert.equal(t.trajectory.length,t.actions.length+1);
 assert.equal(t.actions[2].timestamp,new Date(6900).toISOString());
 // Full-map source rules preserve a two-cell fence jump in one action.
 t.position=[2,10];wall=7100;mono=600;act(t,w,'S',400,wall,null,clock.sample());
 assert.equal(t.actions[3].result,'jumped');assert.deepEqual(t.actions[3].from,[2,10]);assert.deepEqual(t.actions[3].to,[2,12]);
});
test('clock changes within a page do not reverse elapsed task time',()=>{
 const t=newTrial(s.legacy_conditions[0],s.maps.fence1,0,1000);
 let wall=1000,mono=0;const clock=trialClock(t,{wall:()=>wall,mono:()=>mono});
 wall=500;mono=100;assert.equal(clock.sample().elapsed_ms,100);
 const resumed=trialClock(t,{wall:()=>400,mono:()=>0,resume:true});assert.equal(resumed.resumeInfo.negative_wall_gap,true);assert.equal(resumed.sample().elapsed_ms,100);
});
test('final data includes a reconstructable map, coordinate convention, one assignment and exact action times',()=>{
 const c=s.legacy_conditions[0],w=s.maps[c.map_id],t=newTrial(c,w,0,0);act(t,w,'S',400,250);
 const session={id:'test',study_version:CONFIG.studyVersion,assignment:{index:0},trials:[t],prolific:{},browser_events:[]};
 const [row]=exportRows(session,s,CONFIG);assert.deepEqual(row.map_snapshot.tiles,w.tiles);assert.match(row.coordinate_system,/zero-based/);assert.equal(row.actions[0].elapsed_ms,250);assert.equal(row.trajectory[1].elapsed_ms,250);assert.equal(row.schema_version,3);
});
