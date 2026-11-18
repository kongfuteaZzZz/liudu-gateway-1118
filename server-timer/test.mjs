import test,{mock,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import timer from './worker.mjs';
const tick=Date.parse('2026-11-18T23:59:00+08:00');
afterEach(()=>mock.restoreAll());
function fake(body,status=200){const calls=[];mock.method(console,'log',()=>{});mock.method(globalThis,'fetch',async(...args)=>{calls.push(args);return Response.json(body,{status});});return calls;}
test('native trigger uses 15:59 UTC and has no public HTTP routes',()=>{
 const config=JSON.parse(fs.readFileSync(new URL('./wrangler.jsonc',import.meta.url),'utf8'));
 assert.deepEqual(config.triggers.crons,['59 15 * * *']);assert.equal(config.workers_dev,false);assert.equal(config.preview_urls,false);assert.equal(timer.fetch,undefined);
});
test('scheduled handler calls only the fixed settlement endpoint without user credentials',async()=>{
 const calls=fake({ok:true,dates:['2026-11-18']});await timer.scheduled({scheduledTime:tick});
 assert.equal(calls.length,1);assert.equal(calls[0][0],'https://liudu-club-1118.amicablebeam16.chatgpt.site/api/settle');
 const options=calls[0][1];assert.equal(options.method,'GET');assert.equal(options.redirect,'manual');assert.ok(options.signal);assert.deepEqual(options.headers,{Accept:'application/json'});
});
test('a missing daily record at cutoff is reported as a failure',async()=>{
 fake({ok:true,dates:[]});await assert.rejects(timer.scheduled({scheduledTime:tick}),/2026-11-18/);
});
test('redirects are rejected instead of forwarding a settlement request elsewhere',async()=>{
 fake({},302);await assert.rejects(timer.scheduled({scheduledTime:tick}),/302/);
});
test('delayed execution across midnight still checks the originally scheduled date',async()=>{
 const calls=fake({ok:true,dates:['2026-11-18'],now:Date.parse('2026-11-19T00:01:00+08:00')});await timer.scheduled({scheduledTime:tick});assert.equal(calls.length,1);
});
test('manual verification before first cutoff may complete without creating future records',async()=>{
 const calls=fake({ok:true,dates:[]});await timer.scheduled({scheduledTime:Date.parse('2026-11-18T10:00:00+08:00')});assert.equal(calls.length,1);
});
test('HTTP failure, bad response and invalid event fail visibly',async()=>{
 fake({error:'unavailable'},503);await assert.rejects(timer.scheduled({scheduledTime:tick}),/503/);mock.restoreAll();
 fake({ok:false,dates:[]});await assert.rejects(timer.scheduled({scheduledTime:tick}),/结算/);mock.restoreAll();
 const calls=fake({ok:true,dates:['2026-11-18']});await assert.rejects(timer.scheduled({scheduledTime:NaN}),/时间/);assert.equal(calls.length,0);
});
