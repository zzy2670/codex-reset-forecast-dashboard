'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Pace=require('../app/ui/pace-timing.js');
const day=86400000,localAt=Date.parse('2026-10-22T17:09:48.000Z'),now=Date.parse('2026-10-23T01:28:00.000Z');
const global={state:'confirmed',at:'2026-10-20T06:33:48.000Z'};
function proof(at=localAt,durationMins=10080,key='primary',bucketId='codex'){
 const resetsAt=new Date(at+durationMins*60000).toISOString(),observedAt=new Date(at+10000).toISOString();
 return {quota:{source:'local-codex',state:'ok',bucketId,key,durationMins,resetsAt,usedPercent:2,fetchedAt:observedAt},localReset:{kind:'quota-reset',bucketId,windowKey:key,resetsAt,observedAt}};
}
function history(at=localAt-day){const stamp=new Date(at).toISOString(),url='https://x.com/thsottiaux/status/2112432076767289678';return [{id:'2112432076767289678',type:'global',at:stamp,url,sources:[{id:'codex',family:'codex-reset',at:stamp,url},{id:'did',family:'didcodexreset',at:stamp,url}]}];}

test('reported three-day bar starts at the persisted actual local refill rather than the old global completion',()=>{
 const options=proof(),before=JSON.stringify(options),pace=Pace.hypotheticalPace(global,3,now,history(),options);
 assert.equal(pace.origin,'local');assert.equal(pace.anchor,'2026-10-22T17:09:48.000Z');assert.equal(pace.end,'2026-10-25T17:09:48.000Z');
 assert.equal(pace.progress,(now-localAt)/(3*day));assert.ok(pace.progress>.11&&pace.progress<.12);assert.equal(pace.overdue,false);
 assert.equal(JSON.stringify(options),before);
});

test('later published global completions cannot move the actual local refill timestamp',()=>{
 for(const at of [localAt-60000,localAt+60000,now-60000]){
  const pace=Pace.hypotheticalPace({state:'confirmed',at:new Date(at).toISOString()},3,now,history(at),proof());
  assert.equal(pace.origin,'local');assert.equal(Date.parse(pace.anchor),localAt);
 }
});

test('the local assumed period reaches 100 percent once and never wraps into another assumed cycle',()=>{
 const options=proof();
 assert.equal(Pace.hypotheticalPace(global,3,localAt,[],{...options,localReset:{...options.localReset,observedAt:new Date(localAt).toISOString()}}).progress,0);
 for(const at of [localAt+3*day,localAt+6*day,localAt+10*day]){
  const pace=Pace.hypotheticalPace(global,3,at,[],options);assert.equal(pace.progress,1);assert.equal(pace.overdue,true);assert.equal(Date.parse(pace.anchor),localAt);
 }
});

test('aging, paused cache and temporary errors retain a proved same-window refill across JSON restart',()=>{
 for(const state of ['ok','error']){
  const options=proof();options.quota.state=state;options.quota.stale=true;options.quota.fetchedAt='2026-10-22T17:50:59.306Z';
  delete options.quota.usedPercent;
  const restored=JSON.parse(JSON.stringify(options));
  const pace=Pace.hypotheticalPace({state:'unavailable'},3,now,[],restored);
  assert.equal(pace.origin,'local');assert.equal(Date.parse(pace.anchor),localAt);
 }
});

test('ordinary observed five-hour and weekly cycles cannot claim an actual refill',()=>{
 for(const duration of [300,10080])for(const localReset of [null,undefined,{kind:'observed-cycle'},{}]){
  const options=proof(localAt,duration);options.localReset=localReset;
  const pace=Pace.hypotheticalPace(global,3,now,[],options);assert.equal(pace.origin,'current');assert.equal(pace.anchor,global.at);
  assert.equal(Pace.hypotheticalPace(null,3,now,[],options).available,false);
 }
});

test('five-hour, weekly and distinct bucket proofs apply only to their selected exact window',()=>{
 const primary=proof(localAt,10080,'primary'),secondary=proof(now-3600000,300,'secondary'),other=proof(now-1800000,300,'primary','another-bucket');
 for(const options of [primary,secondary,other]){
  const pace=Pace.hypotheticalPace(global,3,now,[],options);assert.equal(pace.origin,'local');
  assert.equal(Date.parse(pace.anchor),Date.parse(options.quota.resetsAt)-options.quota.durationMins*60000);
 }
 for(const [quota,localReset] of [[primary.quota,secondary.localReset],[secondary.quota,primary.localReset],[other.quota,primary.localReset]])assert.equal(Pace.hypotheticalPace(global,3,now,[],{quota,localReset}).origin,'current');
});

test('invalid, future and mismatched refill proof never overrides current or historical global fallback',()=>{
 const invalid=[];
 const add=mutate=>{const options=proof();mutate(options);invalid.push(options);};
 for(const duration of [0,-1,NaN,Infinity,undefined,null,'10080'])add(o=>o.quota.durationMins=duration);
 for(const timestamp of ['bad',undefined,null])add(o=>o.quota.resetsAt=o.localReset.resetsAt=timestamp);
 for(const timestamp of ['bad',undefined,null,new Date(localAt-1).toISOString(),new Date(now+1).toISOString(),new Date(localAt+7*day).toISOString()])add(o=>o.localReset.observedAt=timestamp);
 add(o=>o.localReset.resetsAt=new Date(localAt+8*day).toISOString());
 add(o=>o.quota.source='other');add(o=>delete o.quota.source);add(o=>o.quota.bucketId='');add(o=>o.quota.key='unknown');
 invalid.push(proof(now+60000));
 for(const options of invalid){
  assert.equal(Pace.hypotheticalPace(global,3,now,[],options).origin,'current');
  assert.equal(Pace.hypotheticalPace(null,3,now,history(),options).origin,'history');
  assert.equal(Pace.hypotheticalPace(null,3,now,[],options).available,false);
 }
});

test('four-argument callers retain the original verified-global and historical behavior',()=>{
 const older=history(Date.parse(global.at)-day);
 assert.equal(Pace.hypotheticalPace(global,3,now,older).origin,'current');
 assert.equal(Pace.hypotheticalPace(global,3,now,older).anchor,global.at);
 assert.equal(Pace.hypotheticalPace({state:'pending'},3,now,history()).origin,'history');
 for(const days of [0,-1,NaN,Infinity])assert.equal(Pace.hypotheticalPace(global,days,now,[],proof()).available,false);
 assert.equal(Pace.hypotheticalPace(global,3,now,[],null).origin,'current');
});

test('local hypothetical selection leaves public completion records and absolute calendar targets unchanged',()=>{
 const options=proof(),rows=history(),target={anchor:global.at,at:'2026-10-25T07:00:00.000Z'},before=JSON.stringify({global,rows,target});
 const calendar=Pace.calendarPace(target,now);
 Pace.hypotheticalPace(global,3,now,rows,options);
 assert.deepEqual(Pace.calendarPace(target,now),calendar);assert.equal(JSON.stringify({global,rows,target}),before);
});

test('browser UMD uses persisted local proof without Node or account access',()=>{
 const context=vm.createContext({Date,URL});vm.runInContext(fs.readFileSync(require.resolve('../app/ui/pace-timing.js'),'utf8'),context);
 const actual=context.PaceTiming.hypotheticalPace(global,3,now,[],JSON.parse(JSON.stringify(proof())));
 assert.equal(actual.origin,'local');assert.equal(actual.anchor,'2026-10-22T17:09:48.000Z');
});
