import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import app from './worker/index.mjs';
const secret='local-ip-test-secret-32-characters-minimum',owner='local-owner-secret-32-characters-minimum';
const hmac=s=>createHmac('sha256',secret).update(s).digest('hex');
const digest=s=>createHash('sha256').update(s).digest('hex');
class Bucket {
  value=null;version=0;
  async get(){const v=this.value,etag=String(this.version);return v===null?null:{etag,json:async()=>JSON.parse(v)};}
  async put(k,v,{onlyIf:c}){await new Promise(r=>setTimeout(r,1));if(c.etagMatches&&c.etagMatches!==String(this.version)||c.etagDoesNotMatch==='*'&&this.value!==null)return null;this.value=v;return {etag:String(++this.version)};}
}
function fixture(){
 const bucket=new Bucket(),cookies={},env={BUCKET:bucket,LIUDU_IP_PROXY_KEY:secret,LIUDU_IP_ENFORCE:'true',LIUDU_OWNER_READ_KEY:owner};
 const req=async(name,path,body,ip='203.0.113.1',extra={},tamper={})=>{
   const text=body===undefined?'':JSON.stringify(body),method=body===undefined?'GET':'POST',cookie=cookies[name]||'',time=String(Date.now()),hash=hmac('ip-v1\n'+ip);
   const headers={'Content-Type':'application/json',Cookie:cookie,'X-Liudu-IP-Hash':hash,'X-Liudu-IP-Time':time,'X-Liudu-IP-Signature':hmac(['v1',time,method,'/api/'+path,hash,digest(text),digest(cookie)].join('\n')),...extra};
   const r=await app.fetch(new Request('https://liudu.example/api/'+(tamper.path||path),{method:tamper.method||method,headers,body:body===undefined?undefined:(tamper.text??text)}),env);
   if(r.headers.get('set-cookie'))cookies[name]=r.headers.get('set-cookie').includes('Max-Age=0')?'':r.headers.get('set-cookie').split(';')[0];
   return {status:r.status,data:await r.json()};
 };
 const register=(name,ip)=>req(name,'login',{action:'register',name,password:'correct-password-123'},ip);
 return {bucket,env,cookies,req,register};
}
test('one IP per Beijing day includes registration, logout and existing cookies; failed passwords do not claim IP',async()=>{
 const f=fixture();assert.equal((await f.register('张继元')).status,200);
 assert.equal((await f.register('吴日成')).status,403);
 assert.equal(JSON.parse(f.bucket.value).passwordAccounts['吴日成'],undefined);
 assert.equal((await f.register('吴日成','203.0.113.2')).status,200);
 assert.equal((await f.req('吴日成','login',{name:'吴日成',password:'incorrect-password'},'203.0.113.3')).status,401);
 assert.equal((await f.register('胡瑞祥','203.0.113.3')).status,200);
 assert.equal((await f.req('张继元','logout',{})).status,200);
 assert.equal((await f.req('吴日成','state',undefined)).status,403);
 assert.equal((await f.req('吴日成','submit',{values:{'001':100},visibility:'hidden'})).status,403);
 assert.equal((await f.req('张继元','login',{name:'张继元',password:'correct-password-123'})).status,200);
});
test('concurrent different names claim one IP once; zero oclock resets and logout does not',async()=>{
 const f=fixture(),original=Date.now;
 try{
 Date.now=()=>Date.parse('2026-11-18T23:59:59+08:00');
 const results=await Promise.all([f.register('张继元'),f.register('吴日成')]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,403]);
 const second=results[0].status===403?'张继元':'吴日成';
 Date.now=()=>Date.parse('2026-11-19T00:00:00+08:00');
 assert.equal((await f.register(second)).status,200);
 assert.equal(JSON.parse(f.bucket.value).ipBindings.date,'2026-11-19');
 }finally{Date.now=original;}
});
test('unsigned, stale and tampered requests cannot bypass; owner logs stay private and secret-free',async()=>{
 const f=fixture();await f.register('张继元');
 const direct=await app.fetch(new Request('https://liudu.example/api/state',{headers:{Cookie:f.cookies['张继元'],'CF-Connecting-IP':'203.0.113.1'}}),f.env);
 assert.equal(direct.status,403);
 assert.equal((await f.req('张继元','state',undefined,undefined,{'X-Liudu-IP-Hash':'a'.repeat(64)})).status,403);
 assert.equal((await f.req('张继元','state',undefined,undefined,{'X-Liudu-IP-Time':'1'})).status,403);
 assert.equal((await f.req('张继元','login',{name:'张继元',password:'incorrect-password'})).status,401);
 for(const headers of [{},{Cookie:f.cookies['张继元']},{'X-Liudu-Owner-Key':'wrong'}])assert.equal((await app.fetch(new Request('https://liudu.example/api/owner/logs',{headers}),f.env)).status,403);
 const before=f.bucket.value,r=await app.fetch(new Request('https://liudu.example/api/owner/logs',{headers:{'X-Liudu-Owner-Key':owner}}),f.env),report=await r.json();
 assert.equal(r.status,200);assert.ok(report.events.some(e=>e.action==='register'&&e.result==='success'));
 assert.ok(report.events.some(e=>e.action==='login'&&e.result==='bad_password'));
 for(const forbidden of ['203.0.113.1','correct-password-123','incorrect-password',secret,owner,'passwordHash',f.cookies['张继元']])assert.ok(!JSON.stringify(report).includes(forbidden));
 assert.equal(f.bucket.value,before);
});
test('existing cookies bind on first daily use; logs bounded to 30 days and 2000 events',async()=>{
 const f=fixture();await f.register('张继元');await f.register('吴日成','203.0.113.2');
 const s=JSON.parse(f.bucket.value);delete s.ipBindings;
 s.securityEvents=[{time:Date.now()-31*86400000,action:'expired'},...Array.from({length:2001},(_,i)=>({id:String(i),time:Date.now(),action:'old'}))];
 f.bucket.value=JSON.stringify(s);
 assert.equal((await f.req('吴日成','state',undefined)).status,200);
 assert.equal((await f.req('张继元','state',undefined)).status,403);
 const events=JSON.parse(f.bucket.value).securityEvents;
 assert.equal(events.length,2000);assert.ok(!events.some(e=>e.action==='expired'));
 assert.equal(events.at(-1).result,'ip_blocked');
 const state=(await f.req('吴日成','state',undefined)).data;assert.ok(!JSON.stringify(state).includes('securityEvents'));assert.ok(!JSON.stringify(state).includes('ipHash'));
});
test('valid-looking expired timestamps and changed body, cookie, method or path fail before writes',async()=>{
 const f=fixture();await f.register('张继元');const before=f.bucket.value;
 assert.equal((await f.req('张继元','state',undefined,undefined,{'X-Liudu-IP-Time':String(Date.now()-300001)})).status,403);
 assert.equal((await f.req('张继元','state',undefined,undefined,{Cookie:'liudu_name_session='+'f'.repeat(64)})).status,403);
 for(const tamper of [{path:'public'},{path:'state?altered=1'},{method:'HEAD'}]){
   if(tamper.method==='HEAD'){
     const time=String(Date.now()),hash=hmac('ip-v1\n203.0.113.1'),cookie=f.cookies['张继元'];
     const r=await app.fetch(new Request('https://liudu.example/api/state',{method:'HEAD',headers:{Cookie:cookie,'X-Liudu-IP-Time':time,'X-Liudu-IP-Hash':hash,'X-Liudu-IP-Signature':hmac(['v1',time,'GET','/api/state',hash,digest(''),digest(cookie)].join('\n'))}}),f.env);assert.equal(r.status,403);
   }else assert.equal((await f.req('张继元','state',undefined,undefined,{},tamper)).status,403);
 }
 assert.equal((await f.req('张继元','login',{name:'张继元',password:'correct-password-123'},undefined,{}, {text:JSON.stringify({name:'吴日成',password:'correct-password-123'})})).status,403);
 assert.equal(f.bucket.value,before);
});
test('bounded body reader stops oversized input; settlement prunes logs without new logins',async()=>{
 const f=fixture();await f.register('张继元');
 const time=String(Date.now()),headers={'X-Liudu-IP-Time':time,'X-Liudu-IP-Hash':'a'.repeat(64),'X-Liudu-IP-Signature':'b'.repeat(64)};let reads=0,cancelled=false;
 const stream=new ReadableStream({pull(controller){reads++;controller.enqueue(new Uint8Array(100000));},cancel(){cancelled=true;}});
 const r=await app.fetch(new Request('https://liudu.example/api/login',{method:'POST',headers,body:stream,duplex:'half'}),f.env);
 assert.equal(r.status,400);assert.ok(reads<=7);assert.ok(cancelled);
 const state=JSON.parse(f.bucket.value);state.securityEvents=[{time:Date.now()-31*86400000}];f.bucket.value=JSON.stringify(state);
 const settle=await app.fetch(new Request('https://liudu.example/api/settle'),f.env);assert.equal(settle.status,200);
 assert.deepEqual(JSON.parse(f.bucket.value).securityEvents,[]);
});
