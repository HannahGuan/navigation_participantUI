import test from 'node:test';
import assert from 'node:assert/strict';
import {Collector,prepareUpload,accepted} from '../docs/storage.js';
import {CONFIG} from '../docs/config.js';
test('uploads are immutable and content-addressed across retries',async()=>{
  const s={id:'abc'},u=await prepareUpload(s,[{trial_type:'navigation',x:1}]);
  assert.match(u.filename,/^navigation-abc-[a-f0-9]{64}\.json$/);
  assert.equal(await prepareUpload(s,[{x:2}]),u);
  assert.equal(accepted({ok:false,status:400,body:{error:'FILE_EXISTS'}},u),'already_stored');
  assert.equal(accepted({ok:false,status:400,body:{error:'FILE_EXISTS'}},{filename:'subject.json'}),null);
});
test('201 and queued 202 allow completion; rejection/network failure do not',async()=>{
  for(const status of [201,202,400,500,0]){
    let closed=false;
    const client={createSession:()=>({record(){},close:async()=>{closed=true;}}),saveData:async()=>({ok:status===201||status===202,status,body:{error:status===400?'INVALID_DATA':null}})};
    const c=new Collector(CONFIG,{client});c.start('x');
    if(status===201||status===202){assert.equal(await c.submit({filename:'x',data:'[]'}),status===201?'stored':'queued');assert.equal(closed,true);}
    else{await assert.rejects(c.submit({filename:'x',data:'[]'}));assert.equal(closed,false);}
  }
});
test('preview never opens or writes a DataPipe session',async()=>{
  const client=new Proxy({},{get(){throw new Error('Unexpected network access');}});
  const c=new Collector(CONFIG,{preview:true,client});c.start('x');c.record({test:true});c.flush();
  assert.equal(await c.submit({data:'[]'}),'preview');
});
test('checkpoints are bounded and the final upload closes the same staging session',async()=>{
  const records=[],staging={record:r=>records.push(r),close:async()=>{}};
  let options;
  const c=new Collector(CONFIG,{client:{createSession:()=>staging,saveData:async o=>{options=o;return {ok:true,status:201};}}});
  c.start('abc');c.record({kind:'actions',actions:[]});assert.equal(records.length,1);
  assert.throws(()=>c.record({data:'a'.repeat(16384)}));
  await c.submit({filename:'abc.json',data:'[]'});
  assert.equal(options.session,staging);assert.equal(options.experiment_id,'elWePWHpMmnZ');
});
