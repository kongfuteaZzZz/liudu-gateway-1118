import test from 'node:test';
import assert from 'node:assert/strict';
import * as app from './worker/index.mjs';
const names=['张子豪','周文博','吴日成'];
function fixture(){return {created:Date.now(),targets:[{id:'001',image:'unchanged',created:1}],days:{past:{date:'2026-11-17',rows:[{reward:6}]}},users:{oldZ:{name:'张子豪'},'name:张子豪':{name:'张子豪'},'name:周文博':{name:'周文博'},'name:张继元':{name:'张继元'},'name:吴日成':{name:'吴日成'}},versions:[{user:'oldZ',time:1,values:{'001':100}},{user:'name:张子豪',time:2,values:{'001':100},kind:'allocation'},{user:'name:周文博',time:3,values:{'001':100},kind:'allocation'},{user:'name:张继元',time:4,values:{'001':100},kind:'allocation'},{user:'name:吴日成',time:5,values:{'001':100},kind:'allocation'}],accounts:{吴日成:'old-token3',张子豪:'old-token',周文博:'old-token2',张继元:'keep'},passwordAccounts:{吴日成:{token:'bad3',passwordHash:'bad'},张子豪:{token:'bad1',passwordHash:'bad'},周文博:{token:'bad2',passwordHash:'bad'},张继元:{token:'keep',passwordHash:'keep'}},authFailures:{吴日成:{count:5},张子豪:{count:5},周文博:{count:5},张继元:{count:2}}};}
test('resets only the three compromised identities including legacy aliases, preserves others and frozen days',()=>{
  assert.equal(typeof app.resetCompromisedAccounts,'function');const s=fixture(),before=structuredClone(s);
  app.resetCompromisedAccounts(s);
  for(const name of names){assert.equal(s.passwordAccounts[name],undefined);assert.equal(s.accounts[name],undefined);assert.equal(s.authFailures[name],undefined);assert.equal(s.users['name:'+name],undefined);}
  assert.equal(s.users.oldZ,undefined);assert.deepEqual(s.versions,[before.versions[3]]);
  assert.deepEqual(s.days,before.days);assert.deepEqual(s.targets,before.targets);assert.deepEqual(s.passwordAccounts['张继元'],before.passwordAccounts['张继元']);assert.deepEqual(s.users['name:张继元'],before.users['name:张继元']);assert.deepEqual(s.authFailures['张继元'],before.authFailures['张继元']);
  assert.equal(Object.values(s.ownerAccountResets)[0].archivedVersions.length,4);
  assert.ok(!JSON.stringify(s.ownerAccountResets).includes('passwordHash'));assert.ok(!JSON.stringify(s.ownerAccountResets).includes('bad1'));
});
test('a retry cannot reset a subsequently re-registered legitimate account or new allocation',()=>{
  assert.equal(typeof app.resetCompromisedAccounts,'function');const s=fixture();assert.equal(app.resetCompromisedAccounts(s),true);
  s.passwordAccounts['张子豪']={token:'new',passwordHash:'new'};s.users['name:张子豪']={name:'张子豪'};s.versions.push({user:'name:张子豪',time:Date.now(),values:{'001':100},kind:'allocation'});
  const copy=JSON.stringify(s);assert.equal(app.resetCompromisedAccounts(s),false);assert.equal(JSON.stringify(s),copy);
});
test('maintenance reset denies ordinary cookies, wrong/missing key, wrong target body before mutation',async()=>{
  assert.equal(typeof app.maintenanceReset,'function');let reads=0;const bucket={get:async()=>{reads++;throw Error('should not read');}};
  const secret='isolated-maintenance-test-key-at-least-32-chars';
  const req=(headers,body)=>new Request('https://liudu.example/api/owner/reset-compromised-20261118',{method:'POST',headers,body:JSON.stringify(body)});
  for(const headers of [{},{Cookie:'liudu_name_session='+'a'.repeat(64)},{'X-Liudu-Reset-Key':'wrong'}])assert.equal((await app.maintenanceReset(req(headers,{names}),bucket,secret)).status,403);
  assert.equal((await app.maintenanceReset(req({'X-Liudu-Reset-Key':secret},{names:['张继元']}),bucket,secret)).status,400);assert.equal(reads,0);
});
test('reset revokes actual prior sessions, removes all three voters from denominator and permits fresh registration',async()=>{
  let value=null,version=0;
  const bucket={get:async()=>value?{etag:String(version),json:async()=>JSON.parse(value)}:null,put:async(key,next)=>{value=next;return {etag:String(++version)};}};
  const env={BUCKET:bucket,LIUDU_ACCOUNT_RESET_KEY:'test-only-maintenance-secret-at-least-32-chars'},cookies={};
  async function call(user,path,body,headers={}){
    const r=await app.default.fetch(new Request('https://liudu.example/api/'+path,{method:body===undefined?'GET':'POST',headers:{Cookie:cookies[user]||'',Origin:'https://liudu.example','Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body)}),env);
    if(r.headers.has('set-cookie'))cookies[user]=r.headers.get('set-cookie').split(';')[0];return {status:r.status,data:await r.json()};
  }
  for(const name of [...names.filter(n=>n!=='张子豪'),'张继元']){assert.equal((await call(name,'login',{action:'register',name,password:'test-password-123'})).status,200);assert.equal((await call(name,'submit',{values:{'001':100},visibility:'hidden'})).status,200);}
  const before=JSON.parse(value),result=await call('owner','owner/reset-compromised-20261118',{names},{'X-Liudu-Reset-Key':env.LIUDU_ACCOUNT_RESET_KEY});assert.equal(result.status,200);assert.equal(result.data.submittedCount,1);
  for(const name of names){assert.equal((await call(name,'state')).status,401);assert.equal((await call(name,'submit',{values:{'001':100},visibility:'hidden'})).status,401);}
  assert.deepEqual(JSON.parse(value).passwordAccounts['张继元'],before.passwordAccounts['张继元']);assert.equal((await call('张继元','state')).data.mine.values['001'],100);
  assert.equal((await call('new','login',{action:'register',name:'吴日成',password:'new-correct-password-123'})).status,200);const fresh=(await call('new','state')).data;assert.equal(fresh.mine,null);assert.equal(fresh.dailyLimit.used,0);
  const repeat=await call('owner','owner/reset-compromised-20261118',{names},{'X-Liudu-Reset-Key':env.LIUDU_ACCOUNT_RESET_KEY});assert.equal(repeat.status,200);assert.equal(repeat.data.accounts.find(a=>a.name==='吴日成').registered,true);
  delete env.LIUDU_ACCOUNT_RESET_KEY;assert.equal((await call('owner','owner/reset-compromised-20261118',{names})).status,403);
});
