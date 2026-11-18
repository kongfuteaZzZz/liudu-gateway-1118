import test from 'node:test';
import assert from 'node:assert/strict';
import {board,rank,awards,settle,totals,validate,cutoff,DAY} from './core.mjs';
const targets=[1,2,3,4].map(n=>({id:String(n),image:String(n),created:0}));
test('submitted voters form denominator; omitted targets count zero',()=>{
 const db={targets:[...targets],versions:[{user:'a',time:1,values:{1:100}},{user:'b',time:2,values:{2:100}},{user:'a',time:3,values:{1:60,2:40}}]};
 const b=board(db);assert.equal(b.count,2);assert.equal(b.rows.find(x=>x.id==='1').score,30);assert.equal(b.rows.find(x=>x.id==='2').score,70);assert.equal(b.rows.find(x=>x.id==='4').score,0);
 db.targets.push({id:'5',image:'5',created:4});assert.equal(board(db).rows.find(x=>x.id==='5').score,0);
});
test('one-decimal score determines competition ranking',()=>{
 const db={targets,versions:Array.from({length:30},(_,i)=>({user:String(i),time:0,values:i===0?{1:100,2:100}:i===1?{1:1,2:2}:{}}))};
 const rows=board(db).rows;assert.equal(rows[0].score,3.4);assert.equal(rows[1].score,3.4);assert.deepEqual(rows.map(r=>r.rank),[1,1,3,3]);
});
test('podium slots are pooled across tied places, rounded daily',()=>{
 const make=scores=>rank(scores.map((score,i)=>({id:String(i),score})));
 assert.deepEqual(awards(make([50,50,20])).map(x=>x.reward),[4.5,4.5,1]);
 assert.deepEqual(awards(make([60,20,20])).map(x=>x.reward),[6,2,2]);
 assert.deepEqual(awards(make([10,10,10])).map(x=>x.reward),[3.3,3.3,3.3]);
 assert.deepEqual(awards(make([60,30,5,5])).map(x=>x.reward),[6,3,.5,.5]);
 assert.deepEqual(awards(make([100,0,0,0])).map(x=>x.reward),[6,0,0,0]);
 assert.ok(awards(make([0,0,0])).every(x=>x.reward===0));
});
test('23:59 Beijing cutoff, restart backfill, idempotency and frozen history',()=>{
 const start=Date.parse('2026-11-18T10:00:00+08:00'),end=cutoff('2026-11-18');
 const db={created:start,targets,days:{},versions:[{user:'a',time:start,values:{1:100}},{user:'a',time:end+1,values:{2:100}}]};
 assert.equal(settle(db,end-1),false);assert.equal(settle(db,end+DAY*2),true);
 assert.equal(db.days['2026-11-18'].rows[0].id,'1');assert.equal(db.days['2026-11-19'].rows[0].id,'2');
 const frozen=JSON.stringify(db.days);assert.equal(settle(db,end+DAY*2),false);assert.equal(JSON.stringify(db.days),frozen);
 assert.equal(totals(db).find(x=>x.id==='2').score,12);
});
test('integer, sum, range and known-target validation enforced',()=>{
 assert.doesNotThrow(()=>validate({'1':100},targets));
 for(const v of [{1:99},{1:101,2:-1},{1:99.5,2:.5},{unknown:100},null])assert.throws(()=>validate(v,targets));
});
