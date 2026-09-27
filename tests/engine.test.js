import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {BEARINGS,transition,observation,newTrial,act,shuffle,validateConditions,abilities} from '../docs/engine.js';
const stimuli=JSON.parse(readFileSync(new URL('../docs/stimuli.json',import.meta.url)));
function route(w,p){const q=[[w.start,[]]],seen=new Set([String(w.start)]);for(let i=0;i<q.length;i++){const [c,path]=q[i];if(String(c)===String(w.goal))return path;for(const b of BEARINGS){const t=transition(w,p,c,b);if(t.result!=='blocked'&&!seen.has(String(t.position))){seen.add(String(t.position));q.push([t.position,[...path,b]]);}}}}
test('all compiled movement outcomes match the current Python sandbox',()=>{
  const expected=JSON.parse(execFileSync('python3.11',['scripts/check_parity.py'],{cwd:new URL('..',import.meta.url),maxBuffer:4e6}));
  let count=0;
  for(const [map,profiles] of Object.entries(expected))for(const [profile,rows] of Object.entries(profiles)){
    const w=stimuli.maps[map];
    rows.forEach((row,i)=>row.forEach(([result,position,blocked_by],b)=>{assert.deepEqual(transition(w,profile,[i%w.width,Math.floor(i/w.width)],BEARINGS[b]),{result,position,blocked_by});count++;}));
  }
  assert.equal(count,40500);
});
test('all 45 map/profile combinations reach the goal at Python optimal action count',()=>{
  for(const [map,w] of Object.entries(stimuli.maps))for(const profile of Object.keys(stimuli.profiles)){
    const c={id:map+profile,map_id:map,profile_id:profile,fov_radius:2,prior_knowledge:'none'};
    const t=newTrial(c,w,0,0),path=route(w,profile);
    assert.equal(path.length,w.rules[profile].optimal);
    path.forEach((b,i)=>act(t,w,b,400,i+1));
    assert.equal(t.success,true);assert.equal(t.efficiency,1);assert.equal(t.trail.length,t.actions.length+1);
    assert.throws(()=>act(t,w,'N',400));
  }
});
test('capabilities and full/limited/prior map observations are distinct',()=>{
  const w=stimuli.maps.fence1,c={fov_radius:2,prior_knowledge:'none'};
  assert.equal(observation(w,c,w.start).cells.length,25);
  assert.equal(observation(w,c,w.start).goal,null);
  assert.equal(observation(w,{...c,fov_radius:null},w.start).cells.length,225);
  assert.equal(observation(w,{...c,prior_knowledge:'all'},w.start).cells.length,225);
  assert.equal(observation(w,{...c,prior_knowledge:'all'},w.start,1).cells.length,25);
  assert.equal(transition(w,'P0',[2,10],'S').result,'blocked');
  assert.equal(transition(w,'P_jump',[2,10],'S').result,'jumped');
  assert.match(abilities(stimuli.profiles.P0),/cannot jump/);
  assert.match(abilities(stimuli.profiles.P_swim),/can swim/);
});
test('blocked moves consume the action budget and failed efficiency is null',()=>{
  const c=stimuli.legacy_conditions[0],w=stimuli.maps[c.map_id],t=newTrial(c,w,0,0);
  for(let i=0;i<400;i++)act(t,w,'N',400,i+1);
  assert.equal(t.actions.length,400);assert.equal(t.actions.at(-1).result,'blocked');
  assert.equal(t.success,false);assert.equal(t.efficiency,null);assert.equal(t.reason,'action_limit');
});
test('randomized orders preserve every condition and validation rejects duplicates',()=>{
  validateConditions(stimuli.legacy_conditions,stimuli);
  const orders=new Set();for(let i=0;i<50;i++){const s=shuffle(stimuli.legacy_conditions);assert.equal(new Set(s.map(c=>c.id)).size,5);orders.add(s.map(c=>c.id).join());}
  assert.ok(orders.size>1);
  assert.throws(()=>validateConditions([stimuli.legacy_conditions[0],stimuli.legacy_conditions[0]],stimuli));
});
