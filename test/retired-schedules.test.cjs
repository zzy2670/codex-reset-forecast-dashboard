'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {normalize}=require('../app/core.cjs'),{projectForecasts,warning}=require('../app/ui/pace-timing.js');
const now=Date.parse('2026-10-08T00:00:00Z'),stamp=new Date(now).toISOString();
const raw=()=>JSON.parse(fs.readFileSync(path.join(__dirname,'./fixtures/did.json'),'utf8'));
const old={id:'2103637477760311522',kind:'reset_scheduled',resetType:'global',scheduleBasis:'explicit',scheduleState:'pending',scheduleWindow:{startAt:'2026-09-25T07:00:00Z',endAt:'2026-09-26T07:00:00Z'},source:{url:'https://x.com/thsottiaux/status/2103637477760311522'}};
test('reported September 25 schedule cannot become next even if upstream still calls it pending',()=>{
 const r=raw();r.meta.lastSuccessfulCheckAt=stamp;r.data.items.unshift(old,{...old,id:'888888',source:{url:'https://x.com/thsottiaux/status/888888'},resetType:'banked',scheduleWindow:{endAt:'2026-10-08T07:00:00Z'}});
 const s=normalize('did',r,stamp);assert.equal(s.forecast.state,'none');assert.equal(s.additionalForecasts.length,1);assert.ok(s.archivedForecasts.some(f=>f.id===old.id&&f.retiredReason==='fulfilled'));
});
test('completion links and terminal fields retire even future incorrectly pending schedules',()=>{
 for(const field of [{},{completionRecordId:'done'},{completedAt:stamp},{scheduleState:'fulfilled'},{scheduleState:'cancelled'}]){
  const r=raw();const schedule={...old,...field,scheduleWindow:{endAt:'2026-10-09T07:00:00Z'}};
  if(Object.keys(field).length)r.data.items=r.data.items.filter(i=>i.id!=='2103911959544610829');
  r.data.items.unshift(schedule);const s=normalize('did',r,stamp);assert.equal(s.forecast.state,'none');assert.ok(s.archivedForecasts.some(f=>f.id===old.id));
 }
});
test('cached expired projection and local aging are immediate, idempotent and never invent completion',()=>{
 const source={id:'did',forecast:{id:'old',state:'scheduled',type:'global',start:'2026-09-25T07:00:00Z',end:'2026-09-26T07:00:00Z'},additionalForecasts:[]};
 const p=projectForecasts(source,now);assert.equal(p.forecast.state,'none');assert.equal(p.archivedForecasts.length,1);assert.equal(p.archivedForecasts[0].retiredReason,'expired');assert.equal(projectForecasts(p,now).archivedForecasts.length,1);assert.equal(source.forecast.state,'scheduled');
 const future={...source,forecast:{...source.forecast,end:new Date(now+1000).toISOString()}};assert.equal(projectForecasts(future,now).forecast.state,'scheduled');assert.equal(projectForecasts(future,now+1001).forecast.state,'none');
});
test('cached completion relationship removes future deadline from card and urgency',()=>{
 const s={id:'did',status:'ok',updatedAt:stamp,fetchedAt:stamp,maxAge:900000,forecast:{id:'linked',state:'scheduled',type:'global',end:'2026-10-09T07:00:00Z'},historyEvents:[{type:'global',relatedRecordIds:['linked']}],additionalForecasts:[]};
 assert.equal(projectForecasts(s,now).forecast.state,'none');assert.equal(warning([s],null,null,3,now).active,false);
});
test('same post and time retain separate plans and inferred versus explicit evidence',()=>{
 const s={id:'did',status:'ok',updatedAt:stamp,fetchedAt:stamp,maxAge:900000,forecast:{id:'same',state:'scheduled',type:'global',end:'2026-10-09T07:00:00Z',scope:{plans:['pro']}},additionalForecasts:[]};
 s.additionalForecasts=[{...s.forecast,scope:{plans:['plus']}},{...s.forecast,timingKind:'hint'}];
 const projected=projectForecasts(s,now);assert.equal(projected.additionalForecasts.length,2);assert.equal(warning([projected],{planType:'pro'},null,3,now).active,true);
});
test('missing Did reset type cannot become an automatic global forecast',()=>{
 for(const resetType of [null,undefined]){const r=raw();r.data.items.unshift({...old,id:'999999',source:{url:'https://x.com/thsottiaux/status/999999'},resetType,scheduleWindow:{endAt:'2026-10-09T07:00:00Z'}});const s=normalize('did',r,stamp);assert.equal(s.forecast.state,'none');assert.equal(s.additionalForecasts[0].type,'unknown');assert.equal(warning([s],null,null,3,now).active,false);}
});

test('observation, recap and repair links do not fulfill a pending automatic reset',()=>{
 for(const type of ['observation','commentary','repair']){
  const source={id:'did',forecast:{id:'linked',state:'scheduled',type:'global',end:'2026-10-09T07:00:00Z'},historyEvents:[{type,phase:type,relatedRecordIds:['linked']}],additionalForecasts:[]};
  assert.equal(projectForecasts(source,now).forecast.state,'scheduled');
 }
});
