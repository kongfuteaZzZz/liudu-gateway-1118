import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createGateway, UPSTREAM} from './server.mjs';
import cloud from './cloud-source/worker/index.mjs';

class Bucket {
  value = null; version = 0;
  async get() { return this.value === null ? null : {etag:String(this.version), json:async()=>JSON.parse(this.value)}; }
  async put(key, value) { this.value = value; return {etag:String(++this.version)}; }
}
async function start(t, upstream) {
  let origin;
  const server = createGateway({publicOrigin:'http://localhost', fetchUpstream:upstream});
  // Test requests carry the same browser Origin the server is configured to accept.
  server.listen(0, '127.0.0.1'); await once(server,'listening');
  origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{server.closeAllConnections(); await new Promise(r=>server.close(r));});
  return async (path, body, headers={}) => fetch(origin+path, {
    method:body === undefined ? 'GET' : 'POST',
    headers:{Origin:'http://localhost', 'Content-Type':'application/json', ...headers},
    body:body === undefined ? undefined : JSON.stringify(body)
  });
}

test('gateway preserves named login, votes, hidden plans and logout with isolated cloud state', async t => {
  const bucket = new Bucket();
  const req = await start(t, (url, options) => cloud.fetch(new Request(url,options), {BUCKET:bucket}));
  assert.equal((await req('/api/state')).status,401);
  assert.equal((await req('/api/login',{name:'名单外'})).status,403);
  const login = await req('/api/login',{action:'register',name:'张继元',password:'test-password-123'});
  assert.equal(login.status,200);
  const Cookie = login.headers.get('set-cookie').split(';')[0];
  assert.match(login.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Lax/);
  assert.equal((await req('/api/submit',{values:{'001':100},visibility:'hidden'},{Cookie})).status,200);
  const state = await (await req('/api/state',undefined,{Cookie})).json();
  assert.equal(state.count,1); assert.equal(state.rows.length,13); assert.equal(state.mine.values['001'],100);
  assert.deepEqual(await (await req('/api/public',undefined,{Cookie})).json(),[]);
  const second = await req('/api/login',{action:'register',name:'吴日成',password:'test-password-123'});
  const secondCookie = second.headers.get('set-cookie').split(';')[0];
  assert.equal((await (await req('/api/state',undefined,{Cookie:secondCookie})).json()).mine,null);
  assert.equal((await req('/api/submit',{values:{'002':99},visibility:'public'},{Cookie})).status,400);
  assert.equal((await req('/api/upload',{image:'data:image/png;base64,AA=='},{Cookie})).status,200);
  assert.equal((await (await req('/api/state',undefined,{Cookie})).json()).rows.length,14);
  assert.match((await req('/api/logout',{}, {Cookie})).headers.get('set-cookie'),/Max-Age=0/);
  assert.equal((await req('/api/state')).status,401);
  assert.equal((await req('/avatars/1.png')).status,200);
  assert.equal((await (await req('/api/settle')).json()).ok,true);
});

test('fixed destination, same-origin checks and body limits apply before forwarding', async t => {
  const calls = [];
  const req = await start(t, async (url, options) => {calls.push({url:String(url), options});return new Response('ok');});
  assert.equal((await req('/api/submit',{}, {Origin:'https://other.example'})).status,403);
  assert.equal((await req('/api/submit',{padding:'x'.repeat(500001)})).status,413);
  assert.equal((await req('//other.example/api/state')).status,400);
  assert.equal((await req('/\\other.example/api/state')).status,400);
  assert.equal((await req('/data/state.json')).status,404);
  assert.equal(calls.length,0);
  const token = 'a'.repeat(64);
  const response = await req('/api/state?target=https://other.example',undefined, {
    Cookie:`unrelated=secret; liudu_name_session=${token}; another=secret`,
    Authorization:'Bearer never-forward', 'oai-authenticated-user-id':'never-forward'
  });
  assert.equal(response.headers.get('cache-control'),'no-store');
  assert.equal(calls.length,1);
  assert.equal(new URL(calls[0].url).origin,UPSTREAM);
  assert.deepEqual(calls[0].options.headers, {'Accept-Encoding':'identity','Content-Type':'application/json',Cookie:`liudu_name_session=${token}`});
  await req('/api/submit',{});
  assert.equal(calls[1].options.headers.Origin,UPSTREAM);
  assert.equal(calls[1].options.redirect,'manual');
});

test('upstream redirects and failures never leak redirects or internal details', async t => {
  const redirect = await start(t, async()=>new Response(null,{status:302,headers:{Location:'https://other.example'}}));
  const r = await redirect('/api/state'); assert.equal(r.status,502); assert.equal(r.headers.get('location'),null);
  const failure = await start(t, async()=>{throw Error('secret upstream detail');});
  const f = await failure('/api/state'); assert.equal(f.status,502); assert.doesNotMatch(await f.text(),/secret/);
});

test('health stays available without upstream and unrelated cookies are discarded', async t => {
  let calls = 0;
  const req = await start(t, async()=>{calls++;return new Response('ok',{headers:{'Set-Cookie':'another=secret; Domain=example.com'}});});
  assert.deepEqual(await (await req('/gateway-health')).json(),{ok:true,mode:'gateway'});
  assert.equal(calls,0);
  assert.equal((await req('/')).headers.get('set-cookie'),null);
});

test('WeChat verification text is anonymously served from exact root path without upstream', async t => {
  let calls=0;
  const req=await start(t,async()=>{calls++;throw Error('Verification must not depend on upstream');});
  const result=await req('/b4a0cbf20b78dbe8a5fbd27c3e9bc446.txt');
  assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),'text/plain; charset=utf-8');
  assert.equal(await result.text(),'0de74c938711254c186a07bc0d15db9fb2ec7f3c');
  assert.equal((await req('/other-verification.txt')).status,404);assert.equal(calls,0);
});
