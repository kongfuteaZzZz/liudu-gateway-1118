import test from 'node:test';
import assert from 'node:assert/strict';
import app from './worker/index.mjs';

class Bucket {
  value=null;version=0;
  async get(){const value=this.value,etag=String(this.version);return value===null?null:{etag,json:async()=>JSON.parse(value)};}
  async put(key,value,{onlyIf:c}){await new Promise(r=>setTimeout(r,1));if((c.etagMatches&&c.etagMatches!==String(this.version))||(c.etagDoesNotMatch==='*'&&this.value!==null))return null;this.value=value;return {etag:String(++this.version)};}
}
function fixture(bucket=new Bucket()) {
  const cookies={};
  const req=async(user,endpoint,body,extra={})=>{
    const r=await app.fetch(new Request('https://liudu.example/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{Origin:'https://liudu.example',Cookie:cookies[user]||'','Content-Type':'application/json',...extra},body:body===undefined?undefined:JSON.stringify(body)}),{BUCKET:bucket});
    if(r.headers.has('set-cookie'))cookies[user]=r.headers.get('set-cookie').split(';')[0];
    return {status:r.status,data:await r.json(),cookie:cookies[user]};
  };
  const register=(user='a',name='张继元',password='correct-password-123')=>req(user,'login',{action:'register',name,password});
  return {bucket,req,register};
}
const plan=(id='001')=>({values:{[id]:100},visibility:'hidden'});

test('password registration is unique; password required; old cookies revoked; stored data survives',async()=>{
  const f=fixture();
  f.bucket.value=JSON.stringify({created:Date.now(),targets:[{id:'001',image:'/avatars/1.png',created:Date.now()}],users:{'name:张继元':{name:'张继元',image:''}},accounts:{张继元:'a'.repeat(64)},versions:[{user:'name:张继元',time:Date.now()-1,...plan()}],days:{old:{date:'old',rows:[]}}});
  assert.equal((await f.req('old','state',undefined,{Cookie:'liudu_name_session='+'a'.repeat(64)})).status,401);
  assert.notEqual((await f.req('x','login',{name:'张继元'})).status,200);
  assert.equal((await f.register()).status,200);
  assert.equal((await f.register('thief','张继元','another-password-123')).status,409);
  assert.equal((await f.req('thief','login',{name:'张继元',password:'wrong-password-123'})).status,401);
  assert.equal((await f.req('thief','submit',plan('001'))).status,401);
  assert.equal((await f.req('phone','login',{name:'张继元',password:'correct-password-123'})).status,200);
  const view=(await f.req('phone','state')).data;
  assert.equal(view.mine.values['001'],100);assert.equal(view.allocationQuota.used,0);
  assert.ok(JSON.parse(f.bucket.value).days.old);assert.equal(JSON.parse(f.bucket.value).versions.length,1);
  assert.ok(!f.bucket.value.includes('correct-password-123'));
  assert.ok(!JSON.stringify(view).includes('passwordHash'));
});

test('new registration validates name and password, concurrent claim succeeds once',async()=>{
  const f=fixture();
  assert.equal((await f.register('a','名单外')).status,403);
  for(const password of ['', '1234567', 'x'.repeat(129)])assert.equal((await f.register('a','张继元',password)).status,400);
  const results=await Promise.all([f.register('a'),f.register('b')]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
});

test('only a valid allocation consumes the single chance; visibility and login cannot restore it',async()=>{
  const f=fixture();await f.register();
  assert.equal((await f.req('a','submit',{values:{'001':99},visibility:'hidden'})).status,400);
  assert.equal((await f.req('a','submit',{values:{'001':100}})).status,400);
  assert.equal((await f.req('a','submit',plan())).status,200);
  assert.equal((await f.req('a','submit',plan('003'))).status,429);
  assert.equal((await f.req('a','visibility',{visibility:'public'})).status,200);
  await f.req('a','logout',{});await f.req('a','login',{name:'张继元',password:'correct-password-123'});
  assert.equal((await f.req('a','state')).data.allocationQuota.remaining,0);
  assert.equal((await f.req('a','submit',plan('003'))).status,429);
  assert.equal((await f.req('a','state')).data.mine.values['001'],100);
  await f.register('b','吴日成');assert.equal((await f.req('b','state')).data.allocationQuota.remaining,1);
});

test('same-name devices racing for the same chance can submit only once',async()=>{
  const f=fixture();await f.register();await f.req('b','login',{name:'张继元',password:'correct-password-123'});
  const results=await Promise.all([f.req('a','submit',plan('002')),f.req('b','submit',plan('003'))]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,429]);
  assert.equal((await f.req('a','state')).data.allocationQuota.remaining,0);
  assert.equal(JSON.parse(f.bucket.value).versions.length,1);
});

test('evening submission settles first, midnight gives no chance, and 16:00 refills without stacking',async()=>{
  const f=fixture(),original=Date.now;
  const evening=Date.parse('2026-11-18T23:59:00+08:00');
  const afternoon=Date.parse('2026-11-19T16:00:00+08:00');
  try {
    Date.now=()=>evening-1;
    await f.register();await f.register('b','吴日成');
    assert.equal((await f.req('a','submit',plan())).status,200);
    assert.equal((await f.req('a','submit',plan('002'))).status,429);
    assert.equal(JSON.parse(f.bucket.value).days['2026-11-18'],undefined);
    Date.now=()=>evening;
    assert.equal((await f.req('a','submit',plan('002'))).status,200);
    const settled=JSON.parse(f.bucket.value).days['2026-11-18'];
    assert.equal(settled.rows[0].id,'001');
    assert.equal(settled.rows[0].reward,6);
    assert.equal((await f.req('a','state')).data.allocationQuota.nextAt,afternoon);
    await f.req('a','visibility',{visibility:'public'});
    Date.now=()=>evening+60000;
    assert.equal((await f.req('a','submit',plan('003'))).status,429);
    Date.now=()=>afternoon-1;
    assert.equal((await f.req('a','state')).data.allocationQuota.remaining,0);
    assert.equal((await f.req('b','state')).data.allocationQuota.remaining,1);
    Date.now=()=>afternoon;
    for(const user of ['a','b']){
      assert.equal((await f.req(user,'state')).data.allocationQuota.remaining,1);
      assert.equal((await f.req(user,'submit',plan('003'))).status,200);
      assert.equal((await f.req(user,'submit',plan('004'))).status,429);
    }
    assert.deepEqual(JSON.parse(f.bucket.value).days['2026-11-18'],settled);
  } finally {Date.now=original;}
});

test('repeated password guesses lock account temporarily without granting a session',async()=>{
  const f=fixture();await f.register();
  for(let i=0;i<5;i++)assert.equal((await f.req('x','login',{name:'张继元',password:'incorrect-123'})).status,401);
  assert.equal((await f.req('x','login',{name:'张继元',password:'correct-password-123'})).status,429);
  assert.equal((await f.req('x','state')).status,401);
  const data=JSON.parse(f.bucket.value);data.authFailures['张继元'].until=Date.now()-1;f.bucket.value=JSON.stringify(data);
  assert.equal((await f.req('x','login',{name:'张继元',password:'correct-password-123'})).status,200);
});
