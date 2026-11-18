import test from 'node:test';
import assert from 'node:assert/strict';
import * as module from './worker/index.mjs';
const route='/api/owner/allocations',secret='test-only-inspection-secret-at-least-32-characters';
const makeRequest=(key=secret)=>new Request('https://liudu.example'+route,{headers:{'X-Liudu-Owner-Key':key}});
test('inspection denies missing/wrong keys and unconfigured backend without reading storage',async()=>{
  assert.equal(typeof module.ownerInspection,'function');let reads=0;const bucket={get:async()=>{reads++;throw Error('should not read');}};
  for(const key of ['', 'wrong'])assert.equal((await module.ownerInspection(makeRequest(key),bucket,{route,secret})).status,403);
  assert.equal((await module.ownerInspection(makeRequest(),bucket,{route,secret:undefined})).status,403);
  assert.equal(reads,0);
});
test('inspection returns latest allocation time independently of visibility and never exports credentials or writes',async()=>{
  assert.equal(typeof module.ownerInspection,'function');
  const state={targets:[{id:'001',image:'/avatars/1.png'}],users:{'name:张继元':{name:'张继元'}},versions:[{user:'name:张继元',time:100,kind:'allocation',values:{'001':100},visibility:'public'},{user:'name:张继元',time:200,kind:'visibility',values:{'001':100},visibility:'hidden'}],passwordAccounts:{张继元:{passwordHash:'secret-never-export',token:'token-never-export'}},accounts:{张继元:'old-secret'}};
  let writes=0;const bucket={get:async()=>({etag:'1',json:async()=>state}),put:async()=>{writes++;throw Error('read only');}};
  const result=await module.ownerInspection(makeRequest(),bucket,{route,secret});assert.equal(result.status,200);
  const report=await result.json(),person=report.participants.find(p=>p.name==='张继元');
  assert.equal(report.participants.length,24);assert.equal(person.allocationAt,100);assert.equal(person.latestRecordAt,200);assert.equal(person.visibility,'hidden');assert.equal(person.timeKind,'submission');assert.equal(person.values['001'],100);assert.equal(report.participants.find(p=>p.name==='吴日成').values,null);assert.equal(writes,0);
  for(const forbidden of ['secret-never-export','token-never-export','old-secret','passwordHash','passwordAccounts'])assert.ok(!JSON.stringify(report).includes(forbidden));
});
test('legacy times are labeled as records rather than invented submission timestamps',async()=>{
  assert.equal(typeof module.ownerInspection,'function');
  const bucket={get:async()=>({json:async()=>({targets:[],users:{old:{name:'吴日成'}},versions:[{user:'old',time:123,values:{'001':100},visibility:'public'}]})})};
  const result=await module.ownerInspection(makeRequest(),bucket,{route,secret});const p=(await result.json()).participants[0];assert.equal(p.name,'吴日成');assert.equal(p.timeKind,'legacy_record');assert.equal(p.allocationAt,123);
});
test('ordinary account cookies and forged identity headers cannot query owner endpoint',async()=>{
  let value=null,writes=0;
  const bucket={get:async()=>value?{etag:String(writes),json:async()=>JSON.parse(value)}:null,put:async(key,next)=>{value=next;return {etag:String(++writes)};}};
  const env={BUCKET:bucket,LIUDU_OWNER_READ_KEY:secret};
  const login=await module.default.fetch(new Request('https://liudu.example/api/login',{method:'POST',headers:{Origin:'https://liudu.example','Content-Type':'application/json'},body:JSON.stringify({action:'register',name:'张继元',password:'test-password-123'})}),env);
  assert.equal(login.status,200);const Cookie=login.headers.get('set-cookie').split(';')[0];
  const before=value,count=writes;
  for(const headers of [{Cookie},{Cookie,'oai-authenticated-user-id':'4f8f7009-997f-4f40-97a0-1e6925387d2f'},{'X-Liudu-Owner-Key':'wrong'},{Authorization:'Bearer '+secret}]){
    assert.equal((await module.default.fetch(new Request('https://liudu.example'+route,{headers}),env)).status,403);
  }
  const allowed=await module.default.fetch(new Request('https://liudu.example'+route,{headers:{'X-Liudu-Owner-Key':secret}}),env);
  assert.equal(allowed.status,200);assert.equal((await allowed.json()).participants.length,24);assert.equal(value,before);assert.equal(writes,count);
});
