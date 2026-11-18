import test from 'node:test';
import assert from 'node:assert/strict';
import app from './worker/index.mjs';
class Bucket{
  value=null;version=0;
  async get(){const value=this.value,etag=String(this.version);return value===null?null:{etag,json:async()=>JSON.parse(value)};}
  async put(key,value,{onlyIf:c}){await new Promise(r=>setTimeout(r,1));if((c.etagMatches&&c.etagMatches!==String(this.version))||(c.etagDoesNotMatch==='*'&&this.value!==null))return null;this.value=value;return {etag:String(++this.version)};}
}
function fixture(){
  const bucket=new Bucket(),cookie={};
  const data={created:Date.now(),targets:[{id:'001',image:'/avatars/1.png',created:1}],days:{past:{date:'2026-11-17',rows:[{reward:6}]}},users:{oldZ:{name:'张子豪'},'name:张子豪':{name:'张子豪'},oldJ:{name:'张婧'},'name:吴日成':{name:'吴日成'}},accounts:{张子豪:'old-name-token'},passwordAccounts:{张子豪:{passwordHash:'old-password-hash',token:'a'.repeat(64)},吴日成:{passwordHash:'preserve',token:'b'.repeat(64)}},authFailures:{张子豪:{count:5},吴日成:{count:1}},versions:[{user:'oldZ',time:1,values:{'001':100},visibility:'public'},{user:'name:张子豪',time:2,values:{'001':100},visibility:'hidden',kind:'allocation'},{user:'oldJ',time:3,values:{'001':100},visibility:'public'},{user:'name:吴日成',time:4,values:{'001':100},visibility:'hidden',kind:'allocation'}]};
  bucket.value=JSON.stringify(data);
  const req=async(user,endpoint,body,headers={})=>{const r=await app.fetch(new Request('https://liudu.example/api/'+endpoint,{method:body===undefined?'GET':'POST',headers:{Origin:'https://liudu.example','Content-Type':'application/json',Cookie:cookie[user]||'',...headers},body:body===undefined?undefined:JSON.stringify(body)}),{BUCKET:bucket});if(r.headers.has('set-cookie'))cookie[user]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};};
  return {bucket,req,before:structuredClone(data)};
}
test('removed name cannot login, register, use an old session or submit scores',async()=>{
  const f=fixture();
  for(const action of ['login','register'])assert.equal((await f.req('z','login',{action,name:'张子豪',password:'test-password-123'})).status,403);
  for(const [endpoint,body] of [['state',undefined],['submit',{values:{'001':100},visibility:'public'}]])assert.equal((await f.req('z',endpoint,body,{Cookie:'liudu_name_session='+'a'.repeat(64)})).status,401);
});
test('new member starts unregistered and without inherited votes; other accounts, targets and historical days survive',async()=>{
  const f=fixture();
  const registered=await f.req('jing','login',{action:'register',name:'张婧',password:'new-password-123'});assert.equal(registered.status,200);
  const view=(await f.req('jing','state')).data;assert.equal(view.profile.name,'张婧');assert.equal(view.mine,null);assert.equal(view.count,1);assert.equal(view.dailyLimit.used,0);
  const stored=JSON.parse(f.bucket.value);for(const id of ['oldZ','name:张子豪','oldJ'])assert.equal(stored.users[id],undefined);
  assert.equal(stored.passwordAccounts['张子豪'],undefined);assert.equal(stored.accounts['张子豪'],undefined);assert.equal(stored.authFailures['张子豪'],undefined);
  assert.deepEqual(stored.versions,[f.before.versions[3]]);assert.deepEqual(stored.passwordAccounts['吴日成'],f.before.passwordAccounts['吴日成']);assert.deepEqual(stored.authFailures['吴日成'],f.before.authFailures['吴日成']);assert.deepEqual(stored.targets,f.before.targets);assert.deepEqual(stored.days,f.before.days);
});
test('migration is idempotent and concurrent requests cannot clear new member submissions',async()=>{
  const f=fixture();await f.req('jing','login',{action:'register',name:'张婧',password:'new-password-123'});
  assert.equal((await f.req('jing','submit',{values:{'001':100},visibility:'hidden'})).status,200);
  const count=JSON.parse(f.bucket.value).versions.length;
  await Promise.all([f.req('jing','state'),f.req('jing','public'),f.req('jing','settle')]);
  const view=(await f.req('jing','state')).data;assert.equal(view.mine.values['001'],100);assert.equal(view.count,2);assert.equal(view.dailyLimit.used,1);assert.equal(JSON.parse(f.bucket.value).versions.length,count);
});
