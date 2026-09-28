import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
test('CSV export keeps every timestamped trajectory point, blocked move and jump; prefers complete data over backup',()=>{
 const dir=mkdtempSync(join(tmpdir(),'navigation-export-'));
 try{
  const full=JSON.parse(readFileSync(new URL('../examples/synthetic_session.json',import.meta.url)));
  const backup=structuredClone(full);backup[0].completed_at=null;backup[0].finished=false;backup[0].actions=backup[0].actions.slice(0,2);backup[0].trajectory=backup[0].trajectory.slice(0,3);
  writeFileSync(join(dir,'backup.json'),JSON.stringify(backup));writeFileSync(join(dir,'final.json'),JSON.stringify(full));
  execFileSync('python3.11',['scripts/export_csv.py',join(dir,'backup.json'),join(dir,'final.json'),'--out',join(dir,'csv')],{cwd:new URL('..',import.meta.url)});
  const result=JSON.parse(execFileSync('python3.11',['-c',`import csv,json,pathlib,sys
p=pathlib.Path(sys.argv[1]);print(json.dumps({n:list(csv.DictReader((p/(n+'.csv')).open())) for n in ('trials','actions','trajectory')}))`,join(dir,'csv')]));
  assert.equal(result.trials.length,1);assert.equal(result.trials[0].duration_ms,'3750');
  assert.equal(result.actions.length,15);assert.equal(result.trajectory.length,16);
  assert.equal(result.trajectory[0].elapsed_ms,'0');assert.equal(result.trajectory.at(-1).elapsed_ms,'3750');
  const blocked=result.actions.find(a=>a.result==='blocked');assert.equal(blocked.from_x,blocked.to_x);assert.equal(blocked.from_y,blocked.to_y);
  const jump=result.actions.find(a=>a.result==='jumped');assert.equal(Number(jump.to_y)-Number(jump.from_y),2);
  for(const [i,a] of result.actions.entries()){assert.equal(a.elapsed_ms,String((i+1)*250));assert.equal(a.response_ms,'250');assert.ok(a.timestamp.endsWith('Z'));}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
