'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {warning,paceProgress,remainingSchedule}=require('../app/ui/pace-timing.js');
const now=Date.parse('2026-10-08T00:00:00+08:00'),day=86400000;
const quota={resetsAt:new Date(now+6*day).toISOString(),durationMins:10080,planType:'pro'};
const source=(id,start,end=start)=>({id,name:id,status:'ok',updatedAt:new Date(now).toISOString(),fetchedAt:new Date(now).toISOString(),maxAge:900000,forecast:{state:'scheduled',type:'global',start:new Date(start).toISOString(),end:new Date(end).toISOString()}});
test('single deadline maps current progress toward the forecast, not a fixed personal-cycle time',()=>{
 const w=warning([source('one',now+day)],quota,null,3,now);
 assert.equal(w.active,true);assert.equal(w.range,false);assert.equal(w.left,50);assert.equal(w.sourceCount,1);
});
test('multiple sources and a single source window produce earliest/latest range, shared time one line',()=>{
 const sources=[source('one',now+day),source('two',now+2*day)];
 const w=warning(sources,quota,null,3,now);assert.equal(w.range,true);assert.equal(w.earliest,now+day);assert.equal(w.latest,now+2*day);
 sources[1]=source('two',now+day);assert.equal(warning(sources,quota,null,3,now).range,false);
 assert.equal(warning([source('one',now+day,now+2*day)],quota,null,3,now).range,true);
 sources[0].additionalForecasts=[source('extra',now+3*day).forecast];assert.equal(warning(sources,quota,null,3,now).latest,now+3*day);
});
test('stale, expired, untimed, banked-only, different-plan and reversed windows do not trigger urgency',()=>{
 const make=()=>source('one',now+day);
 for(const mutate of [s=>s.status='stale',s=>s.expiresAt=new Date(now-1).toISOString(),s=>s.forecast.state='untimed',s=>s.forecast.type='banked',s=>s.forecast.scope={plans:['plus']},s=>s.forecast.start=new Date(now+2*day).toISOString()]){
  const s=make();mutate(s);assert.equal(warning([s],quota,null,3,now).active,false);
 }
 assert.equal(warning([source('old',now-1)],quota,null,3,now).active,false);
 const s=make();s.forecast.scope={plans:['pro']};assert.equal(warning([s],quota,null,3,now).active,true);
});
test('forecast pace remains valid beyond the personal deadline and needs a real anchor',()=>{
 const w=warning([source('late',now+8*day)],quota,null,3,now);assert.equal(w.right,1/9*100);assert.equal(w.latest,now+8*day);
 assert.equal(warning([source('one',now+day)],null,null,3,now).mapped,false);
 const c={state:'confirmed',at:new Date(now-day).toISOString()};assert.equal(warning([source('one',now+day)],null,c,3,now).left,50);
});

test('record pace advances to 100 at the exact deadline and uses the verified global anchor first',()=>{
 const anchor=now-day,deadline=now+day;assert.equal(paceProgress(anchor,deadline,now),50);assert.equal(paceProgress(anchor,deadline,now+day/2),75);assert.equal(paceProgress(anchor,deadline,deadline),100);assert.equal(paceProgress(deadline,anchor,now),null);
 const c={state:'confirmed',at:new Date(now-2*day).toISOString()};assert.equal(warning([source('one',deadline)],quota,c,3,now).right,2/3*100);
});

test('earlier future deadlines form the faster right boundary, shared times one line',()=>{
 const w=warning([source('one',now+day),source('two',now+2*day)],quota,null,3,now);assert.equal(w.left,1/3*100);assert.equal(w.right,50);assert.ok(w.left<w.right);
});

test('reported October 10 window start disappears from next estimate without mutating evidence',()=>{
 const t=Date.parse('2026-10-11T08:30:00+08:00'),anchor=Date.parse('2026-10-07T11:35:09+08:00'),deadline=Date.parse('2026-10-11T15:00:00+08:00');
 const s={...source('did',t),updatedAt:new Date(t).toISOString(),fetchedAt:new Date(t).toISOString(),forecast:{state:'scheduled',type:'global',start:'2026-10-10T07:00:00Z',end:new Date(deadline).toISOString(),issuedAt:'2026-10-10T22:15:39Z'}};const raw=JSON.stringify(s);
 const view=remainingSchedule(s.forecast,t);assert.equal(view.start,null);assert.equal(view.originalStart,s.forecast.start);assert.equal(view.end,s.forecast.end);
 const w=warning([s],quota,{state:'confirmed',at:new Date(anchor).toISOString()},3,t);assert.equal(w.range,false);assert.equal(w.earliest,deadline);assert.equal(w.left,(t-anchor)/(deadline-anchor)*100);assert.ok(w.left>90);assert.equal(JSON.stringify(s),raw);
 assert.equal(warning([s],quota,null,3,deadline).active,false);
});

test('view trims a window locally at its start while the source schedule identity remains stable',()=>{
 const f={state:'scheduled',start:new Date(now+1000).toISOString(),end:new Date(now+5000).toISOString()};assert.equal(remainingSchedule(f,now),f);assert.equal(remainingSchedule(f,now+1000).start,null);assert.equal(remainingSchedule(f,now+5000),f);assert.equal(f.start,new Date(now+1000).toISOString());
});
