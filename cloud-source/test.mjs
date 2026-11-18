import test from 'node:test';
import assert from 'node:assert/strict';
import app,{transaction} from './worker/index.mjs';
class Bucket{
  value=null;version=0;
  async get(){const value=this.value,etag=String(this.version);return value===null?null:{etag,json:async()=>JSON.parse(value)};}
  async put(key,value,options){await new Promise(r=>setTimeout(r,1));const c=options.onlyIf;if((c.etagMatches&&c.etagMatches!==String(this.version))||(c.etagDoesNotMatch==='*'&&this.value!==null))return null;this.value=value;this.version++;return {etag:String(this.version)};}
}
test('R2 compare-and-swap preserves concurrent writes',async()=>{
 const bucket=new Bucket();await transaction(bucket);
 await Promise.all(Array.from({length:4},(_,i)=>transaction(bucket,s=>{s.users['u'+i]={name:String(i)};return true;})));
 assert.equal(Object.keys(JSON.parse(bucket.value).users).length,4);
});
function client(env){const cookies={};return async function req(user,endpoint,body,extraHeaders={}){const headers={Cookie:cookies[user]||'',Origin:'https://liudu.example',...extraHeaders};if(body)headers['Content-Type']='application/json';const r=await app.fetch(new Request('https://liudu.example/api/'+endpoint,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env);if(r.headers.get('set-cookie'))cookies[user]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};}
test('name gate blocks unlisted visitors and forged or old identities',async()=>{
 const env={BUCKET:new Bucket()},req=client(env);
 for(const endpoint of ['state','public'])assert.equal((await req('a',endpoint)).status,401);
 for(const endpoint of ['profile','submit','visibility','upload'])assert.equal((await req('a',endpoint,{})).status,401);
 for(const name of ['外人','张继元同学','', '__proto__'])assert.equal((await req('a','login',{name})).status,403);
 assert.equal((await req('a','state',undefined,{'oai-authenticated-user-id':'fake',Cookie:'liudu_session='+'a'.repeat(64)+'; liudu_name_session='+'b'.repeat(64)})).status,401);
 assert.equal((await req('a','login',{name:'吴日成'},{Origin:'https://other.example'})).status,403);
 assert.equal((await req('a','health')).status,200);assert.equal((await req('a','settle')).status,200);
});
test('24 fixed names include Zhang Jiyuan and share one account across browsers',async()=>{
 const env={BUCKET:new Bucket()},req=client(env);
 const names='吴日成、胡瑞祥、陶铎、曾禹乐、赖志图、张婧、林振河、方大凯、张子健、胡德轩、齐好真、曾庆鹏、王志毅、徐泽涛、吴子涵、胡竞航、翁扬、白建国、蔡宇浩、翁俊彦、潘一鸣、夏翔、周文博、张继元'.split('、');
 assert.equal(new Set(names).size,24);
 for(const name of names){assert.equal((await req(name,'login',{action:'register',name,password:'test-password-123'})).status,200);assert.equal((await req(name,'state')).data.profile.name,name);}
 assert.equal((await req('张继元','state')).data.count,0);
 await req('张继元','submit',{values:{'001':100},visibility:'hidden'});
 await req('phone2','login',{name:' 张继元 ',password:'test-password-123'});assert.equal((await req('phone2','state')).data.mine.values['001'],100);
 assert.equal((await req('phone2','submit',{values:{'002':100},visibility:'public'})).status,429);
 const s=(await req('张继元','state')).data;assert.equal(s.count,1);assert.equal(s.mine.values['001'],100);assert.equal(s.rows.find(r=>r.id==='001').score,100);
 assert.equal((await req('phone2','profile',{name:'胡瑞祥'})).status,400);
 assert.equal((await req('phone2','state')).data.profile.name,'张继元');
 await req('phone2','logout',{});assert.equal((await req('phone2','state')).status,401);assert.equal((await req('张继元','state')).data.count,1);
 await req('phone2','login',{name:'胡瑞祥',password:'test-password-123'});assert.equal((await req('phone2','state')).data.mine,null);
});
test('cloud private projections, validation and uploads after named login',async()=>{
 const env={BUCKET:new Bucket()},cookies={};
 async function req(user,endpoint,body){const headers={Cookie:cookies[user]||'',Origin:'https://liudu.example'};if(body)headers['Content-Type']='application/json';const r=await app.fetch(new Request('https://liudu.example/api/'+endpoint,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined}),env);if(r.headers.get('set-cookie'))cookies[user]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};}
 for(const [u,name] of [['a','吴日成'],['b','胡瑞祥']]){assert.equal((await req(u,'login',{action:'register',name,password:'test-password-123'})).status,200);assert.equal((await req(u,'state')).data.rows.length,13);}
 assert.equal((await req('a','submit',{values:{'001':99},visibility:'hidden'})).status,400);
 assert.equal((await req('a','submit',{values:{'001':100}})).status,400);
 await req('a','submit',{values:{'001':100},visibility:'hidden'});await req('b','submit',{values:{'002':100},visibility:'public'});
 const state=(await req('a','state')).data;assert.equal(state.count,2);assert.equal(state.rows[0].score,50);assert.equal(state.rows[1].rank,1);
 assert.equal((await req('b','state')).data.mine.values['001'],undefined);
 const list=(await req('b','public')).data;assert.equal(list.length,1);assert.equal(list[0].profile.name,'胡瑞祥');
 await req('a','visibility',{visibility:'public'});assert.equal((await req('b','public')).data.length,2);
 const upload=await req('a','upload',{image:'data:image/png;base64,AA=='});assert.equal(upload.status,200);assert.equal((await req('b','state')).data.rows.length,14);
 assert.equal((await app.fetch(new Request('https://liudu.example/data/state.json'),env)).status,404);
 assert.equal((await req('a','settle')).data.ok,true);
});
test('matching legacy names merge without deleting original votes or snapshots',async()=>{
 const bucket=new Bucket();await transaction(bucket,s=>{s.users.old1={name:'张继元',image:''};s.users.old2={name:'张继元',image:''};s.versions.push({user:'old1',time:Date.now()-2,values:{'001':100},visibility:'hidden'},{user:'old2',time:Date.now()-1,values:{'002':100},visibility:'public'});return true;});
 const req=client({BUCKET:bucket});await req('new','login',{action:'register',name:'张继元',password:'test-password-123'});const s=(await req('new','state')).data;
 assert.equal(s.count,1);assert.equal(s.mine.values['002'],100);assert.equal(JSON.parse(bucket.value).versions[0].user,'old1');
});
