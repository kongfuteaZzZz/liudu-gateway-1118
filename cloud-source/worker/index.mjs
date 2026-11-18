// Business math is copied unchanged from the verified local web version.
import {board,settle,totals,validate,dateCN} from '../source-web/core.mjs';
import {ASSETS,INITIAL_TARGETS} from './assets.generated.mjs';
const STATE_KEY='liudu/state-v1.json';
const NAMES=new Set('吴日成、胡瑞祥、陶铎、曾禹乐、赖志图、张婧、林振河、方大凯、张子健、胡德轩、齐好真、曾庆鹏、王志毅、徐泽涛、吴子涵、胡竞航、翁扬、白建国、蔡宇浩、翁俊彦、潘一鸣、夏翔、周文博、张继元'.split('、'));
const accountId=name=>'name:'+name;
const ROSTER_UPDATE_ID='2026-11-18-remove-zhangzihao-add-zhangjing';
function updateRoster(state){
  if(state.rosterUpdates?.[ROSTER_UPDATE_ID])return false;
  const names=['张子豪','张婧'],ids=new Set(names.map(accountId));
  for(const [id,profile] of Object.entries(state.users))if(names.includes(profile.name))ids.add(id);
  const archivedProfiles=Object.fromEntries(Object.entries(state.users).filter(([id])=>ids.has(id)));
  const archivedVersions=state.versions.filter(v=>ids.has(v.user));
  state.versions=state.versions.filter(v=>!ids.has(v.user));
  for(const id of ids)delete state.users[id];
  for(const name of names){delete state.passwordAccounts?.[name];delete state.accounts?.[name];delete state.authFailures?.[name];}
  state.rosterUpdates||={};
  // Apply once so later registrations and submissions by the new member survive.
  state.rosterUpdates[ROSTER_UPDATE_ID]={appliedAt:Date.now(),removedName:'张子豪',addedName:'张婧',archivedProfiles,archivedVersions};
  return true;
}
function scoringState(state){
  // Preserve stored history; known legacy names share the same voting identity.
  const users={};for(const profile of Object.values(state.users))if(NAMES.has(profile.name))users[accountId(profile.name)]=profile;
  for(const name of NAMES)if(state.users[accountId(name)])users[accountId(name)]=state.users[accountId(name)];
  return {...state,users,versions:state.versions.flatMap(v=>{const name=state.users[v.user]?.name;return NAMES.has(name)?[{...v,user:accountId(name)}]:[];})};
}
function initial(){const now=Date.now();return {created:now,targets:INITIAL_TARGETS.map(t=>({...t,created:now})),users:{},versions:[],days:{}};}
export async function transaction(bucket,change){
  if(!bucket)throw Object.assign(Error('共享存储尚未配置'),{status:503});
  for(let attempt=0;attempt<8;attempt++){
    const object=await bucket.get(STATE_KEY);
    const state=object?await object.json():initial();
    const rosterChanged=updateRoster(state);
    const due=settle(scoringState(state));
    const updated=change?change(state):false;
    if(object&&!due&&!updated&&!rosterChanged)return state;
    const condition=object?{etagMatches:object.etag}:{etagDoesNotMatch:'*'};
    const stored=await bucket.put(STATE_KEY,JSON.stringify(state),{onlyIf:condition,httpMetadata:{contentType:'application/json'}});
    if(stored)return state;
  }
  throw Object.assign(Error('同时提交的人较多，请稍后重试'),{status:409});
}
const imageOK=image=>typeof image==='string'&&image.length<420000&&/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(image);
function response(data,status=200,headers={}){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});}
const cookieHeader=(token,maxAge=31536000)=>({'Set-Cookie':`liudu_name_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`});
function session(request,state){
  const token=/(?:^|;\s*)liudu_name_session=([a-f0-9]{64})(?:;|$)/.exec(request.headers.get('cookie')||'')?.[1];
  // Legacy name-only tokens must never authenticate after the password upgrade.
  const name=token&&Object.entries(state.passwordAccounts||{}).find(([name,value])=>NAMES.has(name)&&value.passwordHash&&value.token===token)?.[0];
  if(!name)throw Object.assign(Error('请使用姓名和密码登录；首次使用请先注册'),{status:401});
  return {id:accountId(name),name};
}
const randomHex=length=>Array.from(crypto.getRandomValues(new Uint8Array(length)),b=>b.toString(16).padStart(2,'0')).join('');
async function passwordHash(password,salt){
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  // Workers WebCrypto caps PBKDF2 at 100000 iterations; never store plaintext.
  const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:Uint8Array.from(salt.match(/../g),b=>parseInt(b,16)),iterations:100000},key,256);
  return Array.from(new Uint8Array(bits),b=>b.toString(16).padStart(2,'0')).join('');
}
function sameHash(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function authenticate(bucket,body){
  const name=typeof body?.name==='string'?body.name.trim():'',password=body?.password;
  if(!NAMES.has(name))throw Object.assign(Error('姓名不在参与名单中，请输入自己的完整姓名'),{status:403});
  if(typeof password!=='string'||password.length<8||password.length>128)throw Error('密码须为8～128个字符');
  if(body.action!==undefined&&!['login','register'].includes(body.action))throw Error('请选择登录或注册');
  const register=body.action==='register',snapshot=await transaction(bucket),existing=snapshot.passwordAccounts?.[name];
  if(snapshot.authFailures?.[name]?.count>=5&&snapshot.authFailures[name].until>Date.now())throw Object.assign(Error('密码错误次数过多，请15分钟后重试'),{status:429});
  if(register&&existing)throw Object.assign(Error('该姓名已注册，请使用密码登录'),{status:409});
  const salt=register?randomHex(16):existing?.salt;
  const hash=salt?await passwordHash(password,salt):'';
  const token=register?randomHex(32):existing?.token;
  let rejected=false;
  const state=await transaction(bucket,state=>{
    rejected=false;
    if(state.authFailures?.[name]?.count>=5&&state.authFailures[name].until>Date.now())throw Object.assign(Error('密码错误次数过多，请15分钟后重试'),{status:429});
    const current=state.passwordAccounts?.[name];
    if(register){
      if(current)throw Object.assign(Error('该姓名已注册，请使用密码登录'),{status:409});
      state.passwordAccounts||={};state.passwordAccounts[name]={salt,passwordHash:hash,iterations:100000,token,registeredAt:Date.now()};
      state.users[accountId(name)]||=scoringState(state).users[accountId(name)]||{name,image:''};
      return true;
    }
    if(!current||current.passwordHash!==existing?.passwordHash||!sameHash(hash,current.passwordHash)){
      state.authFailures||={};const old=state.authFailures[name];
      const count=old&&old.until>Date.now()?old.count+1:1;
      state.authFailures[name]={count,until:Date.now()+15*60000};
      rejected=true;return true;
    }
    const hadFailures=!!state.authFailures?.[name];if(hadFailures)delete state.authFailures[name];return hadFailures;
  });
  if(rejected)throw Object.assign(Error('姓名或密码不正确，未注册请先注册'),{status:401});
  return {name,token:state.passwordAccounts[name].token};
}
function dailyLimit(state,id,now=Date.now()){
  const date=dateCN(now),used=state.versions.filter(v=>v.user===id&&v.kind==='allocation'&&dateCN(v.time)===date).length;
  return {date,limit:5,used,remaining:Math.max(0,5-used)};
}
async function bodyJSON(request){
  const reader=request.body?.getReader();if(!reader)return {};
  let length=0;const chunks=[];
  while(true){const part=await reader.read();if(part.done)break;length+=part.value.length;if(length>500000){await reader.cancel();throw Error('上传内容过大');}chunks.push(part.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const part of chunks){bytes.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes)||'{}');}catch{throw Error('请求数据无效');}
}
export async function ownerInspection(request,bucket,config){
  if(request.method!=='GET'||new URL(request.url).pathname!==config.route)return response({error:'接口不存在'},404);
  const key=request.headers.get('X-Liudu-Owner-Key')||'';
  if(!config.secret||config.secret.length<32||!key||key.length>128)return response({error:'仅站主可查询'},403);
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
  if(!sameHash(await digest(key),await digest(config.secret)))return response({error:'仅站主可查询'},403);
  const object=await bucket.get(STATE_KEY);
  if(!object)return response({error:'尚无云端记录'},404);
  // Read one snapshot only. Never export authentication data or trigger settlement.
  const state=scoringState(await object.json());
  const update=state.rosterUpdates?.[ROSTER_UPDATE_ID];
  return response({capturedAt:Date.now(),timezone:'Asia/Shanghai',rosterUpdate:update?{id:ROSTER_UPDATE_ID,appliedAt:update.appliedAt,removedName:update.removedName,addedName:update.addedName,removedAccountPresent:!!state.passwordAccounts?.['张子豪'],removedLegacySessionPresent:!!state.accounts?.['张子豪'],removedProfilePresent:Object.values(state.users).some(p=>p.name==='张子豪'),removedActiveVersions:state.versions.filter(v=>v.user===accountId('张子豪')).length}:null,targets:state.targets.map(({id,image})=>({id,image})),participants:[...NAMES].map(name=>{
    const versions=state.versions.filter(v=>v.user===accountId(name)),mine=versions.at(-1),allocation=versions.filter(v=>v.kind!=='visibility').at(-1);
    return {name,registered:!!state.passwordAccounts?.[name],values:mine?.values??null,visibility:mine?.visibility??null,allocationAt:allocation?.time??null,timeKind:allocation?(allocation.kind==='allocation'?'submission':'legacy_record'):null,latestRecordAt:mine?.time??null};
  })});
}
const RESET_NAMES=['张子豪','周文博','吴日成'];
const RESET_OPERATION='2026-11-18-compromised-zhangzihao-zhouwenbo-wuricheng';
function resetStatus(state){
  const current=scoringState(state);
  return {operation:RESET_OPERATION,completedAt:state.ownerAccountResets?.[RESET_OPERATION]?.completedAt??null,accounts:RESET_NAMES.map(name=>({name,registered:!!state.passwordAccounts?.[name],hasAllocation:current.versions.some(v=>v.user===accountId(name)),legacySessionPresent:!!state.accounts?.[name],dailyLimit:dailyLimit(current,accountId(name))})),submittedCount:board(current).count};
}
export function resetCompromisedAccounts(state){
  // One operation only: retries must never clear a later legitimate registration.
  if(state.ownerAccountResets?.[RESET_OPERATION])return false;
  const ids=new Set(RESET_NAMES.map(accountId));
  for(const [id,profile] of Object.entries(state.users))if(RESET_NAMES.includes(profile.name))ids.add(id);
  const archivedProfiles=Object.fromEntries(Object.entries(state.users).filter(([id])=>ids.has(id)));
  const archivedVersions=state.versions.filter(v=>ids.has(v.user));
  const before=resetStatus(state);
  state.versions=state.versions.filter(v=>!ids.has(v.user));
  for(const id of ids)delete state.users[id];
  for(const name of RESET_NAMES){delete state.passwordAccounts?.[name];delete state.accounts?.[name];delete state.authFailures?.[name];}
  state.ownerAccountResets||={};
  state.ownerAccountResets[RESET_OPERATION]={completedAt:Date.now(),names:RESET_NAMES,before,archivedProfiles,archivedVersions};
  return true;
}
export async function maintenanceReset(request,bucket,secret){
  const key=request.headers.get('X-Liudu-Reset-Key')||'';
  if(!secret||secret.length<32||!key||key.length>128)return response({error:'禁止访问'},403);
  const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');
  if(!sameHash(await digest(key),await digest(secret)))return response({error:'禁止访问'},403);
  try{
    if(request.method==='GET'){
      const object=await bucket.get(STATE_KEY);if(!object)return response({error:'尚无数据'},404);
      return response(resetStatus(await object.json()));
    }
    if(request.method!=='POST')return response({error:'接口不存在'},404);
    const body=await bodyJSON(request);
    if(!Array.isArray(body.names)||body.names.length!==RESET_NAMES.length||new Set(body.names).size!==RESET_NAMES.length||body.names.some(name=>!RESET_NAMES.includes(name)))return response({error:'仅允许本次指定的三个账号'},400);
    const state=await transaction(bucket,resetCompromisedAccounts);
    return response({...resetStatus(state),ok:true,before:state.ownerAccountResets[RESET_OPERATION].before});
  }catch(error){return response({error:error.message},error.status||400);}
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/api/owner/reset-compromised-20261118')return maintenanceReset(request,env.BUCKET,env.LIUDU_ACCOUNT_RESET_KEY);
    if(url.pathname==='/api/owner/allocations')return ownerInspection(request,env.BUCKET,{route:'/api/owner/allocations',secret:env.LIUDU_OWNER_READ_KEY});
    if(!url.pathname.startsWith('/api/')){
      const asset=ASSETS[url.pathname==='/'?'/index.html':url.pathname];
      if(!asset)return new Response('Not found',{status:404});
      const data=asset.binary?Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)):asset.data;
      return new Response(data,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}});
    }
    const send=response;
    try{
      if(request.method==='GET'&&url.pathname==='/api/health')return send({ok:true,storageConfigured:!!env.BUCKET,mode:'cloud',authMode:'password',dailySubmissionLimit:5});
      if(request.method==='GET'&&url.pathname==='/api/settle'){
        const state=await transaction(env.BUCKET);
        return send({ok:true,dates:Object.keys(state.days).sort(),now:Date.now(),timezone:'Asia/Shanghai'});
      }
      if(request.method==='POST'){
        const origin=request.headers.get('origin');
        if(origin&&origin!==url.origin)return send({error:'请求来源不符'},403);
        if(url.pathname==='/api/logout')return response({ok:true},200,cookieHeader('',0));
        if(url.pathname==='/api/login'){
          const {name,token}=await authenticate(env.BUCKET,await bodyJSON(request));
          return response({ok:true,name},200,cookieHeader(token));
        }
      }
      const stored=await transaction(env.BUCKET),user=session(request,stored),state=scoringState(stored);
      if(request.method==='GET'&&url.pathname==='/api/state'){
        const b=board(state),mine=[...state.versions].reverse().find(v=>v.user===user.id);
        return send({...b,totals:totals(state),days:Object.values(state.days).sort((a,b)=>b.date.localeCompare(a.date)),profile:state.users[user.id]||null,mine:mine?{values:mine.values,visibility:mine.visibility}:null,dailyLimit:dailyLimit(state,user.id),now:Date.now()});
      }
      if(request.method==='GET'&&url.pathname==='/api/public'){
        const latest=new Map();for(const v of state.versions)latest.set(v.user,v);
        return send([...latest.values()].filter(v=>v.visibility==='public').map(v=>({profile:state.users[v.user],values:v.values,time:v.time})));
      }
      if(request.method!=='POST')return send({error:'接口不存在'},404);
      const origin=request.headers.get('origin');
      if(origin&&origin!==url.origin)return send({error:'请求来源不符'},403);
      const body=await bodyJSON(request);
      if(!['/api/profile','/api/submit','/api/visibility','/api/upload'].includes(url.pathname))return send({error:'接口不存在'},404);
      await transaction(env.BUCKET,state=>{
        session(request,state);
        if(url.pathname==='/api/profile'){
          if(body.name!==undefined&&body.name!==user.name)throw Error('账号姓名不可修改，请通过切换姓名重新进入');
          if(body.image&&!imageOK(body.image))throw Error('头像格式或大小不符合要求');
          state.users[user.id]={name:user.name,image:body.image??state.users[user.id].image};return true;
        }
        if(!state.users[user.id])throw Object.assign(Error('请先设置你的参与者资料'),{status:401});
        if(url.pathname==='/api/submit'){
          validate(body.values,state.targets);
          if(!['public','hidden'].includes(body.visibility))throw Error('每次提交都需要选择公开或隐藏');
          const now=Date.now();
          if(dailyLimit(scoringState(state),user.id,now).remaining===0)throw Object.assign(Error('今天已提交5次分配，请北京时间明天零点后再修改'),{status:429});
          state.versions.push({user:user.id,time:now,kind:'allocation',values:body.values,visibility:body.visibility});return true;
        }
        if(url.pathname==='/api/visibility'){
          if(!['public','hidden'].includes(body.visibility))throw Error('请选择公开或隐藏');
          const mine=[...scoringState(state).versions].reverse().find(v=>v.user===user.id);if(!mine)throw Error('请先提交一份分配');
          state.versions.push({...mine,time:Date.now(),kind:'visibility',visibility:body.visibility});return true;
        }
        if(!imageOK(body.image))throw Error('请上传 PNG、JPEG 或 WebP 图片');
        if(state.targets.length>=300)throw Error('头像数量已达到 300 个上限');
        state.targets.push({id:crypto.randomUUID(),image:body.image,created:Date.now()});return true;
      });
      return send({ok:true});
    }catch(error){return send({error:error.status?error.message:(error.message||'请求失败')},error.status||400);}
  },
  async scheduled(event,env,ctx){ctx.waitUntil(transaction(env.BUCKET));}
};
