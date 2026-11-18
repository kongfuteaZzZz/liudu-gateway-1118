import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,createHmac} from 'node:crypto';
import app from './worker/index.mjs';
const key='local-only-browser-owner-ip-secret-32-characters';
class Bucket {
 value=null;version=0;
 async get(){const v=this.value,etag=String(this.version);return v===null?null:{etag,json:async()=>JSON.parse(v)};}
 async put(k,v,{onlyIf:c}){if(c.etagMatches&&c.etagMatches!==String(this.version)||c.etagDoesNotMatch==='*'&&this.value!==null)return null;this.value=v;return {etag:String(++this.version)};}
}
function fixture(){
 const bucket=new Bucket(),cookies={},env={BUCKET:bucket,LIUDU_IP_PROXY_KEY:key,LIUDU_IP_ENFORCE:'true'};
 const req=async(name,path,body,extra={})=>{
  const method=body===undefined?'GET':'POST',text=body===undefined?'':JSON.stringify(body),cookie=cookies[name]||'',time=String(Date.now()),hmac=s=>createHmac('sha256',key).update(s).digest('hex'),digest=s=>createHash('sha256').update(s).digest('hex'),hash=hmac('test-IP-for-'+name);
  const headers={Cookie:cookie,'Content-Type':'application/json','X-Liudu-IP-Hash':hash,'X-Liudu-IP-Time':time,'X-Liudu-IP-Signature':hmac(['v1',time,method,'/api/'+path,hash,digest(text),digest(cookie)].join('\n')),...extra};
  const r=await app.fetch(new Request('https://liudu.example/api/'+path,{method,headers,body:body===undefined?undefined:text}),env);
  if(r.headers.get('set-cookie'))cookies[name]=r.headers.get('set-cookie').split(';')[0];
  return {status:r.status,data:await r.json(),headers:r.headers};
 };
 const register=name=>req(name,'login',{action:'register',name,password:'local-password-123'});
 return {bucket,cookies,env,req,register};
}
test('owner password session can inspect all current plans and timestamps without exposing credentials or changing votes',async()=>{
 const f=fixture();await f.register('张继元');await f.register('吴日成');
 await f.req('张继元','submit',{values:{'001':100},visibility:'public'});
 await f.req('吴日成','submit',{values:{'002':100},visibility:'hidden'});
 const before=JSON.parse(f.bucket.value),allocation=before.versions.find(v=>v.user==='name:吴日成').time;
 await f.req('吴日成','visibility',{visibility:'public'});await f.req('吴日成','visibility',{visibility:'hidden'});
 const versions=JSON.parse(f.bucket.value).versions;
 const r=await f.req('张继元','allocations');assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.data.participants.length,24);assert.equal(r.data.targets.length,13);
 const person=r.data.participants.find(p=>p.name==='吴日成');assert.deepEqual(person.values,{'002':100});assert.equal(person.visibility,'hidden');assert.equal(person.allocationAt,allocation);assert.equal(person.timeKind,'submission');
 assert.equal(r.data.participants.find(p=>p.name==='张婧').values,null);
 for(const forbidden of ['passwordHash','passwordAccounts','salt','token','securityEvents','ipBindings','ipHash','local-password-123',key])assert.ok(!JSON.stringify(r.data).includes(forbidden));
 assert.deepEqual(JSON.parse(f.bucket.value).versions,versions);
 assert.equal((await f.req('张继元','state')).data.dailyLimit.used,1);
});
test('all other allowed accounts and unauthenticated or forged identities cannot inspect hidden plans',async()=>{
 const f=fixture();await f.register('张继元');
 const names='吴日成、胡瑞祥、陶铎、曾禹乐、赖志图、张婧、林振河、方大凯、张子健、胡德轩、齐好真、曾庆鹏、王志毅、徐泽涛、吴子涵、胡竞航、翁扬、白建国、蔡宇浩、翁俊彦、潘一鸣、夏翔、周文博'.split('、');
 for(const name of names){assert.equal((await f.register(name)).status,200);assert.equal((await f.req(name,'state')).status,200);const r=await f.req(name,'allocations',undefined,{'X-User-Name':encodeURIComponent('张继元'),'oai-authenticated-user-id':'forged-owner'});assert.equal(r.status,403);assert.ok(!('participants' in r.data));}
 assert.equal((await f.req('guest','allocations')).status,401);
 const direct=await app.fetch(new Request('https://liudu.example/api/allocations',{headers:{Cookie:f.cookies['张继元']}}),f.env);assert.equal(direct.status,403);
 assert.notEqual((await f.req('张继元','allocations',{})).status,200);
});
